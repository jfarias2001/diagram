# SPEC-007 — Identidade visual dos editores: temas, fontes, cores livres e arrasto natural

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| PRD | [PRD-007](../prd/PRD-007-identidade-visual-temas.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

Cinco frentes, **nenhuma migration** e **nenhuma rota nova** — tudo é conteúdo do documento Yjs, código de frontend e pacotes de fonte auto-hospedados:

1. **Arrasto:** a aresta do nó arrastado deixa de ser omitida, e ao soltar o editor grava, **numa transação só**, o deslocamento do nó mais o deslocamento compensatório dos **filhos diretos** — assim o ramo fica parado sem mudar a fórmula de posição da SPEC-006. `Shift` volta ao comportamento antigo (ramo junto).
2. **Cortar e religar:** estado local de "religar" no canvas; a troca de pai continua sendo `moveNode`, agora empacotada com a limpeza do deslocamento numa função única (`reparentNode`), para dar um `Ctrl+Z` só. O documento **nunca** guarda nó solto — a árvore continua com uma raiz e sem órfãos.
3. **Tema do documento:** um `Y.Map` novo, `style`, guardando **ids** (`theme`, `font`) e um hex opcional (`background`). Os temas em si são código (`packages/shared/src/theme.ts`), então aplicar tema num mapa de 1.000 blocos é **uma escrita**.
4. **Cores livres:** o nó ganha `ink` (cor do texto); `color`, `fill` e `ink` passam a aceitar qualquer `#rrggbb` (a validação de formato já existe e continua igual — o que muda é a interface, que deixa de oferecer 8 cores fixas). O mesmo para a forma do fluxograma.
5. **Visual:** tokens de cor mais suaves no modo claro, aresta com traço que afina (SVG desenhado por nós), e uma revisão das barras/controles dos dois editores com os mesmos componentes.

## 2. Modelo de dados

Nenhuma mudança no `schema.prisma`. Nenhuma migration. Nenhum backfill: tudo é aditivo e um documento antigo, sem `style`, resolve para o tema padrão.

### 2.1 Estilo do documento (`packages/shared/src/theme.ts`, novo)

```ts
export const THEME_IDS = ['paglamp','aurora','oceano','porsol','grafite','papel','caderno','neon'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const FONT_IDS = ['sans','inter','geometrica','serifada','manuscrita','condensada','mono','legivel'] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface DocumentTheme {
  id: ThemeId;
  name: string;              // rótulo em português
  mode: 'light' | 'dark';
  canvas: string;            // fundo do quadro
  surface: string;           // fundo padrão do bloco
  ink: string;               // texto padrão
  line: string;              // bordas da interface dentro do quadro
  grid: string;              // pontinhos do fundo
  branches: readonly string[];   // 8 cores de ramo
  rootColor: string;
  font: FontId;
  edge: { width: number; taper: number };  // espessura na saída e fração na chegada
  shape: NodeShape;          // formato padrão dos blocos
  /** Blocos de 1º nível nascem preenchidos com a cor do ramo (como na referência). */
  filledBranches: boolean;
}

export const DOC_THEMES: Record<ThemeId, DocumentTheme>;
export const DEFAULT_THEME_ID: ThemeId = 'paglamp';   // PRD §9: documentos novos nascem sóbrios
```

```ts
export const documentStyleSchema = z.object({
  theme: z.enum(THEME_IDS).optional(),      // ausente = 'paglamp'
  font: z.enum(FONT_IDS).optional(),        // ausente = a fonte do tema
  background: z.string().regex(HEX_COLOR).optional(), // ausente = o fundo do tema
});
export type DocumentStyle = z.infer<typeof documentStyleSchema>;

/** Tema + sobreposições, já resolvido para uso direto na interface. */
export function resolveTheme(style: DocumentStyle): DocumentTheme;
```

**Leitura defensiva** (`readStyle(doc)`, em `ydoc.ts`), no mesmo estilo do resto: id fora da lista é ignorado (cai no padrão), `background` só entra se casar com `#rrggbb`. Um cliente adulterado não consegue injetar nada no CSS.

**Escrita:** `setDocumentStyle(doc, patch, origin)` — uma transação; `''` em qualquer campo volta ao padrão (mesma convenção de `color`/`fill` de hoje).

### 2.2 Nó do mapa e forma do fluxograma

```ts
// mindMapNodeSchema
ink: z.string().regex(HEX_COLOR).optional();   // cor do texto escolhida à mão
// shapeSchema (diagram.ts)
ink: color.optional();
```

Lidos e escritos como `color`/`fill` já são hoje: só `#rrggbb` passa. Ausente = a cor sugerida (`readableInk` sobre o preenchimento) ou a tinta do tema.

`FORMAT_VERSION` **não muda**: os campos são aditivos e um cliente antigo ignora o que não conhece.

### 2.3 Como o estilo entra no histórico de versões

`applySnapshotState` (SPEC-005 §2.3) reconcilia hoje `nodes`, `shapes` e `edges`. O `style` é um mapa **plano de campos** (não de entidades por id), então ganha um tratamento próprio na mesma transação: o estilo da versão é lido com `readStyle` e reescrito campo a campo, apagando o que não existir na versão. Assim, restaurar uma versão devolve o tema daquela época (PRD §5.30), e nada de inválido volta.

`meta` continua de fora.

### 2.4 Posição: a fórmula da SPEC-006 não muda

Continua valendo:

```
pos(raiz) = (raiz.dx, raiz.dy) ou (0,0)
pos(n)    = pos(pai(n)) + (n.dx,n.dy  se manual;  senão autoPos(n) - autoPos(pai))
```

O que muda é **o que o editor grava ao soltar** (§5.1). Manter a fórmula é de propósito: ela é o que faz um ramo intocado continuar idêntico ao layout automático e um filho novo nascer no lugar certo.

## 3. API

Nenhuma rota nova ou alterada.

| Método | Rota | Papel mínimo | Body | Resposta |
|---|---|---|---|---|
| — | — | — | — | — |

## 4. Tempo real (Yjs / Hocuspocus)

- O `Y.Map` `style` é mais uma raiz do mesmo documento que já sincroniza: **nenhuma mudança no servidor**. A proteção de somente leitura continua sendo a do `onConnect` ([collab/plugin.ts:118](../../apps/api/src/collab/plugin.ts#L118)), que marca a conexão como `readOnly` para quem não é `EDITOR` — o Hocuspocus descarta o update, venha ele de `nodes` ou de `style`. Isso vira teste (§7).
- Trocar tema, fonte ou fundo é **um update pequeno** (um mapa de três chaves), então não há risco de estouro do limite por mensagem nem por documento.
- Arrastar continua gravando **ao soltar**, não por frame. O que muda é o tamanho da escrita: 1 + (número de filhos diretos) entradas, numa transação só.
- Nenhum campo novo de awareness. O modo religar é **local**: os colegas não veem o intermediário, só a troca de pai no fim.

## 5. Frontend

### 5.1 Arrastar move só o bloco (PRD §5.1–5.7)

**Durante o arrasto** ([MindMapCanvas.tsx](../../apps/web/src/features/editor/MindMapCanvas.tsx)):

- o conjunto que acompanha o ponteiro passa a ser `{id}` — ou `branchIds(nodes, id)` quando o `Shift` está pressionado (lido de `event.shiftKey` em `onNodeDrag`/`onNodeDragStop`);
- com `Shift`, os nós que vão junto recebem a classe `.branch-moving` (anel suave), para o PRD §5.3 ("o ramo fica visivelmente destacado");
- a condição `!isDragging` que apagava a aresta **sai**: a ligação com o pai é desenhada sempre e, como o React Flow recalcula o caminho pela posição do nó, ela estica sozinha. As arestas para os filhos idem.

**Ao soltar no vazio, sem `Shift`:**

```
Δ        = novaPos - pos(nó)
offset(nó)      = novaPos - pos(pai)                  // ou novaPos, se for a raiz
offset(filho c) = (pos(c) - pos(nó)) - Δ              // para todo filho direto
```

Prova de que o filho não se mexe: `pos'(c) = pos'(nó) + rel'(c) = (pos(nó)+Δ) + (pos(c)-pos(nó)-Δ) = pos(c)`. A conta vira uma função pura e testável em `layout.ts`:

```ts
export function offsetsForSoloMove(
  positions: Map<string, PositionedNode>,
  children: string[],
  nodeId: string, parentId: string | null,
  to: { x: number; y: number },
): Array<{ id: string; offset: { dx: number; dy: number } }>
```

Tudo é gravado por `setNodeOffsets(doc, entries, origin)` — **uma transação, um `Ctrl+Z`**.

**Com `Shift`:** grava só o nó arrastado, exatamente como hoje.

**Arrastar a raiz** continua movendo o mapa inteiro (é o caso `Shift` implícito: a raiz não compensa filhos).

**Soltar em cima de outro bloco** continua trocando o pai, agora por `reparentNode` (§5.2).

No **fluxograma** nada muda no arrasto; só o traço dos conectores passa pelo visual novo.

### 5.2 Cortar a ligação e religar (PRD §5.8–5.15)

Estado local novo no canvas: `rewire: { id: string } | null`. Nada disso vai para o documento.

- **Aresta clicável:** o mapa passa a usar uma aresta própria (`MindEdge`, §5.5). Com `edges` selecionáveis, `onEdgeClick` marca a ligação; a aresta selecionada mostra, pelo `EdgeLabelRenderer`, um botão **tesoura** ("Cortar e religar", `aria-label` completo).
- **Modo religar:** ao cortar, `rewire = { id }` (o **filho** da ligação). O canvas então:
  - mostra a faixa "Escolha o novo tópico-pai — `Esc` para cancelar" (componente `RewireBanner`, no topo do quadro);
  - aplica `.rewire-source` no bloco solto e `.rewire-blocked` (opacidade + `cursor: not-allowed`) no próprio bloco e em todos os descendentes — a lista vem de `branchIds`;
  - mantém pan e zoom livres (é assim que se alcança um pai distante, PRD §5.10);
  - no clique de um bloco válido: `reparentNode(doc, id, alvo, origin)`; `Esc`, clique no vazio ou o bloco sumir cancelam sem escrever nada.
- **Teclado:** `Ctrl+X` no bloco selecionado entra no mesmo modo (equivale a cortar), `Ctrl+V` religa no bloco selecionado no momento. Não usamos a área de transferência do sistema no mapa: é um "recorte" interno, o que evita colar HTML de fora e evita qualquer leitura de `clipboard` (ver §6).

No shared:

```ts
/** Troca o pai e devolve o nó à posição automática. Uma transação = um Ctrl+Z. */
export function reparentNode(doc: Y.Doc, id: string, newParentId: string, origin?: unknown): boolean
```

Ela reaproveita as guardas que já existem em `moveNode`: recusa mover a raiz, recusa alvo inexistente e recusa `isInBranch` (ciclo) — a interface impede antes, e o modelo recusa de novo (PRD §5.14). O `Ctrl+Z` volta o `parentId`, o `order` e o deslocamento porque tudo ficou na mesma transação.

### 5.3 Aparência: painel único (PRD §5.16–5.31)

Um botão **Aparência** no cabeçalho do editor abre um painel lateral com três abas — as mesmas nos dois editores:

| Aba | Conteúdo |
|---|---|
| **Temas** | Grade de miniaturas (SVG desenhado em código, sem imagem) dos 8 temas; clique aplica. Abaixo, a ação separada **"Aplicar e limpar as cores manuais"**. |
| **Fonte** | Lista das 8 famílias, cada uma escrita na própria fonte (o arquivo é carregado ao abrir a aba). |
| **Fundo** | Tons prontos claros/escuros + o seletor de cor livre. |

- Aplicar tema = `setDocumentStyle(doc, { theme }, origin)`: **uma escrita**, um `Ctrl+Z`, e os blocos pintados à mão continuam como estavam (PRD §5.29), porque `color`/`fill`/`ink` do nó sempre vencem o tema.
- "Aplicar e limpar as cores manuais" = `setDocumentStyle` + `clearNodeColors(doc, rootId)` na mesma transação (apaga `color`, `fill` e `ink` do ramo inteiro, no estilo do `clearOffsets` que já existe).
- Leitor e comentador: o painel abre em modo leitura (mostra o tema em uso, sem botões de aplicar). A garantia de verdade é o servidor (§6).

### 5.4 Tokens, tema e fontes

`boardTheme.ts` deixa de ser preferência de navegador e vira `useDocumentTheme(doc)`: observa o `Y.Map` `style`, resolve com `resolveTheme` e devolve o tema mais um objeto de variáveis CSS. O elemento do quadro passa a receber:

```tsx
<div data-board={theme.mode} style={{ '--canvas': bg, '--surface': theme.surface, '--ink': theme.ink,
        '--line': theme.line, '--grid': theme.grid, '--board-font': fontFamily }}>
```

Todos os valores vêm de `resolveTheme`, ou seja, de constantes do código ou de um hex já validado na leitura — **nunca** de texto livre do documento. O interruptor sol/lua e a chave `paglamp.board-theme` no `localStorage` são removidos (PRD §5.31); o `localStorage` passa a guardar só as **cores recentes** do seletor.

**Fontes** (`apps/web/src/features/editor/fonts.ts`): 8 famílias auto-hospedadas via `@fontsource`, carregadas **sob demanda** com `import()` dinâmico — o Vite gera um pedaço por fonte, então quem abre um mapa com a fonte padrão não baixa as outras sete. Servidas do próprio domínio, o que respeita a CSP `font-src 'self' data:` de [infra/nginx/security-headers.conf](../../infra/nginx/security-headers.conf) sem afrouxar nada.

| Id | Família | Pacote |
|---|---|---|
| `sans` | Instrument Sans | `@fontsource-variable/instrument-sans` (já instalado) |
| `inter` | Inter | `@fontsource-variable/inter` |
| `geometrica` | Outfit | `@fontsource-variable/outfit` |
| `serifada` | Source Serif 4 | `@fontsource-variable/source-serif-4` |
| `manuscrita` | Caveat | `@fontsource-variable/caveat` |
| `condensada` | Oswald | `@fontsource-variable/oswald` |
| `mono` | JetBrains Mono | `@fontsource-variable/jetbrains-mono` |
| `legivel` | Atkinson Hyperlegible | `@fontsource/atkinson-hyperlegible` |

Enquanto o arquivo carrega, o quadro usa a fonte padrão (`font-display: swap` do próprio fontsource) — nada pisca em branco.

**Cuidado com o layout:** `estimateSize` (layout.ts) estima a largura do texto por um fator de caractere. Cada fonte ganha um fator próprio (`widthFactor` na tabela acima, ex.: Oswald ~0,82; Caveat ~0,78; JetBrains Mono ~1,05), aplicado em `estimateSize`. Sem isso, trocar para a condensada deixaria folga sobrando e para a monoespaçada deixaria texto vazando.

### 5.5 Traço que afina (PRD §5.33)

Aresta própria do mapa (`MindEdge.tsx`), desenhada como **polígono preenchido**, e não como linha de espessura única:

- `taperedPath(sx, sy, tx, ty, w0, w1, side)` (novo `taper.ts`, função pura) monta a cúbica horizontal que o React Flow já usa, amostra 24 pontos, desloca cada um pela normal com largura interpolada de `w0` (saída, no pai) até `w0 * taper` (chegada, no filho) e devolve o `d` do `<path>`;
- a espessura de saída cai com a profundidade (nível 1 mais grosso, níveis fundos mais finos), com um piso, como na referência;
- `React.memo` na aresta e cálculo só quando as pontas mudam.

### 5.6 Seletor de cor (PRD §5.16–5.19)

`components/ColorPicker.tsx`, usado pelos dois editores, sem dependência nova:

- área de saturação/brilho (div com dois gradientes + ponteiro) e barra de matiz, ambas operáveis por teclado (setas movem, `Shift` acelera);
- campo `#RRGGBB` com validação ao digitar;
- fileira **do tema** (as 8 cores do tema em uso) e fileira **recentes** (até 12, no `localStorage`, tolerante a storage bloqueado, como o `boardTheme` já faz hoje);
- botão **Auto** (volta ao padrão) e, no preenchimento, o aviso de contraste: se `contraste(ink escolhido, fill) < 4,5`, aparece "texto pouco legível neste fundo" — **aviso, não bloqueio** (PRD §5.18).

Conversões em `lib/color.ts` (`hexToHsv`, `hsvToHex`, `contrastRatio`), testadas.

### 5.7 Atalhos

| Tecla | Ação |
|---|---|
| `Shift` + arrastar | move o ramo inteiro |
| `Ctrl+X` | corta a ligação do bloco selecionado (entra no modo religar) |
| `Ctrl+V` | religa no bloco selecionado |
| `Esc` | cancela o modo religar (antes de limpar a seleção) |

Os de hoje continuam. Nenhum dispara com o foco num campo de texto (CLAUDE.md §7).

### 5.8 Exportar PNG

`exportCanvasPng` já lê `--canvas` do elemento `[data-board]`, então passa a exportar com o fundo do **tema do documento** sem mudança. Acrescenta-se apenas a espera de `document.fonts.ready` antes de rasterizar, para a fonte escolhida não sair substituída na imagem.

## 6. Segurança

Checklist do CLAUDE.md §9 aplicada ao que muda:

**Autorização**
- Nenhuma rota nova: nada a acrescentar em `assertDocumentAccess`.
- Tema, fonte, fundo e cores são conteúdo do Y.Doc. Quem não é `EDITOR` tem a conexão marcada `readOnly` no `onConnect` e o update é descartado **no servidor** — esconder o painel não é a proteção, é só a interface. Teste novo: leitor forjando um update em `style` pelo WebSocket não muda o documento (§7).
- Admin continua sem acesso por ser admin.

**Injeção / XSS (o risco principal desta entrega, porque ela leva dado do documento para o CSS)**
- Todo valor que vira CSS passa por uma de duas portas: **constante do código** (temas e fontes são ids de listas fechadas) ou **hex validado** (`/^#[0-9a-fA-F]{6}$/`) na leitura do Y.Doc. Não existe caminho de texto livre do documento para `style`.
- Um `theme`/`font` desconhecido (documento adulterado ou de uma versão futura) cai no padrão, em vez de ser repassado.
- `ink` entra com a mesma regra de `color`/`fill`, na leitura **e** na escrita.
- Nada de `dangerouslySetInnerHTML`; o texto do nó continua sendo texto.
- `Ctrl+X`/`Ctrl+V` do mapa **não** leem a área de transferência do sistema: são um recorte interno em memória, então não há superfície de colagem de conteúdo externo.

**Recursos e DoS**
- Aplicar tema = 1 escrita, independentemente do tamanho do mapa.
- O pior caso de escrita do arrasto é "1 + filhos diretos" numa transação; cabe folgado no limite por mensagem e vira teste de desempenho.
- As fontes são estáticas do próprio domínio, com cache do navegador; nenhum pedido externo em tempo de uso (CSP inalterada).

**Dependências**
- 7 pacotes `@fontsource*` novos (só arquivos de fonte, sem código executável no runtime da aplicação) e **nenhuma** biblioteca nova de cor ou de interface. `pnpm audit --prod` roda na etapa 4 do fluxo.

## 7. Plano de testes

**Unidade — `packages/shared`**
- `readStyle`: tema inválido → padrão; fonte inválida → a do tema; `background` fora do hex → ignorado; documento sem `style` → padrão `paglamp`.
- `setDocumentStyle`: grava, `''` limpa, uma transação por chamada.
- **Contraste de todos os temas** (PRD "não funcionais"): para cada tema, `contraste(ink, surface) ≥ 4,5` e, para cada cor de ramo, `contraste(readableInk(cor), cor) ≥ 4,5`.
- `reparentNode`: troca o pai, zera o deslocamento, recusa raiz / alvo inexistente / ciclo, e tudo numa única entrada de desfazer.
- `setNodeOffsets`: lote válido grava tudo; entrada inválida (NaN, acima do limite, id inexistente) é ignorada sem derrubar as outras; uma transação só.
- `clearNodeColors`: apaga `color`/`fill`/`ink` do ramo, não toca em texto nem posição.
- `ink`: forjado com `javascript:`/`red`/`#xyz` no Y.Doc não chega ao snapshot.
- `applySnapshotState`: restaurar uma versão devolve o tema daquela versão; versão sem `style` volta ao padrão.

**Unidade — `apps/web`**
- `offsetsForSoloMove`: o filho fica parado (invariante `pos'(c) == pos(c)`), a raiz não compensa, nó sem filhos gera uma entrada só.
- `taperedPath`: caminho fechado, largura inicial e final corretas, tolerante a pontas coincidentes.
- `lib/color.ts`: `hexToHsv`/`hsvToHex` ida e volta, hex inválido, `contrastRatio` conferido contra valores conhecidos da WCAG.
- `estimateSize` com cada fonte: o texto continua cabendo (largura monotônica com o fator).
- Desempenho (`perf.test.ts`): aplicar tema em 1.000 blocos e arrastar um nó com 500 filhos diretos dentro do orçamento já usado nos testes de hoje.

**Integração — `apps/api`**
- Leitor (papel direto e papel herdado de pasta) forjando update em `style` pelo WebSocket: descartado; o documento não muda.
- Editor troca o tema e a mudança chega a outra conexão aberta.
- Snapshot automático + restauração preservando `style`.

**E2E — `e2e/sp007-aparencia.spec.ts`**
1. arrastar um bloco com filhos: a linha continua visível durante o arrasto, os filhos **não** se movem;
2. `Shift`+arrastar: o ramo inteiro acompanha;
3. cortar a ligação, cancelar com `Esc` (nada muda), cortar de novo, clicar num bloco distante e ver o ramo religado; `Ctrl+Z` volta;
4. aplicar o tema "Oceano", trocar a fonte para "Caderno" e conferir que **a segunda aba** (outro navegador) vê o mesmo;
5. pintar um bloco com um hex digitado à mão e conferir a cor aplicada;
6. leitor abre o mesmo documento e não encontra os botões de aplicar tema.

Os E2E de SPEC-002 e SPEC-006 que citam "Cor"/"Cores" e o interruptor sol/lua são atualizados junto (o interruptor deixa de existir).

## 8. Tarefas (em ordem)

1. [ ] `packages/shared/src/theme.ts`: ids, `DOC_THEMES` (8 temas), `DOC_FONTS`, `documentStyleSchema`, `resolveTheme` + testes de contraste.
2. [ ] `ydoc.ts`: `readStyle`, `setDocumentStyle`, `reparentNode`, `setNodeOffsets`, `clearNodeColors` + testes.
3. [ ] `document.ts` e `diagram.ts`: campo `ink` (leitura, escrita, schema) + testes.
4. [ ] `restore.ts`: reconciliar `style` + teste.
5. [ ] `apps/web/src/lib/color.ts` e `components/ColorPicker.tsx` (com recentes) + testes.
6. [ ] `layout.ts`: `offsetsForSoloMove` e fator de largura por fonte + testes.
7. [ ] `MindMapCanvas`: arrasto solo, `Shift` para o ramo, aresta visível durante o arrasto.
8. [ ] `MindEdge.tsx` + `taper.ts`: traço que afina, aresta selecionável, botão tesoura + testes.
9. [ ] Modo religar: estado, faixa, bloqueio dos descendentes, `Ctrl+X`/`Ctrl+V`, `Esc`.
10. [ ] `useDocumentTheme` (substitui `boardTheme.ts`), tokens no elemento do quadro, remoção do interruptor sol/lua.
11. [ ] `fonts.ts` com carregamento sob demanda + as 7 dependências novas.
12. [ ] Painel **Aparência** (Temas / Fonte / Fundo) nos dois editores, com modo leitura.
13. [ ] Fluxograma: cor livre em forma, borda, texto e conector; tema e fonte aplicados.
14. [ ] Revisão visual dos dois editores: tokens claros mais suaves, barras, controles, foco, sombras.
15. [ ] `exportPng`: esperar `document.fonts.ready`.
16. [ ] Testes de integração (WebSocket, restauração) e o E2E novo; atualizar os E2E afetados.
17. [ ] Revisão de segurança (§6), `pnpm audit --prod`, STORY.md, commit e push.

## 9. Variáveis de ambiente novas

| Nome | Obrigatória | Default | Descrição |
|---|---|---|---|
| — | — | — | Nenhuma. |

## 10. Riscos e decisões pendentes

- **Tamanho do bundle:** 7 famílias novas só existem como pedaço separado, carregado quando o documento usa a fonte. Se o build de produção crescer de forma relevante mesmo assim, a saída é reduzir a lista de 8 para 5 — registrado aqui para não virar surpresa.
- **Tokens claros globais:** o modo claro confortável mexe nos tokens de `:root`, então o **painel de documentos também fica menos branco**. É uma melhora coerente e pequena; o painel não é redesenhado (continua fora do escopo do PRD).
- **Lado do ramo:** como na SPEC-006, arrastar um bloco para o outro lado da tela não troca o lado lógico (esquerda/direita) do ramo; a ligação pode cruzar o mapa. Continua como está.
- **Compensar filhos grava mais:** um nó com muitos filhos diretos gera uma escrita por filho ao ser arrastado (numa transação). É o preço de "os filhos ficam parados" sem abandonar a fórmula relativa, que é o que mantém o resto barato.
- **Fonte e layout:** a largura do texto continua sendo estimada, não medida. O fator por fonte reduz o erro, mas uma fonte muito diferente pode deixar folga irregular; se incomodar, vira tarefa de medir o nó de verdade.
- **Tema não é por usuário:** quem gosta de escuro e abre um documento claro vê claro. Foi a decisão do PRD (§5.30); se depois fizer falta, cabe uma preferência pessoal de sobreposição num follow-up.
