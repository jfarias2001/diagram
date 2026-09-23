# SPEC-008 — Cara nova estilo MindMeister, menus em grade e exportação em PDF

| Campo | Valor |
|---|---|
| Status | Implementado |
| PRD | [PRD-008](../prd/PRD-008-identidade-visual-menus-e-pdf.md) |
| ADR | [ADR-004](../adr/ADR-004-exportacao-pdf.md) (exportação em PDF) |
| Data | 2026-09-23 |

## 1. Resumo técnico

Quatro frentes, independentes entre si:

1. **Lado do ramo vira dado.** O nó do mapa ganha um campo `side` (`'left' | 'right'`), válido só para filhos diretos da raiz. O layout deixa de recalcular a divisão a cada render: ele **lê** o lado. Uma função pura (`resolveSides`) decide o lado de quem ainda não tem, reproduzindo exatamente a regra de hoje enquanto ninguém tiver lado — é isso que faz documento antigo abrir igual.
2. **Tokens e estrutura da interface.** `index.css` ganha a paleta nova (azul/violeta + lateral escura, claro e escuro); o `AppShell` passa a ser lateral escura + conteúdo; o painel vira cartões/lista; o conjunto de ícones sai de `features/editor/icons.tsx` para `components/icons.tsx`, unificado.
3. **Menu em grade.** Um componente só (`ActionMenu`) desenha a grade de ações com ícone, nome e atalho; `NodeActionBar` (mapa) e `SelectionBar` (fluxograma) passam a ter poucas ações diretas mais o botão "Mais ações", que abre esse menu.
4. **Exportação.** `exportPng.ts` vira `features/export/exportCanvas.ts`, com PNG e PDF no mesmo caminho; o PDF usa `jspdf` carregado por `import()` (ADR-004). Um `ExportDialog` único serve os dois editores.

Nada muda em autorização, sessão ou rotas de acesso. A única mudança de banco é uma coluna aditiva (`Document.theme`) para o painel pintar a capa do cartão.

## 2. Modelo de dados

### 2.1 Documento Yjs — campo `side` no nó (mapa mental)

```ts
// packages/shared/src/document.ts
export const NODE_SIDES = ['left', 'right'] as const;
export type NodeSide = (typeof NODE_SIDES)[number];

mindMapNodeSchema = z.object({
  …,
  /** Lado do ramo. Só vale para filho direto da raiz; nos demais é ignorado. */
  side: z.enum(NODE_SIDES).optional(),
});
```

Regras (todas valem **na leitura** do Y.Map, como `shape`/`fill` na SPEC-006 §6):

- Valor fora de `['left','right']` → **ignorado** (o nó é lido como se não tivesse lado).
- `side` num nó que **não** é filho direto da raiz → lido, mas o layout não usa. Não é erro (a raiz pode mudar em teoria); quem passa a não ser mais filho da raiz tem o campo apagado pela operação que o moveu.
- Sem `side` → o lado sai de `resolveSides` (§2.2). Nenhum backfill em massa, nenhuma migration de documento, nenhum write ao abrir.

### 2.2 `resolveSides` — função pura, determinística (`packages/shared/src/sides.ts`)

Entrada: os filhos diretos da raiz **já ordenados** por `order` (desempate por id, como em `childrenIndex`). Saída: `Map<string, NodeSide>`.

```
se NENHUM filho tem `side` válido:
    regra de hoje (compatibilidade): splitAt = ceil(n / 2)
    os splitAt primeiros → 'right'; o resto → 'left'
senão:
    1. quem tem `side` válido fica com ele
    2. quem não tem herda do irmão ANTERIOR mais próximo que já tenha lado
    3. se não houver anterior, herda do PRÓXIMO mais próximo que tenha lado
    4. se ainda assim não houver, vai para o lado com menos ramos (empate → 'right')
```

Consequências que importam:

- Documento antigo intocado → cai no primeiro caso → **desenha exatamente como hoje** (PRD §6, critério "os ramos estão nos mesmos lados de antes").
- Assim que um ramo novo nasce com lado explícito, os antigos passam pelo caso 2/3/4. Para o resultado não mudar nesse instante, a operação que cria um ramo na raiz **grava o lado de todos os filhos da raiz que ainda não têm**, na mesma transação (§2.3) — congelando a foto atual.
- Dois clientes com o mesmo conjunto de nós calculam o mesmo mapa de lados (função pura sobre dados sincronizados) → PRD §6, critério dos dois navegadores.

### 2.3 Operações no Y.Doc (`packages/shared/src/ydoc.ts`)

| Operação | Mudança |
|---|---|
| `addNode(doc, { id, parentId, afterId, text, side? })` | Se `parentId` é a raiz: grava `side` = `side` informado → senão o lado do `afterId` → senão o lado com menos ramos. **Na mesma transação**, grava o lado resolvido de todo filho da raiz que ainda não tinha (congela a foto). |
| `moveNode` / `reparentNode` | Passou a ser filho da raiz → grava `side` (parâmetro novo `side?`, default: o lado resolvido do `afterId`, senão o menos cheio). Deixou de ser filho da raiz → `delete('side')`. |
| `reorderSibling` (`Ctrl+↑/↓`) | Quando o pai é a raiz, os "irmãos" considerados são só os **do mesmo lado**; a ordem trocada é com o vizinho daquele lado. Fora da raiz, nada muda. |
| `setNodeSide(doc, id, side, origin)` **(nova)** | Grava/limpa o lado de um filho direto da raiz. Usada ao arrastar um ramo para o outro lado da raiz. Recusa se o nó não for filho direto da raiz. |
| `writeNode` / `readNodes` | Escrevem/leem `side` com a validação de §2.1. |

`repairTree` (`computeTreeRepairs`) continua igual: nó reanexado à raiz não recebe lado, e `resolveSides` cuida dele.

### 2.4 Banco — `Document.theme` (migration `add_document_theme`)

```prisma
model Document {
  …
  /// Id do tema do documento (SPEC-007), copiado do Y.Doc a cada gravação.
  /// Só para o painel pintar a capa do cartão — nulo = tema padrão.
  theme String? @db.VarChar(32)
}
```

- **Backfill:** nenhum. `null` é lido como `paglamp` (o padrão), que é o que 100% dos documentos usam hoje.
- Preenchida em `collab/plugin.ts` no `store` (do lado do `searchText`), com `readStyle(document).theme`, e na criação/duplicação em `documents/routes.ts`.
- Nunca é escrita pelo cliente por rota nenhuma: é **derivada** do conteúdo do documento no servidor.

## 3. API

**Nenhuma rota nova, nenhuma rota alterada em comportamento ou permissão.** Só um campo a mais na resposta de listagem/detalhe:

| Método | Rota | Papel mínimo | Body | Resposta |
|---|---|---|---|---|
| GET | `/api/v1/documents` | `VIEWER` (só o que já alcança) | — | `DocumentSummary[]` **+ `theme: ThemeId \| null`** |
| GET | `/api/v1/documents/:id` | `VIEWER` | — | idem |
| POST | `/api/v1/documents` | autenticado | igual | idem |

```ts
// packages/shared/src/schemas.ts
export interface DocumentSummary {
  …
  /** Tema do documento, para a capa do cartão. Nulo = tema padrão. */
  theme?: ThemeId | null;
}
```

O servidor só devolve `theme` se o valor estiver em `THEME_IDS`; qualquer outra coisa vira `null` (defesa em profundidade — a coluna é derivada, mas quem lê não confia nela).

## 4. Tempo real (Yjs / Hocuspocus)

- `side` é conteúdo do documento, como `shape` e `fill`: viaja no mesmo `Y.Map` de nós, entra no histórico de versões e no `Y.UndoManager` normalmente.
- **Somente leitura:** nada de novo. A marca `readOnly` do `onConnect` já descarta *qualquer* update de `VIEWER`/`COMMENTER`; um leitor que forje `side` tem a escrita descartada **no servidor** (teste novo, §7).
- Não há evento de awareness novo.
- O campo é minúsculo (≤ 5 bytes por ramo de 1º nível), então o teto de tamanho do documento não muda.

## 5. Frontend

### 5.1 Tokens e paleta (`apps/web/src/index.css`)

Mantém o desenho atual (variáveis CSS em `:root` + `@theme` do Tailwind), trocando os valores e acrescentando os da lateral:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--canvas` | `#f6f7f9` | `#0f1116` | fundo da aplicação |
| `--surface` | `#ffffff` | `#171a21` | cartões, barras, diálogos |
| `--surface-2` | `#eef0f4` | `#1f232c` | campos, pílulas, hover |
| `--ink` | `#14161c` | `#e9ebf1` | texto |
| `--muted` | `#5c6472` | `#99a1b0` | texto secundário |
| `--line` | `#e2e5eb` | `#262b35` | bordas |
| `--brand` | `#3b5bfd` | `#6c8bff` | ação principal |
| `--brand-2` | `#6d3df0` | `#9b7bff` | fim do degradê |
| `--brand-ink` | `#2b45d6` | `#a9bcff` | texto/links na cor da marca |
| `--nav` | `#0e1016` | `#0b0d12` | lateral escura |
| `--nav-ink` / `--nav-muted` | `#e8eaf0` / `#9aa3b2` | idem | texto da lateral |
| `--danger` / `--ok` / `--warn` | `#d93b30` / `#17925a` / `#e07b1a` | `#ff6b5e` / `#4ec98a` / `#f5a93f` | estados |

- **O âmbar (`--filament`) sai** da interface. As referências a `filament` em componentes são trocadas por `brand`; o token some do `index.css`.
- **O bloco `[data-board]` não muda:** o tema do documento continua sobrescrevendo `--canvas`, `--surface`, `--ink`… dentro do quadro (SPEC-007 §5.4). Logo, a barra e o menu do bloco continuam combinando com o tema do documento, e as 8 paletas ficam intactas.
- Contraste ≥ 4,5:1 de `--ink` sobre `--canvas`/`--surface`, `--muted` sobre `--canvas`, branco sobre `--brand` e `--nav-muted` sobre `--nav`, nos dois modos — **verificado por teste** com o `contrastRatio` que já existe em `packages/shared`.
- Tipografia: mantém Bricolage Grotesque (títulos) + Instrument Sans (texto).

### 5.2 Ícones (`apps/web/src/components/icons.tsx`)

- O arquivo `features/editor/icons.tsx` **muda de lugar** para `components/icons.tsx` (é usado por painel, editor e fluxograma) e passa a ter um único `Svg` base: `viewBox="0 0 24 24"`, `strokeWidth={1.75}`, `strokeLinecap/Linejoin="round"`, `size` padrão 18, `aria-hidden`.
- Ícones redesenhados para o mesmo peso visual e **novos**: `IconHome`, `IconDocs`, `IconShared`, `IconFolder`, `IconFolderPlus`, `IconSearch`, `IconGridView`, `IconListView`, `IconChevronRight/Down`, `IconMore`, `IconUsers`, `IconLogout`, `IconKey`, `IconExport`, `IconHistory`, `IconShare`, `IconMindMap`, `IconFlow`, `IconMenu`, `IconCheck`, `IconGridMenu`, `IconBold`, `IconPdf`, `IconImage`.
- Todo botão só de ícone continua com `aria-label`; a dica ao passar o mouse (`title` visual do `BarButton`) passa a mostrar **nome + atalho**.

### 5.3 Painel (`AppShell`, `DashboardPage`, `FolderSidebar`)

```
┌────────────┬──────────────────────────────────────────┐
│ ▣ Paglamp  │  Documentos            [Buscar…] [▦][☰] │
│  Diagram   │  [+ Criar ▾]                             │
│            │  ( Todos )( Mapas )( Fluxogramas )       │
│ ⌂ Início   │  ┌────────┐ ┌────────┐ ┌────────┐        │
│ ▤ Meus     │  │ capa   │ │ capa   │ │ capa   │        │
│ ⇄ Compart. │  │ título │ │ título │ │ título │        │
│ ▣ Lixeira  │  │ pasta· │ │ pasta· │ │ pasta· │        │
│            │  └────────┘ └────────┘ └────────┘        │
│ MINHAS     │                                          │
│  PASTAS  + │                                          │
│  › Comerc. │                                          │
│ COMPART. + │                                          │
│            │                                          │
│ ─────────  │                                          │
│ 👤 Admin ▾ │                                          │
└────────────┴──────────────────────────────────────────┘
```

- `AppShell` deixa de ser cabeçalho + `<Outlet/>` e passa a ser `<aside data-nav>` (largura 248 px, `--nav` de fundo) + `<main>`. A navegação de hoje (Documentos, Usuários, Trocar senha, Sair) vira: itens de navegação em cima, **menu do usuário no rodapé da lateral** (avatar + nome → Trocar senha, Usuários (só ADMIN), Sair).
- `FolderSidebar` continua sendo o mesmo componente, agora renderizado **dentro** da lateral escura, com os tokens `--nav-*`. O arrastar-documento-para-pasta e o `?pasta=` da URL continuam iguais.
- Abas "Meus documentos / Compartilhados comigo / Lixeira" saem das abas e viram **itens da lateral** (o parâmetro de escopo continua o mesmo na consulta).
- `DocumentCard` (novo, em `features/dashboard/`): capa com degradê a partir de `DOC_THEMES[theme].rootColor` → `branches[0]` (a cor vem de **lista fechada no código**, nunca de texto do documento), ícone do tipo, título, pasta, autor, tempo relativo e o menu `IconMore` com as ações que a linha da lista já tem hoje.
- `DocumentRow`: a lista de hoje, restilizada. O alternador **▦/☰** guarda `paglamp.view` (`'grid' | 'list'`) no `localStorage`, com `try/catch` e validação na leitura (mesmo cuidado da SPEC-006 §6).
- Responsivo: abaixo de 1024 px a lateral vira gaveta, aberta pelo `IconMenu` no topo.
- Login, troca de senha e `UsersPage` recebem os tokens novos (sem mudança de estrutura).

### 5.4 Menu de ações em grade (`components/ActionMenu.tsx`)

```
┌──────────────────────────────────────────────┐
│ CRIAR                                        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │    ⊞     │ │    ⊟     │ │    ✂     │      │
│ │  Filho   │ │  Irmão   │ │ Religar  │      │
│ │   Tab    │ │  Enter   │ │  Ctrl+X  │      │
│ └──────────┘ └──────────┘ └──────────┘      │
│ APARÊNCIA                                    │
│ …                                            │
└──────────────────────────────────────────────┘
```

- API do componente: `ActionMenu({ groups, onClose })`, com `groups: { title: string; items: ActionItem[] }[]` e `ActionItem = { id, label, shortcut?, icon, disabled?, danger?, pressed?, onSelect }`.
- Grade de 3 colunas, célula com ícone (22 px), nome e atalho em cinza. `role="menu"`, itens `role="menuitem"`, navegação por `↑ ↓ ← →`, `Home`/`End`, `Esc` fecha e devolve o foco ao quadro, foco preso enquanto aberto.
- **Grupos no mapa mental:** *Criar* (filho, irmão, cortar e religar) · *Aparência* (cores, formato, negrito) · *Organizar* (mover ↑, mover ↓, organizar ramo, recolher/expandir, leva o ramo junto) · *Conteúdo* (nota, link) · *Perigo* (apagar).
- **Grupos no fluxograma:** *Aparência* (preenchimento, borda, texto, negrito) · *Organizar* (duplicar) · *Perigo* (apagar). **Correção durante a implementação:** "alinhar" e "distribuir" não existem como comandos no produto (o alinhamento de hoje é encaixe durante o arrasto, SPEC-003 §5.6); criá-los seria feature nova, fora do PRD-008. Ficou registrado como pendência no STORY.md.
- **Barra direta:** ficam fora do menu, a um clique, `Adicionar filho`, `Adicionar irmão`, `Cores` e o botão `Mais ações` (`IconGridMenu`). Para `VIEWER`/`COMMENTER`, a barra some e o menu mostra só *Conteúdo* (abrir nota, abrir link).
- **Posicionamento (ajustado durante a implementação, com o E2E como juiz):** fora da raiz, a barra sai pelo **lado de fora** do mapa (`Position.Right`/`Left` conforme o lado do ramo), com folga de 38 px para não cobrir o "+" do bloco — acima do bloco ela cobriria o irmão de cima, que fica a 12 px (era exatamente a queixa do PRD-008 §1). Na raiz continua acima/abaixo, pela regra da SPEC-007 §5.7. O que abre (menu ou seletor) desce a partir da barra — ou sobe, perto do rodapé — ancorado para fora, então não cobre o bloco nem a própria barra, e o menu tem `max-height: 60vh` com rolagem.
- Os atalhos de teclado continuam sendo tratados no canvas, exatamente como hoje — o menu só chama as mesmas `actions`.

### 5.5 Mapa mental — lado do ramo

- `layout.ts`: `layoutMindMap` deixa de fazer `splitAt = ceil(n/2)` e passa a chamar `resolveSides(branches)`; o resto do algoritmo (colunas por nível, separação por altura) não muda.
- `MindMapCanvas`:
  - `createSibling(id)` de um filho da raiz → `addNode(..., { afterId: id, side: ladoDoIrmão })`;
  - soltar um bloco **em cima da raiz** passa o lado conforme o x do ponto de soltura em relação ao centro da raiz (fecha a pendência aberta na SPEC-006 §10);
  - `reorder` usa os irmãos do mesmo lado.
- Nada disso mexe em `dx`/`dy`: um ramo movido à mão continua com o deslocamento dele, e "Organizar" segue apagando só os deslocamentos — **o lado não é apagado por "Organizar"**.

### 5.6 Exportação (`features/export/`)

**`exportCanvas.ts`** (substitui `exportPng.ts`, que é apagado):

```ts
export type ExportFormat = 'png' | 'pdf';
export type PageSize = 'fit' | 'a4' | 'a3';
export interface ExportOptions {
  format: ExportFormat;
  page: PageSize;            // 'fit' = página do tamanho do desenho
  orientation: 'landscape' | 'portrait';
  background: boolean;       // fundo do quadro ou transparente/branco
}
export async function exportCanvas(nodes: Node[], title: string, options: ExportOptions): Promise<void>;
```

Funções puras testáveis, em `pageMath.ts`:

| Função | O que faz |
|---|---|
| `pageSizeFor(page, orientation, boundsPx)` | Tamanho da página em **pontos** (A4 = 595×842 pt, A3 = 842×1191 pt, `fit` = px × 72/96, limitado a 14.400 pt por lado) |
| `fitScale(boundsPt, pagePt, marginPt)` | Fator para o desenho caber na área útil (margem 28 pt em A4/A3, 0 em `fit`) |
| `rasterScale(targetPt, dpi, maxSide, maxPixels)` | Escala do raster mirando **200 dpi**, limitada a 12.000 px por lado e 40 MP no total; devolve também `reduced: boolean` |

Fluxo: mesmo cálculo de limites/viewport/fonte do PNG de hoje → `toPng` no tamanho de pixels calculado → `import('jspdf')` → `new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true })` → `addImage` → `setProperties({ title })` → `save(nomeSeguro)`.

- `safeFileName(title, ext)` ganha a extensão como parâmetro (mesma limpeza de hoje).
- O botão "Exportar PNG" do `EditorHeader` vira **"Exportar"**, abrindo `ExportDialog` (formato, tamanho, orientação, fundo; padrão **PDF / Ajustado ao mapa / Paisagem / com fundo**), com estado "Exportando…", erro amigável e aviso quando a resolução foi reduzida.
- O `DiagramEditor` usa o mesmo diálogo.
- No **modo versão** o diálogo funciona sem mudança: o que é exportado é o DOM que está na tela.
- `jspdf` entra como dependência de `apps/web` e **só** é referenciada dentro de `import()`, para não entrar no pedaço inicial do build.

## 6. Segurança

Revisão contra o CLAUDE.md §9, no que esta entrega toca:

**Autorização**
- Nenhuma rota nova, nenhum papel novo, nenhuma consulta de documento nova. `assertDocumentAccess` continua sendo o ponto único.
- `side` é conteúdo do Y.Doc → vale a marca `readOnly` do `onConnect`. **Teste novo:** leitor (direto e herdado de pasta) forjando `side` pelo WebSocket tem a escrita descartada no servidor.
- `Document.theme` é **derivado no servidor** a partir do conteúdo; nenhuma rota aceita `theme` do cliente. Quem não enxerga o documento continua não recebendo nada dele (a coluna viaja dentro do `DocumentSummary`, que já é filtrado por acesso).
- Exportar exige apenas ter o documento aberto (`VIEWER`), e acontece 100% no navegador: não existe rota de exportação, então não há novo IDOR possível.

**Injeção e XSS**
- A capa do cartão e as cores da interface saem de **constantes do código** (`DOC_THEMES`, tokens CSS). `theme` que chegue fora de `THEME_IDS` é descartado na leitura (§3) — nenhum texto do usuário vira CSS.
- `side` é lista fechada, validada na leitura do Y.Doc (§2.1).
- Nenhum `dangerouslySetInnerHTML` novo. Os ícones são SVG escrito por nós, com atributos literais.
- O PDF embute uma **imagem** gerada do DOM; nada de texto do usuário é concatenado em marcação. O único metadado é o título, passado pela API do `jspdf` (não por string de PDF montada à mão).

**Arquivos e DoS**
- Teto de pixels (40 MP / 12.000 px por lado) e de tamanho de página (14.400 pt) na exportação: mapa gigante **reduz a resolução** em vez de travar a aba.
- `jspdf` roda no cliente; nenhum arquivo é enviado ao servidor, nenhum é escrito em disco pelo servidor.

**Dependência**
- `jspdf` 4.x, MIT, sem dependências nativas, carregada por `import()` (ADR-004). `pnpm audit --prod` roda antes de concluir.

**Infra e segredos**
- Nenhuma variável de ambiente nova, nenhum serviço novo, nenhuma mudança de CSP (o `import()` é do próprio domínio; nada de CDN).

## 7. Plano de testes

**Unidade — `packages/shared`**
- `resolveSides`: (a) ninguém com lado → reproduz a regra antiga em 1, 2, 3, 4, 5 e 8 ramos; (b) todos com lado → respeita; (c) misto → herda do anterior/próximo; (d) só o último com lado → herda para trás; (e) empate → `'right'`; (f) valor forjado (`'up'`, `123`, `'<script>'`) é ignorado.
- `addNode` na raiz: grava `side`; herda o lado do `afterId`; equilibra quando não há `afterId`; **congela** o lado dos irmãos que não tinham, na mesma transação (uma só, → um `Ctrl+Z`).
- `moveNode`/`reparentNode`: virou filho da raiz → ganha lado; deixou de ser → perde o campo.
- `reorderSibling` na raiz: troca com o vizinho **do mesmo lado**; não mexe no outro lado.
- `setNodeSide`: recusa em nó que não é filho direto da raiz.
- Leitura defensiva: `side` inválido não aparece em `readNodes`.

**Unidade — `apps/web`**
- `layoutMindMap`: irmão criado nasce **do mesmo lado** e com `y` maior (abaixo) que o irmão de referência; adicionar o 5º ramo **não muda o lado** de nenhum dos 4 (o teste compara os mapas de lado antes/depois); documento antigo (sem nenhum `side`) desenha igual ao esperado de hoje.
- `pageMath`: `pageSizeFor` (fit/a4/a3 × retrato/paisagem), `fitScale` (desenho largo e desenho alto), `rasterScale` (mira 200 dpi; reduz e marca `reduced` ao bater no teto).
- `safeFileName` com `.pdf`/`.png`.
- Contraste: todos os pares de tokens da §5.1, nos dois modos, ≥ 4,5:1 (e ≥ 3:1 para bordas), usando `contrastRatio`.
- `ActionMenu`: grupos e itens esperados por papel (editor vê tudo; leitor vê só *Conteúdo*) — teste do mapa de ações, sem DOM.
- Capa do cartão: cor derivada do tema; tema desconhecido/`null` → padrão.

**Integração — `apps/api`**
- `store` do Hocuspocus grava `theme` a partir do documento; documento sem estilo → `null`.
- `GET /documents` devolve `theme`; valor fora da lista vira `null`.
- WebSocket: leitor forjando `side` (inclusive escrevendo cru no `Y.Map`) tem a escrita descartada; editor grava e o colega recebe.
- Migration aplica em banco com dados (`pnpm db:deploy` no PGlite dos testes) sem perda.

**E2E — `e2e/sp008-visual-menus-pdf.spec.ts`**
1. Login → painel novo: lateral escura com Início/Meus/Compartilhados/Lixeira, "+ Criar", alternar ▦/☰ e **a escolha sobreviver ao recarregar**.
2. Criar mapa → `Enter` cria irmão **do mesmo lado** (mesmo `x` aproximado) e **abaixo** (`y` maior); criar mais três e conferir que nenhum dos anteriores trocou de lado.
3. Abrir o menu em grade: os nomes e atalhos aparecem, o menu **não cobre** o bloco selecionado, `Esc` fecha e o atalho `Tab` continua criando filho.
4. Exportar: escolher PDF/A4/paisagem → o download chega com nome `<título>.pdf` e os primeiros bytes são `%PDF`.
5. Leitora convidada: vê o documento, o menu só traz ações de leitura, e ela **consegue** exportar.
- Os E2E existentes (SPEC-002 a 007) são atualizados onde o rótulo mudou ("Exportar PNG" → "Exportar") e onde a barra virou menu.

**Desempenho**
- `perf.test.ts` do editor continua verde com 1.000 blocos (o `resolveSides` é O(n) sobre os filhos da raiz, não sobre o mapa).

## 8. Tarefas (em ordem)

1. [ ] `packages/shared`: `NODE_SIDES`, campo `side` no schema, leitura/escrita defensiva em `ydoc.ts`, `sides.ts` com `resolveSides` + testes.
2. [ ] `packages/shared`: `addNode`/`moveNode`/`reparentNode`/`reorderSibling`/`setNodeSide` com lado, congelamento na mesma transação + testes.
3. [ ] `apps/web`: `layoutMindMap` lendo `resolveSides`; `MindMapCanvas` passando o lado no criar irmão, no soltar sobre a raiz e no reordenar + testes de layout.
4. [ ] E2E do bug: irmão do mesmo lado e abaixo; nenhum ramo troca de lado.
5. [ ] `index.css`: tokens novos (claro/escuro), remoção do âmbar da interface + teste de contraste.
6. [ ] `components/icons.tsx`: conjunto unificado e ícones novos; atualizar todos os imports.
7. [ ] `AppShell` com lateral escura + menu do usuário; `FolderSidebar` dentro dela; escopos como itens de navegação.
8. [ ] `DashboardPage`: "+ Criar", cartões (`DocumentCard`) e lista, alternador ▦/☰ com `localStorage`, filtros e busca restilizados.
9. [ ] Migration `add_document_theme`; `store` do collab e rotas de criação/duplicação preenchendo; `DocumentSummary.theme`; capa do cartão + testes de integração.
10. [ ] `components/ActionMenu.tsx` (grade, teclado, acessibilidade) + teste dos grupos por papel.
11. [ ] `NodeActionBar`: barra enxuta + "Mais ações" abrindo o menu; posicionamento que não cobre o bloco.
12. [ ] `SelectionBar` do fluxograma (nó e conector) usando o mesmo menu.
13. [ ] Login, troca de senha, `UsersPage`, `EditorHeader`, painéis de Histórico/Aparência/Compartilhar com os tokens novos.
14. [ ] `features/export/`: `pageMath.ts` (+ testes), `exportCanvas.ts`, `ExportDialog.tsx`; `jspdf` como dependência carregada por `import()`; apagar `exportPng.ts`.
15. [ ] Ligar o diálogo nos dois editores e no modo versão; E2E do PDF.
16. [ ] Atualizar os E2E existentes onde o rótulo/estrutura mudou; `pnpm typecheck && lint && test && build && test:e2e`.
17. [ ] Revisão de segurança (§6) + `pnpm audit --prod`; entrada no STORY.md; PRD/SPEC/ADR marcados; commit e push.

## 9. Variáveis de ambiente novas

Nenhuma.

## 10. Riscos e decisões pendentes

- **Texto do PDF não é selecionável** (imagem em alta resolução). Decidido e justificado no ADR-004; se a empresa pedir texto selecionável, vira outra entrega.
- **O congelamento de lados só acontece quando um ramo novo nasce.** Até lá, o documento antigo continua na regra antiga — que é exatamente o que ele desenha hoje, então ninguém percebe. O risco residual é um documento antigo aberto por duas pessoas no exato instante em que ambas criam um ramo na raiz: o Yjs resolve o conflito campo a campo e `resolveSides` mantém tudo determinístico, mas a ordem final dos dois ramos novos é a que o CRDT decidir.
- **O redesign toca muitos arquivos.** O risco real é quebrar seletor de E2E e rótulo que alguém já decorou. Mitigação: nenhum texto de ação muda de nome sem necessidade (só "Exportar PNG" → "Exportar"), e a bateria E2E inteira roda antes do commit.
- **`jspdf` pesa ~110 kB gzip.** Fica fora do carregamento inicial por `import()`; se o build passar a incluí-la no pedaço principal, o teste de build falha a conferência manual da tarefa 14.
- **Capa do cartão sem miniatura real** (decisão do PRD §8): documento nunca aberto depois desta entrega fica com a capa do tema padrão até a primeira gravação.
- **Favoritos** (estrela) continua fora; a lateral já deixa o lugar reservado para quando virar PRD.
