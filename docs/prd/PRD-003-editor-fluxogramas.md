# PRD-003 — Editor de diagramas: fluxogramas

| Campo | Valor |
|---|---|
| Status | Rascunho |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | (quando existir) |

## 1. Problema
Hoje só existem mapas mentais, que são sempre uma árvore a partir de um tópico central. A equipe também precisa desenhar **processos** (atendimento, compras, produção, aprovação), com decisões "sim/não", caminhos que se juntam e voltam — coisa que uma árvore não representa. Para isso usam ferramentas externas ou papel.

## 2. Objetivo
Criar **fluxogramas** dentro da mesma ferramenta, com o mesmo login, compartilhamento, edição simultânea e salvamento automático dos mapas mentais. Tudo feito com o mouse (arrastar formas, puxar setas) e com atalhos para quem prefere teclado.

Sucesso = a equipe desenha um processo real da empresa (ex.: fluxo de pedido) com decisões e setas sem sair da ferramenta.

## 3. Usuários afetados
Todos os colaboradores.

## 4. Histórias de usuário
1. Como **colaborador**, quero escolher no painel entre "Novo mapa mental" e "Novo fluxograma".
2. Como **editor**, quero arrastar formas de uma paleta lateral (ou clicar nelas) para colocá-las no quadro.
3. Como **editor**, quero mover as formas livremente, com encaixe numa grade para ficar alinhado, e mudar o tamanho delas.
4. Como **editor**, quero ligar duas formas puxando uma seta a partir da borda de uma até a outra.
5. Como **editor**, quero puxar uma seta de uma forma e soltar no vazio para criar a próxima forma já ligada.
6. Como **editor**, quero escrever texto dentro das formas e nas setas (ex.: "Sim" / "Não" saindo de uma decisão).
7. Como **editor**, quero mudar cor de fundo, cor da borda e estilo da seta (reta, em ângulo reto, curva, tracejada).
8. Como **editor**, quero selecionar várias formas (arrastando uma caixa ou com Shift+clique) e mover, copiar, colar, duplicar ou apagar todas de uma vez.
9. Como **editor**, quero um botão "Organizar" que arruma o fluxo automaticamente de cima para baixo.
10. Como **editor**, quero desfazer e refazer, ver os colegas editando junto e exportar como PNG.

## 5. Requisitos
### Funcionais
1. **Painel:** botão "Novo" com duas opções (mapa mental / fluxograma). As abas passam a se chamar "Meus documentos", "Compartilhados comigo" e "Lixeira", com um ícone mostrando o tipo de cada documento e filtro por tipo. Renomear, duplicar, lixeira, compartilhar e busca funcionam igual aos mapas.
2. **Formas disponíveis:** Processo (retângulo), Início/Fim (cápsula arredondada), Decisão (losango), Entrada/Saída (paralelogramo), Documento, Banco de dados (cilindro), Sub-processo, Texto livre (sem borda) e Nota (post-it amarelo).
3. **Adicionar forma:** arrastar da paleta até o quadro, ou clicar na forma da paleta (entra no centro da tela, ou ligada à forma selecionada, logo abaixo dela).
4. **Mover e redimensionar:** posição livre com encaixe numa grade (dá para desligar o encaixe segurando Alt). Alças de redimensionar na forma selecionada. Guias de alinhamento aparecem quando a forma fica alinhada com outra.
5. **Conectores (setas):** cada forma tem pontos de conexão nos quatro lados. Puxar de um ponto até outra forma cria a seta. Soltar no vazio abre um mini menu para escolher qual forma criar ali, já ligada. Seta com ponta no fim (opção: sem ponta, ponta nos dois lados), rótulo de texto opcional, estilo reto / em ângulo reto / curvo, contínuo ou tracejado. Dá para reconectar a ponta de uma seta arrastando.
6. **Texto:** duplo clique na forma ou na seta edita o texto; digitar com a forma selecionada também começa a editar. Texto quebra linha dentro da forma.
7. **Estilo:** barra flutuante na forma selecionada com cor de fundo, cor da borda, negrito, e apagar. Para setas: estilo da linha, ponta e cor.
8. **Seleção múltipla:** caixa de seleção arrastando no fundo, Shift+clique, Ctrl+A. Mover, apagar, copiar (Ctrl+C), colar (Ctrl+V) e duplicar (Ctrl+D) o grupo. Colar funciona entre fluxogramas diferentes abertos pelo mesmo usuário.
9. **Organizar automaticamente:** botão que reposiciona tudo de cima para baixo seguindo as setas. É desfazível com um Ctrl+Z.
10. **Regras de integridade:** toda seta liga duas formas que existem; apagar uma forma apaga as setas dela.
11. **Atalhos:** Delete/Backspace apaga, setas do teclado movem a seleção (Shift = passo maior), Ctrl+Z / Ctrl+Shift+Z, Ctrl+C/V/D, Ctrl+A, Esc tira a seleção/sai da edição. Não disparam com o foco num campo de texto.
12. **Igual aos mapas:** edição simultânea com presença, salvamento automático com status, desfazer só o que eu fiz, export PNG, zoom/centralizar, somente leitura para Leitor e Comentador imposta no servidor.

### Não funcionais
- Fluido com 500+ formas e setas num notebook comum.
- Chrome, Edge e Firefox atuais; desktop primeiro.
- Toda a checklist de segurança do CLAUDE.md (texto sempre renderizado como texto).

## 6. Critérios de aceite
- [ ] Dado o painel, quando o usuário clica em "Novo fluxograma", então abre um quadro vazio com a paleta de formas.
- [ ] Dado o quadro, quando o usuário arrasta uma Decisão e puxa duas setas rotuladas "Sim" e "Não" para duas formas, então o fluxo aparece igual para um colega que está com o documento aberto.
- [ ] Dado uma forma com 3 setas, quando é apagada, então as 3 setas somem junto e Ctrl+Z traz tudo de volta.
- [ ] Dado um fluxo bagunçado, quando o usuário clica em "Organizar", então as formas ficam de cima para baixo sem sobreposição, e Ctrl+Z volta ao que era.
- [ ] Dado um Leitor, quando abre o fluxograma, então não consegue mover, criar nem apagar nada, nem forjando mensagens no WebSocket.
- [ ] Dado um usuário sem acesso, quando tenta abrir o fluxograma pelo ID, então recebe "não encontrado".
- [ ] Dado um fluxograma, quando exportado, então gera um PNG com todas as formas e setas.
- [ ] A busca do painel encontra um fluxograma pelo texto de uma forma.

## 7. Permissões
Iguais às do mapa mental (PRD-001 §7):

| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Ver / exportar PNG | ✔ | ✔ | ✔ | ✔ |
| Editar formas e setas | ✔ | ✔ | — | — |
| Renomear / duplicar | ✔ | ✔ | duplicar | duplicar |
| Compartilhar / mudar papéis | ✔ | — | — | — |
| Lixeira / apagar | ✔ | — | — | — |

## 8. Fora de escopo
- Organograma e processo em raias (swimlanes) — PRDs futuros.
- Converter mapa mental em fluxograma (ou o contrário).
- Imagens, ícones personalizados ou formas desenhadas pelo usuário.
- Export SVG/PDF e import de draw.io/Visio.
- Várias páginas dentro do mesmo fluxograma.

## 9. Perguntas em aberto
- [ ] A lista de formas do §5.2 cobre o que a equipe usa? Falta alguma (ex.: "Espera/Atraso", "Conector de página")?
- [ ] Renomear as abas do painel para "Meus documentos" está ok, ou prefere manter "Meus mapas"?
