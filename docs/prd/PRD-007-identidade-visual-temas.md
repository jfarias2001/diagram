# PRD-007 — Identidade visual dos editores: temas, fontes, cores livres e arrasto natural

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | [SPEC-007](../spec/SPEC-007-identidade-visual-temas.md) |

## 1. Problema

O editor já faz o que precisa, mas **não parece um produto acabado**, e alguns comportamentos atrapalham o uso diário:

1. **A linha desaparece durante o arrasto.** Ao arrastar um bloco, a ligação dele com o pai some e só volta quando se solta. O bloco parece "soltar do mapa" e a pessoa perde a referência de onde ele estava preso.
2. **Arrastar um bloco arrasta o ramo inteiro.** Quem quer só afastar um bloco para ganhar espaço acaba movendo todos os filhos dele junto, e precisa arrumar tudo de novo. (Comportamento definido na SPEC-006 §5.1 — este PRD o substitui.)
3. **Só existe um jeito de trocar um bloco de pai: arrastá-lo em cima do novo pai.** Num mapa grande, o pai desejado costuma estar longe, fora da tela — arrastar até lá é impraticável, e hoje a alternativa é apagar o ramo e digitar tudo de novo. Não há como "cortar a ligação" e religar em outro lugar.
4. **Quase não há cores.** São 8 cores de contorno e 8 de preenchimento, fixas. Não dá para usar a cor da marca, nem um tom específico combinado com a equipe.
5. **O modo claro é branco puro (`#ffffff` no bloco, `#f6f7f9` no quadro).** Numa sala clara e em telas grandes isso cansa a vista em poucos minutos.
6. **Uma fonte só, para tudo.** Um mapa de estudo, um organograma formal e um brainstorm têm a mesma cara.
7. **Não existem temas.** Cada mapa começa igual ao anterior; deixar um mapa apresentável exige pintar bloco por bloco.

## 2. Objetivo

Deixar os dois editores (mapa mental e fluxograma) com cara de software profissional, na linha da referência enviada (MindMeister), e dar a cada documento uma **identidade visual própria em dois cliques**.

Quando estiver pronto:
- arrastar um bloco é **previsível**: a linha acompanha o movimento e só o bloco arrastado sai do lugar;
- dá para **cortar a ligação** de um bloco e pendurá-lo em outro pai, por mais longe que ele esteja, sem perder nada do que já foi escrito;
- a pessoa escolhe **qualquer cor** que quiser, não uma lista de oito;
- o modo claro é **confortável** (fundo levemente quente, não branco de farol);
- um painel **Temas** troca de uma vez paleta, fundo, fonte e traço do mapa inteiro;
- quem abre o documento vê **o mesmo tema** que o autor escolheu.

Sucesso = alguém pega um mapa pronto, aplica um tema, apresenta na reunião e ninguém percebe que não é um produto comprado.

## 3. Usuários afetados

Todos os colaboradores, nos dois editores. Trocar o tema, as fontes e as cores é ação de **Dono e Editor**; Comentador e Leitor veem o resultado.

## 4. Histórias de usuário

1. Como **editor**, quero que a linha continue ligando o bloco ao pai **enquanto arrasto**, esticando junto com o movimento, para nunca perder de vista de onde ele saiu.
2. Como **editor**, quero arrastar um bloco **sem levar os filhos junto**, para abrir espaço sem bagunçar o ramo.
3. Como **editor**, quero, quando eu realmente quiser mover o ramo inteiro, ter um jeito explícito de fazer isso.
4. Como **editor**, quero **cortar a ligação** de um bloco e pendurá-lo em outro pai, mesmo que esse pai esteja longe na tela, para reaproveitar o que já escrevi em vez de refazer do zero.
5. Como **editor**, quero escolher **qualquer cor** (roda de cores, código hexadecimal, cores usadas recentemente) para o contorno, o preenchimento e o texto de um bloco.
6. Como **editor**, quero trocar a **fonte** do documento entre algumas opções de boa qualidade, incluindo uma manuscrita e uma com serifa.
7. Como **editor**, quero escolher a **cor de fundo do quadro** — um tom do tema ou uma cor minha.
8. Como **editor**, quero aplicar um **tema pronto** (paleta + fundo + fonte + traço) ao documento inteiro, vendo uma miniatura antes.
9. Como **colaborador**, quero que o **modo claro** seja agradável de olhar por horas.
10. Como **colaborador**, quero que o documento **abra igual para todos**: o tema é do mapa, não do meu navegador.
11. Como **leitor**, quero ver o documento exatamente como ele foi desenhado, sem poder alterá-lo.

## 5. Requisitos

### Funcionais

**A. Arrastar blocos (corrige a SPEC-006)**

1. Enquanto um bloco é arrastado, a **linha que o liga ao pai continua desenhada** e acompanha o bloco em tempo real. O mesmo vale para as linhas que descem para os filhos dele.
2. Arrastar um bloco move **apenas aquele bloco**. Os filhos permanecem onde estão e as linhas até eles se esticam.
3. Para mover o ramo inteiro existe um caminho explícito: **segurar `Shift` ao arrastar** e a opção **"Mover o ramo"** na barra do bloco. Enquanto se arrasta com `Shift`, o ramo que vai junto fica visivelmente destacado.
4. Arrastar a **raiz** continua movendo o mapa inteiro (é o comportamento esperado de "mover o mapa").
5. Soltar em cima de outro bloco continua **trocando o pai**, como hoje.
6. "Organizar automaticamente" (mapa inteiro ou só o ramo) continua existindo e desfaz qualquer arrumação manual.
7. No **fluxograma**, arrastar uma forma já move só ela — nada muda além de os conectores acompanharem suavemente.

**B. Cortar a ligação e religar em outro pai**

8. Clicar numa **linha de ligação** a seleciona e mostra uma barrinha com **"Cortar e religar"** (tesoura).
9. Ao cortar, o mapa entra em **modo religar**: o bloco solto (e o ramo dele) fica destacado, o quadro mostra "Escolha o novo tópico-pai", e **o próximo clique em qualquer bloco** faz a religação. `Esc` ou clicar no vazio **cancela** e nada muda.
10. Durante o modo religar, mover o quadro e dar zoom continuam funcionando — é assim que se alcança um pai distante. Os blocos que **não podem** receber (o próprio bloco e seus descendentes) ficam visivelmente indisponíveis.
11. Pelo teclado: **`Ctrl+X`** recorta o bloco selecionado com o ramo dele e **`Ctrl+V`** o pendura como filho do bloco selecionado no momento. Vale dentro do mesmo documento.
12. Cortar e religar é **uma única operação**: a ligação antiga só é desfeita quando a nova existe — o mapa nunca fica com um bloco solto, e **um `Ctrl+Z` desfaz tudo**.
13. Ao religar, o bloco vai para a **posição automática** sob o novo pai (como já acontece ao soltar um bloco em cima de outro), levando junto texto, nota, link, cores, formato e o ramo inteiro.
14. A raiz não pode ser cortada, e um bloco não pode ser religado nele mesmo nem num descendente (viraria ciclo) — a interface impede e o servidor recusa.
15. Arrastar um bloco em cima de outro continua trocando o pai, como hoje.

**C. Cores livres (todo o sRGB)**

16. Contorno, preenchimento e **cor do texto** de um bloco aceitam **qualquer cor sRGB**, escolhida por: roda/área de cor, campo hexadecimal (`#RRGGBB`), e sliders de matiz e saturação.
17. O seletor mostra: as **cores do tema atual** (acesso de um clique), as **cores usadas recentemente** neste navegador, e o botão **"Auto"**, que devolve o bloco ao padrão do tema.
18. Ao escolher um preenchimento, o sistema **sugere** a cor de texto legível (como hoje), mas a pessoa pode escrever outra — nesse caso, se o contraste ficar abaixo de 4,5:1, aparece um aviso discreto ("texto pouco legível neste fundo"), sem impedir.
19. O mesmo seletor vale para o fluxograma (forma, contorno, texto e conector).

**D. Fontes**

20. O documento tem uma **fonte**, escolhida numa lista curada de 8 famílias já embutidas no sistema (nada é baixado de fora em tempo de uso): duas sem serifa, uma geométrica, uma com serifa, uma manuscrita, uma condensada, uma monoespaçada e uma de alta legibilidade.
21. A troca vale para o quadro inteiro (blocos e rótulos de conector), imediatamente e para todos.
22. Cada tema já vem com a fonte que combina com ele; trocar a fonte depois de aplicar um tema é permitido e prevalece.

**E. Fundo do quadro**

23. O fundo do quadro pode ser: o **fundo do tema**, um dos **tons prontos** (claros e escuros) ou **qualquer cor** pelo seletor.
24. O padrão de grade (pontinhos) se ajusta sozinho ao fundo, para nunca sumir nem berrar.
25. O PNG exportado sai com o fundo em uso.

**F. Temas do documento**

26. Um painel **Temas** (botão no cabeçalho do editor) mostra **miniaturas** dos temas disponíveis; clicar aplica ao documento.
27. Cada tema define: paleta dos ramos (6 a 8 cores), fundo do quadro, cor do texto, fonte, espessura e formato do traço, formato padrão dos blocos e se é claro ou escuro.
28. Temas iniciais (nomes em português): **Paglamp** (o atual, sóbrio), **Aurora**, **Oceano**, **Pôr do sol**, **Grafite** (escuro), **Papel** (claro quente, fonte com serifa), **Caderno** (manuscrita), **Neon** (escuro saturado).
29. Aplicar um tema **não apaga** as escolhas manuais: um bloco pintado à mão continua com a cor dele. O painel oferece **"Aplicar e limpar as cores manuais"** como ação separada, e **um Ctrl+Z desfaz** a aplicação inteira.
30. O tema é **propriedade do documento**: viaja com ele, aparece igual para todos, sincroniza em tempo real e entra no histórico de versões.
31. O interruptor claro/escuro pessoal de hoje (SPEC-006 §5.14–17) **deixa de existir**: claro ou escuro passa a ser uma característica do tema do documento. Documentos já criados continuam abrindo com a aparência atual (tema **Paglamp**).

**G. Redesenho dos editores**

32. **Modo claro confortável:** o quadro deixa de ser branco puro; passa a um tom levemente quente e dessaturado, com os blocos em um tom acima do fundo, e as bordas mais suaves.
33. **Linhas de ligação com cara de mapa mental:** curva orgânica que sai do bloco pai e **afina** conforme se afasta (como na referência), em vez da curva uniforme de hoje.
34. Barra do bloco, controles do canto e cabeçalho reorganizados: agrupamento por assunto, ícones consistentes, sombras e cantos coerentes, estados de foco e de "pressionado" claros.
35. Os dois editores usam **o mesmo sistema visual** (mesmos espaçamentos, raios, sombras, ícones e componentes).

### Não funcionais

- Continua fluido com **1.000+ blocos**: aplicar tema, arrastar e trocar fonte não podem travar o editor.
- Todo texto mantém contraste **WCAG AA (4,5:1)** nos temas prontos — a verificação é automatizada em teste.
- As fontes são servidas pelo próprio site (nada de CDN externo), respeitando a CSP restritiva já em vigor.
- O seletor de cor funciona por teclado e tem rótulos acessíveis.
- Quem prefere menos animação (`prefers-reduced-motion`) não recebe as transições novas.
- Nenhuma cor vinda do documento chega ao CSS sem validação (`#RRGGBB`), como já é hoje.

## 6. Critérios de aceite

- [ ] Dado um bloco com filhos, quando o arrasto, então a linha até o pai continua visível e acompanha, e os filhos **não** saem do lugar.
- [ ] Dado o mesmo bloco, quando arrasto segurando `Shift`, então o ramo inteiro vai junto e fica destacado durante o arrasto.
- [ ] Dado que arrasto a raiz, então o mapa inteiro se move.
- [ ] Dado um bloco com filhos e um pai novo fora da tela, quando clico na linha, corto, arrasto o quadro até o outro lado do mapa e clico no bloco desejado, então o bloco e o ramo dele passam a pertencer a esse pai, com texto, notas e cores intactos, e `Ctrl+Z` devolve tudo ao pai anterior.
- [ ] Dado que cortei uma ligação, quando aperto `Esc`, então nada muda no documento e o mapa volta ao normal.
- [ ] Dado que cortei uma ligação, quando tento religar o bloco num descendente dele, então a interface não deixa e o mapa continua íntegro (uma raiz só, sem ciclo).
- [ ] Dado um bloco selecionado, quando aperto `Ctrl+X`, seleciono outro bloco e aperto `Ctrl+V`, então o ramo muda de pai numa única ação de desfazer.
- [ ] Dado um bloco selecionado, quando abro as cores e digito `#7C3AED`, então o bloco fica dessa cor exata, e a cor entra em "recentes".
- [ ] Dado um preenchimento escuro, então o texto sugerido é claro; se eu escolher um texto escuro mesmo assim, aparece o aviso de legibilidade e a cor é aceita.
- [ ] Dado um documento, quando escolho a fonte "Caderno" (manuscrita), então todos os blocos mudam de fonte para mim e para o colega conectado.
- [ ] Dado um documento, quando aplico o tema "Oceano", então paleta, fundo, fonte e traço mudam de uma vez, um colega vê o mesmo, e `Ctrl+Z` volta tudo ao que era.
- [ ] Dado um bloco que eu havia pintado à mão, quando aplico um tema, então ele mantém a minha cor, salvo se eu usar "Aplicar e limpar as cores manuais".
- [ ] Dado um documento com tema escuro, quando exporto o PNG, então o PNG sai com o fundo escuro.
- [ ] Dado um Leitor, então ele vê o tema, as fontes e as cores, e **não** consegue alterá-los (nem pela API nem forjando mensagem no tempo real).
- [ ] Dado um documento criado antes desta entrega, quando o abro, então ele aparece com o tema Paglamp e nada mudou de lugar.
- [ ] Dado um mapa com 1.000 blocos, quando aplico um tema, então a troca acontece sem travar e em uma única ação de desfazer.

## 7. Permissões

| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Aplicar tema ao documento | ✔ | ✔ | — | — |
| Trocar fonte e fundo do quadro | ✔ | ✔ | — | — |
| Trocar cor de contorno / preenchimento / texto de um bloco | ✔ | ✔ | — | — |
| Arrastar blocos, mover ramo, organizar | ✔ | ✔ | — | — |
| Cortar a ligação e religar em outro pai | ✔ | ✔ | — | — |
| Ver o documento com o tema aplicado | ✔ | ✔ | ✔ | ✔ |

## 8. Fora de escopo

- Painel de documentos, pastas, login e administração: **não** entram neste redesenho (ficam como estão).
- Ícones e emoji dentro dos blocos (a referência tem; vira PRD próprio).
- Imagens, anexos ou papel de parede no fundo do quadro.
- Criar e salvar **temas próprios** da empresa (só os prontos, por enquanto).
- Tamanho de fonte por bloco e edição de texto rica (negrito já existe; itálico, sublinhado etc. ficam fora).
- Escolher o estilo da linha por conector no mapa mental (reta, cotovelo) — o tema define.
- Cortar um ramo de um documento e colar em **outro** documento (o `Ctrl+X`/`Ctrl+V` vale dentro do mesmo mapa).
- Ligações cruzadas no mapa mental (um bloco com dois pais) — a árvore continua com um pai por bloco.
- Tema da interface fora do quadro (cabeçalho, diálogos) continua seguindo o sistema operacional.

## 9. Perguntas em aberto

Respondidas pelo usuário em 2026-09-22, antes deste rascunho:
- [x] "O bloco da frente também se move" → arrastar passa a mover **só o bloco** (§5.2), com `Shift` para o ramo.
- [x] Onde o tema fica guardado → **no documento** (§5.30), visível igual para todos.
- [x] Fontes → **lista curada** embutida (§5.20), sem tamanho por bloco.
- [x] Alcance do redesenho → **editor de mapa mental e editor de fluxograma** (§5.35); painel e login ficam fora.


