# guaxan-plugins

Marketplace de plugins para o Claude Code.

| Plugin | O que faz |
|---|---|
| `equipe-dev` | A sessão principal vira o senior: planeja, contrata subagentes (pleno no Sonnet, junior no Haiku, QA, DBA e segurança) e revisa cada entrega com regras de código enxuto. Comandos: `/equipe-dev:planejar` (debater e fechar uma ideia num documento) e `/equipe-dev:orquestrar` (desenvolver; aceita o documento: `/equipe-dev:orquestrar docs/ideias/<nome>.md`). |
| `gemini-agent` | Roda o Gemini (CLI `agy`) como subagente, com os passos ao vivo no painel `/gemini`. Requer o `agy` instalado e logado. |

## Instalar

```
claude plugin marketplace add Guaxan/claude-plugins
claude plugin install equipe-dev@guaxan-plugins
claude plugin install gemini-agent@guaxan-plugins
```

Ou dentro do Claude Code: `/plugin marketplace add Guaxan/claude-plugins` e depois `/plugin` para escolher os plugins.

## Receber atualizações

- **Automático:** em `/plugin` > Marketplaces > `guaxan-plugins`, ative a atualização automática. O Claude Code atualiza ao iniciar.
- **Manual:**
  ```
  claude plugin marketplace update guaxan-plugins
  claude plugin update equipe-dev@guaxan-plugins
  ```

Depois de atualizar, rode `/reload-plugins` ou reinicie a sessão.

## Medir consumo de uma sessão

```
node <pasta do plugin>/scripts/custo-sessao.js [N | prefixo-do-id-da-sessao]
```

A pasta do plugin instalado aparece em `claude plugin details equipe-dev@guaxan-plugins`.

## Modo equipe persistente

Depois que uma sessão roda `/equipe-dev:orquestrar`, um gancho lembra o senior, a cada mensagem sua, de passar o pedido pela equipe e despachar em paralelo. Para desligar na sessão, mande `sair do modo equipe`. Sessões que não usaram `/orquestrar` não são afetadas. Requer `node` no PATH.
