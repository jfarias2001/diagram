# SPEC-009 — Movimento e acabamento

| Campo | Valor |
|---|---|
| Status | Implementado (2026-11-11) |
| PRD | [PRD-009](../prd/PRD-009-movimento-e-acabamento.md) |
| Data | 2026-11-11 |
| Origem | [PESQUISA-001](../research/PESQUISA-001-ux-e-concorrentes.md) |

## 1. Resumo técnico

Tudo é feito no **frontend**, sem dependência nova, rota nova, migration nem mudança no Y.Doc.

- **Base:** uma camada de movimento com tokens CSS (durações e curvas) e uma regra global de `prefers-reduced-motion`.
- **Peças reutilizáveis:**
  - um hook `usePresence`, que mantém montado o que está saindo até a animação de saída terminar;
  - os componentes `Menu`, `Toast`, `ConfirmDialog`, `Skeleton` e `CommandPalette`.
- **No canvas:** a animação é feita por um hook (`useAnimatedPositions`) que interpola, por `requestAnimationFrame`, **só os nós cuja posição mudou**. A "conta" do que anima é uma função pura e testada (`planTransition`).
- **Câmera, busca no mapa e paleta de comandos** também se apoiam em funções puras com teste.

O roteiro de animação segue o guia da PESQUISA-001 §6.

## 2. Modelo de dados

**Sem mudança** no `schema.prisma` e **sem mudança** no Y.Doc.

Estado novo, todo **local** (só no navegador de quem usa, nunca sincronizado):

| Estado | Onde vive | Por quê |
|---|---|---|
| Fila de avisos (toasts) | store em memória (`components/toast.ts`) | é efêmero |
| Ramos revelados pela busca | `useState` no `MindMapCanvas` | a busca não pode mexer no mapa dos colegas (PRD-009 R6.22) |
| "Renderizar tudo" durante exportação | store em memória (`features/export/renderAll.ts`) | ver §5.8 |
| Seleções dos colegas | store por nó (`features/editor/presence.ts`) | hoje fica no `useMemo` do mapa inteiro (§5.7) |

## 3. API

**Nenhuma rota nova.** O "Desfazer" dos avisos chama as rotas que já existem, com as mesmas checagens no servidor:

| Ação | Desfazer chama | Papel exigido (já hoje) |
|---|---|---|
| Mandar para a lixeira | `POST /api/v1/documents/:id/restore` | OWNER |
| Mover para pasta | `PUT /api/v1/documents/:id/personal-folder` ou `/shared-folder` com a pasta anterior (`DocumentSummary.folder`). Se o tipo de pasta mudou, primeiro `null` no tipo novo e depois o anterior no tipo antigo | o mesmo do mover |
| Remover acesso de membro do documento | `POST /api/v1/documents/:id/members` com o `email` e o `role` do `DocumentMemberView` removido | OWNER |
| Remover membro de pasta | `POST /api/v1/folders/:id/members` com `email` e `role` | dono da pasta |

**Sem Desfazer (vira `ConfirmDialog`):**
- apagar de vez;
- apagar pasta (refazer exigiria recriar a pasta e os vínculos — fora de escopo);
- gerar nova senha provisória;
- sair do documento;
- restaurar versão.

A paleta de comandos busca documentos com o **`GET /api/v1/documents?q=` existente**, que já filtra por acesso no servidor.

## 4. Tempo real (Yjs / Hocuspocus)

Sem campo novo e sem evento novo de awareness. Três mudanças só de leitura:

1. As seleções dos colegas passam a ser lidas por uma store por nó, `presence.ts` (§5.7). O awareness transmitido é o mesmo.
2. Alteração de posição vinda de colega anima como a local, pelas mesmas regras de limite (§5.6).
3. **Busca revela localmente:** o ramo recolhido que contém o resultado é desenhado aberto **só para quem busca**. Nada é escrito no Y.Doc; o leitor também consegue revelar.

## 5. Frontend

### 5.1 Tokens e base de movimento (`index.css`, `lib/motion.ts`)

**Tokens no `:root`** (valem nos dois modos):
```css
--dur-micro: 120ms;  --dur-fast: 180ms;  --dur-base: 240ms;  --dur-slow: 320ms;
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

**`@theme`:** registra `--ease-*` e `--animate-*` para virar utilitário Tailwind. As keyframes `fade-in`, `pop-in` (escala 0,96→1 + opacidade), `slide-up` (8 px), `slide-in-right`, `node-born` (escala 0,85→1 + opacidade, 180 ms) e `shimmer` (esqueleto) usam a origem em `--origin` (padrão `top left`).

**Escalas que hoje estão soltas:**
- Raio: `--radius-control` (0,5 rem), `--radius-pop` (0,75 rem), `--radius-modal` (1 rem).
- Sombra: `--shadow-pop` e `--shadow-modal`, com versão escura que soma borda clara, porque a sombra some no escuro.
- Camadas: `--z-bar` 20, `--z-pop` 40, `--z-modal` 50, `--z-toast` 60.
- Texto: `--text-2xs` (11 px) substitui os `text-[10px]`/`text-[11px]`.
- Tokens novos:
  - `--nav-hover`/`--nav-active`, que substituem `bg-white/8`, `/10` e `/12`;
  - `--scrim`, um escurecimento único para diálogo e gaveta;
  - `--nav` escuro separado do `--canvas`, com contraste ≥ 1,15.

**Reduzir movimento** (regra global no fim do `index.css`):
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important; animation-iteration-count: 1 !important;
    transition-duration: 1ms !important; scroll-behavior: auto !important;
  }
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
```
É 1 ms e não 0 para que `transitionend`/`animationend` continuem disparando: o `usePresence` depende disso.

**`lib/motion.ts`:**
- `DUR` (os mesmos números em JS, para as `duration` do React Flow);
- `easeOutCubic`;
- `prefersReducedMotion()`;
- `useReducedMotion()`, que assina o `matchMedia`.

**Todas as durações JS** passam por `motionMs(ms)`, que devolve 0 com "reduzir movimento". Isso vale para `zoomIn`/`zoomOut`/`fitView` em `CanvasControls` e `DiagramControls`, para a câmera e para as animações de layout.

### 5.2 Entrada e saída (`components/usePresence.ts`)

```ts
usePresence(open: boolean): { mounted: boolean; state: 'enter' | 'open' | 'exit' }
```
- Monta com `state='enter'` e passa a `open` no frame seguinte.
- Ao fechar, passa a `exit` e desmonta no `animationend`/`transitionend`, ou num teto de segurança de 400 ms.
- O CSS anima por `[data-state]`.

Quem usa: `Modal`, `Menu`, `Toast`, gaveta do celular, `HistoryPanel`, `CommandPalette` e os popovers da `NodeActionBar` (seletor de cor e menu em grade).

**`Modal` (`ui.tsx`):**
- Deixa de desmontar o conteúdo ao fechar: `dialog.close()` só roda depois do `exit`.
- Entra com `pop-in` e `--dur-base` e sai com `--ease-exit` em 180 ms.
- O `::backdrop` usa `--scrim` com fade.
- `Field` ganha `aria-describedby` (dica/erro) e `aria-invalid`.

### 5.3 Menus (`components/Menu.tsx`)

Um componente único:
```tsx
<Menu trigger={(props) => <Button {...props}>…</Button>} placement="bottom-end" items={[…]} />
```
- Abre com `pop-in` em `--dur-fast`, com `transform-origin` no canto do gatilho (`--origin` calculado por `placement`).
- Teclado: foca o primeiro item; `↑↓`, `Home`/`End` e letra inicial navegam; `Esc` fecha e **devolve o foco ao gatilho**.
- Fecha por `pointerdown` fora (cobre o toque) e quando o foco sai do menu (`focusout` para fora, cobre o `Tab`).
- Itens com `danger`, `disabled` (visual próprio: opacidade 0,45 e `cursor-not-allowed`) e `shortcut`.

**Substitui** `CardMenu` e `NewMenu` (`DashboardPage.tsx`), `UserMenu` (`AppShell.tsx`) e o `FolderMenuDialog`: as opções da pasta viram `Menu`, igual às do documento. O `ActionMenu` (grade) mantém a própria navegação e ganha só a animação, pelo `usePresence`, e a devolução de foco.

### 5.4 Avisos e confirmação (`components/Toast.tsx`, `components/toast.ts`, `components/ConfirmDialog.tsx`)

**Store (`toast.ts`):** `toast({ message, tone: 'ok' | 'error' | 'info', action?: { label, run }, duration? })`.
- `duration` padrão: **6 s** com ação e 4 s sem.
- No máximo **3 avisos**; o mais antigo sai.
- Pausa no `pointerenter`/`focusin` e retoma ao sair.
- A ação roda **uma vez só**: o botão desabilita ao clicar, e a store ignora clique duplo.
- Depois da ação, aparece o aviso do resultado ("Restaurado") ou o erro.

**`<Toaster>`:** montado no `main.tsx`, dentro do `QueryClientProvider`.
- Canto inferior direito; no celular, embaixo e centralizado, com 16 px de margem.
- Entra com `slide-up` + fade em `--dur-base` e sai em 180 ms.
- Usa duas regiões: `role="status"`/`aria-live="polite"` para `ok`/`info` e `role="alert"` para `error`.
- **O texto do aviso é sempre texto:** títulos de documento entram como string React, sem HTML.

**Onde aparece:**
- duplicar, mover (também ao arrastar para a pasta), renomear, lixeira, restaurar, apagar de vez;
- criar, renomear e apagar pasta;
- adicionar, mudar e remover membro;
- restaurar versão, salvar versão com nome, "salvar como cópia";
- apagar ramo de 2 ou mais tópicos (§5.6.4);
- erros de mutação do TanStack Query, por um `onError` padrão no `QueryClient` com a mensagem do `ApiError`, no lugar do `ErrorText` no topo da página.

O `ErrorText` continua só em formulário (login, troca de senha, campos de diálogo).

**`useConfirm()`:** devolve `confirm({ title, body, confirmLabel, danger }): Promise<boolean>`, construído sobre o `Modal`.
- O botão de perigo usa `variant="danger"` e o título cita o nome do item.
- Foco inicial em **Cancelar**.
- **Os 5 `window.confirm` e o `window.alert` do "Organizar" saem.** Uma regra nova do ESLint, `no-alert: 'error'`, impede que voltem.

### 5.5 Carregamento e acabamento

**`Skeleton`** (`ui.tsx`): um bloco `bg-surface-2` com `shimmer`, mais o hook `useDelayedFlag(loading, { delay: 200, min: 400 })`, que só mostra o esqueleto depois de 200 ms de espera e o mantém por pelo menos 400 ms. Esqueletos no formato do conteúdo para:
- cartões e linhas do painel (6 cartões / 8 linhas);
- tabela de usuários;
- lista do histórico;
- lista de membros no compartilhar;
- abertura do editor (cabeçalho + quadro vazio com pontos).

O `Spinner` fica só dentro de botões ocupados.

**`Button`:**
- prop `size: 'sm' | 'md'` (h-8 / h-9), que elimina os `!h-7 !px-2`;
- `active:scale-[0.97]` e `transition-[transform,background-color,filter]` em `--dur-micro` (sem `transition` genérico);
- anel `focus-visible` com `--brand`.

`Input`/`Select` trocam `focus:outline-none` por anel `focus-visible` de 2 px `--brand-soft` mais a borda `--brand`.

**Lateral (`FolderSidebar.tsx`):**
- a pasta expande com `grid-template-rows: 0fr → 1fr` em `--dur-base`, e a setinha **gira** em vez de ser trocada por outra;
- o "⋯" fica sempre visível em `pointer-coarse:` (toque);
- ao soltar um documento numa pasta, a linha da pasta pulsa uma vez (WAAPI: `scale 1 → 1,04 → 1` em 240 ms) e aparece o aviso "Movido para X · Desfazer".

**Painel (`DashboardPage.tsx`):**
- os cartões entram com `fade-in` + `slide-up` escalonados (`animation-delay: calc(min(var(--i), 10) * 20ms)`);
- a troca de filtro e de cartões/lista roda em `document.startViewTransition` quando existe (`lib/viewTransition.ts`), com crossfade de 180 ms;
- abrir um documento usa `<Link viewTransition>` (React Router 8).

**Histórico (`HistoryPanel.tsx`):** desliza da direita com `--ease-drawer` em `--dur-slow`.

**Gaveta do celular (`AppShell.tsx`):**
- vira um `<dialog>` modal: foco preso, `Esc` e resto inerte de graça;
- desliza com `--ease-drawer`, e o escurecimento acompanha com fade;
- o `main` ganha `pt-14 md:pt-8`, então o botão de menu deixa de cobrir o título.

**Status no celular (`EditorHeader.tsx`):** abaixo de `md`, o status vira um ponto colorido (verde salvo, âmbar salvando, cinza offline) com `aria-label` e `title` com o texto. Tocar mostra o texto num `Menu` curto.

### 5.6 Canvas que flui

#### 5.6.1 `planTransition` (função pura, `features/editor/motion/planTransition.ts`)

```ts
planTransition(input: {
  shown: Map<string, Point>;       // onde cada nó ESTÁ desenhado agora (inclui o meio de uma animação)
  next: Map<string, Point>;        // onde cada nó deve ficar
  parentOf: (id: string) => string | null;
  maxAnimated?: number;            // padrão 300
  minDistance?: number;            // padrão 2 px no mapa, 24 px no fluxograma
}): {
  animate: boolean;
  tracks: Map<string, { from: Point; to: Point }>;   // nós que vão deslizar
  born: Set<string>;                                  // nós novos
  ghosts: Array<{ id: string; from: Point; to: Point }>; // nós que saem
}
```

**Regras, cada uma com teste:**
1. **Nó que existia e mudou** mais que `minDistance`: `from = shown`, `to = next`. Como `from` é onde o nó *está desenhado*, uma animação interrompida no meio continua dali, sem pulo.
2. **Nó novo:** `from` é a posição mostrada do **ancestral visível mais próximo** em `shown`. Por isso o bloco "sai do pai", e ao expandir um ramo os filhos saem dele. Vai para `born`.
3. **Nó que sumiu** com algum ancestral presente em `next`: vira *fantasma*, de `shown` até o `next` do ancestral visível mais próximo (recolher fecha em direção ao pai). Sem ancestral presente (raiz trocada, restauração), some sem fantasma.
4. Se `tracks + ghosts > maxAnimated` → `animate = false`: tudo vai direto. Isso cobre colar, restaurar versão e grande alteração de colega.
5. Nada mudou → `tracks` vazio. O hook não agenda frame nenhum.

#### 5.6.2 `useAnimatedPositions` (`features/editor/motion/useAnimatedPositions.ts`)

- **Recebe** a lista de nós e de ligações já montada (alvo final) e `enabled`.
- **Devolve** listas com a posição interpolada.
- **Roda num componente-filho que renderiza o `<ReactFlow>`** (`AnimatedFlow`), para que a cada frame só ele re-renderize, nunca o `MindMapCanvas` inteiro.

**A cada frame:**
- `t = easeOutCubic(elapsed / DUR.base)` (240 ms);
- objeto novo **só** para os nós de `tracks`; os outros mantêm a mesma referência e o React Flow não os toca;
- as ligações seguem sozinhas, porque o `MindEdge` lê `sourceX/targetX` do próprio React Flow.

**Nós novos:** recebem `className: 'node-born'` (keyframe CSS de 180 ms) durante a animação. O nascimento não é por CSS no `mount`, porque com `onlyRenderVisibleElements` um nó que entra na tela ao rolar seria "remontado" e piscaria.

**Fantasmas:**
- entram na lista como nós `type: 'mind'`, com `id` prefixado `ghost:`, o último `data` em cache, `selectable/draggable/focusable: false`, `className: 'node-ghost'` (`pointer-events: none`) e opacidade de 1 a 0 junto com o trajeto;
- a ligação deles é mantida do mesmo jeito (`ghost:` + id da ligação);
- somem no fim.

**`enabled = false`** (posição direta, sem frame agendado):
- durante arrasto (`drag != null`);
- no primeiro desenho;
- no modo versão;
- com `useReducedMotion()`.

**Para fora, o hook expõe:**
- `data-animating="true|false"` no wrapper, que o E2E usa;
- `whenSettled(): Promise<void>`, que a exportação aguarda (§5.8).

**No fluxograma:** o mesmo hook sobre os `nodes` do `DiagramCanvas`, com `minDistance = 24`, para que mover por setas (8 px) e o fim de um arrasto (já está onde foi solto) fiquem instantâneos. Animam o "Organizar" e os movimentos de colegas. Forma nova também recebe `node-born`.

#### 5.6.3 Câmera (`features/editor/motion/camera.ts`)

`panToReveal(viewport, container, box, margin = 80)`:
- devolve o novo `{ x, y }` do viewport, ou `null` se `box` (em coordenadas do fluxo) já está dentro da área segura;
- **nunca muda o zoom**;
- se o bloco é maior que a área visível, alinha pelo canto de entrada.

**Hook `useFollowCamera(id, posById, measured)`:**
- dispara quando a seleção muda por **teclado ou criação** (não por clique, porque quem clica já está vendo);
- usa a posição **alvo**, não a interpolada;
- chama `setViewport(v, { duration: motionMs(DUR.slow) })`.

O campo de texto do bloco novo continua com `preventScroll`: quem rola a tela é a câmera.

#### 5.6.4 Ramo recolhido (`MindNode.tsx`)

- **Novos campos no `data`:**
  - `hiddenCount`, com quantos descendentes o ramo esconde, calculado no canvas por um índice memorizado e não por nó;
  - `onToggleCollapse`, um callback estável;
  - saem `hasHiddenChildren` e `peers` (este último por causa do §5.7).
- **Bloco recolhido:**
  - na borda de fora fica **só o selo**, um `<button>` com o número ("7", e "99+" acima disso), `aria-label="Expandir ramo (7 tópicos escondidos)"`;
  - clicar **expande**;
  - o "+" não aparece nesse bloco. `Tab` continua criando filho: o `createChild` de um bloco recolhido expande na **mesma transação** (um `Ctrl+Z`).
- **Bloco aberto com filhos:** no hover (ou selecionado), aparecem na borda de fora, em fila, o chip **"–" (recolher)**, mais perto do bloco, e o **"+"**, 4 px depois. Os dois têm 22 px e `title` com o atalho.
- **Leitor:** o selo aparece, mas sem botão (recolher grava no documento compartilhado, PRD-009 §9.1), com `title` explicando. A busca revela localmente (§5.9).

#### 5.6.5 Apagar ramo (`MindMapCanvas.tsx`)

`removeNode` conta `branchIds(nodes, id).length`:
- **≥ 20:** chama `onCheckpoint('Antes de apagar "<texto do bloco, até 40 caracteres>"')` antes de apagar;
- **≥ 2:** mostra o aviso "N tópicos apagados · Desfazer".

**O "Desfazer" do aviso só age se o topo da pilha do `Y.UndoManager` ainda for aquela exclusão.** O hook guarda a referência do `StackItem` criado (evento `stack-item-added`). Se a pessoa fez outra coisa depois, o botão some e o aviso vira informativo. Um `Ctrl+Z` continua desfazendo pela ordem normal. A regra fica na função pura `canUndoFromToast(stack, item)`.

### 5.7 Presença sem re-render global (`features/editor/presence.ts`)

`usePeerSelections` sai dos dois editores (está duplicado) e vira uma store única:
- `createPresenceStore(awareness)` guarda `Map<nodeId, Peer[]>`;
- notifica só os nós cuja lista mudou;
- `usePeersFor(id)` usa `useSyncExternalStore`, com seletor por id.

`MindNode` e `ShapeNode` leem os colegas por esse hook, e `peers` sai das dependências do `useMemo` do fluxo. Com isso, um colega trocando de seleção re-renderiza **2 nós**, não o mapa inteiro. É pré-requisito do cursor ao vivo (PRD-011).

**Correção junto:** o contorno do colega deixa de sumir quando eu também seleciono o mesmo bloco. As duas marcas convivem: o anel é meu e o tracejado externo, a 6 px, é do colega.

### 5.8 Desenhar só o visível, sem quebrar a exportação

- **O mapa mental passa a usar `onlyRenderVisibleElements`**, como o fluxograma.
- **Risco já existente, confirmado no código:**
  - `exportCanvas` fotografa o DOM do `.react-flow__viewport`;
  - com `onlyRenderVisibleElements`, o que está fora da tela **não está no DOM**;
  - no fluxograma, exportar com zoom aproximado deve hoje sair com áreas em branco. Vai ser confirmado no E2E antes de corrigir.
- **Correção:**
  - `renderAll.ts` expõe `requestRenderAll(): Promise<release>`;
  - os dois canvases leem `onlyRenderVisibleElements={!renderAll}`;
  - o `exportCanvas` pede, espera a animação acabar (`whenSettled`) e 2 frames, fotografa e libera.

### 5.9 Busca no mapa — `Ctrl+F` (`features/editor/MapSearch.tsx`, `features/editor/search.ts`)

**`searchNodes(nodes, query)`** (pura) devolve os ids em **ordem de leitura**: raiz, depois os ramos da direita de cima para baixo e então os da esquerda, em profundidade. A comparação ignora caixa e acento (`normalize('NFD')`) e procura no **texto** e na **nota**. Ramos recolhidos entram.

**`withLocalExpand(nodes, revealed)`** (pura) devolve um `NodeRecord` em que só os ancestrais do resultado atual têm `collapsed: false`:
- **cópia rasa** apenas dos objetos afetados, sem mutar o original;
- o layout usa esse registro;
- o Y.Doc **não** é tocado.

**Barra (`Panel` no topo):**
- campo, "3 de 12", ↑/↓, fechar;
- `Enter`/`Shift+Enter` navegam;
- `Esc` fecha e limpa a revelação;
- os resultados ganham `className: 'search-hit'`, e o atual `search-current` mais a câmera (§5.6.3);
- debounce de 120 ms, com teto de 500 resultados destacados.

**Quando o `Ctrl+F` é interceptado:** só com o foco dentro do editor (canvas, barra ou painéis do editor). No resto da página, o navegador busca normalmente.

**No fluxograma:** a mesma barra procura no texto das formas e nos rótulos de conector, sem a parte de revelar.

### 5.10 Paleta de comandos — `Ctrl+K` / `⌘K` (`components/CommandPalette.tsx`, `components/commands.ts`)

**Registro:**
- `CommandProvider` em volta do `RequireAuth`;
- cada página registra comandos com `useCommands('dashboard' | 'editor', list)`, e o registro some ao desmontar.
- Formato do comando: `{ id, label, group, keywords?, shortcut?, icon?, run }`.

**`rankCommands(commands, query)`** (pura):
- normaliza acento e caixa;
- prioridade: começo do rótulo, depois começo de palavra, depois "contém" (inclui `keywords`);
- ordem estável dentro de cada faixa.

**O que entra:**
- **Painel:**
  - Criar mapa mental, Criar fluxograma;
  - Ir para Meus documentos / Compartilhados / Lixeira;
  - Usuários, só se `session.user.role === 'ADMIN'`. É só exibição: a página e a API já exigem admin no servidor.
- **Editor:**
  - as ações do menu em grade, obtidas por `mindMenuGroups(ctx)` / `shapeMenuGroups(...)` **já filtradas por papel** (teste da SPEC-008), mais uma vez achatadas. Só aparecem com algo selecionado;
  - as ações do documento: Exportar, Histórico, Compartilhar, Aparência (só editor), Buscar no mapa, Ajustar à tela, Organizar (só editor), Atalhos.
- **Documentos:** com 2 caracteres ou mais, `GET /documents?q=` com debounce de 150 ms, até 8 resultados, mostrando o nome da pasta.

**Interação:**
- `↑↓`, `Enter`, `Esc`, o mouse escolhe;
- o atalho aparece em `<kbd>`;
- abre centralizada no alto (20% da altura) com `pop-in` em `--dur-fast`;
- `Esc` devolve o foco para onde estava.

**Conflitos:**
- `Ctrl+K` funciona em qualquer tela logada, inclusive com foco em campo: o campo perde o foco, e o bloco em edição confirma o texto pelo `onBlur` de sempre;
- o `preventDefault` evita a barra de busca do navegador.

### 5.11 Atalhos pela tecla `?` (`ShortcutHint.tsx`)

**Desvio do PRD (R6.23), pedindo aprovação:**
- no mapa, "digitar com um bloco selecionado começa a editar" (CLAUDE.md §7), então `?` com bloco selecionado **continua editando**, como hoje;
- `?` abre os atalhos **quando nada está selecionado**;
- `Ctrl+/` abre **sempre**, como no Google Docs e no Miro;
- os dois aparecem no botão "Atalhos" e na paleta.

**A lista** passa a ser um `Modal` com duas colunas agrupadas (Criar, Editar, Navegar, Organizar, Geral), em vez do `<dl>` no canto.

### 5.12 Atalhos novos (resumo)

| Tecla | Onde | Faz |
|---|---|---|
| `Ctrl/⌘+K` | todas as telas logadas | paleta de comandos |
| `Ctrl/⌘+F` | editor (foco dentro) | busca no documento |
| `?` (sem seleção) / `Ctrl+/` | editor | lista de atalhos |
| `Enter` / `Shift+Enter` | barra de busca | próximo / anterior |

## 6. Segurança

- **Autorização:** nenhuma rota nova e nenhuma checagem movida para o cliente.
  - O Desfazer chama rotas existentes, com `assertDocumentAccess` e as checagens de pasta como hoje. Se o papel mudou nesse meio-tempo, a rota recusa e o aviso mostra o erro.
  - A paleta e os menus **escondem** o que o papel não permite, mas quem decide continua sendo o servidor.
  - Recolher/expandir pelo selo usa o mesmo `updateNode` de hoje: o leitor que forçar a escrita é descartado no servidor (`onConnect` readOnly, teste existente).
- **Vazamento entre usuários:**
  - a revelação da busca é local e não chega ao Y.Doc;
  - a busca de documentos da paleta usa o endpoint filtrado por acesso;
  - nenhum dado novo vai para o awareness.
- **XSS:**
  - avisos, paleta, diálogo de confirmação e barra de busca renderizam títulos e textos como **texto** React;
  - nenhum `dangerouslySetInnerHTML`;
  - o destaque da busca é por `className` no nó, não por HTML injetado no texto.
- **CSS:** as variáveis novas são constantes do `index.css`. O único valor dinâmico em `style` é `--i`, um índice numérico da lista, e `--origin`, de uma lista fechada. A CSP não muda: `style-src 'unsafe-inline'` já existe por causa do React Flow; View Transitions e WAAPI não usam `eval`.
- **DoS no navegador:**
  - teto de 300 nós animados (o resto vai direto);
  - teto de 500 destaques na busca;
  - debounce na busca e na paleta;
  - fila de avisos limitada a 3;
  - o "renderizar tudo" da exportação já é limitado pelos tetos de raster do ADR-004.
- **Ações destrutivas:**
  - o `ConfirmDialog` foca **Cancelar** por padrão;
  - o Desfazer roda uma vez só;
  - o "Desfazer" da exclusão no mapa nunca desfaz uma ação diferente (§5.6.5).
- **Regressão de política:** a regra `no-alert` do ESLint impede `window.confirm`/`alert` de voltarem.

## 7. Plano de testes

**Unidade (Vitest)**
- `planTransition`:
  - nó movido;
  - nó novo nascendo do pai, ou do avô quando o pai também é novo;
  - recolher gerando fantasmas em direção ao ancestral visível;
  - sem ancestral, sem fantasma;
  - limite de 300 → `animate: false`;
  - `minDistance`;
  - interrupção (`from` = posição mostrada no meio da animação);
  - nada mudou → vazio.
- `easeOutCubic` (extremos e monotonicidade) e o interpolador de frame (só os objetos de `tracks` mudam de referência).
- `panToReveal`: dentro da margem (null), fora por cada lado, bloco maior que a tela, **zoom nunca muda**.
- `searchNodes`:
  - acento e caixa;
  - ordem de leitura com ramos dos dois lados;
  - ramo recolhido incluído;
  - nota incluída;
  - consulta vazia.
- `withLocalExpand`: não muta a entrada e copia só os ancestrais.
- `rankCommands`: as três faixas de prioridade, acento e estabilidade.
- Comandos do editor por papel: **leitor não recebe nenhum comando de edição**, nem no mapa nem no fluxograma (estende `menuGroups.test.ts`).
- `canUndoFromToast`: topo igual → sim; outra ação depois → não; pilha esvaziada → não.
- Store de avisos (timers falsos): duração de 6 s, pausa e retomada, teto de 3, ação roda uma vez.
- `useDelayedFlag`: carregamento < 200 ms nunca mostra o esqueleto; mostrado, fica ≥ 400 ms.
- `tokens.test.ts`:
  - os tokens novos existem;
  - `--nav` separado de `--canvas` no escuro;
  - o CSS contém a regra global de `prefers-reduced-motion`;
  - nenhum `text-[10px]`/`text-[11px]` em `src/**/*.tsx` (varredura de arquivo, como o teste do âmbar).
- Desempenho (`perf.test.ts`):
  - `planTransition` com 1.000 nós e 300 mudando, mediana < 4 ms;
  - um frame de interpolação com 1.000 nós, mediana < 2 ms;
  - o orçamento atual de layout continua.

**Integração (API)**
- Sem rota nova. Os testes de autorização de `restore`, `members` e `*-folder` já existentes cobrem o Desfazer.
- **Teste novo:** devolver o acesso de um membro removido exige OWNER — um EDITOR tentando o mesmo `POST` recebe 403. Já é a regra; o teste fixa a regra de que o Desfazer depende.

**E2E (Playwright)**

A configuração passa a rodar com **`reducedMotion: 'reduce'` por padrão**, para os 14 testes atuais continuarem determinísticos. O arquivo novo `sp009-movimento.spec.ts` liga o movimento só onde testa animação.

1. **Irmão no meio:**
   - com movimento ligado, o `Enter` no 3º de 5 filhos faz o 4º e o 5º deslizarem;
   - amostrar a 100 ms: a posição está entre o início e o fim, e a ponta da ligação coincide com a borda do bloco (±2 px);
   - no fim, a posição é exata.
2. **Reduzir movimento:** a mesma ação deixa a posição final já no frame seguinte, com `data-animating` sempre `false`.
3. **Câmera:** com um bloco no canto direito, `Tab` faz o filho novo terminar dentro da área visível, com o zoom igual.
4. **Selo:** num ramo com 7 escondidos, aparece "7"; clicar expande, e a contagem de blocos não muda.
5. **Desfazer da lixeira:** num documento dentro de uma pasta, lixeira → "Desfazer" → o documento volta à mesma pasta.
6. **Desfazer do mover:** pessoal A → compartilhada B → Desfazer → volta para A e sai de B.
7. **Sem caixa do navegador:** `page.on('dialog')` faz o teste falhar em todo o arquivo; apagar de vez, apagar pasta e restaurar versão passam pelo `ConfirmDialog`.
8. **Paleta:** `Ctrl+K` no painel, digitar parte do título e `Enter` abrem o documento. A leitora abre a paleta no editor e não vê "Novo tópico", "Apagar", "Cores".
9. **Busca local:**
   - duas abas (dono e colega) no mesmo mapa;
   - o dono faz `Ctrl+F` e vê "1 de 3";
   - o 3º resultado está num ramo recolhido e aparece para o dono;
   - **na aba do colega, o ramo continua recolhido**.
10. **Versão antes de apagar:** apagar um ramo de 25 tópicos deixa uma versão "Antes de apagar…" no histórico; o aviso mostra "25 tópicos apagados".
11. **Celular (390×844):** o ponto de status está visível no editor; o "⋯" da pasta abre o menu ao toque; a gaveta fecha com `Esc`.
12. **Foco:** abrir o menu do cartão pelo teclado e apertar `Esc` devolve o foco ao botão "⋯".
13. **Regressão do Espaço no fluxograma:** com uma forma selecionada, segurar Espaço e arrastar não muda o texto.
14. **Exportação completa:**
    - fluxograma com uma forma distante, zoom de 250% sobre outra;
    - exportar PNG, abrir a imagem num `<canvas>` da página e conferir que o pixel no centro esperado da forma distante **não** é a cor do fundo;
    - o mesmo no mapa mental.

**Manual:** Chrome, Edge, Firefox e Safari (se houver Mac) com e sem "reduzir movimento"; mapa de 1.000 blocos, abrindo e recolhendo um ramo de 200 sem travar.

## 8. Tarefas (em ordem)

Cada bloco termina com `typecheck`, `lint`, `test` e `build` verdes **e um commit próprio**, para dar para parar no meio sem deixar nada quebrado.

1. [ ] **Base:**
   - tokens e escalas no `index.css`;
   - regra global de reduzir movimento;
   - `lib/motion.ts`;
   - durações JS por `motionMs`;
   - testes de token.
2. [ ] **Entrada e saída:** `usePresence`; `Modal` com entrada e saída; `Field` acessível; `ConfirmDialog` + `useConfirm`; trocar os 5 `window.confirm` e o `alert`; regra `no-alert`.
3. [ ] **Menus:** `Menu` único no lugar de `CardMenu`, `NewMenu`, `UserMenu` e `FolderMenuDialog`; animação e devolução de foco no `ActionMenu` e nos popovers da `NodeActionBar`.
4. [ ] **Avisos:**
   - store de avisos e `<Toaster>`;
   - avisos nas mutações;
   - Desfazer de lixeira, mover e remover membro;
   - `onError` padrão.
5. [ ] **Esqueletos:** `Skeleton` + `useDelayedFlag` nas 5 telas.
6. [ ] **Acabamento:**
   - `Button` com `size` e pressionar;
   - foco nos campos;
   - lateral (expandir, girar, "⋯" no toque, pulso ao soltar);
   - gaveta como `<dialog>`;
   - padding do celular;
   - status no celular;
   - histórico deslizando;
   - tokenizar as cores soltas;
   - fim dos `text-[10px]`/`[11px]`.
7. [ ] **Transições:** View Transitions no painel; `Link viewTransition`; entrada escalonada dos cartões.
8. [ ] **Presença e exportação:** store de presença nos dois editores; `onlyRenderVisibleElements` no mapa; `renderAll` na exportação (confirmar e corrigir o branco no fluxograma).
9. [ ] **Animação do mapa:**
   - `planTransition` + testes;
   - `AnimatedFlow` / `useAnimatedPositions` no mapa;
   - `node-born`;
   - fantasmas do recolher;
   - `data-animating` / `whenSettled`;
   - `reducedMotion: 'reduce'` no Playwright.
10. [ ] **Câmera:** `panToReveal` + `useFollowCamera`.
11. [ ] **Ramo recolhido e apagar:** selo com contador, chip de recolher, `Tab` em bloco recolhido; versão antes de apagar ≥ 20 + aviso com `canUndoFromToast`.
12. [ ] **Fluxograma:** animação do "Organizar" e de colegas; `node-born`.
13. [ ] **Busca:** `searchNodes`, `withLocalExpand`, `MapSearch` nos dois editores.
14. [ ] **Paleta e atalhos:** `CommandPalette` com registro e `rankCommands`; comandos do painel e do editor; `?` / `Ctrl+/` com a lista em `Modal`.
15. [ ] **E2E:** `sp009-movimento.spec.ts` com os 14 cenários; rodar a suíte inteira.
16. [ ] **Fechamento:** revisão de segurança (CLAUDE.md §9), `pnpm audit --prod`, STORY.md, PRD/SPEC como `Implementado`, commit e push.

## 9. Variáveis de ambiente novas

Nenhuma.

## 10. Riscos e decisões pendentes

- **[Pede aprovação] Tecla `?`** (§5.11): com bloco selecionado, ela continua editando o bloco; a ajuda abre com `?` sem seleção ou com `Ctrl+/`. A alternativa (a tecla `?` sempre abre a ajuda) quebra a regra "digitar edita" para quem começa o texto com "?".
- **[Pede aprovação] Leitor e o selo:** o leitor vê o contador, mas não expande pelo selo, porque recolher é compartilhado (PRD-009 §9.1). Ele ainda consegue ver o conteúdo escondido pela busca.
- **Custo por frame:** cada frame cria objetos novos só para os nós que se movem, mas o React Flow ainda percorre a lista inteira. Medido no `perf.test.ts`; se um mapa de 1.000 nós com 300 animando passar de 8 ms por frame no Chrome do CI, o teto cai de 300 para 150 antes de ir para produção.
- **Barra do bloco durante a animação:** a `NodeActionBar` acompanha a posição interpolada, porque lê o nó do React Flow. Se tremer, ela fica escondida enquanto `data-animating` for `true`.
- **Testes E2E antigos:** com `reducedMotion: 'reduce'` por padrão, eles não precisam mudar. Se algum depender de `transitionend`, a regra de 1 ms garante que o evento ainda dispara.
- **Navegadores sem View Transitions ou `@starting-style`:** a função fica igual, só sem o efeito. Não há polyfill.
- **Sombra-fantasma de encaixe no arrasto** (estilo MindNode) e **recolher por pessoa** ficaram fora (PRD-009 §8).
