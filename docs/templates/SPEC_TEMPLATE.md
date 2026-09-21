# SPEC-XXX — Nome da feature

| Campo | Valor |
|---|---|
| Status | Rascunho / Aprovado / Implementado |
| PRD | [PRD-XXX](../prd/PRD-XXX-nome.md) |
| Data | AAAA-MM-DD |

## 1. Resumo técnico
Em 3–5 linhas, como a feature será construída.

## 2. Modelo de dados
Mudanças no `schema.prisma` (tabelas, colunas, índices) e/ou na estrutura do documento Yjs.
Migrations necessárias e se exigem backfill.

## 3. API
| Método | Rota | Papel mínimo | Body (schema Zod) | Resposta |
|---|---|---|---|---|

## 4. Tempo real (Yjs / Hocuspocus)
Novos campos no documento, eventos de awareness, regras de somente leitura.

## 5. Frontend
Rotas, componentes, estados (carregando, vazio, erro, offline), atalhos de teclado.

## 6. Segurança
- Autorização: como cada rota/conexão checa acesso.
- Validação de entrada, limites de tamanho, rate limit.
- Riscos específicos desta feature e mitigação.

## 7. Plano de testes
- Unidade: ...
- Integração (API + banco): ...
- E2E (se houver fluxo crítico): ...

## 8. Tarefas (em ordem)
1. [ ] ...

## 9. Variáveis de ambiente novas
| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|

## 10. Riscos e decisões pendentes
