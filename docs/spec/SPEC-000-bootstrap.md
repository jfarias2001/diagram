# SPEC-000 — Fundação do projeto (bootstrap)

| Campo | Valor |
|---|---|
| Status | Implementado |
| PRD | — (infraestrutura; autorizado diretamente pelo usuário na conversa inicial) |
| Data | 2026-09-21 |

## 1. Resumo técnico
Criar o esqueleto do monorepo, com build, deploy e segurança de base funcionando de ponta a ponta, **sem nenhuma regra de negócio**. Tudo o que é feature (login, documentos, editor real) entra via PRD-001/SPEC-001.

## 2. Entregas
1. pnpm workspace: `apps/api`, `apps/web`, `packages/shared`; TypeScript estrito compartilhado (`tsconfig.base.json`).
2. `apps/api` (Fastify 5):
   - Leitura e validação das variáveis de ambiente com Zod (falha no boot se faltar algo).
   - Plugins: `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, checagem de `Origin` em métodos que alteram estado, handler de erro que nunca vaza detalhe interno.
   - `GET /api/v1/health` → `{ status: "ok", db: "ok" }` (testa o Postgres com `SELECT 1`), 503 se o banco não responder.
   - Prisma configurado (schema vazio por enquanto; models entram na SPEC-001).
   - Logger pino com `redact` de cookies e headers de autenticação.
   - Build com `tsup` (empacota `@diagram/shared`).
3. `apps/web` (React + Vite + Tailwind v4):
   - Página inicial com um **protótipo visual** de mapa mental em React Flow, layout automático à esquerda/direita da raiz, só em memória (sem salvar) — serve para validar a lib de canvas.
   - Indicador de status da API (`/api/v1/health`).
   - Proxy do Vite para `/api` e `/collab` em dev.
4. `packages/shared`: tipos e schemas Zod iniciais do documento (`DocumentType`, `Role`, `MindMapNode`).
5. Infra:
   - `docker-compose.yml` de produção com `postgres`, `api`, `web`, `autoheal`, labels do Traefik (`leresolver`, rede externa `traefik`).
   - `docker-compose.dev.yml` só com Postgres para desenvolvimento local.
   - Dockerfiles multi-stage, containers não-root.
   - nginx do `web` com SPA fallback, cache de assets e cabeçalhos de segurança (CSP, HSTS, frame-ancestors, etc.).
   - `.env.example` documentado.

## 3. Segurança
- Postgres sem porta publicada em produção.
- `POSTGRES_PASSWORD`, `SESSION_SECRET` obrigatórios (`:?` no compose).
- Todos os cabeçalhos da checklist aplicados no nginx (web) e via helmet (api).
- Checagem de `Origin` pronta para quando existirem rotas de escrita.

## 4. Fora de escopo
Autenticação, documentos, editor persistente, Hocuspocus — tudo em SPEC-001.
