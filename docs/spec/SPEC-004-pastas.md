# SPEC-004 — Pastas no painel

| Campo | Valor |
|---|---|
| Status | **Aprovado** (2026-09-22) |
| PRD | [PRD-004](../prd/PRD-004-pastas.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

Duas tabelas novas — `Folder` (pessoal ou compartilhada, até 3 níveis) e `FolderMember` — e **dois vínculos diferentes** entre documento e pasta: `DocumentPlacement` (pasta pessoal, um por usuário) e `Document.sharedFolderId` (pasta compartilhada, um por documento, global).

A mudança de fundo é na autorização: o papel de uma pessoa num documento deixa de ser só o `DocumentMember` e passa a ser o **maior** entre o papel direto e o papel **herdado** da pasta compartilhada. Esse cálculo fica num lugar só (`assertDocumentAccess`, CLAUDE.md §9) e é usado por toda rota e pelo `onConnect` do WebSocket. Tudo que tira acesso (remover membro, tirar documento da pasta, apagar pasta) derruba as conexões Yjs afetadas na hora.

O painel ganha uma lateral com a árvore de pastas; a lista de documentos passa a aceitar o filtro por pasta.

## 2. Modelo de dados

### 2.1 Prisma (migration `add_folders`, sem backfill)

```prisma
enum FolderKind {
  PERSONAL
  SHARED
}

model Folder {
  id        String       @id @default(cuid())
  kind      FolderKind
  name      String
  /// PERSONAL: o único que a vê. SHARED: dono da pasta (§5.13 do PRD).
  ownerId   String
  owner     User         @relation("folderOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  parentId  String?
  parent    Folder?      @relation("folderTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  Folder[]     @relation("folderTree")
  /// Pasta principal (1º nível). Igual ao próprio id quando depth = 0.
  /// É onde ficam os membros — subpasta não tem lista própria (§5.21 do PRD).
  rootId    String
  root      Folder       @relation("folderRoot", fields: [rootId], references: [id], onDelete: Cascade)
  branch    Folder[]     @relation("folderRoot")
  /// 0, 1 ou 2 — três níveis (§5.1 do PRD).
  depth     Int          @default(0)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  members      FolderMember[]
  placements   DocumentPlacement[]
  sharedDocs   Document[]     @relation("sharedFolder")

  @@index([ownerId, kind, parentId])
  @@index([rootId])
}

model FolderMember {
  folderId  String
  userId    String
  /// Só EDITOR ou VIEWER — o dono está em Folder.ownerId (§5.13 do PRD).
  role      MemberRole
  addedById String?
  createdAt DateTime   @default(now())
  folder    Folder     @relation(fields: [folderId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([folderId, userId])
  @@index([userId])
}

/// Pasta pessoal: vínculo por usuário, invisível para os outros (§5.9 do PRD).
model DocumentPlacement {
  documentId String
  userId     String
  folderId   String
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder     Folder   @relation(fields: [folderId], references: [id], onDelete: Cascade)

  @@id([documentId, userId])
  @@index([folderId])
  @@index([userId])
}
```

No `Document`, uma coluna nova:

```prisma
  /// Pasta compartilhada em que o documento está (§5.20 do PRD). Global.
  sharedFolderId String?
  sharedFolder   Folder? @relation("sharedFolder", fields: [sharedFolderId], references: [id], onDelete: SetNull)
  placements     DocumentPlacement[]

  @@index([sharedFolderId])
```

**Comportamento dos `onDelete` (as regras do PRD §5.12, §5.19 saem de graça):**
- apagar pasta pessoal → `DocumentPlacement` em cascata → documentos ficam "sem pasta";
- apagar pasta compartilhada → subpastas em cascata (`folderTree` e `folderRoot`) e `Document.sharedFolderId` vira `NULL` → documentos voltam ao painel dos donos;
- desativar usuário não apaga nada (usuário nunca é apagado, SPEC-001 §2.1).

### 2.2 Limites (em `packages/shared`)

| Constante | Valor | Motivo |
|---|---|---|
| `FOLDER_NAME_MAX` | 80 | PRD §5.2 |
| `FOLDER_MAX_DEPTH` | 3 | PRD §5.1 (depth 0..2) |
| `FOLDER_MAX_PER_USER` | 200 | teto por dono e por tipo, contra criação em massa |
| `FOLDER_MEMBERS_MAX` | 100 | teto de membros por pasta |

Nome único entre irmãs: checado no service, **sem acento e sem caixa** (`name.normalize('NFD').toLowerCase()`), porque `NULL` em índice único do Postgres não é comparado (pastas de 1º nível têm `parentId = NULL`). Conflito → 409 `FOLDER_NAME_TAKEN`.

### 2.3 Papel efetivo (o coração da SPEC)

```
papelEfetivo(usuário, documento) = max(
  papel direto  = DocumentMember.role, se existir
  papel herdado = herança da pasta compartilhada do documento, se houver
)
```

Herança (`Document.sharedFolderId` → `Folder.rootId`):

| Situação na pasta principal | Papel herdado no documento |
|---|---|
| `Folder.ownerId = usuário` (dono da pasta) | `EDITOR` |
| `FolderMember.role = EDITOR` | `EDITOR` |
| `FolderMember.role = VIEWER` | `VIEWER` |
| sem vínculo | nenhum |

**A herança nunca dá `OWNER`.** Dono do documento continua sendo só quem está em `Document.ownerId` / `DocumentMember.role = OWNER`: só ele manda para a lixeira e apaga (PRD §5.15).

## 3. API

Todas em `/api/v1`, autenticadas, com validação Zod em `packages/shared` (`folders.ts`).

### 3.1 Pastas

| Método | Rota | Quem pode | Body | Resposta |
|---|---|---|---|---|
| GET | `/folders` | autenticado | — | `{ personal: FolderNode[], shared: FolderNode[] }` — as **minhas** pastas pessoais e as compartilhadas em que sou dono ou membro, já em árvore, com `documentCount` |
| POST | `/folders` | autenticado (PERSONAL); dono/editor da pasta-mãe (SHARED com `parentId`) | `{ kind, name, parentId? }` | `201 FolderView` |
| PATCH | `/folders/:id` | dono da pasta; editor só em subpasta (PRD §5.18) | `{ name?, parentId? }` | `FolderView` |
| DELETE | `/folders/:id` | dono da pasta | — | `204` |
| GET | `/folders/:id/members` | dono ou membro | — | `{ items: FolderMemberView[] }` |
| POST | `/folders/:id/members` | dono da pasta | `{ email, role: 'EDITOR' \| 'VIEWER' }` | `201 FolderMemberView` |
| PATCH | `/folders/:id/members/:userId` | dono da pasta | `{ role }` | `{ userId, role }` |
| DELETE | `/folders/:id/members/:userId` | dono da pasta, ou o próprio (sair) | — | `204` |

Regras do `POST`/`PATCH` de pasta, no service:
- `kind` de uma subpasta é sempre o da mãe; `rootId` e `depth` vêm da mãe (`depth = mãe.depth + 1`, recusado em `>= FOLDER_MAX_DEPTH` com 409 `FOLDER_TOO_DEEP`);
- `parentId` no PATCH = mover: recusa mover para dentro do próprio ramo (ciclo, 409 `FOLDER_CYCLE`), mudar de `kind` e, em pasta compartilhada, mudar de `rootId` (mover entre pastas compartilhadas diferentes é fora de escopo — 409 `FOLDER_CROSS_ROOT`). Mover recalcula `depth` do ramo inteiro e recusa se o ramo passar de 3 níveis;
- membros só existem em pasta de `depth = 0`; as rotas de membros em subpasta respondem 409 `FOLDER_NOT_ROOT`;
- `POST /folders/:id/members` com rate limit de 30/min por usuário (igual ao compartilhamento de documento).

### 3.2 Documento ↔ pasta

| Método | Rota | Quem pode | Body | Resposta |
|---|---|---|---|---|
| PUT | `/documents/:id/personal-folder` | qualquer papel no documento | `{ folderId: string \| null }` | `204` |
| PUT | `/documents/:id/shared-folder` | **dono do documento** e dono/editor da pasta | `{ folderId: string \| null }` | `204` |

- `personal-folder`: a pasta tem de ser minha e `PERSONAL` (senão 404); `null` tira da pasta. Não muda papel de ninguém (PRD §7).
- `shared-folder` com `folderId`: exige `assertDocumentAccess(..., 'OWNER')` **e** ser dono ou editor da pasta (PRD §5.16). Com `null`: permitido ao dono do documento **ou** ao dono da pasta (PRD §5.17).
- Tirar da pasta (ou trocar de pasta) chama `app.collab.closeDocument(id)`: quem só tinha acesso herdado é desconectado e não volta (PRD §5.17).

### 3.3 Listagem

`listDocumentsQuerySchema` ganha:

```ts
folder: z.string().min(1).max(64).optional(), // id da pasta, ou 'none' para "sem pasta"
```

- sem `folder`: comportamento de hoje (abas Meus / Compartilhados / Lixeira);
- `folder = <id>` de pasta pessoal minha: documentos com `DocumentPlacement` nela (e eu com algum papel no documento);
- `folder = <id>` de pasta compartilhada em que sou dono/membro: documentos com `sharedFolderId` nela **ou numa subpasta dela**, quando `folder` é a principal? **Não**: a listagem é da pasta exata, e a lateral navega pelas subpastas. Documentos na lixeira nunca aparecem (PRD §5.8);
- `folder = 'none'`: meus documentos sem `DocumentPlacement` meu e sem `sharedFolderId`;
- pasta que não é minha nem compartilhada comigo → 404 (nem revela que existe).

`DocumentSummary` ganha `folder: { id: string; name: string; kind: FolderKind } | null` — a pasta que interessa **a mim**: a compartilhada, se houver e eu a enxergar; senão a minha pessoal. É o que a busca mostra ("em Comercial › 2026", PRD §5.7).

### 3.4 Erros

Formato de sempre `{ error: { code, message } }`. Códigos novos: `FOLDER_NAME_TAKEN`, `FOLDER_TOO_DEEP`, `FOLDER_CYCLE`, `FOLDER_CROSS_ROOT`, `FOLDER_NOT_ROOT`, `FOLDER_LIMIT`, `NOT_DOCUMENT_OWNER`.

## 4. Tempo real (Yjs / Hocuspocus)

Nada muda no conteúdo do documento — pastas são metadados. O que muda é **quem entra**:

- `onConnect` continua chamando `assertDocumentAccess(..., 'VIEWER')`, que agora já considera a herança; `connectionConfig.readOnly = !hasRole(papelEfetivo, 'EDITOR')`;
- **derrubar conexões** (o cliente reconecta e reautentica, `CLOSE_REAUTH`):

| Evento | Ação |
|---|---|
| Membro da pasta removido ou rebaixado | `collab.disconnectUser(userId)` (todos os documentos dele; ele volta com o papel novo) |
| Documento sai da pasta compartilhada / muda de pasta | `collab.closeDocument(documentId)` |
| Pasta compartilhada apagada | `closeDocument` de cada documento que estava nela ou nas subpastas |

Como quem perdeu o acesso recebe `not-found` no `onConnect`, ele cai na tela "documento não encontrado" já existente (SPEC-001 §5.2).

## 5. Frontend

### 5.1 Painel (`features/dashboard`)
- **Lateral** (`FolderSidebar.tsx`): duas seções, **Minhas pastas** e **Pastas compartilhadas**, em árvore com expandir/recolher; item "Sem pasta"; contador de documentos. Fica numa coluna à esquerda em telas ≥ `lg`, e num `<details>` acima da lista em telas menores.
- **Caminho** no topo da lista (`Comercial › 2026`), clicável.
- **Arrastar o cartão** de um documento até uma pasta da lateral (HTML5 drag-and-drop nativo, `draggable` no `<li>`; alvo destacado no `dragover`) e menu **"Mover para…"** no cartão — os dois chamam as rotas do §3.2. O menu mostra "Minhas pastas" sempre, e "Pastas compartilhadas" só quando sou dono do documento.
- **"+ Novo"** dentro de uma pasta já cria o documento nela: depois do `POST /documents`, o `PUT .../personal-folder` ou `.../shared-folder` correspondente.
- **Busca**: cada resultado mostra a pasta (campo `folder` do `DocumentSummary`).
- Estado por URL: `?pasta=<id>` (e `?pasta=sem-pasta`), para o link ser compartilhável e o voltar do navegador funcionar.
- TanStack Query: chave `['folders']` para a árvore e `['documents', scope, q, type, folder]` para a lista; toda mutação invalida as duas.

### 5.2 Diálogos
- `FolderDialog` — criar/renomear (nome, 1–80, erro de nome repetido inline);
- confirmação ao apagar, com o texto do PRD §5.3 ("os documentos não são apagados");
- `FolderMembersDialog` — reaproveita o visual do `ShareDialog` (e-mail + papel Editor/Leitor, lista de membros, remover). Deixa claro: "quem entra aqui passa a ver **todos** os documentos desta pasta".

### 5.3 Estados
Carregando (skeleton na lateral), vazio ("Esta pasta ainda não tem documentos"), erro (`ErrorText` de sempre), e o caso "a pasta sumiu enquanto eu olhava" → volta para "Todos os documentos" com um aviso.

## 6. Segurança

**Autorização**
- Um ponto só: `assertDocumentAccess` passa a calcular o papel efetivo (§2.3) numa consulta com `include` do `sharedFolder.root` (dono + meu `FolderMember`). Nenhuma rota consulta papel por fora.
- `assertFolderAccess(prisma, userId, folderId, min)` — mesmo desenho para pastas: sem vínculo → 404 (não revela existência), papel insuficiente → 403. Pasta pessoal de outra pessoa é sempre 404.
- Herança nunca chega a `OWNER`: rotas de lixeira, exclusão e compartilhamento do documento continuam exigindo `OWNER` direto (teste dedicado).
- `PUT /shared-folder` exige as **duas** pontas (dono do documento + poder na pasta): impede "publicar" para a equipe um documento alheio.
- ADMIN não ganha nada: não vê pasta alheia nem documento por ser admin.

**Tempo real**
- Mudança de papel/remoção derruba as conexões (§4) — o teste de integração conecta de verdade pelo WebSocket e confirma a desconexão e que o leitor volta somente leitura.
- Leitor herdado recebe `readOnly = true` do servidor; update forjado é descartado (já coberto, agora também para o papel herdado).

**Entrada e limites**
- Zod em todo body/param/query; nome da pasta `trim` + 1..80; `parentId`/`folderId` `.max(64)`.
- Tetos: `FOLDER_MAX_PER_USER`, `FOLDER_MEMBERS_MAX`, profundidade 3, e ciclo recusado (inclusive mover para si mesma).
- `POST /folders/:id/members` com rate limit (enumeração de e-mails); a resposta de e-mail inexistente é a mesma já usada no compartilhamento.
- Sem SQL cru: tudo Prisma. A árvore de subpastas é resolvida com no máximo 3 consultas (profundidade fixa), sem recursão no banco.

**Registro**
- `AuditEvent` novos: `folder.created`, `folder.renamed`, `folder.moved`, `folder.deleted`, `folder.member_added`, `folder.member_updated`, `folder.member_removed`, `document.folder_changed`. Só ids e papéis — nunca conteúdo.

## 7. Plano de testes

**Unidade (`packages/shared`)**
- `folderSchemas`: nome vazio/81 chars/espaços, `kind` inválido, `role` fora de EDITOR/VIEWER.
- `effectiveRole(direto, herdado)`: tabela completa (inclusive "direto VIEWER + herdado EDITOR = EDITOR" e "herdado nunca vira OWNER").
- normalização de nome para comparação (acento e caixa).

**Integração (API + banco)**
- Matriz de acesso herdado: para cada papel de pasta (dono, editor, leitor, não-membro) × rotas do documento (abrir, editar título, compartilhar, lixeira, apagar, duplicar) — o esperado da tabela do PRD §7.
- IDOR: pasta pessoal de outro usuário → 404 em listar, renomear, apagar e mover documento para ela.
- Ciclo (mover pasta para dentro de si/da filha) e 4º nível → 409.
- Nome repetido entre irmãs → 409; nomes iguais em pastas-mãe diferentes → ok.
- Documento em pasta compartilhada: Ana leitora abre; Ana editora edita; Ana removida → 404 e **socket derrubado**; documento tirado da pasta → 404 para quem só tinha herança.
- Só o dono do documento consegue `PUT /shared-folder`; editor recebe 403.
- Apagar pasta compartilhada: documentos continuam existindo, `sharedFolderId = NULL`, subpastas somem.
- Apagar pasta pessoal: documentos continuam, ficam em "sem pasta".
- Lixeira: documento na lixeira some das listagens de pasta e volta à mesma pasta ao restaurar.
- Listagem com `folder=none` e com `folder=<id>`; paginação preservada.

**E2E (Playwright)** — `e2e/sp004-pastas.spec.ts`
Criar pasta compartilhada → adicionar colega como Leitor → mover um documento meu para ela → o colega abre o documento em modo leitura → remover o colega → ele perde o acesso com o documento aberto.

**Desempenho**
- Teste com 500 documentos e 100 pastas: `GET /folders` + primeira página da lista abaixo do orçamento de hoje (mesmo teste de carga do painel, agora com pastas).

## 8. Tarefas (em ordem)

1. [ ] `packages/shared/src/folders.ts`: constantes, schemas Zod, tipos (`FolderView`, `FolderNode`, `FolderMemberView`) e `effectiveRole` + testes.
2. [ ] `schema.prisma`: `Folder`, `FolderMember`, `DocumentPlacement`, colunas e índices no `Document`; `pnpm db:new-migration add_folders`; revisar o SQL.
3. [ ] `modules/folders/access.ts`: `assertFolderAccess` e `folderInheritance`.
4. [ ] Reescrever `assertDocumentAccess` com o papel efetivo (§2.3) + testes da matriz.
5. [ ] `modules/folders/{routes,service}.ts`: CRUD, mover, membros, com auditoria e rate limit.
6. [ ] Rotas `PUT /documents/:id/personal-folder` e `/shared-folder` + derrubada de conexões.
7. [ ] Listagem: filtro `folder`, campo `folder` no `DocumentSummary`.
8. [ ] Web: `FolderSidebar`, caminho, `FolderDialog`, `FolderMembersDialog`, menu "Mover para…", arrastar-e-soltar, criar dentro da pasta.
9. [ ] Testes de integração e E2E.
10. [ ] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + entrada no STORY.md.

## 9. Variáveis de ambiente novas

| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|
| — | — | — | Nenhuma. |

## 10. Riscos e decisões pendentes

- **Risco nº 1 — regressão de autorização.** Mexer no `assertDocumentAccess` toca tudo. Mitigação: a matriz de permissões existente (8 rotas × 6 papéis, mapa e fluxograma) continua rodando sem pastas, e ganha uma segunda rodada com herança.
- **Decisão:** listar a pasta mostra só os documentos dela, não os das subpastas (navegação explícita). Se incomodar no uso, vira follow-up.
- **Decisão:** mover uma subpasta entre pastas compartilhadas diferentes fica fora (mudaria o conjunto de membros de todo um ramo). Recusado com 409.
- **Decisão:** sem transferência de posse (fora de escopo do PRD); se o dono de uma pasta compartilhada for desativado, a pasta continua funcionando para os membros, e só um ADMIN reativando o usuário devolve a gestão. Anotar como pendência no STORY.md.
- **Aberto:** a busca mostra a pasta do resultado, mas não filtra por pasta. Se for preciso, vira follow-up.
