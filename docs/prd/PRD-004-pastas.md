# PRD-004 — Pastas no painel

| Campo | Valor |
|---|---|
| Status | Rascunho |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | (quando existir) |

## 1. Problema
Com o tempo cada colaborador acumula dezenas de mapas e fluxogramas, próprios e compartilhados, todos numa lista só. Fica difícil achar o que importa sem lembrar o nome exato.

## 2. Objetivo
Cada colaborador organiza seus documentos em **pastas** (ex.: "Comercial", "Projetos 2026", "Processos").

Sucesso = um colaborador com 30+ documentos encontra o que precisa navegando pelas pastas, sem precisar da busca.

## 3. Usuários afetados
Todos os colaboradores.

## 4. Histórias de usuário
1. Como **colaborador**, quero criar, renomear e apagar pastas no painel.
2. Como **colaborador**, quero mover um documento para uma pasta arrastando ou pelo menu "Mover para…".
3. Como **colaborador**, quero colocar numa pasta minha também os documentos que foram compartilhados comigo.
4. Como **colaborador**, quero criar um documento novo já dentro da pasta que estou vendo.
5. Como **colaborador**, quero que a busca continue procurando em todas as pastas.

## 5. Requisitos
### Funcionais
1. **Pastas são pessoais:** cada usuário tem as suas. Pôr um documento numa pasta muda só o meu painel; o dono e os outros membros continuam vendo o documento onde eles o colocaram. Ninguém vê as pastas dos outros.
2. Um documento fica em no máximo uma pasta minha por vez (ou em nenhuma = "sem pasta").
3. Pastas podem ter subpastas, até 3 níveis.
4. Nome da pasta: 1 a 80 caracteres; não pode repetir entre pastas irmãs.
5. Apagar uma pasta **não apaga documentos**: os documentos dela (e das subpastas) voltam para "sem pasta". Pede confirmação.
6. Mover por arrastar o cartão do documento até a pasta na lateral, ou pelo menu do documento → "Mover para…".
7. Lateral do painel com a árvore de pastas; clicar abre a pasta. Caminho no topo (ex.: `Comercial › 2026`).
8. "Novo documento" dentro de uma pasta já cria o documento nela.
9. A busca procura em tudo e mostra em qual pasta cada resultado está.
10. Documento que vai para a lixeira sai da pasta; se for restaurado, volta para a mesma pasta (se ela ainda existir).
11. Se eu perco o acesso a um documento compartilhado, ele some das minhas pastas.

### Não funcionais
- Painel continua abrindo rápido com 500 documentos e 100 pastas.

## 6. Critérios de aceite
- [ ] Dado um documento compartilhado comigo, quando eu o coloco na minha pasta "Clientes", então o dono não vê nenhuma mudança no painel dele.
- [ ] Dado uma pasta com 5 documentos, quando eu a apago, então os 5 documentos continuam existindo em "sem pasta".
- [ ] Dado a pasta de outro usuário, quando eu tento listar, renomear, apagar ou mover algo para ela (mesmo trocando o ID na requisição), então recebo "não encontrado".
- [ ] Dado que tento mover uma pasta para dentro dela mesma ou de uma subpasta dela, então a operação é recusada.
- [ ] Dado uma pasta no 3º nível, quando tento criar uma subpasta, então é recusado com mensagem clara.

## 7. Permissões
| Ação | Dono da pasta | Qualquer outro usuário | ADMIN |
|---|---|---|---|
| Ver / criar / renomear / apagar / mover pasta | ✔ | — | — (não vê pastas alheias) |
| Pôr documento na pasta | ✔ (se tiver qualquer papel no documento) | — | — |

Pôr um documento numa pasta **não** muda o papel de ninguém no documento.

## 8. Fora de escopo
- Pastas compartilhadas com a equipe (compartilhar uma pasta inteira).
- Cores/ícones nas pastas, favoritos, ordenação manual.
- Um documento em várias pastas ao mesmo tempo (etiquetas).

## 9. Perguntas em aberto
- [ ] Pastas pessoais (cada um organiza as suas) está bom, ou você quer pastas **compartilhadas**, em que o dono organiza e todo mundo vê igual?
- [ ] 3 níveis de subpasta é suficiente?
