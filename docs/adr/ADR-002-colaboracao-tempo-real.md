# ADR-002 — Colaboração em tempo real e armazenamento do documento

| Campo | Valor |
|---|---|
| Status | Aceito |
| Data | 2026-09-21 |

## Contexto
Várias pessoas precisam editar o mesmo mapa ao mesmo tempo, sem conflito e sem perder alteração. Também queremos funcionar bem com conexão instável e ter histórico de versões.

## Decisão
- O conteúdo de cada documento é um **Y.Doc (Yjs, CRDT)**. Sincronização via **Hocuspocus** (servidor WebSocket do Yjs, MIT), rodando dentro do processo da API em `/collab`.
- Estrutura interna do Y.Doc:
  - `nodes: Y.Map<id, Y.Map>` — lista **plana** de nós (`parentId`, `order`, `text`, `style`, `collapsed`, posição no caso de diagrama).
  - `edges: Y.Map<id, Y.Map>` — conectores (diagramas e ligações cruzadas em mapas).
  - `meta: Y.Map` — tema, layout, título.
- Persistência: estado binário do Yjs salvo em `Document.yState` (`bytea`) com debounce pela extensão de banco do Hocuspocus. Metadados (título, dono, pasta, datas) ficam em colunas normais para listagem/busca.
- Versões: tabela `DocumentSnapshot` com cópias do estado binário.
- Autorização: hook `onAuthenticate` valida o cookie de sessão e o papel do usuário no documento; `VIEWER`/`COMMENTER` recebem conexão `readOnly`.
- Uma única instância da API por enquanto. Se precisar escalar horizontalmente, adicionar Redis com a extensão `@hocuspocus/extension-redis` (novo ADR).

## Alternativas consideradas
| Opção | Prós | Contras |
|---|---|---|
| Salvar JSON via REST + "último a salvar vence" | Simples | Perde edições concorrentes; sem tempo real |
| Operational Transform próprio | Controle total | Complexo e fácil de errar |
| Automerge | CRDT maduro | Ecossistema de servidor/React menor que o do Yjs |
| Liveblocks / serviços SaaS | Pronto | Dados da empresa em terceiro, custo recorrente |

## Consequências
- Edição offline e desfazer por usuário (`Y.UndoManager`) vêm quase de graça.
- O conteúdo do documento não é consultável por SQL diretamente; busca em texto de nós exigirá uma coluna derivada (`searchText`) atualizada na persistência.
- Todo acesso ao documento passa pelo Hocuspocus — é ali que a autorização tem que estar certa.
