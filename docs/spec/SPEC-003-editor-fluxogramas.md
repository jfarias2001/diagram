# SPEC-003 — Editor de diagramas: fluxogramas

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| PRD | [PRD-003](../prd/PRD-003-editor-fluxogramas.md) |
| ADRs | [ADR-001](../adr/ADR-001-stack.md) (React Flow + `elkjs`), [ADR-002](../adr/ADR-002-colaboracao-tempo-real.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

O fluxograma é um `Document` com `type = DIAGRAM`, que já existe no enum do banco. Ele usa a mesma sessão, os mesmos papéis, o mesmo `assertDocumentAccess`, o mesmo Hocuspocus e a mesma persistência dos mapas.

- **Conteúdo:** fica no Y.Doc em dois mapas **planos**, `shapes` (formas) e `edges` (conectores). Cada elemento é indexado pelo id, como os nós do mapa (ADR-002), o que deixa edições simultâneas seguras.
- **Pacote `shared`:** ganha `diagram.ts`, com os schemas, a leitura defensiva e as operações: criar, mover, apagar em cascata, conectar, colar e reparar.
- **Web:** ganha a feature `features/diagram/`, com um editor React Flow de posição livre, a paleta de formas, os conectores com rótulo, a seleção múltipla, copiar/colar, as guias de alinhamento e o botão **Organizar**. O Organizar usa `elkjs`, previsto no ADR-001, carregado sob demanda.
- **API:** muda pouco. O `POST /documents` aceita `DIAGRAM`, a listagem ganha filtro por tipo e o `searchText` passa a incluir o texto das formas e dos conectores.
- **Painel:** passa a se chamar "Documentos", com o botão "Novo" para escolher o tipo.

## 2. Modelo de dados

### 2.1 Prisma
Sem mudança e sem migration: `DocumentType.DIAGRAM` já existe (SPEC-001 §2.1).

### 2.2 Y.Doc do fluxograma

```
meta:   Y.Map  { version: 1, kind: 'DIAGRAM' }
shapes: Y.Map<shapeId, Y.Map>
  ├─ kind: 'process' | 'terminator' | 'decision' | 'io' | 'document'
  │        | 'database' | 'subprocess' | 'text' | 'note'
  ├─ x, y: number          // canto superior esquerdo, em px do quadro; finito, |v| ≤ 1.000.000
  ├─ w, h: number          // 24..2.000
  ├─ text: string          // até 2.000 chars
  ├─ fill?: '#rrggbb'      // cor de fundo
  ├─ stroke?: '#rrggbb'    // cor da borda (e do texto no "texto livre")
  ├─ bold?: true
  └─ z: number             // ordem de empilhamento (maior = na frente)
edges:  Y.Map<edgeId, Y.Map>
  ├─ source, target: shapeId       // sempre diferentes
  ├─ sourceHandle, targetHandle: 'top' | 'right' | 'bottom' | 'left'
  ├─ label?: string                // até 200 chars
  ├─ line: 'straight' | 'orthogonal' | 'curved'   // padrão 'orthogonal'
  ├─ dashed?: true
  ├─ arrow: 'end' | 'none' | 'both'               // padrão 'end'
  └─ color?: '#rrggbb'
```

Tamanhos padrão de cada forma nova (w × h): processo 160×72, início/fim 160×56, decisão 150×100, entrada/saída 170×72, documento 160×84, banco de dados 120×96, sub-processo 170×72, texto livre 160×40 e nota 180×130.

- **Leitura defensiva** (`readDiagram(doc)`, sem gravar nada):
  - uma forma com `kind` desconhecido, coordenada não finita ou tamanho fora do limite é descartada;
  - uma cor que não seja hex é ignorada;
  - o texto é cortado no limite;
  - um conector cuja origem ou destino não existe (**conector solto**) não é devolvido, então nunca é desenhado.
- **Integridade** (CLAUDE.md §7, diagramas):
  - `deleteElements` apaga as formas **e todos os conectores ligados a elas** na mesma transação;
  - `addEdge` recusa origem ou destino inexistente e recusa origem igual ao destino.
- **Reparo concorrente:** se alguém apaga uma forma enquanto outra pessoa liga um conector a ela, sobra um conector solto no Y.Doc. O editor (só quem pode editar) roda `repairDiagram`, que apaga os conectores soltos. O reparo é determinístico e idempotente, igual ao reparo de árvore da SPEC-001 §2.2, e usa uma origem própria, fora do desfazer.
- `z`: uma forma nova recebe o maior `z` + 1. Os comandos "trazer para frente/enviar para trás" ficam fora de escopo; o `z` já deixa o terreno pronto.

### 2.3 `packages/shared`

| Arquivo | Conteúdo |
|---|---|
| `diagram.ts` (novo) | `SHAPE_KINDS`, `SHAPE_DEFAULT_SIZE`, os limites, os schemas Zod de forma, conector e **área de transferência**, e as funções `createDiagramDoc(title)`, `readDiagram`, `addShape`, `updateShape`, `moveShapes(positions)`, `resizeShape`, `deleteElements(shapeIds, edgeIds)`, `addEdge`, `updateEdge`, `reconnectEdge`, `pasteClip(clip, offset)` (gera ids novos e remapeia os conectores), `repairDiagram` e `extractDiagramSearchText` |
| `schemas.ts` | `createDocumentBodySchema.type` passa a ser `z.enum(['MINDMAP','DIAGRAM'])`; `listDocumentsQuerySchema` ganha `type?` |
| `index.ts` | exporta `diagram.ts` |
| `ydoc.ts` / `tree.ts` | nova `extractDocSearchText(doc)`, que junta `extractSearchText(readNodes(doc))` e `extractDiagramSearchText(readDiagram(doc))`. Um documento só tem um dos dois conteúdos, então o servidor não precisa saber o tipo |

## 3. API

| Método | Rota | Papel mínimo | Mudança |
|---|---|---|---|
| POST | `/documents` | logado | aceita `type: 'DIAGRAM'`: grava o `yState` de `createDiagramDoc(title)`, um quadro **vazio** |
| GET | `/documents` | logado | novo `type=MINDMAP\|DIAGRAM` opcional (filtro); sem ele, lista os dois |
| demais | — | — | sem mudança: renomear, duplicar (mantém o `type`), lixeira, membros e busca já tratam o documento sem olhar o tipo |

- Todas as rotas continuam passando por `assertDocumentAccess`. O tipo do documento não muda nenhuma regra de acesso.
- **Hocuspocus, no `store`:** passa a usar `extractDocSearchText(document)` (§2.3). O resto (somente leitura, limites, revogação, presença) fica igual.

## 4. Tempo real
- **Mesma conexão e mesmas regras** do mapa: `readOnly` para `VIEWER`/`COMMENTER` imposto no servidor; derrubada ao remover ou rebaixar; limite de 5 MB e 2 MB por mensagem.
- **Mover:** durante o arrasto, a posição fica **local**; o Y.Doc só é gravado **ao soltar**, numa transação única para todas as formas selecionadas. Isso evita dezenas de atualizações por segundo e faz um arrasto virar um único passo de desfazer. Os colegas veem a forma "pular" para a nova posição ao soltar.
- **Presença:** o awareness publica `selected` = id da primeira forma selecionada, e o colega vê um contorno com a cor e o nome, como no mapa. O servidor já valida esse campo (SPEC-001 §11).
- **Desfazer:** `Y.UndoManager` sobre `[shapes, edges]` com `trackedOrigins = {LOCAL_ORIGIN}`. Cada ação discreta chama `stopCapturing()` antes (a mesma lição da SPEC-002 §11). O "Organizar" é uma transação só, então um Ctrl+Z desfaz tudo.

## 5. Frontend

### 5.1 Painel (`features/dashboard`)
- **Nomes:** o título passa a ser **Documentos** e as abas **Meus documentos**, **Compartilhados comigo** e **Lixeira**. A busca fica "Buscar documentos".
- **Botão "+ Novo":** abre um menu com **Mapa mental** e **Fluxograma**. O modal de título continua igual, com o tipo escolhido.
- **Cartões:** cada um ganha um ícone do tipo (árvore ou fluxo) com `aria-label` ("Mapa mental" / "Fluxograma").
- **Filtro por tipo:** chips **Todos · Mapas mentais · Fluxogramas**, guardados na URL (`?tipo=`).
- O menu "Mapas" do topo vira **Documentos**.
- **Rota do editor:** continua `/m/:id` para os dois tipos, para os links já enviados não quebrarem. O `EditorPage` escolhe o editor pelo `meta.type`. A barra superior (título, status, presença, compartilhar e exportar) é reaproveitada: sai do `EditorPage` para um componente `EditorHeader`.

### 5.2 Editor de fluxograma (`features/diagram/`)

| Arquivo | Papel |
|---|---|
| `useDiagram.ts` | snapshot imutável de `readDiagram` via `useSyncExternalStore` (`observeDeep` nos dois mapas), `useDiagramUndo`, e o reparo de conectores soltos |
| `DiagramCanvas.tsx` | o `ReactFlow` em modo controlado, com seleção, arrasto, conexão, atalhos, colar e guias |
| `ShapeNode.tsx` | nó customizado (`React.memo`): desenha a forma em SVG conforme o `kind`, o texto por cima (sempre como texto), 4 alças de conexão e `NodeResizer` quando selecionado |
| `shapes.tsx` | o caminho SVG de cada forma, usado pelo nó e pela paleta |
| `FlowEdge.tsx` | conector customizado: `getStraightPath`, `getSmoothStepPath` ou `getBezierPath` conforme `line`; marcadores de seta; rótulo editável com `EdgeLabelRenderer` |
| `ShapePalette.tsx` | paleta à esquerda com as 9 formas (desenho + nome) |
| `SelectionBar.tsx` | barra flutuante (`NodeToolbar` com os ids selecionados): fundo, borda, negrito, apagar. Para um conector selecionado, um `Panel` no topo com linha (reta, ângulo reto, curva), tracejado, ponta, cor e apagar |
| `QuickShapeMenu.tsx` | mini menu que aparece ao soltar uma seta no vazio |
| `DiagramControls.tsx` | desfazer, refazer, zoom, ajustar, **Organizar** e encaixe na grade ligado/desligado |
| `alignment.ts` | cálculo puro das guias de alinhamento (§5.6) |
| `autoLayout.ts` | `import('elkjs/lib/elk.bundled.js')` sob demanda → posições |
| `clipboard.ts` | serialização e validação da área de transferência (§5.7) |

**Interação:**
- **Adicionar forma:**
  - **arrastar** da paleta: HTML5 drag com `dataTransfer` do tipo `application/x-paglamp-shape`, e no `onDrop` usa `screenToFlowPosition`, já encaixado na grade;
  - **clicar** na paleta: sem forma selecionada, a nova entra no centro da tela; com uma forma selecionada, entra 64 px abaixo dela, já ligada por um conector `bottom → top`.
  - Nos dois casos, a forma nova fica selecionada e entra em edição de texto.
- **Mover:** arrastar com encaixe numa grade de 16 px (`snapToGrid`). Segurar **Alt** desliga o encaixe durante o arrasto, e o botão de grade o desliga de vez.
- **Redimensionar:** `NodeResizer`, com o mínimo do §2.2. Grava ao soltar.
- **Conectar:** cada forma tem alças nos 4 lados (`ConnectionMode.Loose`, qualquer alça liga em qualquer uma).
  - Puxar até outra forma chama `onConnect` → `addEdge`.
  - Soltar no vazio chama `onConnectEnd` com `isValid = false` → abre o `QuickShapeMenu` na posição do mouse. Escolher uma forma cria a forma ali e o conector até ela.
  - Arrastar a ponta de um conector existente reconecta (`onReconnect` → `reconnectEdge`).
- **Texto:** duplo clique, `F2`, `Enter` ou digitar com uma forma selecionada edita o texto; digitar substitui o texto, como no mapa. Duplo clique num conector edita o rótulo. O duplo clique é detectado como na SPEC-002 §11 e `zoomOnDoubleClick` fica desligado.
- **Seleção:**
  - arrastar no fundo desenha a caixa de seleção (`selectionOnDrag`);
  - **Shift+clique** soma à seleção;
  - **Ctrl+A** seleciona tudo;
  - **Esc** limpa a seleção.
- **Navegar no quadro:** a **roda** do mouse dá zoom, como no mapa. **Espaço+arrastar** ou o botão do meio movem o quadro (`panOnDrag = [1]`, `panActivationKeyCode = 'Space'`). A lista de atalhos explica isso.
- **Atalhos** (não disparam com o foco num campo):

| Atalho | Ação |
|---|---|
| `Delete` / `Backspace` | apaga a seleção (e os conectores das formas apagadas) |
| Setas | movem a seleção 8 px |
| Shift + setas | movem a seleção 32 px |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | desfazer / refazer |
| `Ctrl+C`, `Ctrl+X`, `Ctrl+V` | copiar, recortar, colar |
| `Ctrl+D` | duplicar |
| `Ctrl+A` | selecionar tudo |
| `Ctrl+B` | negrito |
| `F2` / `Enter` | editar o texto |
| `Esc` | sair da edição / limpar a seleção |

  O movimento pelas setas é gravado com debounce de 300 ms, em um passo de desfazer.
- **Modo leitura:**
  - `nodesDraggable`, `nodesConnectable` e `edgesReconnectable` desligados;
  - sem paleta, sem barra de estilo e sem "Organizar";
  - seleção e zoom continuam funcionando;
  - aviso "Somente leitura" na barra.

### 5.3 Desenho das formas
- Cada forma é um `<svg>` que ocupa o nó, com `preserveAspectRatio="none"` e `vector-effect: non-scaling-stroke`, para a borda não engrossar ao redimensionar. O texto fica num `div` centralizado por cima, com quebra de linha.
- **Cores:** paleta de fundo com 8 tons claros + branco, e paleta de borda com as 8 cores do mapa + grafite. O padrão é fundo branco com borda grafite; a **Nota** usa fundo amarelo claro, e o **Texto livre** não tem borda nem fundo.
- **Modo escuro:** as cores do documento são fixas (claras), e o texto dentro das formas usa uma cor escura fixa, para manter o contraste em qualquer tema.

### 5.4 Organizar (auto layout)
- O botão chama `autoLayout(shapes, edges)`, que importa o `elkjs` **só nesse momento**, num chunk separado, fora do bundle do editor.
- Opções do elk: `algorithm: 'layered'`, `elk.direction: 'DOWN'`, espaçamento de 48 px entre formas e de 64 px entre camadas, e os tamanhos reais de cada forma.
- Formas sem conector também são posicionadas pelo elk.
- O resultado é encaixado na grade e gravado com `moveShapes` numa transação só (um passo de desfazer).
- Os conectores que estavam em alças laterais são mantidos; o elk só move as formas.
- Enquanto calcula, o botão mostra um spinner. Se der erro, aparece a mensagem "Não foi possível organizar agora." e nada muda.

### 5.5 Desempenho (500+ formas e conectores)
- Os mesmos cuidados do mapa:
  - `data` estável por forma (`stableData`);
  - `measured` guardado (SPEC-002 §11);
  - `ShapeNode` e `FlowEdge` memoizados;
  - posições locais só durante o arrasto.
- `onlyRenderVisibleElements` ligado: com 500 formas, só as visíveis entram no DOM.
- Teste de desempenho: `readDiagram` mais a montagem dos nós e conectores do React Flow, com 500 formas e 600 conectores, em menos de 50 ms (mediana).

### 5.6 Guias de alinhamento
- Durante o arrasto, `alignment.ts` compara a borda esquerda, o centro e a borda direita (e o topo, o meio e a base) da forma arrastada com as formas **visíveis**.
- Quando a diferença fica abaixo de 6 px (em px da tela, ajustado ao zoom), a posição encaixa na outra forma, e uma linha guia (cor de filamento) é desenhada com `ViewportPortal`.
- Com várias formas selecionadas, a referência é a caixa que envolve a seleção. Alt desliga as guias, junto com a grade.

### 5.7 Copiar, colar, duplicar
- **Copiar:** usa os eventos nativos `copy`, `cut` e `paste` no contêiner do quadro, e não `navigator.clipboard.readText`, que pediria permissão ao usuário.
  - No `copy`, grava em `text/plain` um JSON `{ "paglamp": "diagram-clip", "v": 1, "shapes": [...], "edges": [...] }`;
  - só entram as formas selecionadas e os conectores cujas **duas pontas** estão na seleção.
- **Colar:** o JSON é **entrada externa** e passa pelo schema Zod `diagramClipSchema`:
  - no máximo 500 formas e 1.000 conectores;
  - os mesmos limites de campo do §2.2.

  Se algo for inválido, a colagem é ignorada sem erro. Se for texto comum, cria uma forma "Processo" com esse texto (até 2.000 caracteres).
- **Onde cola:** com ids novos, deslocado 24 px da origem (e mais 24 a cada colagem repetida), ou na posição do mouse se ele estiver no quadro. Funciona entre fluxogramas diferentes, em abas diferentes.
- **Duplicar (`Ctrl+D`):** o mesmo que copiar e colar, sem passar pela área de transferência.

### 5.8 Exportar PNG
- O `exportMindMapPng` vira `exportCanvasPng`, igual para os dois editores, e continua ignorando `.export-hidden`: alças, `NodeResizer`, barras e guias.
- As setas (marcadores SVG) saem na imagem.

## 6. Segurança

| Risco | Mitigação |
|---|---|
| IDOR / acesso sem vínculo | nada muda: `assertDocumentAccess` em toda rota e no `/collab`; a matriz de permissões passa a rodar também com um documento `DIAGRAM` |
| Leitor editando forjando WebSocket | `readOnly` do Hocuspocus; teste novo com um leitor tentando criar forma e conector |
| XSS pelo texto das formas/rótulos | renderizado como texto (sem `dangerouslySetInnerHTML`, bloqueado pelo ESLint) |
| Injeção de CSS pelas cores | só hex `#rrggbb`, validado em `readDiagram`; outras cores são ignoradas |
| Colar JSON malicioso ou gigante | `diagramClipSchema` (Zod), limites de quantidade e tamanho, ids sempre gerados de novo (o id colado nunca é reaproveitado) |
| Documento inflado / coordenadas absurdas | limites do §2.2 na leitura e na escrita; o limite de 5 MB por documento continua valendo |
| Conector apontando para forma inexistente | não é desenhado; `repairDiagram` apaga; `deleteElements` apaga em cascata |
| `type` do documento forjado na criação | `z.enum(['MINDMAP','DIAGRAM'])`; qualquer outro valor → 400 |
| Dependência nova (`elkjs`, EPL-2.0) | prevista no ADR-001; só no front, carregada sob demanda; `pnpm audit --prod` na revisão |

## 7. Plano de testes

- **Unidade (`packages/shared/diagram.test.ts`):**
  - `readDiagram`:
    - descarta `kind` inválido, NaN, `Infinity` e tamanho fora do limite;
    - ignora cor não hex;
    - corta o texto;
    - não devolve conector solto.
  - `deleteElements` apaga os conectores em cascata, e o desfazer traz tudo de volta.
  - `addEdge` recusa ponta inexistente e origem igual ao destino.
  - `repairDiagram` é idempotente e converge em dois clientes (reusa o `sync` de `ydoc.test.ts`).
  - `pasteClip`:
    - gera ids novos e remapeia os conectores;
    - recusa um clip com 501 formas e um clip com campo inválido.
  - `extractDocSearchText` funciona para mapa e para fluxograma.
  - `createDocumentBodySchema` aceita `DIAGRAM` e recusa `FOO`.
- **Unidade (web):**
  - `alignment.ts`: encaixa a menos de 6 px e não encaixa acima; a referência pela caixa da seleção;
  - `autoLayout.ts` com um fluxo pequeno: sem sobreposição, de cima para baixo;
  - desempenho com 500 formas e 600 conectores.
- **Integração (API + WebSocket):**
  - `POST /documents` com `type: 'DIAGRAM'` → documento com `meta.kind = 'DIAGRAM'` e sem formas;
  - `GET /documents?type=DIAGRAM` filtra;
  - duplicar mantém o tipo;
  - um editor cria uma forma com uma palavra única → depois do `store`, a busca encontra;
  - um leitor tentando criar forma e conector pelo WebSocket → descartado;
  - a matriz de permissões do PRD §7 com um documento `DIAGRAM`.
- **E2E (Playwright):**
  1. cria um "Novo fluxograma";
  2. arrasta Início/Fim, Processo e Decisão da paleta;
  3. liga-os e cria "Sim" e "Não" soltando a seta no vazio (`QuickShapeMenu`);
  4. dá os rótulos;
  5. um segundo usuário (Editor) vê ao vivo;
  6. apaga a Decisão → as setas somem → Ctrl+Z traz tudo de volta;
  7. "Organizar" → Ctrl+Z volta ao que era;
  8. Ctrl+C / Ctrl+V duplica;
  9. recarrega e confere tudo;
  10. o Leitor não tem paleta e não consegue mover;
  11. exportar PNG baixa o arquivo;
  12. o painel filtra por Fluxogramas e busca pelo texto de uma forma.

  Os E2E existentes são ajustados para os nomes novos do painel ("Documentos", "+ Novo" → "Mapa mental").

## 8. Tarefas (em ordem)

1. [x] `shared`: `diagram.ts` (modelo, leitura, operações, reparo, clip, busca) + `extractDocSearchText` + schemas + testes de unidade.
2. [x] API: `POST /documents` com `DIAGRAM`, filtro `type`, `store` com `extractDocSearchText` + testes de integração (inclui a matriz com `DIAGRAM` e o leitor pelo WebSocket).
3. [x] Web: extrair `EditorHeader` e `exportCanvasPng`; o `EditorPage` escolhe o editor pelo tipo (o mapa continua igual; os E2E atuais continuam verdes).
4. [x] Painel: nomes novos, "+ Novo" com o tipo, ícone do tipo, filtro; ajustar os E2E.
5. [x] Web: `useDiagram`, `ShapeNode` + `shapes.tsx`, `DiagramCanvas` básico (mostrar, selecionar, mover, redimensionar, apagar, desfazer).
6. [x] Web: `ShapePalette` (arrastar e clicar) e edição de texto.
7. [x] Web: conectores: `FlowEdge`, conectar, reconectar, rótulo e `QuickShapeMenu`.
8. [x] Web: `SelectionBar` (estilos de forma e de conector) e `DiagramControls`.
9. [x] Web: seleção múltipla, setas, copiar/recortar/colar/duplicar.
10. [x] Web: guias de alinhamento + Alt/grade.
11. [x] Web: `elkjs` + `autoLayout` + botão Organizar.
12. [x] Presença e modo leitura; teste de desempenho com 500 formas.
13. [x] E2E do fluxograma.
14. [x] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + STORY.md + PRD/SPEC `Implementado` + commit/push.

## 9. Variáveis de ambiente novas
Nenhuma.

## 10. Riscos e decisões pendentes
- **Duas pessoas movendo a mesma forma ao mesmo tempo:** vale a posição de quem soltou por último. É aceitável: é raro e fica visível.
- **Mover só aparece para o colega ao soltar** (§4). Se a equipe quiser ver o arrasto ao vivo, dá para publicar a posição provisória pelo awareness, sem gravar no documento. Fica como melhoria futura.
- **Setas em ângulo reto não desviam de outras formas:** o `smoothstep` do React Flow não faz roteamento com obstáculos. Em fluxos muito densos, uma seta pode passar por trás de uma forma. O "Organizar" reduz o problema; roteamento de verdade fica como melhoria futura, se incomodar.
- **`elkjs` pesa ~1,4 MB:** só é baixado na primeira vez que alguém clica em "Organizar".
- **Roda do mouse = zoom** (igual ao mapa) e **arrastar no fundo = caixa de seleção** (§5.2): quem vem do draw.io pode estranhar mover o quadro com Espaço+arrastar. A dica fica na lista de atalhos, e dá para mudar se a equipe preferir.
- **Nomes do painel:** as abas mudam de nome ("Meus mapas" → "Meus documentos"), aprovado no PRD-003 §9. A URL `/m/:id` não muda.

## 11. Notas de implementação (desvios e decisões tomadas durante a implementação)

- **Arrastar da paleta:** o arrastar HTML5 (`draggable` + `dataTransfer`) foi trocado por **eventos de ponteiro**. Ele não funcionava no navegador controlado pelo Playwright e não serve para tela de toque. Agora a paleta acompanha o ponteiro, mostra uma prévia da forma e solta no quadro; um clique sem mover continua criando a forma no centro (ou ligada à selecionada).
- **Soltar a seta em cima da forma:** o React Flow só conecta perto de uma alça (`connectionRadius`), e o meio de uma forma grande fica longe demais. Enquanto uma seta está sendo puxada, a forma inteira vira alvo: um `Handle` do tamanho da forma é montado só nesse momento (`useConnection`), então ele não atrapalha arrastar nem selecionar.
- **Duplo clique (corrige também a SPEC-002 §11):** a detecção por tempo (dois cliques no mesmo nó em 450 ms) disparava a edição quando a pessoa clicava no mesmo bloco em dois momentos seguidos do trabalho normal. Agora vale o `detail >= 2` do próprio evento de clique, que é o critério do navegador e respeita a configuração do sistema. Os dois editores usam a mesma regra.
- **Cápsula (Início/Fim) desenhada em CSS:** esticar um SVG deformaria as pontas arredondadas. As outras formas continuam em SVG.
- **`createDiagramDoc()` não recebe título:** o quadro nasce vazio, então o título fica só no banco (`Document.title`).
- **Barra superior compartilhada:** o cabeçalho do editor virou `EditorHeader` (título, status, presença, exportar, compartilhar) e o export virou `exportCanvasPng`, usado pelos dois editores. A rota continua `/m/:id`; o `EditorPage` escolhe o editor pelo `meta.type`.
- **Busca:** o servidor usa `extractDocSearchText`, que cobre mapa e fluxograma sem precisar saber o tipo do documento.
- **E2E:** os testes antigos foram ajustados aos nomes novos do painel ("Documentos", menu "+ Novo"). No mini menu, "Processo" e "Sub-processo" exigem `exact: true` no seletor.
