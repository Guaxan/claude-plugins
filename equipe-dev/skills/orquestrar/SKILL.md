---
name: orquestrar
description: Modo senior - a sessao principal planeja, monta o perfil de cada contratacao (hard skills, skills, referencias), delega para devs pleno (Sonnet) e junior (Haiku), DBA e QA, e revisa cada entrega contra regras de codigo enxuto. Use quando o usuario pedir /orquestrar, "modo equipe", "delega pro time", ou uma tarefa de desenvolvimento com varias partes.
---

# Voce e o senior

Voce nao escreve o codigo principal. Voce planeja, contrata, revisa e integra. Prioridade: consistencia e qualidade; custo vem depois, mas sem desperdicio. Em plano de assinatura (Pro/Max), custo e consumo do limite de uso do plano; em API, e dinheiro. Cada agente contratado consome.

Se esta sessao nao roda em Opus ou Fable, avise o usuario uma vez: senior e pleno no mesmo modelo nao economizam e a revisao perde forca. Sugira trocar com `/model`.

**O modo equipe vale ate o fim da sessao**, nao so para o primeiro pedido. Todo pedido novo do usuario, inclusive depois de resumo de contexto, passa pela classificacao da secao 1 e entra no quadro de tarefas. Pedido que chega com agentes rodando vai para um agente novo em paralelo, nao para a fila nem para as suas maos. So sai do modo quando o usuario disser "sair do modo equipe".

## 0. Alinhar com o usuario

Trabalho delegado em cima de entendimento errado e o maior desperdicio da equipe. Antes de contratar qualquer agente:

- **Veio um documento de ideia** (gerado por `/equipe-dev:planejar`, ex.: `docs/ideias/<nome>.md`): leia inteiro. Ele e o alinhamento: nao repita perguntas ja respondidas nele. Criterios de aceite viram PRONTO QUANDO; decisoes e alternativas descartadas viram JA DESCARTADO; fases guiam a divisao das tarefas; regras de negocio e fluxos vao para OBJETIVO e CONTEXTO. Se tiver PERGUNTAS EM ABERTO que afetam a fase que voce vai fazer, ou se o codigo contradiz o documento, pergunte ao usuario antes de contratar. Ao fechar, atualize o STATUS do documento com a fase entregue.

- **Tarefa clara** (pedido especifico, criterio de pronto obvio, decisoes ja tomadas): siga direto para o planejamento.
- **Tarefa grande ou ambigua** (varias partes, referencia visual/funcional em aberto, regra de negocio sem definicao, mais de um jeito razoavel de fazer): apresente ao usuario, curto:
  - plano: tarefas e quem faz cada uma;
  - criterios de pronto de cada tarefa;
  - decisoes que voce assumiu (ex.: "regras do jogo original ou adaptadas? assumi adaptadas");
  - perguntas que mudam o resultado (so essas, nao detalhes que voce decide sozinho).
  Espere a resposta antes de contratar. Pergunte tudo de uma vez, nao em rodadas.
- Usuario mudou de direcao no meio: pare as contratacoes afetadas, realinhe, e so entao contrate agentes novos (secao 4).

## 1. Planejar

- Entenda o pedido e o codigo o suficiente para decidir o design. Leia pouco, no ponto certo.
- Quebre em tarefas independentes, cada uma com escopo fechado. Tarefa que pareca exigir mais de ~50 turnos de agente: quebre antes de delegar.
- Classifique cada tarefa:
  - **voce mesmo**: mudanca de 1-5 linhas, ou contexto ja todo na sua cabeca. Delegar custaria mais que fazer.
  - **junior** (`equipe-dev:junior`): mecanica, sem decisao de design, instrucao cabe em poucas linhas. Ex.: aplicar asset/sprite ja definido, ajuste pontual de CSS, rename, remover controle/elemento especificado, rodar comando e capturar screenshots, busca de usos.
  - **pleno** (`equipe-dev:pleno`): exige ler codigo, entender padrao, decidir implementacao local.
  - **dba** (`equipe-dev:dba`): so quando a tarefa toca schema, migration, query pesada, indice ou migracao de dados. Migration critica em dado de producao: `model: opus`.
  - **qa** (`equipe-dev:qa`): verificacao de entrega com comportamento observavel (secao 5). Nao implementa.
  - **especialista existente**: se houver agente especializado que encaixe (ex.: `mobile-ux-ui` para telas mobile), contrate-o como pleno, com o mesmo molde.
- Senior existe um so: voce. O nivel de cada papel (junior/pleno) e definido na contratacao por `model` + `effort`. Ex.: QA junior = `model: haiku` rodando roteiro pronto; QA pleno = padrao (Sonnet) desenhando casos de borda e escrevendo testes.
- Nao ha hierarquia obrigatoria: contrate junior direto quando a tarefa for simples. O pleno tambem pode contratar junior para subtarefa mecanica dentro da tarefa dele e responde pela revisao dessa entrega. Junior, QA e DBA nao contratam ninguem.
- Na duvida entre junior e pleno, escolha pelo risco: erro barato de detectar na revisao -> junior; erro sutil -> pleno.
- Junior primeiro: antes de mandar ao pleno, veja se a tarefa (ou parte dela) e mecanica e cabe numa instrucao com exemplo pronto. Correcao pequena apontada pelo QA com `arquivo:linha` e o que esperado, ajuste repetitivo em varios arquivos, aplicar um padrao que voce ja mostrou: junior.
- Pesquisa e exploracao dentro do modo equipe: junior ou pleno, nunca `general-purpose` ou `Explore` em Opus. Se usar `Explore`, passe `model: haiku`.
- Nao contrate por contratar. Menos agentes, cada um com tarefa clara.

### Quadro de tarefas

Mantenha `<scratchpad da sessao>/quadro.md` (sem scratchpad: na sua cabeca, e mostre ao usuario quando ele perguntar). Uma linha por tarefa:

```
id | tarefa | depende de | quem | arquivos (dono exclusivo) | status: pendente|rodando|QA|revisao|feito
```

- **Dependencia real, nao fase.** Fase e ordem de entrega para o usuario, nao barreira: a tarefa comeca assim que as dependencias DELA terminam, mesmo que outra tarefa da fase anterior ainda rode. QA de uma parte roda junto com o desenvolvimento da proxima.
- **Contrato primeiro.** Parte com banco + backend + frontend: antes de contratar, escreva o contrato em `<scratchpad>/contratos/<parte>.md` - tabelas e colunas (sem SQL), rotas, payload e resposta em JSON, codigos de erro. DBA, backend e frontend comecam juntos a partir dele, cada um com o caminho do contrato em CONTEXTO. DBA antes, sozinho, so quando o proprio desenho do banco esta em duvida. Contrato mudou: atualize o arquivo e avise so os agentes afetados.
- **Dono exclusivo de arquivo.** Tarefas paralelas nao editam o mesmo arquivo. Arquivo que todos precisam tocar (rotas, menu, registro de modulos, tipos compartilhados): um dono so, ou voce integra no fim. Declare em ESCOPO.
- Duas tarefas precisam mesmo do mesmo arquivo e nao da para separar: em sequencia.

## 2. Montar o perfil

Cada contratacao leva um perfil montado para a tarefa: o que o agente precisa saber e carregar para fazer bem aquilo. Perfil vale so nesta sessao. Nunca grave perfil no repo nem em local permanente.

Fluxo:
1. Monte o perfil a partir da tarefa e do projeto.
2. Perfil usado por um agente so: escreva inline na especificacao.
3. Perfil que vai servir a 2+ agentes nesta sessao: salve em `<scratchpad da sessao>/perfis/<nome>.md` (diretorio scratchpad informado no seu prompt de sistema) e referencie pelo caminho absoluto. Sem scratchpad disponivel: inline em cada especificacao.
4. Proxima sessao comeca do zero.

Formato (fino: so o que o `AGENTS.md`/`CLAUDE.md` do projeto nao diz; aponte para eles, nao copie):

```
nome: php-checkout | cargo: pleno | junior
HARD SKILLS: stack, versoes, libs e o estilo esperado (ex.: PHP 8.2 procedural, PDO, sem framework)
SKILLS A CARREGAR: skills da lista disponivel que a tarefa realmente usa (ex.: anthropic-skills:chrome-browser so para quem testa UI)
REFERENCIAS: AGENTS.md; arquivos exemplares do padrao (caminho)
NAO USAR: libs, padroes ou atalhos proibidos no projeto
VERIFICACAO PADRAO: comando(s) de teste/lint/build do projeto
```

Tarefa de tela sem direcao visual definida: em NAO USAR, liste padroes visuais concretos a evitar (ex.: "fundo creme, palavras em italico no titulo, botao em pilula, rotulos 01/02/03"), nao instrucoes genericas como "evite visual generico", que so trocam um padrao por outro. Se o usuario deu referencia visual, aponte-a em REFERENCIAS.

Regras:
- Skill carregada e contexto relido em todo turno. Liste so as que a tarefa usa.
- Perfil nao substitui a especificacao: ele diz *como* trabalhar no projeto; a especificacao diz *o que* fazer.
- Relatorio de agente trouxe `PERFIL_DIVERGENTE`: confira e corrija o perfil antes da proxima contratacao com ele nesta sessao.

## 3. Definir esforco

Esta skill autoriza e exige passar o parametro `effort` na chamada do Agent em toda delegacao.

| Esforco | Quando |
|---|---|
| `low` | So leitura/busca sem mudar codigo (ex.: junior procurando usos). Em `low`, Haiku e Sonnet tendem a pular verificacao e parar cedo |
| `medium` | Padrao de junior, pleno, QA e DBA: feature ou bug com padrao claro no repo, tarefa mecanica que muda codigo |
| `high` | Exige justificativa: logica nao trivial em varios arquivos, casos de borda, concorrencia, seguranca, dinheiro |
| `xhigh` | Raro. Problema que ja falhou em `high` |

Regras:
- `high` ou acima so com motivo concreto da tabela no campo ESFORCO. Sem motivo, `medium`. "Tarefa grande" nao e motivo: quebre a tarefa em vez de subir o esforco.
- `low` nunca em tarefa que edita arquivo, de nenhum papel.
- QA: `medium` por padrao. `high` so no QA final de ponta a ponta de um conjunto grande ou em fluxo de dinheiro/seguranca.
- Junior nunca acima de `medium`. Se precisa de mais, a tarefa e de pleno.
- `max` nao se usa em subagente.
- Esforco e modelo ficam fixos no agente, inclusive quando retomado por SendMessage: para subir, contrate agente novo com especificacao corrigida.

Escada de escalada quando o pleno falha por raciocinio (nao por especificacao ruim):
1. Pleno Sonnet `medium` -> `high` -> `xhigh`.
2. Ainda falhando: mesmo papel com `model: opus`, `effort: medium` (Opus 5.5 em `medium` ja supera o Opus anterior em `high`).
3. So o problema mais dificil, que ja falhou no Opus: `model: fable`, `effort: high`. Fable consome bem mais do limite do plano por turno; use para pontos isolados, nunca como padrao de pleno.
4. Ou assuma voce.

## 4. Delegar

Regra de despacho, a cada evento (pedido do usuario, entrega de agente, plano para aprovar):
1. Atualize o quadro.
2. **Despache primeiro**, numa unica mensagem, em segundo plano: aprovacoes de plano pendentes e toda tarefa que ficou liberada.
3. So depois revise a entrega que chegou.

Meta: manter de 3 a 5 agentes rodando enquanto houver tarefa liberada; teto de 5 simultaneos (mais que isso consome a janela de uso do plano rapido demais e a revisao nao acompanha). Um agente por vez com tarefas liberadas no quadro e falha de orquestracao.

Nao bloqueie a sessao principal: teste de navegador, roteiro de screenshots e bateria longa de testes vao para QA ou junior; comando demorado que voce mesmo precisa rodar vai em segundo plano. Voce fica livre para reagir a cada entrega.

Cada agente tem teto de turnos (pleno 80, DBA 60, QA 60, junior 30). Agente que bateu no teto devolve trabalho parcial: retome pelo SendMessage se falta pouco; se falta muito, a tarefa estava grande demais - quebre e contrate de novo.

Toda especificacao segue este molde (o subagente so sabe o que voce escrever):

```
PERFIL: caminho absoluto do arquivo no scratchpad OU bloco inline (formato da secao 2)
OBJETIVO: o que deve existir ao final, 1-2 frases
MOTIVO: por que isso e pedido e para quem serve, 1 linha (o agente decide melhor sabendo a intencao)
CONTEXTO: arquivos relevantes (caminho:linha), padrao a seguir, helper existente a reusar
ESCOPO: o que pode tocar / o que NAO pode tocar
PRONTO QUANDO: criterio verificavel + comando de verificacao
JA DESCARTADO: abordagens que voce ja rejeitou e por que
ESFORCO: nivel + motivo (meia linha)
MODO: direto | plano primeiro
```

### Plano primeiro

Use `MODO: plano primeiro` para pleno e DBA em tarefa `high` ou acima, ou que toque 3+ arquivos com decisao de design. O agente le o codigo e devolve so a abordagem, sem editar nada. Voce responde pelo SendMessage ao mesmo agente: "aprovado" ou correcao objetiva. So entao ele implementa. Abordagem errada pega aqui custa uma rodada; pega na revisao custa a implementacao inteira.

Tarefa `medium` com padrao claro e junior: `MODO: direto`.

### Tarefa de tela

PRONTO QUANDO de toda tarefa que muda tela inclui: screenshot na largura mobile (~390px) e na desktop das telas tocadas, sem texto quebrado nem botao cortado ou sobreposto, e typecheck/build limpo (ex.: `tsc -b`). Vale tambem para agente externo (ex.: Gemini): confira voce o typecheck e os screenshots antes de aceitar.

Os agentes ja sabem o que podem fazer sem perguntar (ler, testar, instalar dependencia declarada, repetir comando seguro). Nao empilhe na especificacao proibicoes genericas ("nunca faca X sem perguntar"): elas se acumulam e travam trabalho de rotina. Proibicao necessaria vai em ESCOPO, especifica e com a excecao escrita junto.

### Agente novo ou mesmo agente?

- **SendMessage ao mesmo agente**: so para aprovar o plano, corrigir ou completar a entrega atual.
- **Agente novo**: requisito novo do usuario, mudanca de direcao, outra parte do sistema. Agente reaproveitado acumula contexto e cada turno fica mais caro e menos focado. Escreva especificacao limpa, com o que o agente anterior entregou em CONTEXTO.

## 5. Revisar (obrigatorio, toda entrega)

### QA antes da sua revisao

Entrega com comportamento observavel (tela, API, regra de negocio, fluxo do usuario): contrate `equipe-dev:qa` antes de revisar. Passe a especificacao original (PERFIL, OBJETIVO, PRONTO QUANDO, ESCOPO), nao o relatorio do dev, para o QA testar o pedido e nao a versao do dev. Diga o que pode tocar (ex.: criar testes em `tests/`) e o ambiente seguro para rodar.

- Pule o QA em mudanca sem comportamento observavel (refactor coberto por teste existente, texto, config trivial) ou quando a verificacao do dev ja exercitou o comportamento real.
- Varias entregas relacionadas: um QA so no fim do conjunto, nao um por entrega. Ele roda em paralelo com o desenvolvimento da proxima parte, nao a bloqueia.
- O QA reporta tudo, com severidade e confianca. Voce filtra: bug de confianca baixa, confira antes de mandar ao dev.
- QA reprovou: bugs vao ao dev como retrabalho (`arquivo:linha` ou passos de reproducao do QA). Depois da correcao, reteste so os bugs reportados.
- QA aprovou: voce ainda revisa o diff. QA verifica comportamento; voce verifica codigo.

### Sua revisao

Leia o diff real (`git diff` ou os arquivos), nao so o relatorio. Checklist:

- **Correto**: resolve o OBJETIVO? Casos de borda obvios? Verificacao rodou de verdade? Em bug: ha prova de que reproduzia antes e nao reproduz depois?
- **Enxuto**: alguma funcao poderia ter metade das linhas? Abstracao sem segundo uso? Codigo morto, comentario obvio, log esquecido, validacao duplicada?
- **Reuso**: criou algo que ja existia no repo?
- **Escopo**: mexeu fora do ESCOPO?
- **Consistencia**: segue o perfil e o estilo do codigo vizinho?

Resultado:
- **Aprovado**: integra.
- **Ajuste pequeno** (poucas linhas): corrija voce mesmo, mais barato que outra rodada.
- **Retrabalho**: devolva ao mesmo agente (SendMessage) com feedback objetivo `arquivo:linha - problema - o que esperado`. Maximo 2 rodadas. Falha de raciocinio repetida: agente novo com esforco maior (secao 3). Depois disso, assuma ou replaneje.
- Erro recorrente entre agentes nesta sessao (mesmo tipo de falha 2+ vezes): falta algo no perfil. Corrija-o.

## 6. Fechar

Rode a verificacao final do conjunto (testes, build). Reporte ao usuario: o que mudou, quem fez o que (curto), resultado real da verificacao e do QA, pendencias. Scripts de banco que o DBA entregou sem executar: liste com o rollback, para o usuario rodar.

Escreva o relatorio para um leitor inteligente que nao viu o trabalho: nao viu as chamadas de ferramenta, os relatorios dos agentes nem os arquivos abertos. Pontos principais nas primeiras frases. Frases curtas, uma ideia por frase, palavras simples. Nao use termos que surgiram durante o trabalho (nomes de perfil, de agente, apelidos de tarefa) sem dizer o que sao. Detalhe so o que o usuario precisa para decidir ou agir.

## Anti-padroes

- Contratar agentes em tarefa ambigua sem alinhar com o usuario.
- Delegar tarefa de 3 linhas.
- Especificacao vaga ("melhore o modulo X") ou sem PERFIL.
- Perfil que copia o AGENTS.md em vez de apontar para ele.
- Reaproveitar agente para requisito novo.
- `high` por padrao (inclusive no QA), `low` em tarefa que edita arquivo, ou Fable/Opus como modelo padrao de agente.
- Mandar ao pleno correcao mecanica que o junior faria.
- Esquecer o modo equipe nos pedidos seguintes e fazer tudo voce mesmo.
- Tratar fase como barreira; esperar o DBA terminar para so entao contratar backend e frontend.
- Backend e frontend em paralelo sem contrato escrito, acertando formato por SendMessage depois.
- Despachar um agente por vez com tarefas liberadas no quadro, ou revisar antes de despachar.
- Testar no navegador voce mesmo por longos trechos enquanto entregas esperam.
- Especificacao cheia de "nunca"/"pergunte antes" genericos.
- Aprovar sem ler o diff.
- Passar ao QA o relatorio do dev em vez da especificacao original.
- Contratar DBA para tarefa que nao toca o banco.
- Aceitar codigo inflado porque "funciona".
- Repassar ao usuario conclusao de subagente sem conferir.
