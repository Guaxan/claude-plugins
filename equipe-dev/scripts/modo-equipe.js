#!/usr/bin/env node
// Hook UserPromptSubmit: se a sessao rodou /equipe-dev:orquestrar (e o usuario nao disse
// "sair do modo equipe"), lembra o senior de passar o pedido pela triagem da equipe.
// Le o transcript de forma incremental (estado por sessao no diretorio temporario).
const fs = require('fs'), path = require('path'), os = require('os');

const ATIVA = /"(?:content|text)":"Base directory for this skill: [^"]*?skills[\\/]+orquestrar\b/;
const SAIR = /"(?:content|text)":"\s*sair do modo equipe/i;
const LEMBRETE = 'Modo equipe ativo (/equipe-dev:orquestrar). Antes de agir neste pedido: classifique (voce mesmo so se 1-5 linhas; senao junior/pleno/dba/qa), atualize o quadro de tarefas e despache numa unica mensagem tudo que estiver liberado, em paralelo com o que ja roda. Nao faca voce mesmo o que um agente faria. Para desligar: "sair do modo equipe".';

let entrada = '';
process.stdin.on('data', d => (entrada += d)).on('end', () => {
  try {
    const { session_id, transcript_path, prompt = '' } = JSON.parse(entrada);
    if (!transcript_path || !fs.existsSync(transcript_path)) return;
    const dir = path.join(os.tmpdir(), 'equipe-dev');
    fs.mkdirSync(dir, { recursive: true });
    const arqEstado = path.join(dir, `${session_id}.json`);
    let st = { ativo: false, offset: 0 };
    try { st = JSON.parse(fs.readFileSync(arqEstado, 'utf8')); } catch {}

    const tam = fs.statSync(transcript_path).size;
    if (tam < st.offset) st = { ativo: false, offset: 0 };
    if (tam > st.offset) {
      const fd = fs.openSync(transcript_path, 'r');
      const buf = Buffer.alloc(tam - st.offset);
      fs.readSync(fd, buf, 0, buf.length, st.offset);
      fs.closeSync(fd);
      const txt = buf.toString('utf8');
      const fim = txt.lastIndexOf('\n') + 1; // so linhas completas
      for (const linha of txt.slice(0, fim).split('\n')) {
        if (ATIVA.test(linha)) st.ativo = true;
        else if (SAIR.test(linha)) st.ativo = false;
      }
      st.offset += Buffer.byteLength(txt.slice(0, fim), 'utf8');
    }
    if (/^\s*sair do modo equipe/i.test(prompt)) st.ativo = false;
    fs.writeFileSync(arqEstado, JSON.stringify(st));

    if (st.ativo) process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: LEMBRETE },
    }));
  } catch {}
});
