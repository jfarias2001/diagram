# PRD-001 — MVP: login, painel e editor de mapas mentais colaborativo

| Campo | Valor |
|---|---|
| Status | **Implementado** (2026-09-21) |
| Autor | Claude (a partir da conversa inicial) |
| Data | 2026-09-21 |
| SPEC | [SPEC-001](../spec/SPEC-001-mvp-mapas-mentais.md) |

## 1. Problema
A equipe precisa organizar ideias, processos e planejamentos em mapas mentais compartilhados. Ferramentas SaaS como o MindMeister cobram por usuário e guardam os dados da empresa em terceiros.

## 2. Objetivo
Ter uma ferramenta interna em `diagram.paglamp.com.br` onde qualquer colaborador entra com seu e-mail da empresa, cria mapas mentais, edita com o teclado tão rápido quanto no MindMeister e compartilha com colegas, que editam junto em tempo real.

Sucesso = a equipe consegue substituir o uso do MindMeister no dia a dia.

## 3. Usuários afetados
- Colaboradores (criam e editam documentos).
- Administrador (cria/desativa contas).

## 4. Histórias de usuário
1. Como **admin**, quero criar manualmente o acesso de um colaborador (nome + e-mail) e receber uma senha provisória para repassar a ele; no primeiro login ele troca a senha. Também quero redefinir a senha e desativar acessos.
2. Como **colaborador**, quero entrar com e-mail e senha e sair quando quiser.
3. Como **colaborador**, quero ver no painel os mapas que criei e os que foram compartilhados comigo, com busca por título.
4. Como **colaborador**, quero criar um mapa novo, renomear, duplicar e mandar para a lixeira.
5. Como **colaborador**, quero editar o mapa só com o teclado: `Tab` cria filho, `Enter` cria irmão, `Delete` apaga, setas navegam, digitar edita o texto.
6. Como **colaborador**, quero arrastar um nó para mudar de pai ou de ordem, e colapsar/expandir ramos.
7. Como **colaborador**, quero mudar a cor de um nó/ramo e deixar texto em negrito.
8. Como **colaborador**, quero desfazer e refazer minhas alterações.
9. Como **dono**, quero compartilhar o mapa com colegas escolhendo o papel (Editor, Comentador, Leitor), e remover o acesso depois.
10. Como **editor**, quero ver as alterações dos colegas aparecendo na hora e saber quem está no mapa.
11. Como **colaborador**, quero que tudo salve sozinho e ver o status (Salvando / Salvo / Offline).
12. Como **colaborador**, quero exportar o mapa como PNG.

## 5. Requisitos
### Funcionais
1. Sem cadastro público; todo acesso é criado manualmente por um admin. O primeiro admin é criado automaticamente na instalação.
2. Painel com "Meus mapas", "Compartilhados comigo" e "Lixeira" (restaurar em até 30 dias).
3. Editor de mapa mental com layout automático (raiz no centro, ramos para os dois lados).
4. Compartilhamento por usuário com papéis OWNER/EDITOR/COMMENTER/VIEWER.
5. Edição simultânea com indicador de presença (avatares de quem está no mapa).
6. Autosave; sem botão salvar.
7. Export PNG.

### Não funcionais
- Fluido com 1.000 nós num notebook comum.
- Chrome, Edge e Firefox atuais; desktop primeiro (tablet/celular só leitura aceitável no MVP).
- Toda a checklist de segurança do CLAUDE.md.

## 6. Critérios de aceite
- [x] Um usuário não consegue abrir, nem pela API nem pelo WebSocket, um mapa que não foi compartilhado com ele (mesmo sabendo o ID).
- [x] Um Leitor não consegue alterar o mapa nem forjando mensagens no WebSocket.
- [x] Dois usuários editando nós diferentes ao mesmo tempo não perdem nenhuma alteração.
- [x] Fechar a aba logo após digitar não perde o texto (salvo em até 2 s).
- [x] Todos os atalhos da história 5 funcionam.
- [x] Remover o acesso de alguém tira essa pessoa do mapa aberto em até alguns segundos.

## 7. Permissões
| Ação | OWNER | EDITOR | COMMENTER | VIEWER |
|---|---|---|---|---|
| Ver | ✔ | ✔ | ✔ | ✔ |
| Editar conteúdo | ✔ | ✔ | — | — |
| Renomear / duplicar | ✔ | ✔ (duplicar vira dono da cópia) | duplicar | duplicar |
| Compartilhar / mudar papéis | ✔ | — | — | — |
| Lixeira / apagar | ✔ | — | — | — |

## 8. Fora de escopo (próximos PRDs)
- Editor de **diagramas** (fluxograma, organograma) — PRD-002.
- Comentários em nós, histórico de versões com restauração, pastas, templates.
- Import (.mm, .xmind, OPML) e export PDF/SVG/Markdown.
- Anexos e imagens em nós.
- Login SSO Google/Microsoft.
- Link público de compartilhamento.

## 9. Perguntas em aberto
Respondidas pelo usuário em 2026-09-21:
- [x] Restrição por domínio de e-mail? → **Não.** Como só o admin cria acessos, o e-mail é apenas o identificador de login e pode ser de qualquer provedor.
- [x] Google Workspace ou Microsoft 365? → **Nenhum.** Sem SSO; acessos criados manualmente pelo admin.
- [x] Como escolher com quem compartilhar? → **Digitando o e-mail** do colega (sem lista de usuários).
- [x] Espaço da equipe? → **Não precisa.** Só compartilhamento individual.
