# SPEC-006 — Mapa mental com posição livre, formatos e cores de bloco, e tema do quadro

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| PRD | [PRD-006](../prd/PRD-006-mapa-livre-formatos-tema.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

Três mudanças independentes, todas sem migration:

1. **Posição livre:** cada nó pode ganhar um deslocamento `dx`/`dy` **relativo ao pai**. A posição final é `pos(pai) + (deslocamento manual ou o delta que o layout automático daria)`. Como é relativo, mover um nó leva o ramo inteiro junto com **uma escrita só** no Yjs, e um filho criado depois continua nascendo na posição automática perto do pai.
2. **Formato e cor do bloco:** dois campos novos no nó, `shape` (lista fechada de 6 formatos) e `fill` (`#rrggbb`), com o texto escolhendo sozinho entre escuro e claro pelo contraste.
3. **Tema do quadro:** os tokens de cor passam a poder ser redefinidos **dentro do elemento do quadro** (`data-board="light|dark"`), sem mexer no resto da interface. A escolha fica no `localStorage`.

Nada disso toca a API nem o banco: são campos do documento (Yjs) e uma preferência de navegador.

## 2. Modelo de dados

### 2.1 Nó do mapa mental (`packages/shared/src/document.ts`)

```ts
export const NODE_SHAPES = ['rounded', 'capsule', 'rect', 'ellipse', 'hexagon', 'underline'] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

export const NODE_OFFSET_MAX = 20_000; // limite de |dx| e |dy|

export const mindMapNodeSchema = z.object({
  // ... campos de hoje
  /// Deslocamento manual em relação ao pai (§2.2). Os dois vêm juntos ou nenhum.
  dx: z.number().finite().min(-NODE_OFFSET_MAX).max(NODE_OFFSET_MAX).optional(),
  dy: z.number().finite().min(-NODE_OFFSET_MAX).max(NODE_OFFSET_MAX).optional(),
  shape: z.enum(NODE_SHAPES).optional(),   // ausente = 'rounded'
  fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), // ausente = fundo do quadro
});
```

Leitura defensiva em `readNode` (`ydoc.ts`), no mesmo estilo do que já existe: `dx`/`dy` só entram se os **dois** forem números finitos dentro do limite; `shape` só se estiver na lista; `fill` só se casar com `#rrggbb`. Qualquer outra coisa é ignorada — inclusive vinda de um cliente adulterado.

`writeNode` grava os campos só quando existem, então documentos antigos continuam válidos e nenhum documento cresce à toa. **Sem migration e sem mudança de `FORMAT_VERSION`**: os campos são aditivos e um cliente antigo simplesmente ignora o que não conhece.

### 2.2 Como a posição é resolvida

```
rel(n)  = (n.dx, n.dy)                          se o nó tem deslocamento manual
        = autoPos(n) - autoPos(pai(n))          caso contrário
pos(raiz) = (raiz.dx, raiz.dy) ou (0, 0)
pos(n)    = pos(pai(n)) + rel(n)
```

`autoPos` é o `layoutMindMap` de hoje (d3-hierarchy), calculado sobre a árvore inteira, como sempre. Consequências, que são exatamente o que o PRD pede:

- ramo sem nada manual fica **idêntico** ao de hoje (§5 do PRD não muda o visual padrão);
- mover um nó = gravar `dx`/`dy` **só nele**; os descendentes se movem juntos porque são relativos (PRD §5.1) — O(1) de escrita, independentemente do tamanho do ramo (requisito de 1.000+ blocos);
- mover a raiz move o mapa inteiro (PRD §5.6);
- criar um filho num pai movido: o filho não tem `dx`/`dy`, então usa o delta automático e nasce perto do pai (PRD §5.4);
- "Organizar" = apagar `dx`/`dy` (do mapa todo ou do ramo) numa transação só, logo um Ctrl+Z desfaz (PRD §5.5 e §5.8).

`layout.ts` ganha `resolvePositions(nodes): PositionedNode[]`, que roda o layout automático e aplica a fórmula acima numa passada em profundidade (O(n), sem recursão em nó — pilha explícita, por causa de mapas fundos).

O `side` (esquerda/direita) continua vindo do layout automático: ele decide o lado do ramo, as alças da ligação e a origem do nó. Arrastar um bloco para o outro lado da tela **não** troca o lado lógico do ramo — anotado no §10.

### 2.3 Operações novas (`packages/shared/src/ydoc.ts`)

```ts
/** Grava o deslocamento manual de um nó (ou o apaga com null). */
export function setNodeOffset(doc, id: string, offset: { dx: number; dy: number } | null, origin?): boolean

/** Apaga dx/dy de um ramo inteiro (ou do mapa, passando a raiz). Uma transação = um Ctrl+Z. */
export function clearOffsets(doc, rootId: string, origin?): number

/** Troca a ordem com o irmão de cima/de baixo (PRD §5.3). */
export function moveSibling(doc, id: string, direction: 'up' | 'down', origin?): boolean
```

`NodePatch` ganha `shape` e `fill` (`fill: ''` volta ao padrão, como já acontece com `color`). Valores fora da lista/do hex são ignorados na escrita, além da leitura.

## 3. API

Nenhuma rota nova nem alterada. O conteúdo viaja pelo Yjs.

| Método | Rota | Papel mínimo | Body | Resposta |
|---|---|---|---|---|
| — | — | — | — | — |

## 4. Tempo real (Yjs / Hocuspocus)

- Os campos novos são do `Y.Map` `nodes` que já sincroniza; nenhuma mudança no servidor.
- **Durante** o arrasto, a posição é só local (`useState`, como hoje); a gravação acontece **ao soltar** (PRD §5.7) — um update por arrasto, não um por frame.
- Conflito de dois colegas arrastando o mesmo nó: vence o último a soltar (LWW do `Y.Map`), que é o comportamento esperado.
- `VIEWER`/`COMMENTER` continuam com updates descartados no servidor: mover, formatar e pintar são impossíveis para eles mesmo forjando mensagens (teste).
- O tema do quadro **não** entra no documento nem no awareness: é só do navegador (PRD §5.17).

## 5. Frontend

### 5.1 Arrastar (`MindMapCanvas.tsx`)
- `draggable` passa a valer também para a raiz (hoje é `node.parentId !== null`).
- `onNodeDrag`: além do estado local de arrasto, calcula o alvo de reparentagem com `getIntersectingNodes` e guarda em `dropTarget` para destacar o bloco alvo (PRD §5.2) — o destaque é uma classe no nó, sem re-render do mapa (`data.dropTarget` no `stableData`).
- `onNodeDragStop`:
  - **soltou sobre outro nó** (fora do próprio ramo) → `moveNode` como hoje **e** `setNodeOffset(null)`: o nó assume a posição automática sob o novo pai;
  - **soltou no vazio** → `setNodeOffset(doc, id, { dx, dy })`, com `dx/dy` = posição solta − posição do pai renderizado. Não reordena mais irmãos (PRD §5.3).
- As duas coisas passam por `newStep()` (um passo de desfazer por arrasto).

### 5.2 Ordem entre irmãos
- `Ctrl+↑` / `Ctrl+↓` (e `⌘` no Mac) chamam `moveSibling`; as setas sozinhas continuam navegando.
- Botões "Mover para cima" e "Mover para baixo" na barra flutuante, com o atalho no `title` (padrão da SPEC-002).

### 5.3 Organizar automaticamente
- Botão na `CanvasControls` ("Organizar", ícone de grade) → `clearOffsets(raiz)`;
- Item na barra do bloco ("Organizar este ramo") → `clearOffsets(id)`;
- Os dois criam um `CHECKPOINT` de versão quando a SPEC-005 estiver no ar (SPEC-005 §8, tarefa 8), e são um passo só de desfazer.

### 5.4 Formato e cor do bloco
- `MindNode` desenha o formato com **SVG atrás do texto**, no mesmo padrão do `ShapeSvg` do fluxograma (SPEC-003 §5.3) — assim borda e preenchimento funcionam em elipse e hexágono, o que `clip-path` não daria. `rounded`, `capsule` e `rect` continuam sendo CSS (`border-radius`), mais baratos; `underline` é uma `border-bottom` de 2 px sem caixa.
- `estimateSize` (layout) ganha folga por formato (elipse e hexágono precisam de mais margem para o texto caber dentro do desenho): uma tabela `SHAPE_PADDING` com os fatores, como o `TEXT_INSET` do fluxograma.
- Barra flutuante: o botão de cor de hoje vira um popover com duas linhas — **Contorno** (a paleta `BRANCH_COLORS` atual, campo `color`) e **Preenchimento** (paleta clara + escuras + "Auto", campo `fill`) — e um botão novo **Formato** com os 6 desenhos.
- Contraste (PRD §5.13): `readableInk(hex)` em `packages/shared` — luminância relativa WCAG; acima de 0,45 devolve o tom escuro, abaixo o claro. O texto do bloco pintado usa esse valor; o bloco sem `fill` usa o token `--ink` do quadro. Teste de unidade com a lista de cores da paleta nos dois temas.

### 5.5 Tema do quadro
- `useBoardTheme()` em `features/editor/boardTheme.ts`: estado `'light' | 'dark'`, inicial = `localStorage['paglamp.board-theme']` ou `matchMedia('(prefers-color-scheme: dark)')`; grava a escolha e escuta a mudança do sistema enquanto não houver escolha.
- O elemento que envolve o `ReactFlow` recebe `data-board="light"` ou `"dark"`. No `index.css`, um bloco redefine dentro dele os tokens que o quadro usa (`--canvas`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--line`, `--grid`) — ou seja, os blocos, as barras flutuantes de dentro do quadro e a grade acompanham, e **o painel, o cabeçalho e os diálogos não** (PRD §5.14).
- Interruptor sol/lua no `EditorHeader`, `aria-label="Mudar o quadro para o modo claro/escuro"` e `aria-pressed`, visível para todos os papéis.
- `exportPng.ts` passa a ler `--canvas` do elemento do quadro (hoje lê do `body`) — o PNG sai com o fundo do quadro em uso (PRD §5.18).
- Vale para o `DiagramEditor` também (PRD §5.16): fundo do quadro, grade, barras flutuantes e paleta acompanham o tema. As cores das **formas** do fluxograma (`DEFAULT_FILL`, `SHAPE_INK`, SPEC-003 §5.3) **continuam fixas** — são conteúdo do documento, e quem quiser contraste troca o preenchimento pela paleta que já existe desde a SPEC-003. No mapa mental é diferente: um bloco **sem** `fill` usa o tom do quadro (por isso a cor de preenchimento do PRD §5.12 existe, para os casos em que se quer fugir dele).

### 5.6 Desempenho
- `resolvePositions` é memoizado sobre `nodes` (como o `layoutMindMap` hoje) e o arrasto continua fora do React Flow (estado local + `zIndex`), sem tocar no Yjs até soltar.
- `stableData` ganha os campos novos (`shape`, `fill`, `ink`, `dropTarget`), mantendo a identidade do objeto quando nada muda — sem isso, mil nós re-renderizam a cada arrasto.

## 6. Segurança

Superfície pequena (nada de API nova), mas tem armadilha de XSS/CSS:

- **Cor** (`fill`) e **formato** (`shape`) são validados na **leitura** do Yjs, não só na escrita: um cliente adulterado que grave `fill: "url(javascript:…)"`, `#fff" onload="…` ou `shape: "<img …>"` não produz nada — o valor é descartado e o nó cai no padrão (teste, como o já feito na SPEC-003 §6).
- `fill` e `color` entram em `style` como valor de propriedade, nunca em `innerHTML`; segue proibido `dangerouslySetInnerHTML` (CLAUDE.md §9).
- `dx`/`dy` são clamplados na leitura e na escrita (`NaN`, `Infinity` e valores absurdos descartados), evitando um nó "sumido" a milhões de pixels — e, por serem relativos, um valor grande não arrasta o mapa inteiro para fora da tela.
- O SVG do formato é gerado por nós, com `viewBox` fixo e atributos literais; nenhum dado do usuário vira marcação — só o texto, que continua sendo renderizado como texto.
- Autorização: nada novo. Mover, formatar e pintar são escritas no Y.Doc, já barradas para `VIEWER`/`COMMENTER` no servidor (teste dedicado com update forjado, reaproveitando o de `collab.test.ts`).
- `localStorage` guarda só `'light'`/`'dark'`; a leitura valida o valor e cai no padrão do sistema se vier outra coisa. Nenhum dado pessoal, nada que atravesse usuários.
- Export PNG: o `html-to-image` continua rodando sobre o DOM do quadro, sem buscar recurso externo.

## 7. Plano de testes

**Unidade (`packages/shared`)**
- `readNode`/`writeNode`: `dx` sem `dy`, `dx` infinito, `dx` acima do limite, `shape` fora da lista, `fill` inválido (`red`, `#ff0`, `url(javascript:alert(1))`) — todos ignorados.
- `setNodeOffset`, `clearOffsets` (ramo e mapa inteiro), `moveSibling` (primeiro/último, raiz, nó inexistente).
- `readableInk`: preto sobre amarelo-claro, branco sobre azul-escuro, e todas as cores da paleta com contraste ≥ 4,5:1 contra o tom devolvido.

**Unidade (web)**
- `resolvePositions`: mapa sem offsets = igual ao `layoutMindMap` de hoje; nó com offset move só o próprio ramo; offset na raiz desloca tudo; filho novo de pai movido fica perto do pai; mapa em cadeia de 20 níveis não estoura pilha.
- `estimateSize` com cada formato.
- `perf.test.ts`: 1.000 nós, `resolvePositions` dentro do orçamento atual do layout; um arrasto = uma escrita no Yjs (contador de updates).

**Integração (API + banco)**
- Pelo WebSocket: leitor forjando `dx`/`dy`, `shape` e `fill` tem o update descartado; editor grava e o colega recebe.

**E2E (Playwright)** — `e2e/sp006-mapa-livre.spec.ts`
Arrastar um bloco com filhos para o vazio (posições confirmadas na segunda aba) → criar um filho nele → "Organizar automaticamente" → Ctrl+Z → trocar formato para elipse e pintar o bloco → ligar o quadro claro com o sistema no escuro e recarregar (o quadro continua claro e o painel, escuro).

## 8. Tarefas (em ordem)

1. [ ] `packages/shared`: campos `dx`/`dy`/`shape`/`fill` no schema e na leitura/escrita defensiva; `setNodeOffset`, `clearOffsets`, `moveSibling`, `readableInk` + testes.
2. [ ] `layout.ts`: `resolvePositions`, `SHAPE_PADDING` no `estimateSize` + testes.
3. [ ] `MindMapCanvas`: arrasto livre, destaque do alvo, reparentagem limpando o offset, `Ctrl+↑/↓`.
4. [ ] `CanvasControls` e `NodeActionBar`: "Organizar" (mapa e ramo), "Mover para cima/baixo", popover de cores (contorno + preenchimento) e seletor de formato.
5. [ ] `MindNode`: desenho por formato (SVG/CSS), `fill` e texto com contraste.
6. [ ] `boardTheme.ts`, tokens com escopo no `index.css`, interruptor no `EditorHeader`, `exportPng` lendo o fundo do quadro.
7. [ ] Fluxograma: mesmo interruptor e mesmo escopo de tokens.
8. [ ] Testes de unidade, integração e E2E.
9. [ ] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + entrada no STORY.md.

## 9. Variáveis de ambiente novas

| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|
| — | — | — | Nenhuma. |

## 10. Riscos e decisões pendentes

- **Decisão:** deslocamento **relativo ao pai**, não absoluto. Custa uma passada a mais no layout, mas dá mover-ramo-junto de graça, uma escrita por arrasto e nenhum conflito em cascata entre colegas.
- **Decisão:** soltar um bloco sobre outro troca o pai e **volta o bloco para a posição automática**. É o que deixa claro que houve uma mudança de estrutura, e não de posição. Se na prática irritar, o follow-up é manter a posição solta.
- **Limitação conhecida:** arrastar um ramo para o outro lado da raiz não muda o lado lógico do ramo (as ligações continuam saindo pelo lado original). Vira follow-up se incomodar.
- **Limitação conhecida:** blocos movidos à mão podem se sobrepor — é o preço da posição livre; "Organizar" resolve.
- **Risco:** mapas antigos, de gente que usava o arrasto para reordenar, mudam de comportamento. Mitigação: os botões "Mover para cima/baixo" ficam visíveis na barra, com o atalho escrito.
- **Aberto:** o tema do quadro fica no navegador (PRD §8). Se depois quiserem na conta, vira PRD próprio junto com outras preferências.
