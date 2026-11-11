# PRD-009 — Movimento e acabamento: um sistema afiado e fluido

| Campo | Valor |
|---|---|
| Status | Aprovado (2026-11-11) |
| Autor | João Paulo (via Claude) |
| Data | 2026-11-11 |
| SPEC | [SPEC-009](../spec/SPEC-009-movimento-e-acabamento.md) |
| Origem | [PESQUISA-001](../research/PESQUISA-001-ux-e-concorrentes.md) |

## 1. Problema

O sistema faz tudo o que um mapa mental precisa, mas **não parece fluido**. Comparado com MindNode, Xmind, Whimsical e Linear, a diferença está no movimento e no acabamento, não na lista de funções:

1. **Os blocos pulam.** Criar, recolher, reordenar, religar e "Organizar" teletransportam os blocos para o lugar novo. O olho perde o fio: não dá para ver *de onde saiu* nem *para onde foi*.
2. **A câmera não acompanha.** Um filho criado na borda nasce fora da tela, e a pessoa digita sem ver. Navegar pelas setas também deixa o bloco selecionado fora da vista.
3. **Recolher é uma armadilha.** O sinal de "ramo recolhido" não diz quantos blocos esconde, não abre o ramo ao clicar e, ao passar o mouse, vira o "+" de **criar filho**. Quem tenta abrir o ramo cria um tópico novo.
4. **A interface é "seca".** Menus, diálogos e painéis aparecem e somem de uma vez. O carregamento é sempre um círculo girando. Ações como mandar para a lixeira, mover e duplicar não dão nenhum retorno, e as confirmações são as caixas cinzas do navegador ("Tem certeza?"), sem opção de desfazer.
5. **Achar as coisas é lento.** Não há como procurar um texto dentro do mapa, nem uma busca rápida de comandos e documentos (o "Ctrl+K" de Linear, Notion e Miro). A lista de atalhos só abre por um botão no canto.
6. **No celular, falta informação.** O "Salvo/Offline" some, o botão de menu fica sobre o título e as opções da pasta só aparecem com o mouse por cima.

## 2. Objetivo

Quando isto estiver pronto:

- **Toda mudança no mapa é visível como movimento:** o bloco novo nasce do pai, os vizinhos deslizam para abrir espaço, o ramo recolhido se fecha em direção ao pai e reabre dele.
- **A tela sempre mostra o que está sendo editado.**
- **Menus, diálogos e painéis abrem e fecham com suavidade**, todos com o mesmo ritmo.
- **Toda ação importante dá um retorno curto** ("Movido para Comercial · Desfazer").
- **Qualquer comando ou documento está a um Ctrl+K de distância**, e qualquer texto do mapa a um Ctrl+F.
- **Nada disso deixa o sistema mais lento:** um mapa de 1.000 blocos continua fluido, e quem configurou o computador para "reduzir movimento" vê tudo sem animação.

**Como saberemos que deu certo:**
1. Num mapa de 30 blocos, criar, recolher e reorganizar sem nenhum bloco "sumir e aparecer em outro lugar".
2. Uma pessoa nova abre um ramo recolhido na primeira tentativa.
3. Mandar um documento para a lixeira por engano é desfeito com um clique.
4. O mapa de 1.000 blocos continua respondendo a cada tecla como hoje (teste de desempenho existente).

## 3. Usuários afetados

**Todos os colaboradores**, em todas as telas: painel, editor de mapa, editor de fluxograma, histórico, compartilhamento, login e usuários. Nada muda em permissões.

## 4. Histórias de usuário

- Como **colaborador**, quero ver os blocos **deslizarem** para o lugar novo quando o mapa muda, para não perder o raciocínio.
- Como **colaborador**, quero que a tela **acompanhe o bloco que estou criando ou selecionando**, para nunca digitar às cegas.
- Como **colaborador**, quero ver **quantos blocos um ramo recolhido esconde** e abri-lo com um clique, sem criar um bloco sem querer.
- Como **colaborador**, quero **desfazer** com um clique quando mando algo para a lixeira, movo ou removo um acesso por engano.
- Como **colaborador**, quero apertar **Ctrl+K** e digitar para abrir um documento, criar um mapa ou executar qualquer ação do editor.
- Como **colaborador**, quero apertar **Ctrl+F** no mapa e pular entre os blocos que contêm o texto.
- Como **colaborador**, quero apertar **?** e ver os atalhos.
- Como **colaborador que prefere menos movimento** (configuração do sistema operacional), quero o sistema sem animações, sem perder nenhuma função.
- Como **colaborador no celular**, quero ver se o documento está salvo e acessar as opções da pasta pelo toque.

## 5. Requisitos

### Funcionais

**R1 — Movimento na interface (todas as telas)**
1. Menus, popovers, seletores de cor e o menu em grade **abrem a partir do botão que os chamou** e fecham mais rápido do que abrem.
2. Diálogos (compartilhar, exportar, pastas, confirmações) **entram e saem suavemente**, inclusive o escurecimento do fundo.
3. Painéis laterais (histórico) e a gaveta do celular **deslizam**.
4. Botões, itens de menu e cartões dão **retorno ao passar o mouse e ao pressionar**, e mostram **foco visível** quando se navega pelo teclado.
5. Ao abrir uma pasta da lateral, ela **se expande** em vez de aparecer de uma vez, e a setinha gira.
6. Ao trocar de filtro ou de modo cartões/lista, e ao ir do painel para o editor, a tela **transiciona** em vez de cortar seco.
7. Ao soltar um documento numa pasta, há uma confirmação visual de que ele "caiu ali".

**R2 — Avisos com Desfazer**
8. Existe um **aviso curto no canto da tela** para o resultado das ações: duplicar, mover, renomear, mandar para a lixeira, restaurar, remover acesso, criar e apagar pasta, restaurar versão.
9. Ações reversíveis mostram **"Desfazer"** no aviso por alguns segundos: lixeira, mover e remover acesso.
10. Todas as caixas cinzas do navegador ("Tem certeza?") são trocadas por **um diálogo do próprio sistema**, com o botão de perigo em vermelho e o nome do que vai ser apagado. Onde houver Desfazer, a pergunta deixa de existir.
11. Erros aparecem no aviso, perto de onde a pessoa está olhando, e não no topo da página fora da vista.

**R3 — Carregamento**
12. Painel, lista de usuários, histórico e membros mostram um **esqueleto com o formato do conteúdo** enquanto carregam, em vez do círculo girando. O esqueleto só aparece se a espera passar de um instante, para não piscar.

**R4 — Movimento no mapa mental**
13. **Bloco novo** (Tab, Enter, "+"): nasce saindo do pai e já entra em edição. Os vizinhos **deslizam** para abrir espaço, e a ligação acompanha o bloco o tempo todo.
14. **Recolher/expandir:** os filhos se fecham em direção ao pai e reabrem a partir dele.
15. **Reordenar, religar, apagar, "Organizar" e alterações vindas de colegas:** os blocos deslizam até o lugar novo.
16. **Câmera:** ao criar um bloco ou navegar pelas setas, se o bloco sair da área visível, a tela **desliza até ele** sem mudar o zoom. O zoom nunca muda sozinho enquanto se digita.
17. **Recolhido com contador:** o ramo recolhido mostra um selo com o **número de blocos escondidos**, e clicar nele **expande**. O "+" de criar filho nunca ocupa o mesmo lugar do selo. O bloco aberto ganha, ao passar o mouse, um controle visível de recolher.
18. **Apagar ramo grande** guarda uma versão no histórico antes (regra do CLAUDE.md §7 hoje descumprida). O aviso mostra quantos blocos foram apagados, com Desfazer.

**R5 — Movimento no fluxograma**
19. "Organizar" e movimentos de várias formas vindos de colegas **deslizam** até o lugar novo.
20. Forma nova entra com uma animação curta.

**R6 — Encontrar as coisas**
21. **Ctrl+K** (⌘K no Mac) abre uma **paleta de comandos** em qualquer tela logada:
    - **no painel:** buscar e abrir documentos e pastas, criar mapa ou fluxograma, ir para Lixeira, Compartilhados e Usuários (este, só para admin);
    - **no editor:** as mesmas ações do menu "Mais ações", com nome e atalho, além de exportar, histórico e compartilhar.

    Ela respeita o papel da pessoa: o leitor não vê ações de edição.
22. **Ctrl+F no mapa mental e no fluxograma** abre uma barra de busca que destaca os blocos com o texto, mostra "3 de 12" e pula entre eles com `Enter` e `Shift+Enter`, levando a câmera até cada um. Um resultado dentro de um ramo recolhido aparece **sem recolher nem expandir o ramo para os colegas**.
23. **?** abre a lista de atalhos, fora de campos de texto.

**R7 — Celular e acabamento**
24. O estado de salvamento aparece no celular, ao menos como um ponto colorido com o significado ao tocar.
25. O botão de menu do celular não cobre o título da página; as opções da pasta ficam alcançáveis pelo toque.
26. A gaveta do celular fecha com `Esc`, prende o foco e escurece o fundo suavemente.
27. Botões, campos e menus seguem **uma escala única** de tamanhos, cantos, sombras e fontes. É ajuste de consistência, sem mudar a identidade da SPEC-008.

### Não funcionais
- **Desempenho:**
  - o teste de desempenho de 1.000 blocos continua passando;
  - animação usa só deslocamento e transparência, e nunca roda durante o arrasto (o bloco segue o mouse 1:1);
  - quando muitos blocos mudam de uma vez (colar, restaurar versão, grande alteração de colega), a mudança é **aplicada direto, sem animar**;
  - o mapa mental passa a desenhar só o que está visível na tela, como o fluxograma já faz.
- **Ritmo:**
  - todas as animações seguem a mesma família de durações (de 120 a 320 ms) e curvas, definida uma vez;
  - nada demora a ponto de a pessoa esperar a animação para continuar;
  - Tab, Enter e setas continuam **instantâneos**: só a acomodação ao redor desliza.
- **Reduzir movimento:** com a opção do sistema operacional ligada, nada desliza nem cresce. No máximo um esmaecimento curto, onde ajuda a entender a mudança.
- **Acessibilidade:**
  - avisos lidos por leitor de tela;
  - paleta e busca usáveis só pelo teclado;
  - foco devolvido ao botão de origem quando um menu ou diálogo fecha;
  - contraste AA mantido.
- **Sem dependência nova:** tudo com recursos nativos do navegador. Se a SPEC concluir que precisa de biblioteca, isso vira ADR antes.
- **Navegadores:** Chrome, Edge, Firefox e Safari atuais. Onde um efeito não for suportado, a função continua igual, só sem o efeito.

## 6. Critérios de aceite

- [ ] Dado um mapa com 5 filhos à direita da raiz, quando aperto `Enter` no terceiro, então o irmão nasce abaixo dele e o quarto e o quinto **deslizam** para baixo; em nenhum quadro da animação a ligação se separa do bloco.
- [ ] Dado um bloco no canto direito da tela, quando aperto `Tab`, então a tela desliza até o filho novo e eu vejo o que digito; o zoom não muda.
- [ ] Dado um ramo recolhido com 7 blocos escondidos, então vejo um selo "7"; quando clico nele, o ramo **abre** e nenhum bloco é criado.
- [ ] Dado que mandei um documento para a lixeira pelo painel, quando clico em "Desfazer" no aviso, então ele volta para o mesmo lugar e a pasta de antes.
- [ ] Dado qualquer ação que hoje pergunta "Tem certeza?" com a caixa do navegador, então essa caixa não aparece mais em nenhum lugar do sistema.
- [ ] Dado que estou no painel, quando aperto `Ctrl+K` e digito parte do nome de um documento, então ele aparece na lista e `Enter` o abre.
- [ ] Dado que sou **Leitor** de um documento, quando abro a paleta no editor, então não vejo nenhuma ação que altere o documento.
- [ ] Dado um mapa com a palavra "orçamento" em 3 blocos, um deles num ramo recolhido, quando busco com `Ctrl+F`, então vejo "1 de 3", e o terceiro aparece para mim sem que o ramo mude para os colegas.
- [ ] Dado que apago um ramo com 25 blocos, então existe uma versão no histórico de antes da exclusão.
- [ ] Dado o computador com "reduzir movimento" ligado, então nenhum bloco desliza e nenhum menu cresce, e todas as funções continuam funcionando.
- [ ] Dado um mapa de 1.000 blocos, então o teste de desempenho atual continua passando, e colar ou restaurar uma versão grande não anima.
- [ ] Dado o celular, então vejo o estado de salvamento no editor e consigo abrir as opções de uma pasta pelo toque.
- [ ] Dado que abro um menu pelo teclado e aperto `Esc`, então o foco volta ao botão que o abriu.

## 7. Permissões

Nada muda. A paleta de comandos e os menus mostram **só o que o papel da pessoa permite** (mesma regra do menu em grade da SPEC-008). A autorização continua no servidor. Desfazer pelo aviso chama as mesmas rotas de hoje, com as mesmas checagens. A busca no mapa só procura no documento já aberto.

## 8. Fora de escopo (vão para as próximas ondas — ver PESQUISA-001 §5)

- Ícones/emoji, imagens, tarefas, etiquetas e ligações cruzadas no bloco (PRD-010).
- Comentários, cursores dos colegas e seguir colega (PRD-011).
- Modo foco, minimapa, outline/lista, apresentação e outros layouts (PRD-012).
- Templates, favoritos, colar lista recuada e importação (PRD-013).
- Comandos de alinhar/distribuir, agrupar, raias e Tab para a próxima forma no fluxograma (PRD-014).
- Qualquer recurso de IA (PRD-015, com ADR).
- **Recolher por pessoa** (o seu recolher não mexer na tela do colega): ver pergunta 1.
- Sombra-fantasma de encaixe durante o arrasto (estilo MindNode).
- Busca global no conteúdo de todos os documentos dentro da paleta: a paleta usa a busca do painel que já existe.

## 9. Perguntas em aberto

Respondidas na aprovação (2026-11-11): o dono aprovou o PRD sem responder às perguntas uma a uma, então valem as propostas.

- [x] **1. Recolher por pessoa?** **Não, por enquanto.** Recolher continua valendo para todos; a decisão fica para o PRD-012. A busca (R6.22) é a exceção: ela revela o resultado só para quem busca.
- [x] **2. Tempo do "Desfazer".** **6 segundos**, pausando enquanto o mouse ou o foco estiver no aviso.
- [x] **3. Versão antes de apagar ramo.** A partir de **20 blocos**.
- [x] **4. Leitor de tela ou "reduzir movimento" na equipe?** Sem resposta. Os dois modos são testados de qualquer jeito: o E2E roda com "reduzir movimento" ligado por padrão.
