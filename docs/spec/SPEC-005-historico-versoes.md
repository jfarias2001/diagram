# SPEC-005 — Histórico de versões

| Campo | Valor |
|---|---|
| Status | **Aprovado** (2026-09-22) |
| PRD | [PRD-005](../prd/PRD-005-historico-versoes.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

Uma tabela nova, `Snapshot`, guarda o estado binário do Y.Doc (o mesmo formato de `Document.yState`) em momentos determinados. As versões **automáticas** são criadas pelo servidor, dentro do plugin de colaboração (a cada 10 minutos de edição e quando o último editor sai), então não dependem do navegador de ninguém. As versões **com nome** e as "antes de operação grande" são criadas por rota.

Restaurar não substitui o `yState` no banco: o servidor **reconcilia o Y.Doc vivo** com o da versão (mesma técnica para mapa e fluxograma, porque os dois são mapas planos indexados por id), dentro de uma transação Yjs. Assim quem está com o documento aberto vê a mudança na hora, sem recarregar, e a convergência continua sendo a do CRDT.

No editor, um painel lateral lista as versões; ao visualizar, o quadro é renderizado a partir de um `Y.Doc` local somente leitura, sem tocar no documento atual.

## 2. Modelo de dados

### 2.1 Prisma (migration `add_snapshots`, sem backfill)

```prisma
enum SnapshotKind {
  /// Periódica ou ao fechar o documento (§5.1 do PRD).
  AUTO
  /// Criada por uma pessoa, com nome (§5.3).
  NAMED
  /// Guardada antes de restaurar ou de uma operação grande (§5.2).
  CHECKPOINT
}

model Snapshot {
  id          String       @id @default(cuid())
  documentId  String
  document    Document     @relation(fields: [documentId], references: [id], onDelete: Cascade)
  kind        SnapshotKind
  /// Só em NAMED e CHECKPOINT ("Antes de restaurar…"). Até 80 caracteres.
  name        String?
  /// Estado do Y.Doc (Y.encodeStateAsUpdate), igual ao Document.yState.
  state       Bytes
  sizeBytes   Int
  /// Quem editou no intervalo coberto por esta versão. Só ids.
  editorIds   String[]     @default([])
  createdById String?
  createdAt   DateTime     @default(now())

  @@index([documentId, createdAt])
  @@index([kind, createdAt])
}
```

`onDelete: Cascade` resolve o PRD §5.9: apagar o documento de vez apaga o histórico; mandar para a lixeira não apaga nada.

### 2.2 Limites

| Constante | Valor | Motivo |
|---|---|---|
| `SNAPSHOT_NAME_MAX` | 80 | PRD §5.3 |
| `SNAPSHOT_INTERVAL_MS` | 10 min | PRD §5.1 |
| `SNAPSHOT_MAX_PER_DOCUMENT` | 300 | teto duro; ao passar, a versão AUTO mais antiga sai |
| `SNAPSHOT_MAX_BYTES_PER_DOCUMENT` | 100 MB | teto de espaço por documento |
| `MAX_DOCUMENT_BYTES` | 5 MB (já existe) | cada versão nunca passa disso |

Retenção (PRD §5.8), aplicada pelo job do §3.4:
- `NAMED` e `CHECKPOINT`: para sempre;
- `AUTO` com menos de 30 dias: todas;
- `AUTO` entre 30 dias e 1 ano: só a **última de cada dia** (UTC) de cada documento;
- `AUTO` com mais de 1 ano: apagadas.

### 2.3 Reconciliação (restaurar) — `packages/shared/src/restore.ts`

```ts
/** Deixa `live` com o mesmo conteúdo de `state`, preservando o CRDT. */
export function applySnapshotState(live: Y.Doc, state: Uint8Array, origin?: unknown): void
```

Para cada raiz do documento (`meta`, `nodes`, `shapes`, `edges`), numa transação só:
1. chave que existe no vivo e não na versão → `delete`;
2. chave que existe na versão → grava um `Y.Map` novo com os campos lidos pelos leitores defensivos existentes (`readNodes` / `readDiagram`), o que já descarta lixo e mantém os limites de tamanho e o `#rrggbb` das cores;
3. chaves iguais em conteúdo são reescritas assim mesmo — é barato (mapas planos) e mantém o resultado determinístico.

Depois da reconciliação roda o reparo de sempre (`repairTree` / `repairDiagram`), então uma versão antiga corrompida não deixa a árvore inválida.

## 3. API

Todas em `/api/v1`, autenticadas. O papel mínimo sai da tabela do PRD §7 e é verificado com `assertDocumentAccess`.

| Método | Rota | Papel mínimo | Body | Resposta |
|---|---|---|---|---|
| GET | `/documents/:id/versions` | VIEWER | — | `{ items: VersionSummary[], nextCursor }` — sem o binário |
| GET | `/documents/:id/versions/:versionId/content` | VIEWER | — | `application/octet-stream` com o estado Y.Doc |
| POST | `/documents/:id/versions` | EDITOR | `{ kind: 'NAMED' \| 'CHECKPOINT', name }` | `201 VersionSummary` |
| POST | `/documents/:id/versions/:versionId/restore` | EDITOR | — | `{ checkpointId, restoredFrom }` |
| POST | `/documents/:id/versions/:versionId/copy` | VIEWER | `{ title? }` | `201 DocumentSummary` |
| PATCH | `/documents/:id/versions/:versionId` | OWNER | `{ name }` | `VersionSummary` |
| DELETE | `/documents/:id/versions/:versionId` | OWNER | — | `204` |

```ts
interface VersionSummary {
  id: string;
  kind: 'AUTO' | 'NAMED' | 'CHECKPOINT';
  name: string | null;
  createdAt: string;
  sizeBytes: number;
  /** Nomes resolvidos no servidor, sem e-mail (§6). */
  editors: Array<{ id: string; name: string }>;
}
```

Detalhes:
- **`versionId` sempre é conferido contra o `documentId` da URL** (`findFirst({ where: { id, documentId } })`) — trocar o id de uma versão de outro documento dá 404.
- `POST /versions` e `restore` partem do **estado vivo** (`app.collab.liveState(id) ?? document.yState`), porque o banco pode estar atrás pelo debounce.
- `restore`:
  1. `assertDocumentAccess(..., 'EDITOR')`;
  2. cria `CHECKPOINT` "Antes de restaurar de 21/09 às 14:30" com o estado vivo;
  3. se o documento está aberto no Hocuspocus, `applySnapshotState` no `Y.Doc` dele (os clientes recebem o update por sync, PRD §5.6); se não está, aplica num doc decodificado e grava `yState`, `searchText` e `sizeBytes`;
  4. nunca apaga versão (PRD §5.6);
  5. auditoria `document.version_restored`.
- `copy`: cria documento novo com o `state` da versão, dono = quem chamou (mesma lógica do `duplicate` já existente), título `"<título> (de 21/09 14:30)"` quando não vier no body.
- `DELETE`/`PATCH` só valem para `NAMED` (409 `VERSION_NOT_NAMED` para `AUTO`/`CHECKPOINT`) — histórico automático não se apaga à mão.
- Rate limit de 20/min por usuário em `POST /versions` e em `restore`.

### 3.4 Job de retenção

No mesmo timer horário do `purgeTrash` (`app.ts`): `pruneSnapshots(prisma, now)`, em `modules/documents/snapshots.ts`:
1. apaga `AUTO` com mais de 365 dias;
2. entre 30 e 365 dias, por documento e por dia (UTC), mantém o `createdAt` mais recente e apaga o resto;
3. por documento, se passar de `SNAPSHOT_MAX_PER_DOCUMENT` ou de `SNAPSHOT_MAX_BYTES_PER_DOCUMENT`, apaga as `AUTO` mais antigas até caber;
4. registra `snapshot.pruned` com a contagem.

Função pura no tempo (`now` injetável) para dar para testar sem esperar um ano.

## 4. Tempo real (Yjs / Hocuspocus)

O conteúdo do documento não ganha campo novo. O plugin de colaboração ganha um registro em memória por documento aberto:

```ts
interface DocActivity { lastSnapshotAt: number; dirtySince: number | null; editors: Set<string> }
```

- `onStoreDocument` (já roda com debounce de 2 s / máx. 10 s): marca `dirtySince` e acrescenta o `userId` do `lastContext` em `editors`. Se `agora - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS` e há sujeira, grava uma `AUTO` com o estado atual e limpa o registro.
- `afterUnloadDocument` (último a sair): se há sujeira desde a última versão, grava uma `AUTO` e descarta o registro.
- Reinício da API: o registro some, então a primeira gravação depois do reinício cria uma `AUTO` — tudo bem, é só uma versão a mais.
- `restore` escreve no `Y.Doc` do Hocuspocus com uma `origin` própria (`RESTORE_ORIGIN`): como não é uma conexão, a escrita não passa pelo `readOnly` das conexões, e é transmitida a todos. Ela **não** entra no `UndoManager` de ninguém (que só segue `LOCAL_ORIGIN`) — restaurar não é desfazível com Ctrl+Z; desfaz-se restaurando o checkpoint.
- Nada disso muda as regras de somente leitura: `VIEWER`/`COMMENTER` continuam com updates descartados.

## 5. Frontend

### 5.1 Painel de histórico (`features/history`)
- Botão **Histórico** no `EditorHeader` (todos os papéis, PRD §7) abre um painel lateral à direita, no mesmo padrão do `NotePanel`.
- Lista (mais recente primeiro): data e hora ("hoje 14:30", `relativeTime` existente), nome quando houver, ícone por tipo (automática / com nome / checkpoint) e nomes de quem editou. Paginação por cursor, "Carregar mais".
- Botão **Salvar versão** (Editor+) abre um campo para o nome (até 80).

### 5.2 Visualizar uma versão
- Clicar numa versão baixa o binário (`/content`), monta um `Y.Doc` local (`Y.applyUpdate`) e entra no **modo versão**:
  - faixa fixa no topo: *"Você está vendo a versão de 21/09 às 14:30"*, com **Restaurar esta versão** (Editor+), **Salvar como cópia** e **Voltar ao atual**;
  - o quadro renderiza a partir desse doc local, com `canEdit = false`, nada é enviado ao servidor;
  - para isso, `MindMapCanvas` e `DiagramCanvas` passam a aceitar `provider: HocuspocusProvider | null` (sem provider: sem presença, sem awareness) e `doc` de fora — mudança pequena, sem alterar o caminho normal;
  - `Esc` e "Voltar ao atual" saem do modo versão; sair descarta o doc local.
- Restaurar mostra confirmação ("O estado atual vai ficar guardado como uma versão") e, no sucesso, sai do modo versão — o quadro atual já chega restaurado pelo Yjs.

### 5.3 Estados
Carregando (spinner na lista), vazio ("Ainda não há versões guardadas deste documento"), erro (`ErrorText`), offline (o botão Restaurar fica desabilitado enquanto o status não for "Salvo").

## 6. Segurança

**Autorização**
- Toda rota passa por `assertDocumentAccess` com o papel da tabela do PRD §7, e o `versionId` é sempre filtrado por `documentId` (IDOR entre documentos).
- `restore` e `POST /versions` exigem `EDITOR`: Comentador e Leitor recebem 403 mesmo chamando a API direto (teste).
- `PATCH`/`DELETE` de versão exigem `OWNER`.
- ADMIN não tem exceção — sem vínculo, 404.
- A cópia (`/copy`) nasce com `members: { create: { userId: quem chamou, role: OWNER } }`; nenhum membro do original é copiado (o PRD permite ao Leitor copiar; ele vira dono só da cópia).
- Quando o SPEC-004 entrar, o papel efetivo (herdado de pasta) vale aqui também, porque o ponto de checagem é o mesmo.

**Vazamento de dados**
- `VersionSummary` devolve **nome** de quem editou, não e-mail.
- `/content` responde `application/octet-stream` com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff` (CLAUDE.md §9 — nunca servir conteúdo do usuário inline).
- Logs sem conteúdo: só `documentId`, `snapshotId` e tamanho.

**Integridade e DoS**
- Versão nunca passa de `MAX_DOCUMENT_BYTES`; acima disso a criação é recusada (e a automática só registra um `log.error`, como o congelamento de documento já faz).
- Tetos por documento (§2.2) + job de retenção: o histórico não faz o banco crescer sem controle.
- Rate limit em criar e restaurar.
- O estado restaurado passa pelos leitores defensivos e pelo reparo — uma versão antiga com lixo (ou um `state` adulterado no banco) não produz árvore inválida, cor fora de `#rrggbb` nem link `javascript:`.
- `state` é `Bytes` gravado como veio do Yjs; nunca é interpretado como JSON nem concatenado em SQL.

## 7. Plano de testes

**Unidade (`packages/shared`)**
- `applySnapshotState`: doc A restaurado para o estado de B fica idêntico a B (mapa e fluxograma); chaves a mais são apagadas, chaves ausentes voltam; link inseguro e cor inválida na versão não chegam ao doc restaurado; dois docs que aplicam o mesmo restore convergem.
- Reparo depois do restore: versão com nó órfão volta reparada.

**Unidade (API)**
- `pruneSnapshots` com datas injetadas: mantém todas as de 30 dias, uma por dia até 1 ano, nenhuma depois de 1 ano, e nunca apaga `NAMED`/`CHECKPOINT`; respeita os tetos por documento.

**Integração (API + banco)**
- Matriz de papéis × rotas de versão (listar, ver conteúdo, criar, restaurar, copiar, renomear, apagar), incluindo `404` para quem não é membro e `403` para Leitor/Comentador em restaurar.
- `versionId` de outro documento → 404.
- Restaurar cria o `CHECKPOINT` e não apaga nada; a lista cresce em 1.
- **Pelo WebSocket** (usando o `connect()` já existente em `test/collab.test.ts`): dois clientes conectados, um ramo apagado, restauração pela API → os dois veem o ramo voltar sem reconectar.
- Restaurar com o documento fechado: o `yState` e o `searchText` no banco ficam com o conteúdo da versão.
- `copy` cria documento do chamador e não altera o original.
- Versão automática: com o intervalo reduzido no teste, editar e esperar a gravação cria uma `AUTO` com `editorIds` corretos; sair do documento cria a última.
- Apagar o documento de vez apaga as versões (cascade); mandar para a lixeira não.

**E2E (Playwright)** — `e2e/sp005-versoes.spec.ts`
Editar um mapa → salvar versão com nome → apagar um ramo → abrir o histórico → visualizar a versão (o atual não muda) → restaurar → o ramo volta e aparece a versão "Antes de restaurar…".

**Desempenho**
- Documento com 1.000 nós: listar (50 itens) e abrir uma versão dentro do orçamento do PRD (2 s), medido no teste de integração com o mesmo gerador do `perf.test.ts`.

## 8. Tarefas (em ordem)

1. [ ] `packages/shared`: constantes, `VersionSummary`, schemas Zod e `applySnapshotState` + testes.
2. [ ] `schema.prisma`: `Snapshot` e `SnapshotKind`; `pnpm db:new-migration add_snapshots`; revisar o SQL.
3. [ ] `modules/documents/snapshots.ts`: `createSnapshot`, `restoreSnapshot`, `pruneSnapshots` (service, sem Fastify).
4. [ ] `modules/documents/versions.routes.ts` com as 7 rotas, auditoria e rate limit.
5. [ ] Colaboração: registro de atividade, versão a cada 10 min e no `afterUnloadDocument`; `RESTORE_ORIGIN` e escrita no doc vivo.
6. [ ] `app.ts`: `pruneSnapshots` no timer horário existente.
7. [ ] Web: `HistoryPanel`, modo versão no `EditorPage`, `provider` opcional nos dois canvases, faixa de aviso e ações.
8. [ ] Gancho do PRD-005 §5.2: "Organizar automaticamente" (fluxograma de hoje e mapa do PRD-006) cria um `CHECKPOINT` antes.
9. [ ] Testes de unidade, integração, WebSocket e E2E.
10. [ ] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + entrada no STORY.md.

## 9. Variáveis de ambiente novas

| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|
| `SNAPSHOT_INTERVAL_MINUTES` | não | `10` | Intervalo entre versões automáticas (os testes usam um valor baixo). |
| `SNAPSHOT_RETENTION_DAYS` | não | `365` | Idade máxima de uma versão automática. |
| `SNAPSHOT_DAILY_AFTER_DAYS` | não | `30` | A partir daqui, guarda só uma versão automática por dia. |

Vão para o `.env.example` e para o `docker-compose.yml` com os defaults.

## 10. Riscos e decisões pendentes

- **Crescimento do banco.** Cada versão é um estado inteiro (até 5 MB). Com os tetos e a retenção, o pior caso por documento é limitado, mas o backup diário (PRD futuro) precisa considerar isso. Anotar no STORY.md.
- **Decisão:** restaurar **não** é desfazível com Ctrl+Z; o caminho de volta é o checkpoint "Antes de restaurar…". Menos surpresa entre colegas do que injetar a restauração no undo de quem clicou.
- **Decisão:** versões automáticas são responsabilidade do servidor, não do navegador — quem fecha a aba não perde nada.
- **Decisão:** comparar versões lado a lado fica fora (PRD §8).
- **Aberto:** quando o documento é restaurado enquanto alguém está digitando dentro de um nó, o texto em edição é sobrescrito ao confirmar. Aceito para esta versão; se incomodar, o editor pode fechar a edição ao receber um restore (follow-up).
