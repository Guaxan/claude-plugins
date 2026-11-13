import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Question, Run, Step } from '../types'

const PANE = 'gemini-agent'
const TOOL_NAME = 'run'
const TOOL = 'mcp__gemini-agent__run'
const MAX_RUNS = 20

// Change the tag when Run/Step fields change: old stored values are declined.
const runs = atom({ plugin: 'gemini-agent', key: 'runs' } as const, [], {
  shape: 'runs-1',
})

const RESULT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'needs_input'] },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'text'],
      },
    },
    summary: { type: 'string' },
    answer: { type: 'string' },
  },
  required: ['status', 'summary'],
})

const PROTOCOL = `

---
Protocolo de execução (obrigatório):
- Você roda sem humano por perto. A ferramenta ask_question NÃO funciona aqui.
- Se faltar informação para decidir algo relevante (requisito, regra de negócio, design, dado), NÃO invente: pare e retorne status "needs_input" com perguntas objetivas (id curto, text, options quando houver alternativas claras).
- Ao terminar, retorne status "done". Em answer coloque o conteúdo completo da sua resposta ao pedido (listas, textos, análises), em markdown. Em summary diga em poucas linhas o que fez e quais arquivos criou ou alterou.`

type Answer = { id: string; answer: string }
type Input = {
  prompt?: string
  conversationId?: string
  answers?: Answer[]
  mode?: 'plan' | 'accept-edits' | 'auto'
  model?: string
  cwd?: string
}

const TOOL_DESCRIPTION = `Roda o Gemini (CLI agy) como agente, com cada passo visível ao vivo no painel "Gemini".

Use para delegar trabalho ao Gemini (ex.: telas, UI/UX, acessibilidade). Retorna JSON:
{ status: "done" | "needs_input" | "error", conversationId, questions, summary, deniedActions }

Quando status = "needs_input": o Gemini parou com dúvidas. Responda cada pergunta você mesmo SE a resposta estiver no contexto (specs, docs, memória, código). Se for decisão de produto/UX/negócio ou ambígua, pergunte ao usuário (AskUserQuestion). Depois chame esta ferramenta de novo com o mesmo conversationId e answers.

deniedActions lista ações que o agy bloqueou em modo headless (ex.: rodar comandos); informe o usuário.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Tarefa para o Gemini (obrigatório na primeira chamada; opcional ao retomar com answers).',
    },
    conversationId: {
      type: 'string',
      description: 'Id retornado numa chamada anterior, para retomar a mesma conversa.',
    },
    answers: {
      type: 'array',
      description: 'Respostas às perguntas de needs_input.',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, answer: { type: 'string' } },
        required: ['id', 'answer'],
      },
    },
    mode: {
      type: 'string',
      enum: ['plan', 'accept-edits', 'auto'],
      description: 'Modo do agy. Padrão accept-edits (pode editar arquivos).',
    },
    model: { type: 'string', description: 'Modelo do agy (opcional).' },
    cwd: { type: 'string', description: 'Diretório de trabalho (padrão: o da sessão).' },
  },
}

const DETAIL_KEYS = [
  'CommandLine',
  'TargetFile',
  'AbsolutePath',
  'DirectoryPath',
  'SearchPath',
  'Query',
  'Url',
  'Pattern',
]

function describeParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined
  const p = params as Record<string, unknown>
  for (const k of DETAIL_KEYS) {
    if (typeof p[k] === 'string') return p[k] as string
  }
  const json = JSON.stringify(p)
  return json.length > 120 ? `${json.slice(0, 117)}...` : json
}

function buildPrompt(input: Input): string {
  const parts: string[] = []
  if (input.answers && input.answers.length > 0) {
    parts.push(
      'Respostas às suas perguntas:\n' +
        input.answers.map(a => `- ${a.id}: ${a.answer}`).join('\n'),
    )
  }
  if (input.prompt) parts.push(input.prompt)
  return parts.join('\n\n') + PROTOCOL
}

function clip(text: string, n: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

let agyPath: string | undefined

// O PATH do processo do Claude Code é o do momento em que a sessão abriu: um agy
// instalado depois não é achado como 'agy'. Procura no PATH e no local padrão.
async function resolveAgy($: EngineInterface): Promise<string> {
  if (agyPath) return agyPath
  try {
    const where = await $.process.run(['cmd', '/c', 'where agy.exe'])
    const first = where.stdout.split('\n').map(l => l.trim()).find(Boolean)
    if (where.exitCode === 0 && first) return (agyPath = first)
    const env = await $.process.run(['cmd', '/c', 'echo %LOCALAPPDATA%'])
    const candidate = `${env.stdout.trim()}\\agy\\bin\\agy.exe`
    const exists = await $.process.run(['cmd', '/c', `if exist "${candidate}" echo yes`])
    if (exists.stdout.includes('yes')) return (agyPath = candidate)
    throw new Error(`agy não encontrado no PATH nem em ${candidate}`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('agy não encontrado')) throw err
    return 'agy' // fora do Windows (sem cmd): confia no PATH
  }
}

type Outcome = {
  status: Run['status']
  conversationId?: string
  questions: Question[]
  summary: string
  answer?: string
  denied: string[]
  steps: number
  seconds?: number
  usage: { input: number; output: number; cacheRead: number; model: string }
}

const AGENT_NAME = 'gemini'
const AGENT_TYPE = 'gemini-agent:gemini'

const AGENT_DESCRIPTION = `Gemini (CLI agy) como subagente: cada passo dele aparece ao vivo no transcript do agente, com os tokens do Gemini. Use para delegar trabalho de tela (UI/UX, acessibilidade) ou qualquer tarefa ao Gemini. Rode em background.

O prompt é a tarefa. Linhas opcionais no topo do prompt, uma por linha:
@cwd: <pasta do projeto, pode ser \\\\wsl$\\...>
@mode: plan | accept-edits | auto   (padrão accept-edits: edita arquivos)
@model: <modelo do agy, ex. gemini-4-argon-high>

Se o Gemini tiver dúvidas, o agente termina com status needs_input e as perguntas. Responda pelo contexto ou pergunte ao usuário, e envie as respostas a este mesmo agente com SendMessage: a conversa do Gemini continua de onde parou.`

const AGENT_FALLBACK_PROMPT =
  'Você é um marcador do plugin gemini-agent. Se estiver lendo isto, o plugin não interceptou a execução. Responda apenas: "gemini-agent não carregou; rode /reload-plugins."'

// Gemini conversation per agent, so a SendMessage resumes the same conversation.
const agentConvs = atom({ plugin: 'gemini-agent', key: 'agentConvs' } as const, {}, {
  shape: 'agentConvs-2',
})

function parseHeader(text: string): { input: Partial<Input>; body: string } {
  const input: Partial<Input> = {}
  const lines = text.split('\n')
  let i = 0
  for (; i < lines.length; i++) {
    const m = /^\s*@(cwd|mode|model):\s*(.+?)\s*$/.exec(lines[i] ?? '')
    if (!m) break
    const [, k, v] = m
    if (k === 'cwd') input.cwd = v
    if (k === 'model') input.model = v
    if (k === 'mode' && (v === 'plan' || v === 'accept-edits' || v === 'auto')) input.mode = v
  }
  return { input, body: lines.slice(i).join('\n').trim() }
}

// Runs agy once: keeps the pane's record up to date, yields narration text for a
// live transcript, and returns the outcome.
async function* runGemini(
  $: EngineInterface,
  input: Input,
  key: string,
  title: string,
): AsyncGenerator<string, Outcome> {
  const isUnc = !!input.cwd && /^(\\\\|\/\/)/.test(input.cwd)
  const prompt = isUnc
    ? `Diretório do projeto (já adicionado ao workspace): ${input.cwd}\n\n${buildPrompt(input)}`
    : buildPrompt(input)
  const argv = [
    'agy',
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--json-schema',
    RESULT_SCHEMA,
    '--mode',
    input.mode ?? 'accept-edits',
  ]
  if (input.conversationId) argv.push('--conversation', input.conversationId)
  if (input.model) argv.push('--model', input.model)
  // agy started with a \\wsl$ working directory loses its keyring login: start
  // it from the session's folder and add the project as a workspace dir.
  if (isUnc) argv.push('--add-dir', input.cwd!)

  const fresh: Run = {
    key,
    conversationId: input.conversationId,
    title,
    status: 'running',
    steps: [],
    questions: [],
    denied: [],
    startedAt: Date.now(),
  }
  await update($, runs, list => [...list.filter(r => r.key !== key), fresh].slice(-MAX_RUNS))
  $.ui.status('gemini: iniciando…')

  const patch = (fn: (run: Run) => Run) =>
    update($, runs, list => list.map(r => (r.key === key ? fn(r) : r)))

  let buffer = ''
  let stderr = ''
  let final: Record<string, any> | undefined
  let conversationId = input.conversationId
  const seen = new Set<string>()
  const said = new Map<number, string>()
  let narration = ''

  const applyLine = (run: Run, line: string): Run => {
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      stderr += `${line}\n`
      return run
    }
    if (ev.event === 'init') {
      conversationId = ev.conversation_id ?? conversationId
      return { ...run, conversationId }
    }
    if (ev.event === 'result') {
      final = ev.result
      return run
    }
    if (ev.event !== 'step_update') return run
    const s = ev.step_update ?? {}
    const index = Number(s.step_index ?? 0)
    const kind: string = s.step_type ?? '?'
    const err = s.tool_info?.error?.message as string | undefined
    const detail = describeParams(s.tool_info?.parameters)

    // narration for the transcript
    if (kind === 'user_input' && !seen.has(`u${index}`)) {
      seen.add(`u${index}`)
      narration += '▸ prompt enviado ao Gemini\n'
    } else if (kind === 'tool' && !seen.has(`t${index}`)) {
      seen.add(`t${index}`)
      narration += `▸ ${s.tool_name ?? 'tool'}${detail ? `  ${clip(detail, 160)}` : ''}\n`
    }
    if (kind === 'tool' && s.state === 'ERROR' && !seen.has(`e${index}`)) {
      seen.add(`e${index}`)
      narration += `  ✗ ${clip(err ?? 'erro', 240)}\n`
    }
    if (kind === 'agent_response' && typeof s.text_delta === 'string') {
      const before = said.get(index) ?? ''
      const after = before + s.text_delta
      said.set(index, after)
      // the final answer is the schema's JSON: it is summarised at the end instead
      if (!after.trimStart().startsWith('{')) {
        narration += (before === '' ? '\n' : '') + s.text_delta
      }
    }
    if (kind === 'agent_response' && s.state === 'DONE') {
      const all = said.get(index) ?? ''
      if (all && !all.trimStart().startsWith('{') && !all.endsWith('\n')) narration += '\n'
    }

    // the pane's record
    const steps = [...run.steps]
    const at = steps.findIndex(x => x.index === index)
    const prev: Step = at >= 0 ? steps[at]! : { index, kind, state: '', text: '' }
    const nextStep: Step = {
      ...prev,
      kind,
      tool: s.tool_name ?? prev.tool,
      detail: detail ?? prev.detail,
      state: s.state ?? prev.state,
      text: err ? clip(err, 200) : prev.text + (s.text_delta ?? ''),
      seconds: s.duration_seconds ?? prev.seconds,
    }
    if (at >= 0) steps[at] = nextStep
    else steps.push(nextStep)
    return { ...run, steps }
  }

  let exit: { code: number | null } | undefined
  let startError: string | undefined
  try {
    argv[0] = await resolveAgy($)
    const child = $.process.spawn({ argv, cwd: isUnc ? undefined : input.cwd })
    const it = child[Symbol.asyncIterator]()
    for (;;) {
      const r = await it.next()
      if (r.done) {
        exit = r.value as { code: number | null }
        break
      }
      const { stream, text } = r.value
      if (stream === 'stderr') {
        stderr += text
        continue
      }
      buffer += text
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const ready = lines.map(l => l.trim()).filter(Boolean)
      if (ready.length === 0) continue
      await patch(run => ready.reduce(applyLine, run))
      if (narration) {
        const out = narration
        narration = ''
        yield out
      }
      const now = (await read($, runs)).find(x => x.key === key)
      const last = now?.steps[now.steps.length - 1]
      if (last) $.ui.status(`gemini: passo ${last.index}${last.tool ? ` · ${last.tool}` : ''}`)
    }
    if (buffer.trim()) {
      const tail = buffer.trim()
      await patch(run => applyLine(run, tail))
      if (narration) yield narration
    }
  } catch (err) {
    startError = `Falha ao iniciar o agy (${argv[0]}): ${err instanceof Error ? err.message : String(err)}`
  } finally {
    $.ui.status(undefined)
  }

  const res = final
  const out = (res?.structured_output ?? {}) as {
    status?: 'done' | 'needs_input'
    questions?: Question[]
    summary?: string
    answer?: string
  }
  const denied: string[] = (res?.denied_actions ?? []).map(
    (d: { action?: string; display_name?: string }) => d.display_name ?? d.action ?? '?',
  )
  const status: Run['status'] =
    startError || res?.status !== 'SUCCESS' ? 'error' : out.status ?? 'done'
  const summary =
    startError ??
    out.summary ??
    (typeof res?.response === 'string' && res.response.trim()
      ? res.response.trim()
      : clip(stderr || `agy saiu com código ${exit?.code ?? '?'}`, 600))
  const u = res?.usage ?? {}
  const usage = {
    input: Number(u.input_tokens ?? 0),
    output: Number(u.output_tokens ?? 0) + Number(u.thinking_tokens ?? 0),
    cacheRead: Number(u.cache_read_tokens ?? 0),
    model: input.model ?? 'gemini (agy)',
  }
  conversationId = res?.conversation_id ?? conversationId

  await patch(run => ({
    ...run,
    conversationId,
    status,
    questions: out.questions ?? [],
    summary,
    denied,
    seconds: res?.duration_seconds,
    tokens: res?.usage?.total_tokens,
  }))
  const done = (await read($, runs)).find(x => x.key === key)

  return {
    status,
    conversationId,
    questions: out.questions ?? [],
    summary,
    answer: out.answer?.trim() || undefined,
    denied,
    steps: done?.steps.length ?? 0,
    seconds: res?.duration_seconds,
    usage,
  }
}

function outcomeText(o: Outcome): string {
  const lines = [`status: ${o.status}`, `conversationId: ${o.conversationId ?? '-'}`, '', o.summary]
  if (o.answer) lines.push('', 'Resposta do Gemini:', o.answer)
  if (o.questions.length > 0) {
    lines.push('', 'Perguntas do Gemini:')
    for (const q of o.questions) {
      lines.push(`- ${q.id}: ${q.text}${q.options?.length ? ` [${q.options.join(' | ')}]` : ''}`)
    }
  }
  if (o.denied.length > 0) lines.push('', `Ações bloqueadas pelo agy: ${o.denied.join(', ')}`)
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
      isDeferred: false,
    })
    await $.agent.register({
      name: AGENT_NAME,
      description: AGENT_DESCRIPTION,
      prompt: AGENT_FALLBACK_PROMPT,
      tools: [],
      model: 'haiku',
    })
    await $.command.register({
      name: 'gemini',
      description: 'Abre o painel do Gemini (execuções do agy ao vivo)',
    })
    return next(e)
  })

  on('command.run', { command: 'gemini' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Gemini' })
    return { text: 'Painel do Gemini aberto.' }
  })

  // The Gemini subagent: its model requests never reach Claude. Each one runs agy
  // and streams Gemini's steps as the agent's own text, with Gemini's usage.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) return yield* next(e)
    const agent = (await $.agent.list()).find(a => a.id === e.agentId)
    if (agent?.type !== AGENT_TYPE) return yield* next(e)

    const agentId = e.agentId
    const msgs = await $.session.messages({ agentId })
    // Real tasks: the spawn prompt and each SendMessage. Harness reminders and
    // tool results (the handback's own) are not tasks and never rerun agy.
    const tasks = Array.isArray(msgs)
      ? msgs.filter(
          m =>
            m.role === 'user' &&
            m.text.trim() &&
            !(m.toolResults && m.toolResults.length > 0) &&
            !m.text.trimStart().startsWith('<system-reminder>'),
        )
      : []
    const memo = (await read($, agentConvs))[agentId] ?? { handled: 0 }

    // A refused handback must not loop: end the run with the report as text.
    const lastMsg = Array.isArray(msgs) ? msgs[msgs.length - 1] : undefined
    if (lastMsg?.role === 'user' && lastMsg.toolResults?.some(t => t.isError)) {
      const text = `\n${memo.report ?? ''}\n`
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'gemini (agy)' }
      yield { kind: 'text', index: 0, text }
      yield { kind: 'stop', stopReason: 'end_turn', usage }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage }
    }

    let answer = ''
    let report = memo.report ?? 'Nenhuma tarefa nova para o Gemini.'
    let usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      model: 'gemini (agy)',
    }

    if (tasks.length > memo.handled) {
      const { input: header } = parseHeader(tasks[0]?.text ?? '')
      const last = tasks[tasks.length - 1]?.text ?? ''
      const { body } = parseHeader(last)
      const input: Input = {
        ...header,
        prompt: body || last,
        conversationId: memo.handled > 0 ? memo.conv : undefined,
      }
      const title = clip(`[agente] ${agent.description || body}`, 60)

      const run = runGemini($, input, `${agentId}:${tasks.length}`, title)
      let outcome: Outcome | undefined
      for (;;) {
        const r = await run.next()
        if (r.done) {
          outcome = r.value
          break
        }
        answer += r.value
        yield { kind: 'text', index: 0, text: r.value }
      }

      report = outcomeText(outcome)
      if (outcome.status === 'needs_input') {
        report +=
          '\n\nO Gemini parou com dúvidas. Responda pelo contexto ou pergunte ao usuário, e envie as respostas a este agente com SendMessage: a mesma conversa do Gemini continua.'
      }
      const closing = `\n---\n${report}\n`
      answer += closing
      yield { kind: 'text', index: 0, text: closing }

      const saved = { conv: outcome.conversationId ?? memo.conv, handled: tasks.length, report }
      await update($, agentConvs, all => ({ ...all, [agentId]: saved }))
      usage = {
        input_tokens: outcome.usage.input,
        output_tokens: outcome.usage.output,
        cache_read_input_tokens: outcome.usage.cacheRead,
        cache_creation_input_tokens: 0,
        model: outcome.usage.model,
      }
    }

    // Deliver the report the way a subagent must: a SubagentHandback call.
    const handback = { message: report }
    const id = `toolu_gem${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    yield { kind: 'tool', index: 1, id, name: 'SubagentHandback' }
    yield { kind: 'input', index: 1, json: JSON.stringify(handback) }
    yield { kind: 'stop', stopReason: 'tool_use', usage }
    return {
      turnId: e.turnId,
      index: e.index,
      answer,
      toolUses: [{ name: 'SubagentHandback', input: handback }],
      stopReason: 'tool_use',
      usage,
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Input
    if (!input.prompt && !(input.answers && input.answers.length > 0)) {
      return { deny: 'Informe prompt (ou answers + conversationId para retomar).' }
    }
    const key = e.tool_use_id ?? `run-${Date.now()}`
    const title = clip(
      input.prompt ?? `respostas: ${input.answers!.map(a => a.id).join(', ')}`,
      60,
    )
    void $.ui.open({ id: PANE, title: 'Gemini' })
    const run = runGemini($, input, key, title)
    let r = await run.next()
    while (!r.done) r = await run.next()
    const o = r.value

    const payload = {
      status: o.status,
      conversationId: o.conversationId,
      questions: o.questions,
      summary: o.summary,
      answer: o.answer,
      deniedActions: o.denied,
      steps: o.steps,
    }
    let text = JSON.stringify(payload, null, 2)
    if (o.status === 'needs_input') {
      text +=
        '\n\nO Gemini parou com dúvidas. Responda pelo contexto ou pergunte ao usuário, e chame de novo com este conversationId e answers.'
    }
    return { result: text }
  }).catch(($, e, next) => {
    $.ui.status(undefined)
    const why = next.error.message ?? next.error.kind
    return { deny: `gemini-agent falhou (${next.error.kind}): ${why}` }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.props.tool !== TOOL) return row
    const { Box, Text } = $.ui.resolve(e)
    const run = (await read($, runs)).find(r => r.key === e.props.tool_use_id)
    if (!run) return row
    const label =
      run.status === 'running'
        ? `executando · ${run.steps.length} passos`
        : run.status === 'needs_input'
          ? `aguardando resposta · ${run.questions.length} pergunta(s)`
          : run.status === 'error'
            ? 'erro'
            : `concluído · ${run.steps.length} passos${run.seconds ? ` · ${Math.round(run.seconds)}s` : ''}`
    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>  gemini: {label} (painel: /gemini)</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, runs)
    const width = Math.max(30, (e.viewport?.columns ?? 60) - 4)
    const room = Math.max(6, (e.viewport?.rows ?? 30) - 4)

    if (list.length === 0) {
      return <Text dimColor>Nenhuma execução do Gemini ainda.</Text>
    }

    const run = list[list.length - 1]!
    const icon = (s: string) =>
      s === 'DONE' ? '✓' : s === 'ERROR' ? '✗' : s === 'ACTIVE' ? '…' : '·'
    const statusColor =
      run.status === 'done'
        ? 'green'
        : run.status === 'error'
          ? 'red'
          : run.status === 'needs_input'
            ? 'yellow'
            : 'cyan'

    const lines: RenderNode[] = []
    for (const s of run.steps) {
      if (s.kind === 'tool') {
        lines.push(
          <Text color={s.state === 'ERROR' ? 'red' : undefined}>
            {icon(s.state)} {s.tool ?? 'tool'} {clip(s.detail ?? '', width - 20)}
          </Text>,
        )
        if (s.state === 'ERROR' && s.text) {
          lines.push(<Text color="red" dimColor>    {clip(s.text, width - 4)}</Text>)
        }
      } else if (s.kind === 'agent_response') {
        lines.push(
          <Text dimColor={s.state === 'DONE'}>
            {icon(s.state)} gemini{s.text ? `: ${clip(s.text, width - 12)}` : ' pensando'}
          </Text>,
        )
      } else if (s.kind === 'user_input') {
        lines.push(<Text dimColor>{icon(s.state)} prompt enviado</Text>)
      } else {
        lines.push(<Text dimColor>{icon(s.state)} {s.kind}</Text>)
      }
    }

    const tail: RenderNode[] = []
    if (run.status !== 'running') {
      if (run.summary) tail.push(<Text>{clip(run.summary, width * 3)}</Text>)
      for (const q of run.questions) {
        tail.push(
          <Text color="yellow">
            ? {q.id}: {clip(q.text, width - 8)}
            {q.options && q.options.length > 0 ? ` [${q.options.join(' | ')}]` : ''}
          </Text>,
        )
      }
      if (run.denied.length > 0) {
        tail.push(<Text color="red">bloqueado: {run.denied.join(', ')}</Text>)
      }
    }

    const keep = Math.max(3, room - tail.length - 3)
    const shown = lines.slice(-keep)
    const older = list.length - 1

    return (
      <Box flexDirection="column">
        <Text bold>{clip(run.title, width)}</Text>
        <Text color={statusColor}>
          {run.status}
          {run.conversationId ? ` · ${run.conversationId.slice(0, 8)}` : ''}
          {run.tokens ? ` · ${run.tokens} tokens` : ''}
        </Text>
        {lines.length > shown.length && (
          <Text dimColor>… {lines.length - shown.length} passos anteriores</Text>
        )}
        {shown}
        {tail}
        {older > 0 && <Text dimColor>({older} execução(ões) anteriores)</Text>}
      </Box>
    )
  })
}
