# ADR-001 — Stack do projeto

| Campo | Valor |
|---|---|
| Status | Aceito |
| Data | 2026-09-21 |

## Contexto
Sistema web interno, estilo MindMeister, com mapas mentais **e** diagramas, edição colaborativa e hospedagem na VPS da empresa atrás do Traefik. Time pequeno, que já mantém outro projeto (Lumen) em pnpm monorepo + Node + Postgres + Docker Compose. Não há necessidade de SEO: tudo fica atrás de login.

## Decisão
- **pnpm monorepo** com `apps/web`, `apps/api` e `packages/shared` — mesmo padrão do Lumen, facilita manutenção.
- **Frontend: React 19 + Vite (SPA)**, servido como estático por nginx. O editor é 100% client-side (canvas); SSR do Next.js não traria ganho e adicionaria um servidor Node a mais.
- **Canvas: React Flow (`@xyflow/react`, MIT)**. Serve para os dois tipos de documento: mapa mental (nós + arestas com layout em árvore calculado por `d3-hierarchy`) e diagrama (formas livres + conectores, layout automático opcional com `elkjs`). Nós são componentes React, então editar texto, ícones e estilos é trivial.
- **Backend: Fastify 5** (rápido, plugins oficiais de segurança: helmet, rate-limit, cookie) com **Zod** para validação.
- **Banco: PostgreSQL 16 + Prisma.**
- **Tempo real: Yjs + Hocuspocus** embutido no processo da API (detalhes em ADR-002).
- **Estilo: Tailwind CSS v4.**
- **Testes: Vitest; Playwright para e2e.**

## Alternativas consideradas
| Opção | Prós | Contras |
|---|---|---|
| Next.js (igual Lumen) | Time conhece | SSR sem utilidade num editor canvas; mais um runtime Node em produção |
| tldraw | Canvas excelente | Licença comercial paga para uso em produção; foco em whiteboard, não em árvore |
| Excalidraw | MIT, ótimo para rascunho | Estilo "mão livre", não se encaixa em mapa mental estruturado |
| GoJS / JointJS+ | Muito completos | Licença paga |
| NestJS | Estrutura opinativa | Mais cerimônia do que o projeto precisa |

## Consequências
- Uma única lib de canvas para os dois editores: componentes, atalhos e export compartilhados.
- Web e API na mesma origem (`diagram.paglamp.com.br`), roteadas pelo Traefik por caminho → sem CORS.
- Qualquer troca de peça da stack exige novo ADR.
