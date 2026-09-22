# PRD-005 — Histórico de versões

| Campo | Valor |
|---|---|
| Status | Rascunho |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | (quando existir) |

## 1. Problema
Como tudo salva sozinho e várias pessoas editam juntas, um erro (apagar um ramo grande sem querer, um colega que reorganiza tudo) fica gravado na hora. O desfazer só volta as **minhas** alterações e some ao fechar a aba. Não há como voltar o documento para como estava ontem.

## 2. Objetivo
Ver versões antigas de qualquer mapa ou fluxograma e **restaurar** uma delas com segurança, sem nunca perder histórico.

Sucesso = alguém apaga metade de um mapa sem querer e o dono recupera tudo em menos de 1 minuto.

## 3. Usuários afetados
Donos e editores de documentos (e, conforme decisão abaixo, leitores).

## 4. Histórias de usuário
1. Como **editor**, quero abrir o painel "Histórico" e ver a lista de versões com data, hora e quem editou.
2. Como **editor**, quero clicar numa versão e ver como o documento estava, sem alterar o atual.
3. Como **editor**, quero restaurar uma versão antiga, sabendo que o estado atual também fica guardado.
4. Como **editor**, quero salvar uma versão com nome (ex.: "Aprovado pela diretoria") para achá-la fácil depois.
5. Como **colaborador**, quero criar um documento novo a partir de uma versão antiga ("Salvar como cópia").

## 5. Requisitos
### Funcionais
1. **Versão automática:** enquanto o documento está sendo editado, uma versão é guardada a cada 10 minutos (só se algo mudou), e sempre que a última pessoa sai do documento.
2. **Versão antes de operações grandes:** antes de restaurar uma versão e antes de "Organizar automaticamente" (PRD-003).
3. **Versão com nome:** botão "Salvar versão" pede um nome (até 80 caracteres).
4. **Lista:** mais recente primeiro, com data/hora, nome (se tiver) e nomes de quem editou naquele intervalo.
5. **Visualizar:** abre a versão em modo somente leitura, com aviso claro "Você está vendo a versão de 21/09 às 14:30", e botões "Restaurar esta versão", "Salvar como cópia" e "Voltar ao atual".
6. **Restaurar:** guarda o estado atual como versão ("Antes de restaurar…"), depois substitui o conteúdo. Quem estiver com o documento aberto vê a mudança na hora. Restaurar **nunca** apaga versões.
7. **Salvar como cópia:** cria um documento novo com o conteúdo daquela versão; quem fez vira dono da cópia.
8. **Retenção:** versões com nome ficam para sempre. Versões automáticas: todas dos últimos 30 dias; depois disso, uma por dia até 1 ano; mais antigas que 1 ano são removidas.
9. Mandar o documento para a lixeira não apaga o histórico; restaurar da lixeira traz o histórico junto. Apagar definitivamente apaga o histórico.

### Não funcionais
- Abrir a lista e visualizar uma versão em até 2 s num documento de 1.000 nós.
- As versões não podem fazer o banco crescer sem controle (retenção do §5.8 + limite de tamanho por documento).

## 6. Critérios de aceite
- [ ] Dado um mapa em que alguém apagou um ramo, quando o editor restaura a versão de antes, então o ramo volta para todos que estão com o mapa aberto, e a versão "Antes de restaurar" aparece na lista.
- [ ] Dado uma versão sendo visualizada, quando o usuário tenta editar, então nada muda no documento atual.
- [ ] Dado um usuário sem acesso ao documento, quando tenta listar ou abrir versões (mesmo trocando IDs), então recebe "não encontrado".
- [ ] Dado um Comentador ou Leitor, quando tenta restaurar pela API, então é recusado.
- [ ] Dado 10 minutos de edição contínua, então existe uma versão automática nova.
- [ ] Salvar como cópia a partir de uma versão cria um documento meu, sem mexer no original.

## 7. Permissões
| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Ver lista e visualizar versões | ✔ | ✔ | ✔ | ✔ |
| Salvar versão com nome | ✔ | ✔ | — | — |
| Restaurar versão | ✔ | ✔ | — | — |
| Salvar versão como cópia | ✔ | ✔ | ✔ | ✔ |
| Renomear / apagar versão com nome | ✔ | — | — | — |

ADMIN não vê versões de documentos em que não é membro.

## 8. Fora de escopo
- Comparar duas versões lado a lado destacando o que mudou.
- Histórico detalhado "quem mudou cada bloco" (linha do tempo por alteração).
- Restaurar só um ramo/pedaço de uma versão.

## 9. Perguntas em aberto
- [ ] Leitores e Comentadores podem ver versões antigas? (Proposta acima: **sim**, pois já têm acesso ao documento. Mas uma versão antiga pode conter algo que o dono apagou de propósito — se isso for um problema, restringimos a Dono e Editor.)
- [ ] Editor pode restaurar, ou só o Dono?
- [ ] A retenção do §5.8 está boa?
