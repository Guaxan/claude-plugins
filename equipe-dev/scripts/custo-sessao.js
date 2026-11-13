#!/usr/bin/env node
// Soma uso de tokens por modelo de sessoes do Claude Code (inclui subagentes).
// Uso: node custo-sessao.js [N=5 ultimas sessoes | id-da-sessao]
const fs = require('fs'), path = require('path'), os = require('os');

// $/1M tokens: [entrada, gravacao cache (~1.25x), leitura cache, saida]. Haiku cache read estimado.
const PRECO = {
  fable:  [8, 10, 0.2, 40],
  opus:   [4, 5, 0.2, 20],
  sonnet: [2, 2.5, 0.1, 10],
  haiku:  [0.1, 0.125, 0.01, 0.5],
};
const familia = m => Object.keys(PRECO).find(k => m.includes(k));

const raiz = path.join(os.homedir(), '.claude', 'projects');
const sessoes = fs.readdirSync(raiz).flatMap(p =>
  fs.readdirSync(path.join(raiz, p)).filter(f => f.endsWith('.jsonl'))
    .map(f => ({ id: f.slice(0, -6), arq: path.join(raiz, p, f), dir: path.join(raiz, p, f.slice(0, -6)) })));

const arg = process.argv[2] || '5';
const alvo = /^\d+$/.test(arg)
  ? sessoes.sort((a, b) => fs.statSync(b.arq).mtimeMs - fs.statSync(a.arq).mtimeMs).slice(0, +arg)
  : sessoes.filter(s => s.id.startsWith(arg));

for (const s of alvo) {
  const sub = path.join(s.dir, 'subagents');
  const arqs = [s.arq, ...(fs.existsSync(sub) ? fs.readdirSync(sub).filter(f => f.endsWith('.jsonl')).map(f => path.join(sub, f)) : [])];
  const vistos = new Set(), tot = {}, chamadas = new Set(), mensagens = new Set();
  for (const a of arqs) for (const linha of fs.readFileSync(a, 'utf8').split('\n')) {
    let m; try { m = JSON.parse(linha).message; } catch { continue; }
    if (a === s.arq && Array.isArray(m?.content)) for (const c of m.content)
      if (c.type === 'tool_use') (c.name === 'Agent' ? chamadas : c.name === 'SendMessage' ? mensagens : new Set()).add(c.id);
    if (!m?.usage || !m.model || vistos.has(m.id)) continue;
    vistos.add(m.id);
    const f = familia(m.model); if (!f) continue;
    const u = m.usage, t = tot[f] ??= { turnos: 0, tok: [0, 0, 0, 0] };
    t.turnos++;
    [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens, u.output_tokens]
      .forEach((v, i) => t.tok[i] += v || 0);
  }
  let soma = 0;
  console.log(`\nSessao ${s.id}  (${arqs.length - 1} subagentes | senior: ${chamadas.size} contratacoes, ${mensagens.size} SendMessage)`);
  for (const [f, t] of Object.entries(tot)) {
    const custo = t.tok.reduce((c, v, i) => c + v * PRECO[f][i] / 1e6, 0); soma += custo;
    console.log(`  ${f.padEnd(7)} turnos ${String(t.turnos).padStart(4)} | in ${t.tok[0]} | cache+ ${t.tok[1]} | cache> ${t.tok[2]} | out ${t.tok[3]} | ~$${custo.toFixed(2)}`);
  }
  if (soma) console.log(`  total equivalente API ~$${soma.toFixed(2)}` +
    (tot.opus ? `  | se tudo fosse Opus ~$${Object.values(tot).reduce((c, t) => c + t.tok.reduce((x, v, i) => x + v * PRECO.opus[i] / 1e6, 0), 0).toFixed(2)}` : ''));
}
