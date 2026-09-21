# SPEC-001 — MVP: login, painel e editor de mapas mentais colaborativo

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-21) |
| PRD | [PRD-001](../prd/PRD-001-mvp-mapas-mentais.md) |
| ADRs | [ADR-002](../adr/ADR-002-colaboracao-tempo-real.md), [ADR-003](../adr/ADR-003-autenticacao.md) |
| Data | 2026-09-21 |

## 1. Resumo técnico

A API ganha autenticação por sessão opaca em cookie, gestão manual de usuários pelo admin, CRUD de documentos com papéis por membro e um servidor Hocuspocus v4 embutido em `/collab`, que guarda cada mapa como estado binário do Yjs no Postgres. O web ganha rotas (login, troca de senha, painel, editor, admin). O protótipo em memória da SPEC-000 é substituído por um editor ligado ao Y.Doc, com colaboração em tempo real, presença, autosave e desfazer por usuário.

A autorização fica concentrada em **uma** função (`assertDocumentAccess`), usada tanto pelas rotas REST quanto pela conexão WebSocket.

## 2. Modelo de dados

### 2.1 Prisma

```prisma
enum UserRole     { ADMIN MEMBER }
enum DocumentType { MINDMAP DIAGRAM }
enum MemberRole   { OWNER EDITOR COMMENTER VIEWER }

model User {
  id                 String    @id @default(cuid())
  email              String    @unique            // sempre minúsculo e sem espaços
  name               String
  role               UserRole  @default(MEMBER)
  passwordHash       String
  mustChangePassword Boolean   @default(true)
  active             Boolean   @default(true)
  failedLoginCount   Int       @default(0)
  lockedUntil        DateTime?
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  sessions           Session[]
  memberships        DocumentMember[]
  ownedDocuments     Document[] @relation("owner")
}

model Session {
  id         String   @id @default(cuid())
  tokenHash  String   @unique                     // SHA-256 do token; o token em si nunca é salvo
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  ip         String?
  userAgent  String?  // truncado em 256
  @@index([userId])
}

model Document {
  id             String       @id @default(cuid())
  type           DocumentType @default(MINDMAP)
  title          String                           // 1..200
  ownerId        String
  owner          User         @relation("owner", fields: [ownerId], references: [id])
  yState         Bytes?                           // estado binário do Y.Doc
  searchText     String       @default("")        // texto dos nós, até 10k chars (busca)
  sizeBytes      Int          @default(0)
  trashedAt      DateTime?
  lastEditedById String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  members        DocumentMember[]
  @@index([ownerId, trashedAt])
}

model DocumentMember {
  documentId String
  userId     String
  role       MemberRole
  addedById  String?
  createdAt  DateTime   @default(now())
  document   Document   @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([documentId, userId])
  @@index([userId])
}

model AuditEvent {
  id        String   @id @default(cuid())
  actorId   String?
  action    String   // ex.: auth.login, auth.login_failed, user.created, user.password_reset,
                     //      user.deactivated, document.shared, document.unshared, document.trashed
  targetId  String?
  meta      Json?    // nunca senha, token ou conteúdo de documento
  ip        String?
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```

Regras:
- O dono **também** tem uma linha em `DocumentMember` com `OWNER`. Assim toda checagem de acesso consulta uma tabela só. Existe exatamente um `OWNER` por documento; a transferência de posse fica fora deste MVP.
- Usuário **não é apagado**, só desativado (`active = false`), para não quebrar autoria nem posse.
- Um job na API (a cada hora) apaga de vez os documentos com `trashedAt` há mais de `TRASH_RETENTION_DAYS` (padrão 30).

### 2.2 Estrutura do Y.Doc (mapa mental)

```
nodes: Y.Map<nodeId, Y.Map>   // lista plana (ADR-002)
  ├─ id: string
  ├─ parentId: string | null  // null só na raiz
  ├─ order: number            // fracionário entre irmãos
  ├─ text: string             // até 2.000 chars
  ├─ color?: '#rrggbb'
  ├─ bold?: boolean
  └─ collapsed?: boolean      // compartilhado entre todos, como no MindMeister
meta: Y.Map
  └─ version: 1               // versão do formato, para migrar no futuro
```

- **Criação:** ao criar um documento, a API monta o Y.Doc inicial (raiz com o texto = título) e grava em `yState`.
- **Reparo de árvore** (edições simultâneas podem gerar nó órfão, quando alguém apaga o pai enquanto outro cria um filho, ou ciclo, quando dois movimentos cruzam): o cliente, ao montar a árvore, detecta nós cujo caminho não chega à raiz e os **reanexa à raiz**. A escrita de reparo é determinística (`parentId = rootId`, `order` = maior + 1) e idempotente, então dois clientes reparando ao mesmo tempo chegam ao mesmo resultado. Se houver mais de uma raiz, vale a de menor `id`; as outras viram filhas dela.
- `nodeId` é gerado no cliente com `crypto.randomUUID()`.

## 3. API REST

Todas as rotas ficam em `/api/v1`, exigem sessão válida (exceto login) e usam Zod em body, params e query. Erros seguem `{ error: { code, message } }`.

**Sem acesso = 404**, nunca 403, para não revelar que um documento existe.

### 3.1 Autenticação

| Método | Rota | Quem | Body | Resposta / efeito |
|---|---|---|---|---|
| POST | `/auth/login` | público | `{ email, password }` | 200 `{ user }` + cookie de sessão. 401 genérico `INVALID_CREDENTIALS` (mesma resposta para e-mail inexistente, senha errada ou usuário inativo). 423 `ACCOUNT_LOCKED` durante o bloqueio. |
| POST | `/auth/logout` | logado | — | apaga a sessão no banco e o cookie |
| GET | `/auth/me` | logado | — | `{ id, name, email, role, mustChangePassword }` |
| POST | `/auth/change-password` | logado | `{ currentPassword, newPassword }` | troca a senha, zera `mustChangePassword`, **apaga todas as outras sessões** do usuário |

- **Cookie:** `__Host-sid` em produção (`Secure`, `Path=/`, sem `Domain`) e `sid` em dev (http://localhost). Sempre `HttpOnly`, `SameSite=Lax`. O conteúdo é um token aleatório de 32 bytes em base64url.
- **Expiração:** a sessão dura 7 dias e é renovada com o uso quando faltam menos de 3,5 dias, até o limite absoluto de 30 dias desde o login. `lastSeenAt` é atualizado no máximo 1 vez a cada 5 min.
- **Troca de senha obrigatória:** enquanto `mustChangePassword = true`, qualquer rota fora de `/auth/*` responde 403 `PASSWORD_CHANGE_REQUIRED`, e o WebSocket recusa a conexão.
- **Força bruta:**
  - rate limit na rota de login: 10 tentativas por minuto por IP;
  - por usuário, após 10 falhas seguidas, bloqueio de 15 min (`lockedUntil`); login bem-sucedido zera o contador.
- **Tempo constante:** com e-mail inexistente, a API ainda roda um `verify` do argon2 contra um hash fictício, para o tempo de resposta não revelar quais e-mails existem.
- **Política de senha:** de 10 a 128 caracteres, diferente do e-mail. Validada por um schema Zod em `packages/shared`.
- **Hash:** argon2id com os parâmetros padrão da `@node-rs/argon2` (m=19 MiB, t=2, p=1).

### 3.2 Administração de usuários (somente `ADMIN`)

| Método | Rota | Body | Resposta / efeito |
|---|---|---|---|
| GET | `/admin/users` | query `q?` | lista `{ id, name, email, role, active, mustChangePassword, lastLoginAt, createdAt }` |
| POST | `/admin/users` | `{ name, email, role }` | 201 `{ user, temporaryPassword }`. A senha provisória aparece **só nessa resposta** e nunca é logada. 409 se o e-mail já existir. |
| PATCH | `/admin/users/:id` | `{ name?, role?, active? }` | atualiza. Desativar apaga as sessões e derruba as conexões em tempo real. |
| POST | `/admin/users/:id/reset-password` | — | `{ temporaryPassword }`, `mustChangePassword = true`, apaga as sessões e derruba as conexões |

- **Senha provisória:** 16 caracteres de um alfabeto sem ambiguidade (sem `0/O/1/l/I`), gerada com `crypto.randomInt`.
- **Travas:**
  - o admin não pode desativar a si mesmo nem remover o próprio papel de admin;
  - o último admin ativo não pode ser rebaixado nem desativado (409 `LAST_ADMIN`).
- **Primeiro admin:** no boot, se não existir nenhum `ADMIN` e `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` estiverem definidos, a API cria o admin com `mustChangePassword = true` e loga apenas `"admin inicial criado"`. Se já existir algum admin, as variáveis são ignoradas.
- Toda ação desta seção gera um `AuditEvent`.

### 3.3 Documentos

| Método | Rota | Papel mínimo | Body / query | Resposta |
|---|---|---|---|---|
| GET | `/documents` | logado | `scope=mine\|shared\|trash`, `q?` (busca em título e `searchText`), `cursor?` | lista paginada (50) `{ id, title, type, myRole, owner: { name }, updatedAt }` |
| POST | `/documents` | logado | `{ title, type: 'MINDMAP' }` | 201 documento, com o criador como `OWNER` |
| GET | `/documents/:id` | VIEWER | — | metadados + `myRole` |
| PATCH | `/documents/:id` | EDITOR | `{ title }` | renomeia |
| POST | `/documents/:id/duplicate` | VIEWER | `{ title? }` | 201 cópia (mesmo `yState`), com quem duplicou como `OWNER` |
| POST | `/documents/:id/trash` | OWNER | — | `trashedAt = now`; derruba todas as conexões ao vivo |
| POST | `/documents/:id/restore` | OWNER | — | `trashedAt = null` |
| DELETE | `/documents/:id` | OWNER | — | só se já estiver na lixeira; apaga de vez |

- Documento na lixeira: para qualquer operação que não seja `restore` ou `DELETE`, a API responde 404, inclusive para o dono. No painel ele aparece só em `scope=trash` e só para o dono.
- A busca `q` usa `ILIKE` com parâmetro (sem SQL cru) e é limitada a 100 caracteres.

### 3.4 Compartilhamento

| Método | Rota | Papel mínimo | Body | Efeito |
|---|---|---|---|---|
| GET | `/documents/:id/members` | VIEWER | — | `[{ userId, name, email, role }]` |
| POST | `/documents/:id/members` | OWNER | `{ email, role: EDITOR\|COMMENTER\|VIEWER }` | adiciona. 404 `USER_NOT_FOUND` se não houver usuário **ativo** com esse e-mail. 409 se já for membro. |
| PATCH | `/documents/:id/members/:userId` | OWNER | `{ role }` | muda o papel (não pode virar `OWNER`) e rebaixa as conexões ao vivo daquele usuário |
| DELETE | `/documents/:id/members/:userId` | OWNER, ou o próprio usuário (sair) | — | remove e derruba as conexões ao vivo daquele usuário. O dono não pode se remover. |

- Rate limit do POST de membros: 30 por minuto por usuário. Ele funciona como "testar se o e-mail existe", mas o risco é aceitável porque só funcionários logados têm acesso.

### 3.5 Autorização central

```ts
// apps/api/src/modules/documents/access.ts
assertDocumentAccess(prisma, userId, documentId, minRole): Promise<{ document, role }>
```
- A função busca `DocumentMember` por `(documentId, userId)` junto com o documento.
- Lança 404 `NOT_FOUND` quando não há vínculo, quando o documento está na lixeira (salvo se `allowTrashed`) ou quando o papel é menor que `minRole` e o usuário não é membro. Se o usuário **é** membro mas o papel é insuficiente, lança 403 `INSUFFICIENT_ROLE`: ele já sabe que o documento existe.
- **Toda** rota de `/documents/:id/*` e o `onConnect` do WebSocket passam por ela.
- ADMIN não tem exceção.

## 4. Tempo real (Hocuspocus v4)

- **Dependências:**
  - `@hocuspocus/server@^4`, `@hocuspocus/extension-database@^4`, `yjs`, `y-protocols` e `@fastify/websocket` na API;
  - `@hocuspocus/provider@^4` e `yjs` no web.
- **Montagem:** `new Hocuspocus({...})` embutido na API. Uma rota `GET /collab` do `@fastify/websocket` chama `hocuspocus.handleConnection(socket, request)`, onde `request` é um `Request` montado a partir dos headers do upgrade. `maxPayload` do WebSocket = 2 MB.
- **`documentName`** é o id do documento.
- **Autenticação no `onConnect`** (roda sempre, não depende de token):
  1. o header `Origin` tem que ser igual à origem de `APP_URL`, senão a conexão é recusada;
  2. lê o cookie de sessão nos `requestHeaders` e valida a sessão, o usuário ativo e `mustChangePassword = false`;
  3. chama `assertDocumentAccess(userId, documentName, 'VIEWER')`;
  4. `connectionConfig.readOnly = role` é `VIEWER` ou `COMMENTER`;
  5. devolve o contexto `{ userId, name, role }`.
- **Persistência** (`extension-database`, com debounce de 2 s e máximo de 10 s):
  - `fetch` lê `yState`;
  - `store` grava `yState`, `sizeBytes`, `searchText` (textos dos nós, cortado em 10k), `lastEditedById` e `updatedAt`.
- **Limites:**
  - documento com mais de 5 MB: o `onChange` fecha as conexões de escrita daquele documento e loga um alerta; o conteúdo fica congelado até a solução manual;
  - no máximo 20 conexões simultâneas por usuário.
- **Revogação:** um registro em memória `userId → conexões` permite:
  - `disconnectUser(userId, documentId?)` ao remover um membro, rebaixar um papel, desativar um usuário, resetar uma senha ou trocar a própria senha;
  - `closeConnections(documentId)` ao mandar para a lixeira.

  O cliente reconecta sozinho e passa de novo pelo `onConnect` com o papel atualizado.
- **Presença (awareness):**
  - o cliente publica `{ user: { id, name, color }, selectedNodeId }`;
  - no `beforeHandleAwareness`, o servidor sobrescreve `user.id` e `user.name` com os valores do contexto, para ninguém conseguir se passar por outro nome.
- **Somente leitura:** o Hocuspocus já descarta as atualizações vindas de conexões `readOnly`. Um teste de integração garante isso.

## 5. Frontend

### 5.1 Rotas (React Router)

| Rota | Tela | Acesso |
|---|---|---|
| `/login` | Login | público |
| `/trocar-senha` | Troca de senha, obrigatória quando `mustChangePassword` | logado |
| `/` | Painel: abas **Meus mapas**, **Compartilhados comigo**, **Lixeira**, busca, botão **Novo mapa** | logado |
| `/m/:id` | Editor | membro |
| `/admin/usuarios` | Lista, criar, editar, desativar, redefinir senha | ADMIN |

- Um guard global usa `GET /auth/me` via TanStack Query:
  - 401 leva a `/login?next=...`, e o `next` só aceita caminho relativo interno, para evitar redirecionamento aberto;
  - `mustChangePassword` leva a `/trocar-senha`.
- **Senha provisória:** ao criar o acesso ou redefinir a senha, a tela mostra a senha num modal com botão **Copiar** e o aviso "Esta senha não será exibida novamente".
- O editor é carregado sob demanda (`lazy`), o que também resolve o bundle de 528 kB.

### 5.2 Editor

- `HocuspocusProvider` com `url = wss://<origem>/collab` (ou `ws://` em dev) e `name = documentId`.
- Um hook `useMindMap(doc)` observa `nodes` com `observeDeep` e publica um snapshot imutável em um `useSyncExternalStore`. O layout (`layoutMindMap`, já existente) roda em `useMemo`. Os nós do React Flow recebem `data` estável, e o `MindNode` segue memoizado.
- Todas as operações passam por `doc.transact(fn, LOCAL_ORIGIN)`:
  - criar filho ou irmão;
  - apagar ramo (bloqueado na raiz);
  - editar texto, cor ou negrito;
  - recolher e expandir;
  - mover (reparentar ou reordenar), com checagem `isInBranch` contra ciclo.
- **Desfazer:** `Y.UndoManager` sobre `nodes` com `trackedOrigins = {LOCAL_ORIGIN}`, para desfazer só o que o próprio usuário fez.
- **Atalhos:**
  - `Tab` (filho), `Enter` (irmão), `Delete`/`Backspace` (apagar), `F2` ou digitar (editar), `Esc` (sair da edição), `Espaço` (recolher);
  - setas: ← e → vão para o pai ou o primeiro filho conforme o lado do mapa; ↑ e ↓ vão para o irmão anterior ou o próximo;
  - `Ctrl+Z`, `Ctrl+Shift+Z` ou `Ctrl+Y` (desfazer e refazer) e `Ctrl+B` (negrito).
- **Arrastar:** ao soltar um nó sobre outro, ele vira filho do nó de destino. Ao soltar entre irmãos, ele é reordenado. A raiz não se arrasta.
- **Barra superior:**
  - título editável (EDITOR+);
  - status de salvamento: "Salvando…" quando há alterações não sincronizadas, "Salvo" depois do sync, "Offline" quando desconectado e "Somente leitura" quando for o caso;
  - avatares de presença (awareness);
  - botões **Compartilhar** (abre o modal de membros; edição só para OWNER) e **Exportar PNG**.
- **Painel lateral do nó selecionado** (EDITOR+): paleta de 8 cores e negrito.
- **Seleção dos colegas:** o nó selecionado por outro usuário ganha uma borda com a cor dele.
- **Exportar PNG:** `html-to-image` sobre o viewport ajustado a todos os nós (`getNodesBounds`), com fundo branco. O nome do arquivo é o título, sanitizado.
- **Modo leitura:** atalhos de edição e arrasto desligados, e um aviso na barra.
- **Links:** ficam fora deste MVP. `isSafeLink` já existe para quando entrarem.

## 6. Segurança

| Risco | Mitigação |
|---|---|
| IDOR (trocar id na URL/WS) | `assertDocumentAccess` em toda rota e no `onConnect`; 404 sem vínculo; teste por rota |
| Leitor escrevendo via WS forjado | `connectionConfig.readOnly`; teste de integração enviando update com conexão de leitor |
| Acesso continua após remoção | `disconnectUser` / `closeConnections`; teste |
| Força bruta / enumeração de e-mail | rate limit por IP, bloqueio por conta, resposta e tempo iguais para e-mail inexistente |
| Roubo de sessão | cookie `__Host-` HttpOnly Secure SameSite=Lax; token só como hash no banco; revogação |
| CSRF | checagem de `Origin` (já existe) em métodos de escrita e no upgrade do WS |
| XSS pelo texto do nó | texto renderizado como texto; ESLint bloqueia `dangerouslySetInnerHTML`; título do PNG sanitizado |
| Falsificar nome na presença | servidor sobrescreve `user.id`/`name` do awareness |
| DoS por documento gigante | `maxPayload` 2 MB, limite 5 MB por doc, 20 conexões/usuário, `bodyLimit` 1 MB no REST |
| Senha provisória vazando | exibida uma vez, nunca logada, troca obrigatória |
| Admin lendo mapas alheios | papel ADMIN não tem exceção em `assertDocumentAccess` |
| Redirecionamento aberto em `?next=` | só aceita caminho relativo iniciado por `/` e não por `//` |
| Logs com dados sensíveis | `redact` de cookie/senha; `AuditEvent.meta` sem senha, token ou conteúdo |

## 7. Plano de testes

Os testes de integração precisam de Postgres. Eles usam o `docker-compose.dev.yml` com um banco `diagram_test`, e a variável `TEST_DATABASE_URL` é aplicada via `prisma migrate reset --force` **só** nesse banco. Se o Docker não estiver disponível na máquina, os testes de integração rodam no CI/VPS; os de unidade rodam sempre.

- **Unidade:**
  - política de senha;
  - gerador de senha provisória (alfabeto e tamanho);
  - hash de token de sessão;
  - regras de renovação e expiração de sessão;
  - `hasRole`;
  - reparo de árvore (órfão, ciclo, duas raízes);
  - operações do editor sobre um Y.Doc (criar, apagar ramo, mover com bloqueio de ciclo, desfazer só local);
  - `searchText`;
  - validação de `next`.
- **Integração (API + Postgres):**
  - login ok, senha errada, e-mail inexistente (mesma resposta), bloqueio após 10 falhas, usuário inativo;
  - `mustChangePassword` bloqueando as rotas;
  - troca de senha revogando as outras sessões;
  - admin: criar, e-mail duplicado, trava do último admin, reset revogando sessões; MEMBER recebe 403 em `/admin/*`;
  - **matriz de permissões do PRD §7**: cada rota × cada papel × não-membro, gerada por tabela;
  - lixeira: 404 fora de restore/delete, purga após a retenção;
  - WebSocket (com `HocuspocusProvider` em Node):
    - sem cookie é recusado;
    - Origin errado é recusado;
    - não-membro é recusado;
    - update de leitor é ignorado;
    - update de editor é persistido;
    - remover membro derruba a conexão.
- **E2E (Playwright, 1 fluxo):** admin cria usuário → usuário faz login e troca a senha → cria um mapa → compartilha com o admin como Editor → os dois editam em abas diferentes e veem as alterações → o dono rebaixa o admin a Leitor → o admin não consegue mais editar.
- **Desempenho:** script que gera um mapa com 1.000 nós. Critério: digitar num nó sem travamento perceptível (sem frame acima de 50 ms no profiler).

## 8. Tarefas (em ordem)

1. [x] Schema Prisma + migration inicial; configurar o banco de teste.
2. [x] `packages/shared`: schemas Zod de auth, admin, documentos, membros e senha.
3. [x] API — sessão (plugin `auth`: cookie, `request.user`, guard `mustChangePassword`), login, logout, me, troca de senha, bloqueio, auditoria.
4. [x] API — seed do primeiro admin no boot.
5. [x] API — rotas de admin de usuários.
6. [x] API — `assertDocumentAccess` + rotas de documentos + lixeira + job de purga.
7. [x] API — rotas de membros.
8. [x] API — Hocuspocus em `/collab` (onConnect, persistência, limites, awareness, revogação).
9. [x] Testes de integração da API (inclui matriz de permissões e WebSocket).
10. [x] Web — roteamento, guard, login, troca de senha.
11. [x] Web — painel (abas, busca, novo, renomear, duplicar, lixeira).
12. [x] Web — admin de usuários (modal da senha provisória).
13. [x] Web — editor ligado ao Yjs (hook, operações, desfazer, reparo, atalhos, arrastar).
14. [x] Web — barra do editor: status, presença, compartilhar, exportar PNG, modo leitura.
15. [x] E2E Playwright + teste de 1.000 nós.
16. [x] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + STORY.md.

## 9. Variáveis de ambiente

| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|
| `SEED_ADMIN_EMAIL` | só na 1ª subida | — | e-mail do primeiro admin |
| `SEED_ADMIN_NAME` | não | `Administrador` | nome do primeiro admin |
| `SEED_ADMIN_PASSWORD` | só na 1ª subida | — | senha inicial (mín. 10); troca obrigatória no 1º login. **Apagar do `.env` depois da 1ª subida.** |
| `ALLOWED_EMAIL_DOMAINS` | não (passa a ser opcional) | vazio = qualquer e-mail | restrição opcional de domínio ao criar usuário |
| `TRASH_RETENTION_DAYS` | não | `30` | dias na lixeira antes de apagar de vez |
| `TEST_DATABASE_URL` | só nos testes | — | banco exclusivo de teste de integração |

## 10. Riscos e decisões pendentes

- **Hocuspocus v4 + Fastify:** a v4 usa `crossws` e recebe um `Request` padrão web. Se a integração com `@fastify/websocket` der problema, o plano B é tratar o `upgrade` no `server` HTTP do Node, direto no path `/collab`. Isso não muda nada fora da API.
- **Integridade concorrente da árvore:** o CRDT não impede ciclos e órfãos, e o reparo no cliente resolve (§2.2). Um editor malicioso poderia gravar lixo no documento; o risco é aceito porque editores são colegas autorizados e tudo é renderizado como texto.
- **Documento acima de 5 MB congelado:** improvável no uso real (1.000 nós ocupam cerca de 200 kB). Se acontecer, trata manualmente.
- **Backup:** continua obrigatório antes de liberar para a empresa. Fica como PRD separado.

## 11. Notas de implementação (desvios e decisões tomadas durante a implementação)

- **Testes sem Docker:** o usuário não pode instalar Docker. Os testes de integração e o E2E usam **PGlite** (Postgres compilado para WebAssembly) servido pelo protocolo TCP do Postgres (`apps/api/scripts/pglite-server.ts`). As migrations reais são aplicadas. Só funciona com `pgbouncer=true` na URL, porque o multiplexador do PGlite compartilha uma sessão e os *prepared statements* do Prisma colidiriam. `TEST_DATABASE_URL` continua disponível para rodar contra um Postgres de verdade. O mesmo PGlite serve para o desenvolvimento local (`pnpm db:local`).
- **Hocuspocus v4:** `handleConnection` não escuta o socket sozinho; a rota `/collab` repassa `message` e `close` (igual ao adaptador `crossws` deles). No cliente, com `websocketProvider` explícito é preciso chamar `provider.attach()`.
- **`LOGIN_RATE_LIMIT_MAX`** (padrão 10): o limite de login virou configurável para os testes; em produção fica o padrão.
- **`trustProxy`** confia só no salto imediato (Traefik). Com `true`, um `X-Forwarded-For` forjado furaria o rate limit (achado da revisão de segurança, com teste de regressão).
- **Na lixeira, só o dono enxerga** o documento, e só nas rotas de restaurar/apagar; para os demais membros ele responde 404 (a matriz de testes pegou um 403 que revelava a existência).
- **Presença:** além de nome e id, o servidor também valida a cor (só hex) e o campo `selected`.
- **Editor:** as teclas digitadas antes de o campo de texto de um nó novo ganhar foco (o React Flow mantém o nó invisível até medi-lo) ficam guardadas e entram no texto — o E2E pegou a perda de caracteres.
- **Layout:** as colunas e as linhas se ajustam ao tamanho estimado de cada nó (texto longo ou com várias linhas não se sobrepõe).
- **E2E** (`pnpm test:e2e`) usa o Chrome instalado na máquina (`channel: 'chrome'`), sem baixar navegadores.
- **Fontes** hospedadas no próprio servidor (`@fontsource-variable/*`), porque a CSP bloqueia o Google Fonts.
