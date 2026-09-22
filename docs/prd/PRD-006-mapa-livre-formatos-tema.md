# PRD-006 — Mapa mental com posição livre, formatos de bloco e modo claro/escuro

| Campo | Valor |
|---|---|
| Status | Rascunho |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | (quando existir) |

## 1. Problema
- No mapa mental, a posição de cada bloco é sempre calculada automaticamente. Arrastar um bloco só serve para trocá-lo de pai ou de ordem: ao soltar, ele volta para onde o layout manda. Quem quer arrumar o mapa do seu jeito não consegue.
- Todo bloco tem o mesmo formato (retângulo arredondado), então não dá para destacar tipos de ideia pelo formato.
- A interface segue o tema do sistema operacional. Quem usa o Windows em modo escuro vê o quadro escuro e não tem como trocar para um quadro branco, que é melhor para apresentar, imprimir e para quem prefere.

## 2. Objetivo
- Arrastar qualquer bloco do mapa e ele **ficar onde foi solto**, levando junto os filhos.
- Escolher o **formato** de cada bloco.
- Um **botão de alternância claro/escuro** sempre à mão.

Sucesso = um colaborador arruma o mapa do jeito dele, destaca blocos com formatos diferentes e apresenta num quadro branco mesmo com o Windows no escuro.

## 3. Usuários afetados
Todos os colaboradores. O tema vale para todo mundo; posição e formato valem para quem edita (Dono e Editor).

## 4. Histórias de usuário
1. Como **editor**, quero arrastar um bloco para qualquer lugar do quadro e ele ficar lá, com os filhos indo junto.
2. Como **editor**, quero continuar podendo trocar um bloco de pai, soltando-o em cima de outro bloco.
3. Como **editor**, quero um botão "Organizar automaticamente" que volta o mapa (ou só um ramo) para o layout automático.
4. Como **editor**, quero escolher o formato de um bloco: retângulo arredondado, cápsula, retângulo, elipse, hexágono ou só sublinhado.
5. Como **colaborador**, quero um botão para alternar entre modo claro e escuro, que fica lembrado da próxima vez.

## 5. Requisitos
### Funcionais
**A. Posição livre no mapa mental**
1. Arrastar um bloco e soltá-lo no vazio: o bloco **fica onde foi solto**, e todo o ramo dele (filhos, netos...) se move junto, mantendo o desenho relativo.
2. Soltar um bloco **em cima de outro** continua fazendo dele filho daquele bloco (como hoje). Enquanto arrasta, o bloco-alvo fica destacado, para ficar claro o que vai acontecer.
3. A **ordem entre irmãos** passa a seguir o teclado (setas ↑/↓) e os comandos "Mover para cima/para baixo" da barra do bloco, e não mais o arrasto: o arrasto agora é para posicionar.
4. Um bloco criado depois (filho ou irmão) aparece na posição automática, perto do pai, mesmo que o pai tenha sido movido à mão.
5. **Organizar automaticamente:**
   - na barra de controles: volta **todo** o mapa para o layout automático;
   - na barra do bloco: volta **só aquele ramo**.

   É desfazível com Ctrl+Z.
6. A raiz também pode ser arrastada, e arrastá-la move o mapa inteiro.
7. As posições são do documento: todos os colegas veem o mesmo desenho, e ele sincroniza em tempo real (ao soltar).
8. Mover e organizar entram no desfazer/refazer.

**B. Formatos de bloco**
9. Formatos: **Arredondado** (padrão atual), **Cápsula**, **Retângulo**, **Elipse**, **Hexágono** e **Sublinhado** (sem caixa, só uma linha embaixo do texto, como no MindMeister).
10. O formato é escolhido na barra flutuante do bloco (ao lado da cor). Vale só para aquele bloco; os filhos não herdam.
11. A cor do ramo continua valendo para a borda de qualquer formato.

**C. Modo claro / escuro**
12. Um **interruptor** (sol/lua) na barra do editor e no topo do painel alterna entre **Claro** e **Escuro**.
13. A primeira vez segue o tema do sistema; depois de usar o interruptor, a escolha fica **lembrada neste navegador**.
14. Vale para toda a interface: painel, editor de mapa e de fluxograma.
15. É uma preferência **só minha**: não muda nada para os colegas nem no documento.
16. O PNG exportado usa o fundo do tema que está em uso.

### Não funcionais
- Continua fluido com 1.000+ blocos: arrastar um ramo grande não pode travar.
- O interruptor tem rótulo acessível ("Mudar para modo claro/escuro").
- Nos dois temas, o contraste do texto é legível (WCAG AA).

## 6. Critérios de aceite
- [ ] Dado um mapa, quando arrasto um bloco para o vazio e solto, então ele e os filhos ficam naquela posição, e um colega vê a mesma posição.
- [ ] Dado que solto um bloco em cima de outro, então ele vira filho do bloco de destino.
- [ ] Dado um mapa com blocos movidos à mão, quando clico em "Organizar automaticamente", então tudo volta ao layout automático, e Ctrl+Z desfaz.
- [ ] Dado um bloco movido à mão, quando crio um filho nele, então o filho aparece perto dele, sem sobrepor.
- [ ] Dado um bloco, quando escolho "Elipse", então ele vira elipse para todos que estão no mapa.
- [ ] Dado o Windows em modo escuro, quando ligo o modo claro, então o quadro fica branco, e continua branco ao recarregar a página.
- [ ] Dado um Leitor, então ele não consegue mover blocos nem trocar formatos, mas consegue trocar o próprio tema.

## 7. Permissões
| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Mover blocos / organizar automaticamente | ✔ | ✔ | — | — |
| Trocar formato do bloco | ✔ | ✔ | — | — |
| Trocar o próprio tema (claro/escuro) | ✔ | ✔ | ✔ | ✔ |

## 8. Fora de escopo
- Ícones/emoji dentro dos blocos (✔, ⚠, ★...) — podem virar um PRD próprio.
- Temas de cor do mapa (paletas prontas, fundo colorido do quadro).
- Tema salvo na conta do usuário (fica no navegador por enquanto).
- Linhas de ligação personalizadas (reta, curva, cotovelo) no mapa mental.

## 9. Perguntas em aberto
- [ ] "Ícones de formas diferentes": entendi como **formatos de bloco** (§5.B). Se você quis dizer **ícones/emoji dentro do bloco** (✔, ⚠, ★, 🔥), me diga e eu incluo aqui.
- [ ] Hoje arrastar entre irmãos troca a ordem. Com a posição livre, o arrasto passa a só posicionar, e a ordem vai para o teclado e a barra (§5.3). Está ok?
- [ ] O tema vale para a interface inteira (§5.14), ou você quer trocar **só o quadro** e manter o resto como está?
