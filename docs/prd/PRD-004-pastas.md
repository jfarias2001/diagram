# PRD-004 — Pastas no painel

| Campo | Valor |
|---|---|
| Status | **Aprovado** (2026-09-22) |
| Autor | Claude (a partir do pedido do usuário) |
| Data | 2026-09-22 |
| SPEC | (quando existir) |

## 1. Problema
Com o tempo cada colaborador acumula dezenas de mapas e fluxogramas, próprios e compartilhados, todos numa lista só. Fica difícil achar o que importa sem lembrar o nome exato.

## 2. Objetivo
Cada colaborador organiza seus documentos em **pastas pessoais** (ex.: "Meus rascunhos") e a equipe pode ter **pastas compartilhadas** (ex.: "Comercial", "Processos da fábrica"): quem entra numa pasta compartilhada passa a ver todos os documentos dela, sem precisar compartilhar um por um.

Sucesso = um colaborador com 30+ documentos encontra o que precisa navegando pelas pastas, sem precisar da busca; e um setor inteiro acessa seus processos numa pasta só.

## 3. Usuários afetados
Todos os colaboradores.

## 4. Histórias de usuário
1. Como **colaborador**, quero criar, renomear e apagar pastas no painel.
2. Como **colaborador**, quero mover um documento para uma pasta arrastando ou pelo menu "Mover para…".
3. Como **colaborador**, quero colocar numa pasta pessoal também os documentos que foram compartilhados comigo.
4. Como **colaborador**, quero criar um documento novo já dentro da pasta que estou vendo.
5. Como **colaborador**, quero que a busca continue procurando em todas as pastas.
6. Como **dono de uma pasta compartilhada**, quero adicionar colegas pelo e-mail (Editor ou Leitor) para que eles vejam todos os documentos da pasta, inclusive os que eu colocar depois.
7. Como **membro de uma pasta compartilhada**, quero ver a pasta na minha lateral, com os mesmos documentos e subpastas que todo mundo vê.

## 5. Requisitos
### A. Regras gerais (valem para os dois tipos)
1. Pastas podem ter subpastas, até 3 níveis.
2. Nome da pasta: 1 a 80 caracteres; não pode repetir entre pastas irmãs.
3. Apagar uma pasta **não apaga documentos**. Pede confirmação.
4. Mover por arrastar o cartão do documento até a pasta na lateral, ou pelo menu do documento → "Mover para…".
5. Lateral do painel com duas seções: **Minhas pastas** e **Pastas compartilhadas**; clicar abre a pasta. Caminho no topo (ex.: `Comercial › 2026`).
6. "Novo documento" dentro de uma pasta já cria o documento nela.
7. A busca procura em tudo e mostra em qual pasta cada resultado está.
8. Documento que vai para a lixeira sai da pasta; se for restaurado, volta para a mesma pasta (se ela ainda existir).

### B. Pastas pessoais
9. Cada usuário tem as suas; ninguém mais as vê. Pôr um documento numa pasta pessoal muda só o **meu** painel.
10. Um documento fica em no máximo uma pasta pessoal minha por vez (ou em nenhuma = "sem pasta").
11. Posso pôr na minha pasta pessoal qualquer documento em que eu tenha algum papel. Se eu perder o acesso, ele some das minhas pastas.
12. Apagar uma pasta pessoal: os documentos dela voltam para "sem pasta".

### C. Pastas compartilhadas
13. Qualquer colaborador pode criar uma pasta compartilhada; ele vira o **dono da pasta**. O dono adiciona membros pelo e-mail, com papel **Editor** ou **Leitor** da pasta, e pode mudar ou remover depois (igual ao compartilhamento de documentos).
14. **Acesso herdado:** ser membro da pasta dá acesso a todos os documentos dentro dela e das subpastas. Editor da pasta = Editor dos documentos; Leitor da pasta = Leitor dos documentos. Se a pessoa também tiver um papel direto no documento, vale o **maior** dos dois.
15. O dono do documento continua sendo o dono dele: só o dono do documento manda-o para a lixeira ou o apaga, mesmo dentro da pasta.
16. **Quem pode pôr um documento numa pasta compartilhada:** só o dono do documento, e só se for dono ou Editor da pasta. (Assim ninguém consegue abrir para a equipe um documento que não é dele.)
17. **Quem pode tirar um documento da pasta compartilhada:** o dono do documento ou o dono da pasta. Ao sair da pasta, quem só tinha acesso herdado perde o acesso na hora (inclusive se estiver com o documento aberto).
18. Membros Editores da pasta podem criar documentos e subpastas dentro dela, e renomear subpastas. Só o dono da pasta renomeia a pasta principal, gerencia membros e apaga a pasta.
19. Apagar uma pasta compartilhada: os documentos voltam para o painel de seus donos ("sem pasta") e todo acesso herdado acaba. Subpastas são apagadas junto.
20. Um documento fica em no máximo **uma** pasta compartilhada; e, ao mesmo tempo, cada pessoa pode tê-lo também numa pasta pessoal sua.
21. Só a pasta principal (1º nível) tem lista de membros; as subpastas usam os mesmos membros dela.

### Não funcionais
- Painel continua abrindo rápido com 500 documentos e 100 pastas.
- Adicionar ou remover alguém de uma pasta com 100 documentos reflete o acesso em poucos segundos.

## 6. Critérios de aceite
- [ ] Dado um documento compartilhado comigo, quando eu o coloco na minha pasta pessoal "Clientes", então o dono não vê nenhuma mudança no painel dele.
- [ ] Dado uma pasta pessoal com 5 documentos, quando eu a apago, então os 5 documentos continuam existindo em "sem pasta".
- [ ] Dado a pasta pessoal de outro usuário, quando eu tento listar, renomear, apagar ou mover algo para ela (mesmo trocando o ID na requisição), então recebo "não encontrado".
- [ ] Dado que tento mover uma pasta para dentro dela mesma ou de uma subpasta dela, então a operação é recusada.
- [ ] Dado uma pasta no 3º nível, quando tento criar uma subpasta, então é recusado com mensagem clara.
- [ ] Dado uma pasta compartilhada com a Ana como Leitora, quando eu ponho um documento meu nela, então a Ana passa a abrir o documento só para leitura (e não consegue editar nem forjando mensagens).
- [ ] Dado que a Ana é removida da pasta, então ela perde o acesso aos documentos que só tinha pela pasta, e é desconectada de um documento aberto.
- [ ] Dado um documento em que sou só Editor, quando tento pô-lo numa pasta compartilhada, então é recusado.
- [ ] Dado uma pasta compartilhada apagada, então os documentos continuam existindo no painel dos seus donos.

## 7. Permissões
**Pastas pessoais**

| Ação | Dono da pasta | Qualquer outro usuário | ADMIN |
|---|---|---|---|
| Ver / criar / renomear / apagar / mover pasta | ✔ | — | — (não vê pastas alheias) |
| Pôr documento na pasta | ✔ (se tiver qualquer papel no documento) | — | — |

Pôr um documento numa pasta pessoal **não** muda o papel de ninguém no documento.

**Pastas compartilhadas**

| Ação | Dono da pasta | Editor da pasta | Leitor da pasta | Não-membro / ADMIN |
|---|---|---|---|---|
| Ver a pasta e abrir os documentos | ✔ (Editor nos docs) | ✔ (Editor nos docs) | ✔ (Leitor nos docs) | — |
| Criar documento / subpasta dentro | ✔ | ✔ | — | — |
| Renomear subpasta | ✔ | ✔ | — | — |
| Pôr documento na pasta | ✔ se for dono do documento | ✔ se for dono do documento | — | — |
| Tirar documento da pasta | ✔ | ✔ se for dono do documento | — | — |
| Renomear pasta principal / gerenciar membros / apagar pasta | ✔ | — | — | — |

## 8. Fora de escopo
- Transferir a posse de uma pasta ou de um documento para outra pessoa.
- Compartilhar uma subpasta separadamente, com membros diferentes da pasta principal.
- Papel "Comentador" em pasta (fica só Editor e Leitor).
- Cores/ícones nas pastas, favoritos, ordenação manual.
- Um documento em várias pastas compartilhadas ao mesmo tempo (etiquetas).

## 9. Perguntas em aberto
Respondidas pelo usuário em 2026-09-22:
- [x] Pessoais ou compartilhadas → **as duas**. As regras das pastas compartilhadas (§5.C) foram detalhadas depois dessa resposta e **confirmadas pelo usuário em 2026-09-22**:
  - [x] Entrar na pasta dá acesso a todos os documentos dela (§5.14).
  - [x] Só o dono do documento pode colocá-lo numa pasta compartilhada (§5.16).
- [x] 3 níveis de subpasta → aprovado junto com o PRD.
