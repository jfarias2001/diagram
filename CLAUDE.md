# CLAUDE.md — Paglamp Diagram

> **ANTES DE QUALQUER COISA: leia o [STORY.md](STORY.md).** Ele é o diário do projeto: o que já foi feito, o que está pela metade e o que ficou pendente. Não comece nenhuma tarefa sem ter lido pelo menos as 5 entradas mais recentes.

---

## 1. O que é este projeto

Clone privado do [MindMeister](https://www.mindmeister.com/pt) para uso **exclusivo e interno** dos colaboradores da Paglamp, com suporte adicional a **diagramas** (fluxogramas, organogramas, diagramas de processo).

- URL de produção: **https://diagram.paglamp.com.br**
- Público: somente funcionários da empresa. **Não existe cadastro público.**
- Idioma da interface: português do Brasil.
- Hospedagem: VPS própria, Docker Compose, Traefik como proxy reverso (cert resolver `leresolver`).

## 2. Stack (detalhes e justificativas em [docs/adr/ADR-001-stack.md](docs/adr/ADR-001-stack.md))

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces (`apps/*`, `packages/*`) |
| Linguagem | TypeScript estrito em tudo |
| Frontend | React 19 + Vite (SPA), React Router, TanStack Query, Tailwind CSS v4 |
| Canvas | `@xyflow/react` (React Flow) para mapas e diagramas; layout automático com `d3-hierarchy` (mapas) e `elkjs` (diagramas) |
| Colaboração em tempo real | Yjs (CRDT) + Hocuspocus rodando dentro da API (ver [ADR-002](docs/adr/ADR-002-colaboracao-tempo-real.md)) |
| Backend | Node 24 + Fastify 5, validação com Zod |
| Banco | PostgreSQL 16 + Prisma |
| Autenticação | E-mail + senha (argon2id), sessão opaca em cookie httpOnly, acessos criados pelo admin — sem cadastro público nem SSO (ver [ADR-003](docs/adr/ADR-003-autenticacao.md)) |
| Testes | Vitest (unidade/integração), Playwright (e2e, quando houver fluxos críticos) |
| Deploy | Docker Compose + Traefik (`leresolver`), imagens `web` (nginx) e `api` (node) |

Não troque nenhuma peça da stack sem abrir um ADR novo e ter aprovação.

## 3. Estrutura do repositório

```
.
├── CLAUDE.md                 # este arquivo
├── STORY.md                  # diário do projeto — LER PRIMEIRO
├── apps/
│   ├── api/                  # Fastify + Prisma + Hocuspocus (porta 3001)
│   │   ├── prisma/           # schema.prisma e migrations
│   │   └── src/
│   │       ├── config/       # leitura/validação das variáveis de ambiente
│   │       ├── modules/      # um diretório por domínio (auth, maps, users...)
│   │       ├── plugins/      # plugins Fastify (segurança, db, auth)
│   │       └── server.ts
│   └── web/                  # React + Vite (servido por nginx em produção)
│       └── src/
│           ├── features/     # um diretório por domínio (maps, auth, editor...)
│           ├── components/   # componentes genéricos de UI
│           └── lib/          # cliente HTTP, helpers
├── packages/
│   └── shared/               # schemas Zod e tipos compartilhados entre web e api
├── docs/
│   ├── templates/            # modelos de PRD, SPEC e ADR
│   ├── prd/                  # PRD-XXX-nome.md
│   ├── spec/                 # SPEC-XXX-nome.md
│   └── adr/                  # ADR-XXX-nome.md
├── infra/                    # nginx, scripts de backup, etc.
├── docker-compose.yml        # produção (VPS)
└── docker-compose.dev.yml    # só o Postgres para desenvolvimento local
```

## 4. Comandos

```bash
cp .env.example .env                 # primeira vez: variáveis de dev
pnpm install                         # instala tudo
pnpm db:local                        # Postgres local SEM Docker (PGlite, porta 5432) — deixe rodando
pnpm db:deploy                       # aplica as migrations no banco do .env
pnpm dev                             # api (3001) + web (5173) em paralelo
pnpm typecheck                       # tsc em todos os pacotes
pnpm lint                            # lint em todos os pacotes
pnpm test                            # unidade + integração (sobe PGlite em memória sozinho)
pnpm test:e2e                        # Playwright no Chrome instalado (sobe a pilha inteira)
pnpm build                           # build de produção
pnpm audit --prod                    # vulnerabilidades em dependências
```

**Sem Docker na máquina de desenvolvimento.** O banco local e o dos testes é o PGlite (Postgres em WebAssembly), servido pelo protocolo do Postgres. A URL precisa de `pgbouncer=true`.

**Nova migration:** altere o `schema.prisma` e rode `pnpm db:new-migration <nome_em_snake_case>` com o `pnpm db:local` rodando (compara o banco local com o schema; o `prisma migrate dev` não funciona com PGlite porque exige banco-sombra). Revise o SQL e rode `pnpm db:deploy`.

Deploy na VPS: `git pull && docker compose up -d --build`. As migrations rodam no entrypoint da API (`prisma migrate deploy`).

## 5. Fluxo de trabalho OBRIGATÓRIO

Toda **feature nova** segue estas etapas, nesta ordem. **Nunca pule etapas e nunca avance sem aprovação explícita do usuário.**

1. **PRD** — `docs/prd/PRD-XXX-nome-curto.md`, a partir de [docs/templates/PRD_TEMPLATE.md](docs/templates/PRD_TEMPLATE.md). Descreve o *problema e o quê*: objetivo, usuários, histórias, critérios de aceite, fora de escopo. Nada de detalhe técnico.
   → Status `Rascunho` → pedir aprovação → `Aprovado`.
2. **SPEC** — `docs/spec/SPEC-XXX-nome-curto.md`, a partir de [docs/templates/SPEC_TEMPLATE.md](docs/templates/SPEC_TEMPLATE.md), com o **mesmo número do PRD**. Descreve o *como*: modelo de dados, endpoints, eventos em tempo real, componentes, impacto em segurança, plano de testes, tarefas em ordem.
   → Status `Rascunho` → pedir aprovação → `Aprovado`.
3. **Implementação** — seguir a SPEC. Se durante a implementação a SPEC se mostrar errada, **pare, atualize a SPEC, explique a mudança e peça aprovação** antes de continuar. Referencie a SPEC nos comentários quando uma decisão não for óbvia (`// SPEC-004 §3.2`).
4. **Revisão de segurança** — passar a checklist da seção 9 em tudo que foi alterado, rodar `pnpm audit --prod` e registrar o resultado. Corrigir o que for encontrado antes de concluir.
5. **STORY.md** — adicionar uma entrada no **topo** (mais recente primeiro) seguindo o formato do próprio arquivo. Marcar PRD/SPEC como `Implementado`.
6. **Commit + push** — ao concluir **toda** atualização (feature, correção ou docs), fazer commit e `git push origin main` para `https://github.com/jfarias2001/diagram` **sem precisar pedir**. Antes: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes e `git status` conferido (nunca `.env`, `.pglite/`, dumps ou segredos). Mensagem no formato da §8. Nunca `--force` nem `--no-verify`. Se o push falhar (autenticação, conflito), avisar o usuário em vez de contornar.

**Numeração:** sequencial com 3 dígitos (`001`, `002`...). O próximo número é o maior existente em `docs/prd/` + 1. PRD e SPEC da mesma feature compartilham o número. Follow-ups de uma SPEC viram `SPEC-XXX-followup-nome.md`.

**Exceções (não precisam de PRD/SPEC):** correção de bug pequena e localizada, ajuste de texto/estilo, atualização de dependência, refatoração sem mudança de comportamento. Essas **ainda passam** pelas etapas 4 e 5.

**Decisões de arquitetura** (trocar biblioteca, mudar forma de sincronizar, novo serviço no compose, provedor de login) exigem um **ADR** em `docs/adr/` a partir de [docs/templates/ADR_TEMPLATE.md](docs/templates/ADR_TEMPLATE.md).

## 6. Glossário do domínio

Use sempre estes termos — no código (em inglês, entre parênteses) e na interface (em português).

| Termo (UI) | Código | Significado |
|---|---|---|
| Documento | `Document` | Qualquer arquivo criado pelo usuário: um mapa mental ou um diagrama. |
| Mapa mental | `MindMap` (`type = MINDMAP`) | Documento em árvore, com um único nó raiz central. |
| Diagrama | `Diagram` (`type = DIAGRAM`) | Documento em grafo livre: formas ligadas por conectores. |
| Nó | `Node` | Uma caixa com texto. No mapa mental sempre tem um pai (exceto a raiz). |
| Raiz / tópico central | `root` | Nó sem pai do mapa mental. Não pode ser apagado. |
| Ramo | `branch` | Um nó e todos os seus descendentes. |
| Irmão | `sibling` | Nós com o mesmo pai. A ordem entre irmãos é explícita (`order`). |
| Forma | `Shape` | Nó de diagrama com um tipo visual (retângulo, losango, elipse...). |
| Conector | `Edge` | Ligação entre dois nós de diagrama, ou ligação cruzada extra em um mapa. |
| Pasta | `Folder` | Agrupamento de documentos no painel do usuário. |
| Versão | `Snapshot` | Cópia congelada do documento em um momento, usada no histórico. |
| Membro | `DocumentMember` | Vínculo usuário ↔ documento com um papel. |
| Papéis | `OWNER`, `EDITOR`, `COMMENTER`, `VIEWER` | Dono (tudo, inclusive apagar e compartilhar), Editor (edita), Comentador (lê e comenta), Leitor (só lê). |
| Administrador | `User.role = ADMIN` | Gerencia usuários da empresa. **Não** tem acesso automático ao conteúdo dos documentos. |

## 7. Regras específicas do editor

- **Integridade da árvore (mapa mental):** exatamente uma raiz; todo nó não-raiz tem `parentId` existente; mover um nó para dentro do próprio ramo é proibido (checar ciclo). Apagar um nó apaga o ramo inteiro.
- **Modelo de dados no Yjs:** nós ficam num `Y.Map` plano indexado por id (`{ id, parentId, order, text, style, ... }`), **não** em árvore aninhada — isso deixa edições concorrentes seguras. `order` é fracionário (string/float entre irmãos) para permitir inserir no meio sem renumerar.
- **Autosave:** não existe botão salvar. Toda alteração vai pelo Yjs; o servidor persiste com debounce. A UI mostra o estado ("Salvando…", "Salvo", "Offline").
- **Desfazer/refazer:** usar `Y.UndoManager` restrito às alterações do usuário local (não desfazer o que o colega fez).
- **Histórico de versões:** snapshot automático periódico e antes de operações destrutivas grandes (importação, restaurar versão). Restaurar cria um snapshot novo, nunca apaga histórico.
- **Desempenho:** o editor tem que continuar fluido com **1.000+ nós**. Evitar re-render global: seletores estreitos, `React.memo` nos nós customizados, layout calculado fora do render, sem `JSON.stringify` do documento inteiro a cada tecla.
- **Atalhos de teclado (padrão MindMeister):** `Tab` cria filho, `Enter` cria irmão, `Delete`/`Backspace` apaga, `F2` ou digitar edita, `Esc` sai da edição, setas navegam, `Ctrl+Z`/`Ctrl+Shift+Z` desfaz/refaz, `Espaço` colapsa/expande ramo. Atalhos não disparam enquanto o foco está num campo de texto.
- **Diagramas:** conectores sempre apontam para nós existentes; apagar um nó apaga seus conectores.
- **Import/Export:** formatos planejados — JSON próprio (ida e volta sem perda), PNG/SVG/PDF, OPML/Markdown e, se aprovado, `.mm` (FreeMind) e `.xmind`.

## 8. Convenções de código

- TypeScript `strict`, sem `any` (use `unknown` + validação). Sem `// @ts-ignore` sem comentário justificando.
- **Toda entrada externa é validada com Zod** (body, query, params, mensagens WebSocket, arquivos importados). Schemas que web e api compartilham ficam em `packages/shared`.
- Código (identificadores, nomes de arquivo) em **inglês**; textos de interface, mensagens de erro exibidas ao usuário, comentários e documentação em **português**.
- API REST versionada em `/api/v1/...`. Erros no formato `{ error: { code, message } }`. Nunca vazar stack trace ou mensagem do Prisma para o cliente.
- Backend organizado por módulo (`modules/<dominio>/{routes,service,schemas}.ts`). Regra de negócio fica no `service`, nunca na rota.
- Frontend organizado por feature. Estado do servidor com TanStack Query; estado do documento com Yjs; não duplicar o documento em outro store.
- Migrations do Prisma são imutáveis depois de aplicadas em produção — erro se corrige com migration nova.
- Commits no formato `tipo(escopo): descrição` (`feat`, `fix`, `docs`, `refactor`, `chore`, `security`), referenciando a SPEC quando houver.
- Testes: toda regra de autorização e toda regra de integridade da árvore tem teste automatizado.

## 9. Checklist de segurança (rodar após TODA alteração)

Antes de marcar qualquer tarefa como concluída, revise o que mudou contra esta lista e registre o resultado no STORY.md.

**Autorização (o risco nº 1 deste sistema)**
- [ ] Toda rota e toda conexão WebSocket que toca um documento chama `assertDocumentAccess(userId, documentId, papelMínimo)` no servidor. Trocar o ID na URL **não** pode abrir documento alheio (IDOR).
- [ ] Consultas ao banco filtram por usuário/membro — nunca `findUnique({ where: { id } })` de documento sem checar vínculo.
- [ ] `VIEWER` e `COMMENTER` recebem conexão Yjs **somente leitura** imposta no servidor (não basta esconder o botão).
- [ ] Mudança de papel ou remoção de membro derruba/rebaixa conexões em tempo real abertas daquele usuário.
- [ ] Admin não lê conteúdo de documentos por ser admin.

**Autenticação e sessão**
- [ ] Sem cadastro público; acessos criados **manualmente por um ADMIN**, com senha provisória exibida uma única vez e troca obrigatória no 1º login (ADR-003).
- [ ] Senhas com argon2id; nunca logar senha, hash, token ou cookie.
- [ ] Cookie de sessão `httpOnly`, `Secure`, `SameSite=Lax`, com expiração; sessão revogável no banco; logout invalida no servidor.
- [ ] Rate limit em login, troca de senha e convite.
- [ ] Requisições que alteram estado (POST/PUT/PATCH/DELETE) validam o header `Origin` contra `APP_URL` (proteção CSRF).
- [ ] O handshake do WebSocket valida a sessão e o `Origin`.

**Injeção e XSS**
- [ ] Texto de nó renderizado como texto. `dangerouslySetInnerHTML` proibido, salvo com DOMPurify e justificativa na SPEC.
- [ ] Links em nós aceitam só `http:`, `https:` e `mailto:` (bloquear `javascript:`, `data:`), abrem com `rel="noopener noreferrer"`.
- [ ] Nada de `$queryRawUnsafe`/concatenação de SQL; `$queryRaw` só com template tag.
- [ ] Export SVG/HTML escapa o texto dos nós.

**Arquivos (importação e anexos)**
- [ ] Limite de tamanho no upload e no documento descompactado (zip bomb em `.xmind`).
- [ ] XML (`.mm`, OPML) parseado **sem** entidades externas (XXE) e com limite de profundidade.
- [ ] Tipo do arquivo verificado pelo conteúdo, não pela extensão. SVG enviado pelo usuário nunca é servido inline.
- [ ] Anexos servidos com `Content-Disposition` adequado e `X-Content-Type-Options: nosniff`, fora da raiz estática.

**Tempo real / DoS**
- [ ] Limite de tamanho por mensagem WebSocket e por documento; limite de conexões por usuário.
- [ ] Mensagens Yjs de usuário somente leitura são descartadas no servidor.

**Infra e segredos**
- [ ] Segredos só no `.env` da VPS (nunca commitados). `.env.example` sem valores reais.
- [ ] Cabeçalhos: CSP restritiva, HSTS, `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `Referrer-Policy`, `nosniff`.
- [ ] Postgres sem porta exposta no host em produção.
- [ ] Logs sem conteúdo de documentos nem dados pessoais além do necessário.
- [ ] `pnpm audit --prod` sem vulnerabilidade alta/crítica não tratada.
- [ ] Containers rodam como usuário não-root.

## 10. Infra e deploy

- VPS com Traefik já existente, rede Docker externa `traefik` (variável `TRAEFIK_NETWORK`), cert resolver **`leresolver`** (variável `TRAEFIK_CERT_RESOLVER`).
- Roteamento em `diagram.paglamp.com.br`:
  - `PathPrefix(/api)` e `PathPrefix(/collab)` → container `api` (porta 3001), prioridade 100.
  - Todo o resto → container `web` (nginx, porta 8080), prioridade 10.
- Mesma origem para web e api: sem CORS, cookies simples.
- `api` tem healthcheck em `/api/v1/health` e label `autoheal=true`.
- Backup diário do Postgres é obrigatório antes de liberar para a empresa (PRD a ser feito).
- Nunca rode `prisma migrate reset`, `docker compose down -v` ou apague volumes na VPS.

## 11. Definition of Done

Uma tarefa só está pronta quando:
- [ ] Atende a todos os critérios de aceite do PRD e segue a SPEC.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` passam.
- [ ] Regras de autorização e integridade novas têm teste.
- [ ] Checklist de segurança revisada e resultado registrado.
- [ ] Novas variáveis de ambiente estão no `.env.example` e no `docker-compose.yml`.
- [ ] Entrada adicionada no topo do STORY.md; PRD/SPEC marcados como `Implementado`.
- [ ] Commit feito e enviado (`git push origin main`).

## 12. Nunca faça

- Implementar feature sem PRD e SPEC aprovados.
- Pular a revisão de segurança ou a entrada no STORY.md.
- Commitar `.env`, dumps de banco, chaves ou tokens.
- Confiar no frontend para autorização.
- Editar migration já aplicada, rodar comando destrutivo no banco/volumes de produção, ou dar `git push --force` na branch principal.
- Adicionar dependência pesada ou serviço novo no compose sem ADR.
- Criar cadastro público, link público sem expiração, ou qualquer acesso anônimo sem PRD aprovado.
- Guardar o documento inteiro em JSON a cada tecla ou fazer polling onde o Yjs já resolve.
- Dizer que algo está pronto sem ter rodado os checks.

## 13. Como se comunicar comigo

- Responda em português do Brasil, direto ao ponto.
- Ao terminar uma etapa, diga o que foi feito, o que falta e o que precisa da minha aprovação.
- Se algo estiver ambíguo no PRD, **pergunte** em vez de inventar regra de negócio.
- Ao encontrar falha de segurança fora do escopo da tarefa, avise e sugira um item no STORY.md — não corrija silenciosamente algo grande.
- Seja honesto: se um teste falhou ou uma etapa foi pulada, diga.
