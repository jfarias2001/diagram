# PESQUISA-001 — Auditoria de UX/UI e pesquisa de concorrentes

| Campo | Valor |
|---|---|
| Data | 2026-11-11 |
| Autor | João Paulo (via Claude, 5 agentes em paralelo) |
| Gera | [PRD-009](../prd/PRD-009-movimento-e-acabamento.md) e o roteiro da §5 |

Pedido do dono: *"um sistema afiado, com animações fluidas; pesquisar dentro do sistema e no mercado e implementar o que os outros têm"*.

Foram cinco frentes, todas rodadas ao mesmo tempo. Três auditaram o código, sem alterar nada: visual e movimento, UX do editor e inventário de funcionalidades. As outras duas pesquisaram o mercado, com dados de 2025–2026: mapa mental (MindMeister, Xmind, MindNode, Miro, Whimsical, Coggle, Ayoa, Mapify, Heptabase) e diagrama/quadro branco (Miro, Lucidchart, Whimsical, FigJam, draw.io, Excalidraw, tldraw, Eraser), com Notion e Linear como referência de painel e de "UI afiada".

---

## 1. Resumo em uma página

**O que já temos e está no nível do mercado:**
- atalhos de teclado do mapa (Tab, Enter, setas e os demais);
- colaboração em tempo real com o "somente leitura" imposto no servidor;
- histórico de versões;
- 8 temas de documento;
- linhas que afinam do pai para o filho;
- exportação em PDF;
- pastas com acesso herdado;
- fluxograma com seleção múltipla, guias e "soltar a seta no vazio cria a próxima forma".

**Onde estamos atrás:**
1. **Movimento.** Nada anima no editor: o bloco novo, recolher, reordenar e "Organizar" fazem os blocos *pularem*. A câmera não acompanha o bloco novo, que pode nascer fora da tela. Menus, diálogos e painéis aparecem e somem "secos". Não há sistema de aviso (toast) nem "Desfazer": são 6 `window.confirm`. O carregamento é sempre um spinner, nunca um esqueleto do conteúdo. O `prefers-reduced-motion` só é respeitado num ponto.
2. **Conteúdo do bloco.** Faltam ícones/emoji, imagem, tarefa (responsável, prazo) e ligação cruzada. Os 9 concorrentes de mapa mental têm ícone e imagem.
3. **Colaboração.** Não há comentários: o papel *Comentador* existe, mas não há onde comentar. Também faltam cursores dos colegas e "seguir colega".
4. **Navegação.** Faltam busca dentro do mapa, paleta de comandos (Ctrl+K), ajuda pela tecla `?`, modo foco, apresentação, outline/lista e outros layouts (organograma, linha do tempo).
5. **Produtividade.** Faltam templates, favoritos, colar uma lista recuada para virar ramos e importação. Na exportação, ainda não existem SVG, Markdown, OPML e .xmind.
6. **IA.** Todo concorrente gera mapa a partir de texto e expande ramo. Xmind e Miro já têm agente que edita o mapa.

**Recomendação:** começar pela **Onda 1 — movimento e acabamento** (PRD-009). É o que dá a sensação de "afiado" em todas as telas, não exige dependência nova nem ADR e prepara o terreno para o resto (o toast com Desfazer, a paleta de comandos e a animação de layout são usados pelas ondas seguintes).

---

## 2. Achados da auditoria interna

### 2.1 Bugs encontrados (corrigidos junto com esta pesquisa, sem PRD — são bugs pequenos e localizados)
| Bug | Onde | Correção |
|---|---|---|
| No fluxograma, com uma forma selecionada, segurar **Espaço** para mover o quadro entrava em edição e trocava o texto da forma por " " | `DiagramCanvas.tsx` (tecla de 1 caractere disparava "digitar para editar") | Espaço e combinações com Ctrl/⌘ não iniciam mais a edição |
| `bg-brand-soft` não gerava CSS: o item "ligado" do menu em grade e o formato escolhido no Exportar ficavam sem fundo | `index.css` (`--brand-soft` fora do `@theme`) | Token registrado |
| Botão vermelho ("Apagar") no modo escuro com texto branco sobre `#ff7a6e`: contraste ≈ 2,5:1 | `ui.tsx` | Token novo `--on-danger` (escuro no modo escuro) + teste de contraste |

### 2.2 Problemas de UX que viram requisito no PRD-009
- **Armadilha do ramo recolhido:** o selo de "recolhido" não é clicável, não diz quantos blocos esconde e, no hover, dá lugar ao "+" de **criar filho**, no mesmo lugar. Quem tenta abrir o ramo cria um tópico novo.
- **Câmera parada:** o filho criado na borda nasce fora da tela, e o usuário digita às cegas. Navegar pelas setas também não leva a câmera até o bloco.
- **Apagar ramo grande não guarda versão antes**, o que contraria o CLAUDE.md §7. Hoje só o `Ctrl+Z` salva.
- **Mapa sem `onlyRenderVisibleElements`** (o fluxograma tem): é o ganho de desempenho mais barato para mapas de mais de 1.000 nós.
- **Presença recalcula o mapa inteiro** a cada mudança de colega. Precisa ser isolada antes de existir cursor ao vivo.
- **Celular:** o status "Salvo/Offline" some, o botão de menu fica sobre o título da página e o "⋯" da pasta só aparece no hover (inalcançável no toque).
- **Menus feitos à mão:** sem setas, sem devolver o foco, fecham só com clique do mouse. A pasta abre um *diálogo* e o documento abre um *menu* para a mesma coisa.
- **Sistema de design sem escalas:** 5 raios, 3 sombras e 14 tamanhos de fonte soltos (`text-[10px]` etc.), além de cores fixas no código (avatar, escurecimento de fundo, estados da lateral).

### 2.3 O que já é bom e deve ser preservado
- Tokens de cor com teste de contraste automático.
- Conjunto único de ícones.
- Duas fontes da interface bem combinadas.
- `<dialog>` nativo com foco preso.
- Menu em grade com navegação por teclado.

---

## 3. Mercado — mapa mental

Legenda: ✓ tem · ~ parcial · ✗ não tem. Nós = Paglamp Diagram hoje.

| Recurso | Nós | MindMeister | Xmind | MindNode | Miro | Whimsical | Ayoa |
|---|---|---|---|---|---|---|---|
| Tab/Enter/setas | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ |
| Posição livre + organizar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Layout animado ("flui") | ✗ | ~ | ✓ | ✓ | ~ | ✓ | ✓ |
| Recolher com contador | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Outros layouts (organograma, linha do tempo…) | ✗ | ~ | ✓ | ~ | ~ | ~ | ~ |
| Outline/lista sincronizada | ✗ | ✓ | ✓ | ✓ | ✗ | ~ | ? |
| Modo foco num ramo | ✗ | ✓ | ~ | ✓ | ✗ | ✗ | ✓ |
| Apresentação a partir do mapa | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ? |
| Ícones/emoji | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Imagem no bloco | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Notas e links | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ✓ |
| Tarefas (prazo, responsável) | ✗ | ~ | ✓ | ~ | ~ | ✗ | ✓ |
| Ligações cruzadas | ✗ | ✓ | ✓ | ✓ | ✓ | ? | ✓ |
| Tempo real | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ |
| Comentários com @menção | ✗ | ✓ | ? | ✗ | ✓ | ✓ | ✓ |
| Histórico de versões | ✓ | ✓ | ? | ✗ | ✓ | ✓ | ? |
| Templates | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| IA: gerar mapa / expandir ramo | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Colar lista recuada → ramos | ✗ | ✓ | ✓ | ✓ | ~ | ✓ | ? |

**Diferenciais que valem copiar:**
- **Pitch Mode do Xmind:** slides gerados do mapa.
- **Arrasto do MindNode:** sombra-fantasma no ponto de encaixe, com os vizinhos abrindo espaço.
- **Auto Focus do Ayoa:** recolher é *por pessoa*, e o recolher de um colega não mexe na sua tela.
- **Ramo → tarefa com Gantt** (Xmind, Ayoa).
- **Destaque por etiqueta** (MindNode).

## 4. Mercado — diagrama e quadro branco

| Recurso | Nós | Miro | Lucid | Whimsical | FigJam | draw.io | Excalidraw |
|---|---|---|---|---|---|---|---|
| Conector que gruda e se reconecta | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Seta em ângulo reto | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Criar forma ligada pela alça/teclado | ~ (só alça) | ✓ | ✓ | ✓ | ✓ (Ctrl+Enter) | ✓ | ~ |
| Organizar automático | ✓ | ~ | ✓ | ✓ | ~ | ✓ | ✗ |
| Alinhar/distribuir (comando) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agrupar/travar | ✗ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ |
| Raias/containers | ✗ | ✓ | ✓ | ~ | ~ | ✓ | ~ |
| Sticky note / desenho livre | ✗ | ✓ | ~ | ✓ | ✓ | ~ | ✓ |
| Cursores ao vivo com nome | ✗ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Seguir colega | ✗ | ✓ | ~ | ~ | ✓ | ✓ | ✓ |
| Comentário fixado no quadro | ✗ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Apresentação com quadros | ✗ | ✓ | ✓ | ~ | ~ | ✓ | ✓ |
| IA: texto → diagrama | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Diagrama como código (Mermaid) | ✗ | ~ | ✓ | ✗ | ✗ | ✓ | ✓ |

**Diferenciais para uma empresa:**
- **Procedimento escrito → fluxograma com raias por área** (Lucid AI).
- **"O que mudou desde a sua última visita"** (Catch-up do Miro), que combina com o nosso histórico.
- **Timer e votação em reunião** (Miro, FigJam).
- **Servidor MCP** para agentes de IA da empresa lerem e criarem diagramas: todos lançaram um em 2025–26.

## 5. Roteiro proposto (cada onda = um PRD, aprovado antes de começar)

| Onda | PRD | Conteúdo | Precisa de ADR? |
|---|---|---|---|
| **1** | **PRD-009 Movimento e acabamento** | Base de animação, diálogos/menus/avisos animados, Desfazer, esqueletos de carregamento, transição painel→editor, layout que flui, câmera que acompanha, recolher com contador, Ctrl+K, `?`, busca no mapa (Ctrl+F) | Não |
| 2 | PRD-010 Conteúdo rico no bloco | Ícones/emoji, imagem no bloco (upload, com toda a parte de segurança de arquivos), tarefas (responsável, prazo, concluída), ligações cruzadas, etiquetas | Talvez (armazenamento de arquivos) |
| 3 | PRD-011 Comentários e presença | Comentários com @menção e "resolver" (dá função ao Comentador), cursores ao vivo, seguir colega, "o que mudou desde a sua visita" | Não |
| 4 | PRD-012 Ver o mapa de outros jeitos | Modo foco, minimapa, outline/lista sincronizada, apresentação a partir do mapa, organograma e linha do tempo | Não |
| 5 | PRD-013 Produtividade | Templates da empresa, favoritos, colar lista → ramos, importar/exportar (Markdown, OPML, JSON, SVG, .xmind/.mm, Mermaid) | Não |
| 6 | PRD-014 Fluxograma profissional | Tab cria a próxima forma ligada, alinhar/distribuir, agrupar/travar, raias e containers, sticky note | Não |
| 7 | PRD-015 IA | Gerar mapa de texto/PDF, expandir ramo, procedimento → fluxograma com raias | **Sim** (provedor de IA e privacidade: o conteúdo sai da VPS) |

O **primeiro deploy na VPS e o PRD de backup** continuam pendentes desde a SPEC-004 e podem andar em paralelo com qualquer onda.

## 6. Guia de movimento (vira tokens na SPEC-009)

```css
--dur-micro: 120ms;  /* hover, toggle, tooltip */
--dur-fast:  180ms;  /* menu, popover */
--dur-base:  240ms;  /* diálogo, painel, aviso */
--dur-slow:  320ms;  /* teto para interface comum */
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* entrada / resposta */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* algo que se desloca na tela */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* painéis laterais */
```

**Regras:**
- Animar só `transform` e `opacity`.
- A saída dura de 70 a 80% da entrada.
- Esqueleto de carregamento só aparece após 200 ms e fica pelo menos 400 ms.
- Com `prefers-reduced-motion`, tudo vira um fade curto ou fica instantâneo.

**Nunca animar:**
- texto enquanto se digita;
- bloco seguindo o mouse no arrasto;
- reorganização com mais de cerca de 300 blocos mudando de uma vez;
- Tab, Enter e setas: a *criação* é instantânea, só a acomodação dos vizinhos desliza.

## 7. Fontes principais

Xmind (xmind.com/whats-new, /blog/xmind-2025-recap, /user-guide/pitch-mode-new) · MindNode (mindnode.com/releases/2026.4, /post/2025.6) · MindMeister (mindmeister.com/pt/features) · Ayoa (support.ayoa.com/collapsing-branches-and-auto-focus) · Miro (miro.com/blog/2025-recap, help.miro.com) · Lucid (lucid.co/blog/lately-at-lucid-october-2026) · Whimsical (whimsical.com/releases/2026-10-better-search-and-flowchart-icons) · FigJam (help.figma.com) · draw.io (drawio.com/blog/generate-diagram-tool) · Excalidraw (plus.excalidraw.com/changelog) · tldraw (tldraw.dev/releases/v3.13.0) · Eraser (eraser.io/ai-new) · Linear (linear.app/blog/how-we-redesigned-the-linear-ui) · Vercel (vercel.com/design/guidelines) · Apple WWDC23 10158 (springs) · React Flow (reactflow.dev/examples/nodes/node-position-animation).
