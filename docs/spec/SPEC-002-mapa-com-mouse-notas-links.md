# SPEC-002 — Editar o mapa mental com o mouse, notas e links nos nós

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| PRD | [PRD-002](../prd/PRD-002-mapa-com-mouse-notas-links.md) |
| Data | 2026-09-22 |

## 1. Resumo técnico

Mudança quase toda no **frontend** e no pacote `shared`. Não há rota REST nova, migration nem mudança no servidor de tempo real.

- O nó do Y.Doc ganha dois campos opcionais: `note` e `link`.
- O editor ganha uma **barra flutuante** no nó selecionado (`NodeToolbar` do React Flow), um **"+"** que aparece ao passar o mouse, uma **barra de controles** (desfazer, refazer, zoom, ajustar) e um **painel lateral de nota**.
- Todas as ações do mouse chamam as **mesmas funções** do teclado (`addNode`, `updateNode`, `deleteBranch`), com `LOCAL_ORIGIN`. Assim o desfazer, o tempo real e o somente leitura continuam valendo sem código novo.
- A busca passa a incluir as notas porque o servidor já grava `searchText` com `extractSearchText(readNodes(doc))`: basta essa função incluir as notas.

## 2. Modelo de dados

### 2.1 Prisma
Sem mudança. Sem migration.

### 2.2 Y.Doc (nó do mapa mental)

```
nodes: Y.Map<nodeId, Y.Map>
  ├─ ... (campos da SPEC-001 §2.2)
  ├─ note?: string   // NOVO — texto simples, até 5.000 chars
  └─ link?: string   // NOVO — URL http/https/mailto, até 2.048 chars
```

- `meta.version` continua `1`: os campos são opcionais, e documentos antigos simplesmente não os têm.
- **Leitura defensiva** (`readNode`): `note` que não for string é ignorada e é cortada em 5.000. `link` só é aceito se passar em `isSafeLink` e no limite de tamanho. Senão é **descartado na leitura**. Isso protege mesmo que um editor mal-intencionado grave um `javascript:` direto no Y.Doc, sem passar pela interface.
- **Escrita** (`updateNode`): `note: ''` e `link: ''` apagam o campo. `link` inválido faz `updateNode` retornar `false` sem gravar nada.

### 2.3 `packages/shared`

| Arquivo | Mudança |
|---|---|
| `document.ts` | `NODE_NOTE_MAX = 5_000`, `NODE_LINK_MAX = 2_048`; `note` e `link` opcionais no `mindMapNodeSchema`; nova `normalizeLink(input): string \| null` |
| `ydoc.ts` | `readNode`, `writeNode` e `updateNode` tratam `note` e `link`; `NodePatch` inclui os dois |
| `tree.ts` | `extractSearchText` inclui as notas **depois** de todos os textos dos nós, para os títulos terem prioridade no limite de 10k |

`normalizeLink`:
1. aplica `trim()`; vazio → `null`;
2. espaço no meio → `null`;
3. se não tiver esquema (`/^[a-z][a-z0-9+.-]*:/i`), prefixa `https://`, de modo que `paglamp.com.br/x` vira `https://paglamp.com.br/x`;
4. retorna o resultado só se `isSafeLink` aprovar e couber em `NODE_LINK_MAX`; senão, `null`.

Portanto `javascript:`, `JaVaScRiPt:`, `data:` e `vbscript:` voltam `null`. `ftp:` também: a lista de protocolos é fechada.

## 3. API
Sem rotas novas. O `searchText`, gravado pelo Hocuspocus no `store` (SPEC-001 §4), passa a conter as notas automaticamente.

## 4. Tempo real
- Sem mudança no servidor. Notas e links são campos comuns do Y.Map do nó, então sincronizam e são persistidos como o resto.
- **Somente leitura:** continua imposto pelo Hocuspocus (`connectionConfig.readOnly`). No cliente, com `canEdit = false`, a barra flutuante só mostra ações de leitura (ver nota, abrir link) e o "+" não aparece.
- **Nota editada por duas pessoas ao mesmo tempo:** a nota é uma string (não `Y.Text`), então vale a última gravação. É um risco aceito (§10).

## 5. Frontend

Arquivos em `apps/web/src/features/editor/`.

### 5.1 Barra flutuante — `NodeActionBar.tsx` (novo)
- Um **único** componente, renderizado no `MindMapCanvas` para o nó selecionado, usando `<NodeToolbar nodeId={selectedId} isVisible position={Position.Top} offset={10}>` do `@xyflow/react`. Ele acompanha zoom e rolagem sem recalcular posição no React.
- Não aparece enquanto o nó está em edição de texto, nem durante um arrasto.
- Botões, na ordem, cada um com `title` e `aria-label` em português e o atalho entre parênteses:

| Botão | Ação | Aparece quando |
|---|---|---|
| `+ Filho` (Tab) | `createNode(id)` | canEdit |
| `+ Irmão` (Enter) | `createNode(parentId, id)` | canEdit e não é raiz |
| Cor | popover com as 8 cores + "Auto" (o mesmo conteúdo do `StylePanel` atual) | canEdit |
| **B** (Ctrl+B) | alterna negrito | canEdit |
| Nota | abre o `NotePanel` | sempre (leitor: só se houver nota) |
| Link | popover `LinkEditor` | canEdit, ou leitor quando há link (abre o link) |
| Recolher / Expandir (Espaço) | alterna `collapsed` | canEdit e o nó tem filhos (`collapsed` é compartilhado, então é edição) |
| Apagar (Delete) | `deleteBranch` + a mesma regra de nova seleção do teclado | canEdit e não é raiz |

- O `StylePanel` fixo no canto superior esquerdo **sai**; as cores passam para o popover da barra.
- A lógica de "criar, apagar e escolher a próxima seleção", que hoje fica dentro do `onKeyDown`, é extraída para funções do canvas (`createChild`, `createSibling`, `removeNode`, `toggleCollapse`, `toggleBold`). O teclado e a barra chamam as mesmas funções.
- Os cliques na barra não roubam o foco do canvas de forma que quebre os atalhos: depois da ação, `focusCanvas()`, exceto quando a ação abre um campo (nota, link ou texto do nó novo).

### 5.2 "+" ao passar o mouse — em `MindNode.tsx`
- Um botão redondo `+` absoluto, na borda de fora do nó: direita para `side = right`, esquerda para `left`. A raiz mostra os dois. Aparece com `group-hover` via CSS (sem estado React, então sem re-render ao mover o mouse) e também quando o nó está selecionado, para funcionar no toque.
- Tem as classes `nodrag nopan`, e o clique usa `stopPropagation` para não selecionar nem começar um arrasto.
- Clicar chama `data.onAddChild(id)`, que cria o filho no fim e já entra em edição.
- **Na raiz:** o layout (SPEC-001) já divide os ramos entre os dois lados, então anexar no fim mantém o equilíbrio. Os dois "+" da raiz fazem o mesmo, e o novo filho aparece no lado que tiver menos filhos.
- Não aparece quando `data.canEdit` é falso, nem com o nó em edição.

### 5.3 Indicadores no nó — em `MindNode.tsx`
- Nó com nota: ícone de nota à direita do texto (`button`, `aria-label="Ver nota"`), que chama `data.onOpenNote(id)`.
- Nó com link: ícone de link, um `<a href={link} target="_blank" rel="noopener noreferrer" title={link}>`. O `href` sempre vem de `readNode`, que já validou o link. Clicar abre o link sem selecionar o nó (`stopPropagation`).
- Os dois ícones têm `nodrag`. `estimateSize` do layout soma a largura dos ícones, para não sobrepor nós.

### 5.4 Dados do nó e desempenho
- `MindNodeData` ganha `canEdit`, `hasNote`, `link` (`string | null`), `onAddChild` e `onOpenNote`.
- Os callbacks precisam ser **estáveis**: são criados uma vez com `useCallback` e leem o estado atual por um `ref` (`actionsRef.current`). Assim mudar a seleção ou o texto de um nó não recria o `data` dos outros 999, e o `React.memo` do `MindNode` continua valendo.
- A barra flutuante é um componente só, e não uma por nó.

### 5.5 Painel de nota — `NotePanel.tsx` (novo)
- Gaveta à direita (largura 360 px; tela cheia abaixo de 640 px) com o texto do nó como título e um `textarea` com `maxLength={NODE_NOTE_MAX}` e contador "1.234 / 5.000".
- **Escrita:** estado local no `textarea` e gravação no Y.Doc com debounce de 500 ms, e também ao fechar e no `blur`. Enquanto o campo tem foco, alterações remotas na mesma nota não sobrescrevem o que o usuário está digitando; ao perder o foco, o painel volta a mostrar o valor do Y.Doc.
- Tem `onKeyDown` com `stopPropagation`, para os atalhos do mapa não dispararem, e Esc fecha o painel.
- **Leitor / Comentador:** mostra o texto como texto (`whitespace-pre-wrap`), sem `textarea`.
- Se o nó for apagado (por alguém) com o painel aberto, o painel fecha.
- Abre pela barra flutuante ou pelo ícone do nó. Fica aberto ao mudar a seleção e passa a mostrar a nota do novo nó selecionado.

### 5.6 Editor de link — `LinkEditor.tsx` (novo, popover da barra)
- Um campo com o link atual e os botões **Salvar**, **Remover** e **Abrir**.
- Ao salvar, aplica `normalizeLink`. Se voltar `null`, mostra o erro "Link inválido. Use um endereço da web (https://…) ou de e-mail (mailto:…)." e não grava nada.
- Enter salva e Esc fecha, com `stopPropagation`.

### 5.7 Barra de controles — `CanvasControls.tsx` (novo, substitui o `<Controls>`)
- Canto inferior esquerdo. Botões: **Desfazer (Ctrl+Z)**, **Refazer (Ctrl+Shift+Z)**, **Afastar**, **Aproximar**, **Ajustar à tela**.
- Zoom e ajuste usam `useReactFlow()` (`zoomIn`, `zoomOut`, `fitView` com o mesmo `padding` do `fitView` inicial).
- Desfazer e Refazer ficam desabilitados quando a pilha correspondente está vazia. O estado vem dos eventos `stack-item-added`, `stack-item-popped` e `stack-cleared` do `Y.UndoManager`. Os dois ficam ocultos para quem não pode editar.

### 5.8 Duplo clique e seleção
- O duplo clique já entra em edição, com o cursor no fim do texto (SPEC-001). Nada muda, só entra no E2E.
- Clique no fundo tira a seleção (já existe). O painel de nota continua aberto, mostrando "Selecione um tópico".

### 5.9 Atalhos
Sem mudança. A lista de atalhos (`ShortcutHint`) ganha a linha "Duplo clique → editar texto".

## 6. Segurança

| Risco | Mitigação |
|---|---|
| XSS por `javascript:`/`data:` no link | `normalizeLink` na interface **e** `isSafeLink` em `readNode`: um link inválido gravado direto no Y.Doc nunca chega a um `href` |
| Tabnabbing ao abrir link | `target="_blank"` sempre com `rel="noopener noreferrer"` |
| XSS pela nota | nota renderizada como texto (`{note}`), sem `dangerouslySetInnerHTML` (a regra do ESLint continua) |
| Leitor editando nota/link forjando WebSocket | `readOnly` do Hocuspocus, já testado; um teste novo cobre um update de `note` vindo de um leitor |
| Documento inflado por notas enormes | a interface limita a 5.000; `readNode` corta; o limite de 5 MB por documento e o `maxPayload` de 2 MB (SPEC-001) continuam valendo |
| `searchText` com o conteúdo das notas | já está no banco com o resto do documento; não aparece em log nem em `AuditEvent` |
| Autorização | nenhuma rota nova; `assertDocumentAccess` já protege o `/collab` |

## 7. Plano de testes

- **Unidade (`packages/shared`):**
  - `normalizeLink`:
    - aceita `https://x`, `http://x`, `mailto:a@b.c` e `paglamp.com.br` (vira `https://`);
    - recusa `javascript:alert(1)`, `JaVaScRiPt:...`, ` javascript:...` com espaço antes, `data:text/html,...`, `vbscript:`, `ftp://`, texto com espaço no meio, vazio e um link acima de 2.048 caracteres.
  - `readNode`:
    - descarta um link inseguro escrito direto no `Y.Map`;
    - corta uma nota acima de 5.000;
    - ignora uma `note` que não é string.
  - `updateNode`:
    - grava e apaga nota e link;
    - retorna `false` com link inválido e não grava.
  - `extractSearchText` inclui as notas, e os textos dos nós vêm antes.
  - Desfazer de uma alteração de nota.
- **Integração (API + WebSocket):**
  - um editor grava uma nota com uma palavra única → depois do `store`, `GET /documents?q=<palavra>` encontra o documento;
  - um leitor envia um update que define `note` → o documento persistido não muda.
- **Unidade (web):** o teste de 1.000 nós (`perf.test.ts`) continua passando. Um teste novo garante que o `data` dos nós não selecionados mantém a mesma referência quando a seleção muda.
- **E2E (Playwright), fluxo "só mouse":**
  1. cria um mapa, clica na raiz e em `+ Filho`, digita e confirma;
  2. passa o mouse no filho, clica no "+" e digita;
  3. dá duplo clique para editar e muda a cor pela barra;
  4. abre a nota e escreve;
  5. adiciona o link `paglamp.com.br`;
  6. tenta `javascript:alert(1)` e vê o erro;
  7. recolhe e expande, apaga um nó e desfaz pelo botão;
  8. recarrega a página e confere tudo;
  9. no painel, busca por uma palavra da nota.

  Um segundo contexto, como Leitor, vê o ícone da nota, lê a nota e não vê a barra de edição.

## 8. Tarefas (em ordem)

1. [x] `shared`: `NODE_NOTE_MAX`, `NODE_LINK_MAX`, `normalizeLink`, `note`/`link` em schema, `readNode`, `writeNode`, `updateNode`, `extractSearchText` + testes de unidade.
2. [x] Web: extrair as ações do `onKeyDown` para funções reutilizáveis do canvas, sem mudar o comportamento (os testes e o E2E atuais continuam verdes).
3. [x] Web: `MindNodeData` com callbacks estáveis (`actionsRef`), o "+" no hover e os ícones de nota e link; `estimateSize` considerando os ícones.
4. [x] Web: `NodeActionBar` (com o popover de cores e o `LinkEditor`); remover o `StylePanel`.
5. [x] Web: `NotePanel`.
6. [x] Web: `CanvasControls` substituindo o `<Controls>`.
7. [x] Integração: busca pela nota e leitor tentando gravar a nota.
8. [x] E2E do fluxo "só mouse" + leitor; o teste de 1.000 nós continua passando.
9. [x] Revisão de segurança (CLAUDE.md §9) + `pnpm audit --prod` + STORY.md + PRD/SPEC `Implementado` + commit/push.

## 9. Variáveis de ambiente novas
Nenhuma.

## 10. Riscos e decisões pendentes
- **Nota com a última gravação vencendo:** se duas pessoas editarem a **mesma** nota ao mesmo tempo, vale o texto de quem gravou por último, e o do outro se perde. Usar `Y.Text` resolveria, mas exige ligar o `textarea` ao CRDT (diferença a cada tecla). A situação é rara, então fica como melhoria futura, se incomodar.
- **Exportar PNG:** o export (SPEC-001) captura `.react-flow__viewport`. A `NodeToolbar` é renderizada fora dele, então não sai na imagem. Já o "+", que fica dentro do nó e aparece no nó selecionado, ganha a classe `export-hidden`, e o `toPng` passa a usar `filter` para ignorar esses elementos. Os ícones de nota e link **saem** no PNG, de propósito.

## 11. Notas de implementação (desvios e decisões tomadas durante a implementação)

- **Nós escondidos a cada mudança (defeito que já vinha do MVP):** o canvas entrega objetos de nó novos ao React Flow a cada mudança e, sem o campo `measured`, o React Flow trata cada nó como "não medido". Ele esconde o nó (`visibility: hidden`) e mede de novo **todos** os nós. Um clique que caísse nesse intervalo atravessava o nó e ia para o fundo. Agora o canvas guarda os tamanhos que chegam pelos eventos `dimensions` do `onNodesChange` e os devolve em cada nó. Isso também tira a re-medição dos 1.000 nós a cada tecla (§5.4).
- **Duplo clique (§5.8):** o duplo clique num nó **não selecionado** não funcionava. O primeiro clique troca a seleção, e o `dblclick` do navegador ia para o fundo, que dava zoom. Agora:
  - o canvas detecta dois cliques no mesmo nó em até 450 ms;
  - o zoom por duplo clique está desligado (`zoomOnDoubleClick={false}`); o zoom continua na roda do mouse e nos botões da §5.7.
- **Um passo de desfazer por ação:** o `Y.UndoManager` junta alterações feitas com menos de 400 ms de intervalo, então dois cliques rápidos na barra viravam um passo só. Cada ação discreta (criar, apagar, recolher, negrito, cor, link, mover) chama `stopCapturing()` antes. O texto digitado num nó recém-criado continua no mesmo passo da criação, como no MVP.
- **Recolher/expandir** aparece na barra só para quem edita, porque `collapsed` é compartilhado no Y.Doc (§5.1 corrigida).
- **Teclas dentro da barra, dos controles e dos popovers** não disparam atalhos do mapa: o `onKeyDown` do canvas ignora eventos vindos de `button`, `a`, `input`, `textarea` e `form`.
- **E2E:** o teste antigo (`mvp.spec.ts`) usava `getByRole('button', { name: 'Adicionar' })`, que agora também encontra "Adicionar filho" e outros botões. Passou a usar `exact: true`, sem mudança de comportamento.
