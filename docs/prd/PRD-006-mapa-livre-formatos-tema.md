# PRD-006 — Mapa mental com posição livre, formatos e cores de bloco, e tema do quadro

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-22) |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | [SPEC-006](../spec/SPEC-006-mapa-livre-formatos-tema.md) |

## 1. Problema
- No mapa mental, a posição de cada bloco é sempre calculada automaticamente. Arrastar um bloco só serve para trocá-lo de pai ou de ordem: ao soltar, ele volta para onde o layout manda. Quem quer arrumar o mapa do seu jeito não consegue.
- Todo bloco tem o mesmo formato (retângulo arredondado) e o mesmo fundo, então não dá para destacar tipos de ideia nem para dar contraste a um bloco importante.
- O quadro segue o tema do sistema operacional. Quem usa o Windows em modo escuro vê o quadro escuro e não tem como deixá-lo branco, que é melhor para apresentar e imprimir.

## 2. Objetivo
- Arrastar qualquer bloco do mapa e ele **ficar onde foi solto**, levando junto os filhos.
- Escolher o **formato** e a **cor de preenchimento** de cada bloco.
- Um **interruptor claro/escuro do quadro** sempre à mão, sem mexer no resto da interface.

Sucesso = um colaborador arruma o mapa do jeito dele, destaca blocos com formatos e cores diferentes e apresenta num quadro branco mesmo com o Windows no escuro.

## 3. Usuários afetados
Todos os colaboradores. O tema do quadro vale para quem estiver olhando; posição, formato e cor valem para quem edita (Dono e Editor).

## 4. Histórias de usuário
1. Como **editor**, quero arrastar um bloco para qualquer lugar do quadro e ele ficar lá, com os filhos indo junto.
2. Como **editor**, quero continuar podendo trocar um bloco de pai, soltando-o em cima de outro bloco.
3. Como **editor**, quero um botão "Organizar automaticamente" que volta o mapa (ou só um ramo) para o layout automático.
4. Como **editor**, quero escolher o formato de um bloco: retângulo arredondado, cápsula, retângulo, elipse, hexágono ou só sublinhado.
5. Como **editor**, quero pintar o fundo de um bloco, para destacá-lo e para ele ficar legível em qualquer quadro.
6. Como **colaborador**, quero um botão para alternar o quadro entre claro e escuro, que fica lembrado da próxima vez.

## 5. Requisitos
### Funcionais
**A. Posição livre no mapa mental**
1. Arrastar um bloco e soltá-lo no vazio: o bloco **fica onde foi solto**, e todo o ramo dele (filhos, netos...) se move junto, mantendo o desenho relativo.
2. Soltar um bloco **em cima de outro** continua fazendo dele filho daquele bloco (como hoje). Enquanto arrasta, o bloco-alvo fica destacado, para ficar claro o que vai acontecer.
3. A **ordem entre irmãos** passa a seguir o teclado e os comandos "Mover para cima/para baixo" da barra do bloco, e não mais o arrasto: o arrasto agora é para posicionar.
4. Um bloco criado depois (filho ou irmão) aparece na posição automática, perto do pai, mesmo que o pai tenha sido movido à mão.
5. **Organizar automaticamente:**
   - na barra de controles: volta **todo** o mapa para o layout automático;
   - na barra do bloco: volta **só aquele ramo**.

   É desfazível com Ctrl+Z.
6. A raiz também pode ser arrastada, e arrastá-la move o mapa inteiro.
7. As posições são do documento: todos os colegas veem o mesmo desenho, e ele sincroniza em tempo real (ao soltar).
8. Mover e organizar entram no desfazer/refazer.

**B. Formato e cor do bloco**
9. Formatos: **Arredondado** (padrão atual), **Cápsula**, **Retângulo**, **Elipse**, **Hexágono** e **Sublinhado** (sem caixa, só uma linha embaixo do texto, como no MindMeister).
10. O formato é escolhido na barra flutuante do bloco. Vale só para aquele bloco; os filhos não herdam.
11. A cor do ramo continua valendo para a **borda** e para a linha de ligação de qualquer formato.
12. Cada bloco pode ter uma **cor de preenchimento** própria, escolhida numa paleta com a opção "Auto" (volta ao fundo padrão do quadro). Vale só para aquele bloco; os filhos não herdam.
13. O texto do bloco pintado escolhe sozinho entre escuro e claro, para continuar legível (contraste WCAG AA) tanto num fundo claro quanto num escuro.

**C. Modo claro / escuro do quadro**
14. Um **interruptor** (sol/lua) na barra do editor alterna o **quadro** entre **Claro** e **Escuro**. O resto da interface (painel de documentos, barras, diálogos) continua seguindo o tema do sistema — a troca é **só do quadro**.
15. A primeira vez, o quadro segue o tema do sistema; depois de usar o interruptor, a escolha fica **lembrada neste navegador**.
16. Vale para os dois editores: mapa mental e fluxograma.
17. É uma preferência **só minha**: não muda nada para os colegas nem no documento.
18. O PNG exportado usa o fundo do quadro que está em uso.

### Não funcionais
- Continua fluido com 1.000+ blocos: arrastar um ramo grande não pode travar.
- O interruptor tem rótulo acessível ("Mudar o quadro para o modo claro/escuro").
- Nos dois temas do quadro, o contraste do texto é legível (WCAG AA), inclusive nos blocos pintados.

## 6. Critérios de aceite
- [ ] Dado um mapa, quando arrasto um bloco para o vazio e solto, então ele e os filhos ficam naquela posição, e um colega vê a mesma posição.
- [ ] Dado que solto um bloco em cima de outro, então ele vira filho do bloco de destino.
- [ ] Dado um mapa com blocos movidos à mão, quando clico em "Organizar automaticamente", então tudo volta ao layout automático, e Ctrl+Z desfaz.
- [ ] Dado um bloco movido à mão, quando crio um filho nele, então o filho aparece perto dele, sem sobrepor.
- [ ] Dado um bloco, quando escolho "Elipse", então ele vira elipse para todos que estão no mapa.
- [ ] Dado um bloco pintado de azul-escuro, então o texto dele aparece claro, e pintado de amarelo-claro, aparece escuro.
- [ ] Dado o Windows em modo escuro, quando ligo o quadro claro, então o quadro fica branco (o painel continua escuro), e continua branco ao recarregar a página.
- [ ] Dado um Leitor, então ele não consegue mover blocos, trocar formatos nem cores, mas consegue trocar o tema do próprio quadro.

## 7. Permissões
| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Mover blocos / organizar automaticamente | ✔ | ✔ | — | — |
| Trocar formato e cor do bloco | ✔ | ✔ | — | — |
| Trocar o tema do próprio quadro (claro/escuro) | ✔ | ✔ | ✔ | ✔ |

## 8. Fora de escopo
- Ícones/emoji dentro dos blocos (✔, ⚠, ★...) — podem virar um PRD próprio.
- Tema claro/escuro do restante da interface (painel, diálogos) — continua seguindo o sistema.
- Temas de cor prontos do mapa (paletas, fundo colorido do quadro).
- Tema salvo na conta do usuário (fica no navegador por enquanto).
- Linhas de ligação personalizadas (reta, curva, cotovelo) no mapa mental.

## 9. Perguntas em aberto
Respondidas pelo usuário em 2026-09-22:
- [x] "Ícones de formas diferentes" → é o **formato do bloco** (§5.B), como proposto.
- [x] Arrasto passa a só posicionar, e a ordem entre irmãos vai para o teclado e a barra (§5.3) → **ok**.
- [x] Alcance do tema → **só o quadro** (§5.14); o resto da interface fica como está.
- [x] Pedido junto da aprovação: **cor de preenchimento do bloco** (§5.12 e §5.13), para dar contraste em qualquer quadro.
