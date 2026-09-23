# PRD-008 — Cara nova estilo MindMeister, menus em grade e exportação em PDF

| Campo | Valor |
|---|---|
| Status | Implementado |
| Autor | João Paulo (via Claude) |
| Data | 2026-09-23 |
| SPEC | [SPEC-008](../spec/SPEC-008-identidade-visual-menus-e-pdf.md) |

## 1. Problema

O sistema funciona, mas **não parece um produto**. Quatro dores concretas, observadas no app rodando:

1. **A interface é sem graça e sem hierarquia.** Fundo bege, botões pretos, um único acento âmbar. O painel de documentos é uma lista com abas; nada indica o que é importante. O MindMeister, que é a referência de quem vai usar isto, tem lateral escura, botão de criar em destaque e cartões grandes — a diferença de acabamento é gritante.
2. **Os ícones não dizem nada.** A barra que aparece ao selecionar um bloco é uma fileira de 11 ícones minúsculos, sem rótulo, sem agrupamento e sem atalho à vista. Ninguém adivinha o que é "a tesoura" ou "o boneco com um risco". Pior: por ser uma barra larga, ela **cobre blocos vizinhos** (visto num mapa com netos).
3. **Criar um irmão joga o bloco para o outro lado do mapa.** Com um filho à direita, apertar `Enter` cria o irmão **à esquerda da raiz** — o bloco "passa por trás do pai" em vez de nascer logo abaixo do irmão. A causa: os ramos da raiz são redivididos entre direita e esquerda **a cada bloco criado**, então os blocos já existentes também pulam de lado sozinhos. Isso quebra a expectativa de qualquer pessoa que já usou um mapa mental e faz perder o fio do raciocínio no meio de uma reunião.
4. **Não dá para entregar o mapa para quem não usa o sistema.** Só existe "Exportar PNG". Para levar um mapa a uma reunião, anexar num e-mail ou imprimir, o formato que todo mundo abre é **PDF** — e o PNG de um mapa grande fica ilegível ao imprimir.

## 2. Objetivo

Quando isto estiver pronto:

- Abrir o sistema deve dar a mesma sensação de acabamento do MindMeister: **lateral escura, azul/violeta como cor principal, cartões grandes, tipografia clara**.
- Toda ação do editor deve ser **encontrável sem adivinhação**: menu em grade, com ícone, nome, atalho e uma linha explicando.
- `Enter` deve criar o irmão **logo abaixo, do mesmo lado**; nenhum bloco já existente muda de lado sozinho.
- Qualquer documento (mapa ou fluxograma) deve virar **PDF** em dois cliques, pronto para imprimir ou anexar.

**Como saberemos que deu certo:** os colaboradores conseguem montar um mapa de 20 blocos sem perguntar o que cada ícone faz, e um mapa qualquer vira um PDF legível em A4.

## 3. Usuários afetados

**Todos os colaboradores** da Paglamp — a mudança é da interface inteira (painel, editor de mapa, editor de fluxograma, telas de login e de usuários). Nada muda em permissões, nem em quem vê o quê.

## 4. Histórias de usuário

- Como **colaborador**, quero uma interface bonita e organizada para não ter vergonha de abrir o sistema numa reunião com cliente.
- Como **colaborador novo**, quero ver **o nome e a explicação** de cada ação do bloco para usar o editor sem treinamento.
- Como **colaborador**, quero que `Enter` crie o irmão **abaixo do bloco atual, do mesmo lado**, para não perder o raciocínio procurando onde o bloco foi parar.
- Como **colaborador**, quero que os blocos que já desenhei **fiquem onde estão** quando eu adiciono outro, para o mapa não se reorganizar sozinho.
- Como **colaborador**, quero **exportar em PDF** para anexar num e-mail, imprimir ou apresentar sem depender de ter acesso ao sistema.
- Como **colaborador**, quero escolher **A4/A3, retrato/paisagem** na exportação para o mapa sair legível no papel.
- Como **dono de documento**, quero encontrar meus documentos rapidamente num painel com lateral fixa e cartões, em vez de uma lista sem destaque.

## 5. Requisitos

### Funcionais

**R1 — Identidade visual nova (estilo MindMeister)**

1. Paleta principal: **azul → violeta** como cor de ação, **lateral escura quase preta**, fundo claro neutro e texto em cinza-tinta. O âmbar sai da interface (continua existindo como tema de documento, já entregue na SPEC-007).
2. A escolha de cores vale para: painel, editor (cabeçalho, barras, painéis laterais, diálogos), login, troca de senha e administração de usuários.
3. **Modo escuro da interface** continua funcionando (segue a preferência do sistema operacional), com a mesma paleta adaptada.
4. **O tema do documento não muda.** As 8 paletas de quadro da SPEC-007 continuam iguais; um mapa antigo abre exatamente com a aparência que tinha.
5. Contraste de texto em cima de qualquer cor da interface: mínimo **4,5:1** (AA).

**R2 — Painel de documentos reestruturado**

6. **Lateral escura fixa** com: Início, Meus documentos, Compartilhados comigo, Lixeira e, abaixo, as árvores de Minhas pastas e Pastas compartilhadas. Cada item com ícone e rótulo.
7. **Botão "+ Criar" em destaque** no topo do conteúdo, abrindo as opções Mapa mental e Fluxograma.
8. Documentos em **cartões grandes** com: capa colorida (derivada do tipo e do tema do documento), título, pasta, quem criou, quando foi modificado e o menu de ações.
9. **Alternar entre cartões e lista**, com a escolha lembrada no navegador.
10. Busca, filtros (Todos / Mapas mentais / Fluxogramas) e tudo o que o painel já faz hoje continua funcionando — inclusive arrastar o documento para uma pasta.
11. A lateral **recolhe** em telas estreitas (vira um botão de menu), e o painel continua utilizável a partir de 1024 px de largura.

**R3 — Ícones**

12. Conjunto de ícones **coerente**: mesma família, traço de mesma espessura, mesmo tamanho, alinhados ao texto. Sem mistura de estilos.
13. Todo ícone clicável tem **rótulo visível ou dica ao passar o mouse** e nome acessível para leitor de tela.

**R4 — Menu de ações em grade (mapa mental e fluxograma)**

14. A barra de ícones do bloco selecionado vira um **menu em grade**: cada ação com **ícone + nome + atalho**, agrupada por assunto (Criar, Aparência, Organizar, Conteúdo, Perigo).
15. As ações mais usadas (criar filho, criar irmão, cores) continuam a **um clique**, sem abrir o menu.
16. Ao abrir, o menu **não cobre o bloco selecionado** nem sai da tela.
17. Todos os atalhos de teclado atuais continuam valendo, sem exceção.

**R5 — Criar irmão (correção)**

18. `Enter` (ou "Adicionar irmão") cria o bloco **do mesmo lado e imediatamente abaixo** do bloco de referência.
19. Criar, apagar ou reordenar blocos **não faz nenhum bloco já existente trocar de lado**.
20. Um mapa criado do zero continua se distribuindo dos **dois lados** da raiz, como no MindMeister — mas o lado de cada ramo, uma vez definido, é estável.
21. O comportamento vale igual para quem está com o documento aberto ao mesmo tempo (dois navegadores enxergam o mesmo lado).
22. Documentos que já existem abrem com os lados que têm hoje, sem se remexer.

**R6 — Exportar em PDF**

23. Um botão **"Exportar"** único no editor abre um diálogo com: formato (**PNG** ou **PDF**), tamanho (**Ajustado ao mapa**, **A4**, **A3**), orientação (retrato/paisagem) e incluir ou não o fundo do quadro.
24. Padrão: **PDF, ajustado ao mapa, paisagem, com fundo** — dois cliques do começo ao fim.
25. O PDF sai em **uma página** quando o tamanho é "Ajustado ao mapa". Em A4/A3, o mapa é **reduzido para caber** na página escolhida.
26. O texto dos blocos precisa ficar **legível** no PDF (nada de imagem borrada ao imprimir).
27. Vale para **mapa mental e fluxograma**, e também para o **modo versão** (exportar a versão que se está vendo).
28. O arquivo sai com o nome do documento (sem caracteres problemáticos) e a exportação acontece **no navegador** — o documento não é enviado para lugar nenhum.

### Não funcionais

- **Desempenho:** o painel e o editor continuam abrindo no mesmo tempo de hoje; o editor continua fluido com 1.000+ blocos. A exportação de um mapa de 1.000 blocos deve terminar em até ~10 s numa máquina comum.
- **Acessibilidade:** navegação por teclado em todos os menus novos, foco visível, contraste AA, nome acessível em todo botão só de ícone.
- **Compatibilidade:** Chrome e Edge atuais (o que a empresa usa); o PDF gerado abre em qualquer leitor.
- **Peso:** a biblioteca de PDF não pode inchar o carregamento inicial — ela só é baixada quando alguém exporta.
- **Sem regressão:** todos os testes existentes continuam passando; nenhuma rota, permissão ou dado muda de significado.

## 6. Critérios de aceite

- [ ] Dado um mapa com um bloco à direita, quando eu seleciono e aperto `Enter`, então o novo bloco aparece **à direita, logo abaixo** do anterior — e o anterior não se move.
- [ ] Dado um mapa com quatro ramos, quando eu crio o quinto, então **nenhum dos quatro muda de lado**.
- [ ] Dado um mapa já existente, quando eu o abro depois desta entrega, então os ramos estão nos mesmos lados de antes.
- [ ] Dado dois colaboradores com o mesmo mapa aberto, quando um cria um irmão, então os dois veem o bloco no mesmo lugar.
- [ ] Dado um bloco selecionado, quando abro o menu de ações, então vejo **ícone, nome e atalho** de cada ação, agrupados, sem o menu cobrir o bloco.
- [ ] Dado qualquer botão só de ícone, quando passo o mouse ou uso leitor de tela, então recebo o nome da ação.
- [ ] Dado o painel, quando entro, então vejo a lateral escura com Início / Meus documentos / Compartilhados / Lixeira / pastas e o botão "+ Criar" em destaque.
- [ ] Dado o painel, quando alterno entre cartões e lista e recarrego a página, então a escolha foi lembrada.
- [ ] Dado um documento aberto, quando clico em "Exportar", escolho PDF/A4/paisagem e confirmo, então baixa um PDF de uma página, com o mapa inteiro legível e o nome do documento.
- [ ] Dado um fluxograma, quando exporto em PDF, então o resultado tem todas as formas e conectores.
- [ ] Dado que estou vendo uma versão antiga, quando exporto, então o PDF é o **daquela versão**.
- [ ] Dado um leitor (VIEWER), quando abre o documento, então consegue exportar, mas continua sem poder editar nada.
- [ ] Dado o modo escuro do sistema operacional, quando abro o sistema, então a interface inteira está legível (contraste AA) e nada fica branco no meio do escuro.

## 7. Permissões

Nada muda no modelo de acesso. Detalhando o que é novo:

| Ação | Papel mínimo |
|---|---|
| Ver a interface nova | qualquer usuário autenticado |
| Abrir o menu de ações do bloco | `VIEWER` vê o menu apenas com as ações de leitura (abrir nota, abrir link); as de edição não aparecem |
| Usar as ações de edição do menu | `EDITOR` |
| Exportar PNG/PDF | `VIEWER` — quem pode ver o documento pode exportar o que vê |
| Exportar uma versão antiga | `VIEWER` (mesma regra do histórico, SPEC-005) |

Como a exportação acontece **no navegador**, ela nunca dá acesso a nada além do que aquela pessoa já tem carregado na tela.

## 8. Fora de escopo

- **Favoritos / estrelinha** nos documentos (existe no MindMeister; exigiria tabela nova — vira PRD próprio).
- **Miniatura real** do conteúdo no cartão. O cartão terá uma capa colorida gerada a partir do tipo e do tema, não uma imagem do mapa (gerar imagem de verdade exigiria renderizar documento no servidor).
- **Modelos prontos**, **importação de arquivos** e **criação por IA** (os outros botões que o MindMeister tem no topo).
- **Exportar SVG, OPML, Markdown, `.mm`, `.xmind`** — ficam para o PRD de importação/exportação completa.
- **Fatiar o PDF em várias páginas** para impressão em tamanho grande (pôster). Nesta entrega, A4/A3 sempre reduz para caber.
- **Copiar a marca do MindMeister**: nada de usar o logotipo, o nome ou as ilustrações deles. O que se copia é o **estilo** (estrutura, densidade, paleta na mesma família), com a identidade Paglamp.
- **Trocar as 8 paletas de documento** da SPEC-007.
- **Aplicativo para celular / uso em tela de telefone.**

## 9. Perguntas em aberto

Respondidas na aprovação (2026-09-23):

- [x] **Nome:** continua **"Paglamp Diagram"**.
- [x] **Capa do cartão:** pode usar a cor do **tema do documento** (mapa com tema Oceano → capa azul).
