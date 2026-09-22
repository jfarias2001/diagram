# PRD-002 — Editar o mapa mental com o mouse, notas e links nos nós

| Campo | Valor |
|---|---|
| Status | **Aprovado** (2026-09-22) |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | [SPEC-002](../spec/SPEC-002-mapa-com-mouse-notas-links.md) |

## 1. Problema
No MVP, criar e organizar blocos no mapa mental só funciona pelo teclado (`Tab`, `Enter`, `F2`...). Quem não conhece os atalhos não consegue montar um mapa, e mesmo quem conhece sente falta de clicar para adicionar um bloco, como no MindMeister. Além disso, o bloco só guarda um texto curto: não dá para anotar detalhes nem apontar para um site ou arquivo.

## 2. Objetivo
Qualquer colaborador consegue montar um mapa inteiro **só com o mouse**, sem conhecer nenhum atalho. E cada bloco pode ter uma **nota** (texto longo) e um **link**.

Sucesso = um colega que nunca usou a ferramenta cria um mapa com 10 blocos, uma nota e um link sem precisar de ajuda.

## 3. Usuários afetados
Todos os colaboradores que editam mapas mentais (Dono e Editor). Leitores e Comentadores veem notas e links.

## 4. Histórias de usuário
1. Como **editor**, quero clicar num bloco e ver botões ao lado dele para criar filho, criar irmão, mudar cor, negrito, recolher/expandir e apagar.
2. Como **editor**, quero passar o mouse num bloco e clicar num **"+"** que aparece do lado para criar um filho com um clique.
3. Como **editor**, quero dar **duplo clique** num bloco para editar o texto dele.
4. Como **editor**, quero ter na barra do editor botões de desfazer, refazer, aproximar, afastar e centralizar o mapa.
5. Como **editor**, quero escrever uma **nota** num bloco (detalhes, observações) e ver um ícone no bloco indicando que ele tem nota.
6. Como **editor**, quero colocar um **link** num bloco e abrir esse link com um clique.
7. Como **leitor**, quero ler as notas e abrir os links, sem conseguir alterá-los.

## 5. Requisitos
### Funcionais
1. **Barra flutuante do bloco selecionado** (aparece junto ao bloco, acompanha zoom e rolagem), com: `+ Filho`, `+ Irmão`, cor, negrito, nota, link, recolher/expandir (só se tiver filhos) e apagar. Na raiz, `+ Irmão` e apagar não aparecem.
2. **Botão "+" ao passar o mouse:** aparece na borda do bloco voltada para fora (lado do ramo); na raiz, cria o filho do lado que tiver menos filhos. O novo bloco já entra em modo de edição.
3. **Duplo clique** num bloco entra na edição de texto. Clique simples só seleciona. Clique no fundo vazio tira a seleção.
4. **Barra do editor** com desfazer, refazer, zoom +, zoom −, centralizar/ajustar à tela. Cada botão mostra o atalho equivalente ao passar o mouse (ex.: "Desfazer (Ctrl+Z)") — assim o mouse também ensina o teclado.
5. **Nota:** texto simples (sem formatação) de até 5.000 caracteres, editado num painel lateral que abre pela barra flutuante ou clicando no ícone de nota do bloco. Salva sozinho, como o resto.
6. **Link:** um link por bloco, só `http://`, `https://` ou `mailto:`. Endereço sem protocolo (ex.: `paglamp.com.br`) vira `https://` automaticamente. Ícone de link no bloco abre em nova aba.
7. A busca do painel passa a encontrar também o texto das notas.
8. Tudo que for feito com o mouse entra no desfazer/refazer e sincroniza em tempo real com os colegas, igual ao teclado.
9. Os atalhos de teclado atuais continuam funcionando sem mudança.

### Não funcionais
- Continua fluido com 1.000+ blocos (a barra e o "+" não podem deixar o mapa lento).
- Botões com dica (tooltip) em português e rótulo acessível para leitor de tela.
- Desktop primeiro; em tela de toque a barra flutuante deve funcionar com toque simples.

## 6. Critérios de aceite
- [ ] Dado um mapa novo, quando o usuário usa só o mouse, então consegue criar filhos, irmãos, editar texto, mudar cor, recolher e apagar blocos.
- [ ] Dado um bloco selecionado, quando clica em `+ Filho` ou no "+", então o filho aparece já em edição.
- [ ] Dado um duplo clique num bloco, então o texto entra em edição com o cursor no fim.
- [ ] Dado um link `javascript:...` ou `data:...`, quando o usuário tenta salvar, então o link é recusado com mensagem clara.
- [ ] Dado um bloco com nota e link, quando um Leitor abre o mapa, então ele lê a nota e abre o link, mas não consegue editá-los (nem forjando mensagens).
- [ ] Dado que dois editores estão no mapa, quando um adiciona uma nota, então o outro vê o ícone de nota em poucos segundos.
- [ ] A busca do painel encontra um mapa por uma palavra que só existe numa nota.
- [ ] Ctrl+Z desfaz uma ação feita pelo mouse.

## 7. Permissões
| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Usar barra flutuante / "+" / duplo clique para editar | ✔ | ✔ | — | — |
| Criar/editar/apagar nota e link | ✔ | ✔ | — | — |
| Ler nota e abrir link | ✔ | ✔ | ✔ | ✔ |
| Zoom e centralizar | ✔ | ✔ | ✔ | ✔ |

## 8. Fora de escopo
- Menu de clique direito (não escolhido nesta rodada).
- Nota com formatação (negrito, listas, imagens) — só texto simples por enquanto.
- Mais de um link por bloco, anexos de arquivo, imagens no bloco.
- Ícones/emoji nos blocos.
- Comentários (é outra feature, para o papel Comentador).

## 9. Perguntas em aberto
Respondidas pelo usuário em 2026-09-22 ("está excelente"):
- [x] Limite da nota → **5.000 caracteres**, como proposto.
- [x] Como mostrar o link → **só o ícone**; o endereço aparece na dica ao passar o mouse.
