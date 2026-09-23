# STORY.md — Diário do projeto

> **Claude: este é o primeiro arquivo a ser lido em toda sessão.** Depois leia o [CLAUDE.md](CLAUDE.md).
> Entradas novas vão **no topo** (mais recente primeiro). Nunca apague entradas antigas.

## Formato de cada entrada

```markdown
## AAAA-MM-DD — Título curto
**Tipo:** feature | fix | security | infra | docs | refactor
**Refs:** PRD-XXX, SPEC-XXX, ADR-XXX (ou "—")

**O que mudou**
- ...

**Revisão de segurança**
- Checklist CLAUDE.md §9: o que foi verificado e o resultado.
- `pnpm audit --prod`: resultado.

**Pendências / próximos passos**
- [ ] ...
```

---

## Estado atual (atualize a cada entrada)

- **Fase:** SPEC-001 a 008 **todas implementadas e testadas** (415 testes + 14 E2E); ainda não publicadas na VPS.
- **Em produção:** nada ainda.
- **Repositório:** https://github.com/jfarias2001/diagram (branch `main`; push automático a cada atualização — CLAUDE.md §5 etapa 6).
- **Próximo passo:** primeiro deploy na VPS e PRD de backup do banco antes de liberar para a equipe.

---

## 2026-09-23 — Cara nova estilo MindMeister, menus em grade, lado do ramo e PDF (SPEC-008)
**Tipo:** feature, fix
**Refs:** PRD-008, SPEC-008, ADR-004

**O que mudou**
- **O bug do irmão, resolvido na raiz.** `layoutMindMap` redividia os ramos da raiz entre direita e esquerda **a cada desenho** (`splitAt = ceil(n/2)`): com um filho à direita, apertar `Enter` criava o irmão **à esquerda**, "atrás do pai", e os ramos antigos pulavam de lado sozinhos quando outro nascia. Agora o lado é **dado**: o nó ganhou o campo `side` (`left`/`right`), gravado quando o ramo nasce, e o layout **lê** em vez de recalcular. `resolveSides` (função pura, testada) decide o lado de quem não tem — e **enquanto nenhum ramo tiver lado, reproduz exatamente a regra antiga**, que é o que faz um documento criado antes desta entrega abrir idêntico. Quando o primeiro ramo novo nasce, o lado dos antigos é **congelado na mesma transação** (um `Ctrl+Z` desfaz tudo).
- **De brinde, a pendência da SPEC-006 §10 fechou:** arrastar um ramo para o outro lado da raiz agora **troca o lado de verdade** (o ponto de soltura decide), em vez de só mover o desenho com as ligações saindo do lado errado. `Ctrl+↑`/`Ctrl+↓` na raiz passou a considerar só os irmãos **do mesmo lado** — o vizinho do outro lado está na outra metade do mapa.
- **Paleta nova (estilo MindMeister).** O âmbar saiu da interface: agora é azul→violeta como cor de ação, fundo claro neutro e **lateral escura**. Um token novo, `--on-brand`, resolve o que o teste de contraste pegou: no modo escuro a cor de ação é clara, então o texto do botão principal tem de ser escuro. O **tema do documento não mudou** — as 8 paletas da SPEC-007 continuam iguais dentro do quadro, e por isso a barra do bloco segue combinando com o tema escolhido.
- **Painel reestruturado:** lateral escura fixa com Meus documentos / Compartilhados / Lixeira e as árvores de pastas (as abas viraram itens da lateral), botão **"+ Criar"** em destaque, **cartões grandes** com capa colorida e alternância **cartões/lista** lembrada no `localStorage`. A capa vem do **tema do documento**, que agora o painel conhece: coluna `theme` (migration `add_document_theme`), **derivada no servidor** a partir do Y.Doc na mesma gravação que já extrai o texto da busca. Nenhuma rota aceita `theme` do cliente.
- **A navegação da rota é injetada na lateral do shell** por um "encaixe" (contexto + portal): a página continua dona do estado das pastas, sem duplicar nada no `AppShell`.
- **Menu em grade, com nome e atalho.** A fileira de 11 ícones sem rótulo virou uma barra enxuta (filho, irmão, cores) mais **"Mais ações"**, que abre um menu em grade agrupado — Criar, Aparência, Organizar, Conteúdo, Perigo — cada ação com ícone, nome e atalho, navegável por teclado (`↑↓←→`, `Home`/`End`, `Esc`). Vale no mapa e no fluxograma. Os grupos são montados por **função pura**, então o que cada papel enxerga tem teste sem DOM: **leitor só vê "Ver nota" e "Abrir link"**.
- **Duas correções de posicionamento que o E2E pegou:** fora da raiz, a barra passou a sair pelo **lado de fora** do mapa (acima do bloco ela cobria o irmão de cima, que fica a 12 px) e com folga de 38 px, senão cobriria o "+" do bloco; e o que abre (menu ou seletor de cor) desce a partir da barra, ancorado **para fora**, então não cobre nem o bloco nem a própria barra.
- **Ícones unificados:** `features/editor/icons.tsx` virou `components/icons.tsx` — uma base só (grade de 24, traço 1,75, 18 px, `currentColor`) com 25 ícones novos para painel, menu e exportação.
- **Exportar em PDF.** Botão único "Exportar" abre um diálogo com formato (PNG/PDF), tamanho (**Ajustado ao mapa**, A4, A3), orientação e fundo; o padrão é PDF ajustado em paisagem. O PDF é gerado **no navegador** (ADR-004): `jspdf` carregado por `import()` — o build confirma que ele fica num pedaço próprio (129 kB gzip) **fora do carregamento inicial** — embutindo um raster mirando **200 dpi** na área impressa. As contas (`pageSizeFor`, `fitScale`, `rasterScale`) são funções puras com teste. Vale para mapa, fluxograma e **modo versão**, e o leitor exporta o que enxerga.
- **`exportPng.ts` foi apagado**: PNG e PDF compartilham o mesmo caminho em `features/export/`.
- **Testes:** 415 de unidade e integração (mais 86) e **14 E2E** (mais 5). Entre os novos: `resolveSides` nos seis casos (inclusive lado forjado e a regra antiga em 1…8 ramos), `addNode` congelando os lados em **uma** transação, `setNodeSide` recusando quem não é filho da raiz, leitor forjando `side` pelo WebSocket **descartado no servidor**, tema derivado chegando à coluna e ao painel (e tema estranho virando `null`), contraste AA de **todos** os tokens nos dois modos, grupos do menu por papel, as contas da página/raster, e os E2E que provam o irmão nascendo do mesmo lado e abaixo, o menu sem cobrir o bloco, a escolha cartões/lista sobrevivendo ao recarregar e um **PDF de verdade baixado** (confere `%PDF` nos primeiros bytes).

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** nenhuma rota nova, nenhum papel novo, nenhuma consulta de documento nova — `assertDocumentAccess` continua sendo o ponto único. `side` é conteúdo do Y.Doc, então vale a marca `readOnly` do `onConnect`: teste novo com o leitor escrevendo cru no `Y.Map` e tendo a escrita descartada **no servidor**.
  - **IDOR / vazamento:** `Document.theme` viaja dentro do `DocumentSummary`, que já é filtrado por acesso; quem não enxerga o documento não recebe nada dele.
  - **Confiança no banco:** a coluna `theme` é derivada pelo servidor, mas quem lê **não confia nela** — valor fora de `THEME_IDS` vira `null` (teste com `<script>` gravado direto na coluna).
  - **Injeção de CSS:** a capa do cartão e as cores da interface saem de **constantes do código** (`DOC_THEMES`, tokens). `side` é lista fechada validada **na leitura** do Y.Doc, como `shape` e `fill` (SPEC-006 §6).
  - **XSS:** nenhum `dangerouslySetInnerHTML` novo (o projeto continua sem nenhum fora do DOMPurify já existente); os ícones são SVG escrito por nós. O "Abrir link" do menu do leitor usa o `link` já validado por `isSafeLink` (só `http`, `https`, `mailto`) e abre com `noopener,noreferrer`.
  - **Exportação:** acontece 100% no navegador — não existe rota de exportação, então não há superfície nova. Nos metadados do PDF vai **só o título**, nunca autor ou e-mail. O nome do arquivo passa pelo `safeFileName` (teste com `../../etc/passwd`).
  - **CSP:** o pedaço do `jspdf` é servido do próprio domínio (`script-src 'self'`) e **não usa `eval` nem `new Function`** (conferido no arquivo gerado), então a CSP da VPS continua intacta; `img-src 'self' data: blob:` já cobria o caminho do raster.
  - **DoS:** teto de 40 MP e 12.000 px por lado no raster e de 14.400 pt na página — mapa gigante **reduz a resolução** e avisa, em vez de travar a aba.
  - **Preferência local:** o `localStorage` guarda só `grid`/`list`, com validação na leitura e `try/catch`.
  - **Segredos:** nada de `.env`, dump ou chave no commit (`git status` conferido).
- `pnpm audit --prod`: **sem vulnerabilidades**. Dependência nova: `jspdf` 4.2.1 (MIT), só no cliente e só por `import()` (ADR-004).

**Pendências / próximos passos**
- [ ] O texto do PDF **não é selecionável** (é imagem em 200 dpi) — decisão do ADR-004; se a empresa pedir texto selecionável, vira outra entrega com `pdf-lib`.
- [ ] O menu da forma no fluxograma ficou com *Duplicar* no grupo "Organizar": **alinhar e distribuir**, citados na SPEC-008 §5.4, não existem como comandos hoje (o alinhamento é encaixe durante o arrasto) e criá-los seria feature fora do PRD-008.
- [ ] **Favoritos** (estrela) continua fora do escopo (PRD-008 §8); a lateral já tem lugar para ele.
- [ ] A capa do cartão é cor do tema, **não miniatura do conteúdo** (PRD-008 §8): documento nunca aberto depois desta entrega fica com a capa padrão até a primeira gravação.
- [ ] Primeiro deploy na VPS e PRD de backup do banco (pendência que vem desde a SPEC-004).

---

## 2026-09-22 — Identidade visual: temas do documento, fontes, cores livres, arrasto natural e religar (SPEC-007)
**Tipo:** feature, fix
**Refs:** PRD-007, SPEC-007

**O que mudou**
- **Arrastar passou a mover só o bloco.** A linha que liga ao pai **deixou de sumir** durante o arrasto (era uma condição `!isDragging` que apagava a aresta) e agora estica junto. Ao soltar, o editor grava o deslocamento do bloco **e o deslocamento compensatório de cada filho direto**, numa transação só: matematicamente `pos'(filho) = pos(filho)`, então o ramo fica exatamente onde estava. `Shift` (ou o botão "leva o ramo junto" na barra) volta ao comportamento da SPEC-006, e arrastar a raiz continua movendo o mapa inteiro. **Isto substitui a regra da SPEC-006 §5.1.**
- **Cortar e religar** (pedido durante a aprovação do PRD): clicar na linha mostra a tesoura; `Ctrl+X` faz o mesmo pelo teclado. O mapa entra em "modo religar", dá para navegar e dar zoom até um pai do outro lado do mapa, e o clique (ou `Ctrl+V`) religa. `Esc` cancela sem escrever nada. A ligação velha **só cai quando a nova existe** (`reparentNode`, uma transação): o documento nunca guarda bloco órfão, e um `Ctrl+Z` desfaz tudo. Religar num descendente é recusado pela interface **e** pelo modelo.
- **Tema é do documento, não do navegador.** Um `Y.Map` novo, `style`, guarda só `theme`, `font` e `background` — **ids de listas fechadas e um hex**. As 8 paletas (Paglamp, Aurora, Oceano, Pôr do sol, Grafite, Papel, Caderno, Neon) são código, então aplicar um tema num mapa de 1.000 blocos é **uma escrita** e um `Ctrl+Z`. O tema viaja com o documento, sincroniza em tempo real e **entra no histórico de versões** (olhar uma versão antiga mostra a aparência daquela época). O interruptor sol/lua pessoal da SPEC-006 deixou de existir.
- **Cores livres (sRGB inteiro)** para contorno, preenchimento e agora também **cor do texto** (`ink`, campo novo no nó e na forma): área de saturação/brilho, barra de matiz, código hexadecimal, cores do tema e as usadas recentemente. Vale nos dois editores. O aviso de contraste **avisa e deixa passar** — é escolha de quem edita.
- **8 fontes** auto-hospedadas (`@fontsource`), carregadas **sob demanda**: o build gera um pedaço por família, então quem abre um mapa com a fonte padrão não baixa as outras sete. Nada de CDN — a CSP `font-src 'self'` continuou intacta. Cada fonte tem um fator de largura que entra no `estimateSize`, senão a condensada deixaria folga sobrando e a monoespaçada deixaria texto vazando.
- **Modo claro deixou de ser branco puro** (`#f2f1ed` no quadro, `#fbfaf8` nas superfícies): o painel herdou o mesmo conforto, mas não foi redesenhado.
- **Linhas com cara de mapa mental:** a ligação virou um polígono que **afina** do pai para o filho (`taperedPath`, função pura testada), com a espessura caindo por nível.
- **Dois problemas de barra achados pelo E2E, corrigidos na raiz:** a barra do bloco ficava **atrás do cabeçalho** quando o bloco estava no topo (agora ela desce sozinha) e o seletor de cor, bem mais alto que a paleta antiga, **cobria o bloco que se estava pintando** (agora abre do lado oposto ao bloco, fora do fluxo).
- **A fonte do documento vale só para o conteúdo:** blocos e rótulos de conector. A barra, os painéis e os diálogos continuam na fonte do sistema mesmo com o mapa em manuscrita — o E2E verifica os dois lados.
- **Sem migration, sem rota nova e sem variável de ambiente nova.** Documentos antigos abrem no tema Paglamp, exatamente como antes.
- **Testes:** 329 de unidade e integração (mais 55) e 9 E2E. Entre os novos: contraste AA de **todos** os temas (a paleta antiga tinha duas cores abaixo de 4,5:1 e foi corrigida), `readStyle` ignorando lixo forjado, `reparentNode` (ciclo, raiz, um Ctrl+Z), `offsetsForSoloMove` com a invariante "o filho não se mexe", conversões de cor, `taperedPath`, **o leitor forjando tema pelo WebSocket sendo descartado**, o tema voltando junto com a versão restaurada, e o E2E que arrasta, religa com `Esc` no meio, pinta por hexadecimal, troca tema e fonte, e confere que a leitora vê tudo sem poder mexer.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** nenhuma rota nova. Tema, fonte e cores são conteúdo do Y.Doc, então valem a marca `readOnly` do `onConnect` — leitor (direto ou herdado de pasta) que força um update em `style` tem a escrita descartada **no servidor** (teste novo pelo WebSocket, inclusive escrevendo cru no `Y.Map`).
  - **Injeção/CSS (o risco desta entrega):** todo valor que vira CSS vem de **constante do código** (tema e fonte são ids de listas fechadas) ou de **hex validado na leitura**. Tema desconhecido cai no padrão; `background`, `ink`, `color` e `fill` fora de `#rrggbb` são ignorados na leitura **e** na escrita. Teste com `url(javascript:…)` e `#fff;position:fixed` escritos direto no documento.
  - **Versões:** o estilo restaurado passa pelo mesmo leitor defensivo — lixo guardado numa versão antiga não volta (teste).
  - **Área de transferência:** `Ctrl+X`/`Ctrl+V` do mapa são um recorte **interno**; não leem nem escrevem no clipboard do sistema, então não há superfície de colagem de conteúdo externo.
  - **Rede:** as 7 famílias novas são arquivos servidos pelo próprio site; CSP inalterada, nenhum pedido externo em tempo de uso.
  - **DoS:** aplicar tema é 1 escrita; o pior caso do arrasto é "1 + filhos diretos" numa transação (teste com 500 filhos).
- `pnpm audit --prod`: **sem vulnerabilidades** (7 pacotes `@fontsource*` novos, só arquivos de fonte).

**Pendências / próximos passos**
- [ ] Criar e salvar temas próprios da empresa ficou fora (PRD-007 §8); só os 8 prontos.
- [ ] Ícones/emoji dentro dos blocos continuam fora — é o item mais visível que ainda separa o editor da referência.
- [ ] Tamanho de fonte por bloco e tema por usuário (quem gosta de escuro vê o documento claro) ficaram fora, de propósito.
- [ ] A largura do texto ainda é **estimada**, não medida: fonte muito diferente pode deixar folga irregular.
- [ ] Primeiro deploy na VPS e PRD de backup do banco (continua sendo o próximo passo real).

---

## 2026-09-22 — Pastas pessoais e compartilhadas (SPEC-004)
**Tipo:** feature
**Refs:** PRD-004, SPEC-004

**O que mudou**
- **Tabelas novas** (migration `add_folders`): `Folder` (pessoal ou compartilhada, até 3 níveis, com `rootId` apontando para a pasta principal), `FolderMember` e `DocumentPlacement`. No `Document`, a coluna `sharedFolderId`.
- **Dois vínculos diferentes, de propósito:** a pasta **pessoal** é um vínculo por usuário (só muda o *meu* painel) e a **compartilhada** é do documento (uma só, global).
- **A autorização mudou de fundo:** o papel de alguém num documento passou a ser o **maior entre o direto e o herdado da pasta compartilhada**, calculado num lugar só (`assertDocumentAccess`). Dono da pasta e Editor herdam Editor; Leitor herda Leitor; **a herança nunca dá Dono** — mandar para a lixeira e apagar continuam sendo só do dono do documento. Os 108 testes de permissão que já existiam continuaram passando sem mudança.
- **Perder acesso vale na hora:** remover ou rebaixar um membro da pasta, tirar o documento da pasta ou apagar a pasta derruba as conexões Yjs afetadas; quem só tinha acesso herdado cai na tela "documento não encontrado", mesmo com o documento aberto.
- **Painel:** lateral com "Minhas pastas" e "Pastas compartilhadas" em árvore, caminho no topo (`Comercial › 2026`), arrastar o cartão do documento até a pasta, menu "Mover para…", "+ Novo" já criando dentro da pasta aberta, e a busca mostrando em que pasta cada resultado está. A pasta aberta fica na URL (`?pasta=`).
- **Regras do PRD implementadas com teste:** nome único entre irmãs (ignorando acento e caixa), 3 níveis, recusa de ciclo, apagar pasta não apaga documentos, documento na lixeira some da pasta e volta ao ser restaurado, só o dono do documento o coloca numa pasta compartilhada, e só o dono da pasta gerencia membros.
- **Correção encontrada pelo E2E completo (regressão minha da SPEC-006):** o E2E da SPEC-002 ainda clicava no botão "Cor", que virou "Cores" com o popover de contorno e preenchimento. Rótulos atualizados no teste.
- **Correção de teste instável (SPEC-005):** a retenção agrupa por dia UTC e o teste montava as datas a partir de "agora", então ele passava ou falhava conforme a hora do dia. Agora ancora na meia-noite UTC.
- **Testes:** 274 de unidade e integração (mais 17) e 8 E2E. Entre os novos: pasta pessoal invisível para os outros e para o ADMIN, matriz do papel herdado (leitor → editor da pasta), "o maior papel vence", remoção de membro tirando o acesso, **herança valendo no WebSocket com o leitor forjando escrita**, e o E2E em que a colega entra na pasta, abre o documento só de leitura e perde o acesso ao ser removida.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização (risco nº 1):** o ponto único continua único; nenhuma rota consulta papel por fora. `assertFolderAccess` segue o mesmo desenho (sem vínculo → 404, papel fraco → 403).
  - **IDOR:** pasta pessoal alheia responde 404 em listar, renomear, apagar e mover documento para ela (teste, inclusive com ADMIN).
  - **Publicar documento alheio:** `PUT /shared-folder` exige ser **dono do documento** e ter poder na pasta — editor do documento recebe 403 (teste).
  - **Somente leitura herdada:** o `onConnect` usa o papel efetivo; leitor herdado tem o update descartado no servidor (teste pelo WebSocket).
  - **Revogação em tempo real:** remover membro, tirar da pasta e apagar a pasta derrubam as conexões.
  - **Enumeração de e-mails:** rate limit de 30/min em adicionar membro, com a mesma resposta do compartilhamento de documento.
  - **Limites:** 200 pastas por tipo e por usuário, 100 membros por pasta, profundidade 3, ciclo recusado; a árvore é resolvida em no máximo 3 consultas, sem recursão no banco.
  - **Registro:** eventos novos de auditoria só com ids e papéis, nunca conteúdo.
- `pnpm audit --prod`: **sem vulnerabilidades** (nenhuma dependência nova).

**Pendências / próximos passos**
- [ ] Abrir uma pasta mostra só os documentos dela, não os das subpastas (decisão da SPEC-004 §10).
- [ ] Sem transferência de posse: se o dono de uma pasta compartilhada for desativado, só um ADMIN reativando devolve a gestão (SPEC-004 §10).
- [ ] Mover subpasta entre pastas compartilhadas diferentes é recusado de propósito (§10).
- [ ] Primeiro deploy na VPS e PRD de backup do banco.

---

## 2026-09-22 — Histórico de versões (SPEC-005)
**Tipo:** feature
**Refs:** PRD-005, SPEC-005

**O que mudou**
- **Tabela `Snapshot`** (migration `add_snapshots`), com o estado do Y.Doc e três tipos: `AUTO`, `NAMED` e `CHECKPOINT`. Apagar o documento de vez apaga o histórico junto; a lixeira não.
- **Versões automáticas criadas pelo servidor**, dentro do plugin de colaboração: a cada 10 minutos de edição e quando o último editor sai do documento. Não dependem do navegador de ninguém, e guardam quem editou no intervalo.
- **Restaurar mostra na hora para quem está com o documento aberto.** Em vez de trocar o estado binário (o que quebraria a sincronização), o servidor **reconcilia o Y.Doc vivo** com o da versão: apaga o que sumiu, reescreve o que existe, tudo numa transação. Funciona igual para mapa e fluxograma, porque os dois são mapas planos por id. Antes de restaurar, o estado atual vira um checkpoint "Antes de restaurar de…" — **nada é apagado**.
- **Rotas** `/documents/:id/versions` (listar, criar, ver conteúdo, restaurar, salvar como cópia, renomear, apagar), com os papéis do PRD §7: leitor e comentador veem e copiam; editor cria e restaura; só o dono renomeia e apaga versão com nome.
- **Retenção** no mesmo job horário da lixeira: tudo dos últimos 30 dias, uma por dia até 1 ano, nada depois — e tetos de 300 versões e 100 MB por documento, sacrificando só as automáticas.
- **Painel "Histórico"** no editor (mapa e fluxograma), com data, nome e quem editou. Clicar numa versão entra no **modo versão**: o quadro passa a vir de um Y.Doc local somente leitura, com a faixa "Você está vendo a versão de…" e os botões Restaurar, Salvar como cópia e Voltar ao atual. O documento atual não é tocado enquanto se olha.
- **Checkpoint antes de organizar** (mapa e fluxograma), disparado sem travar a ação — se o histórico falhar, organizar continua funcionando.
- **Variáveis novas** no `.env.example` e no `docker-compose.yml`: `SNAPSHOT_INTERVAL_MINUTES`, `SNAPSHOT_RETENTION_DAYS`, `SNAPSHOT_DAILY_AFTER_DAYS`.
- **Testes:** 257 de unidade e integração (mais 22) e 7 E2E. Entre os novos: reconciliação (ramo que volta, convergência entre dois clientes, fluxograma), matriz de papéis das 7 rotas, IDOR de versão de outro documento, retenção com datas injetadas, **restauração chegando a duas abas conectadas pelo WebSocket**, versão automática criada pelo servidor, e o E2E que salva, apaga, visualiza e restaura.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** toda rota passa por `assertDocumentAccess` com o papel da tabela do PRD §7; leitor e comentador recebem 403 em criar e restaurar (teste), não-membro e ADMIN recebem 404 em tudo (teste).
  - **IDOR:** a versão é sempre buscada com `where: { id, documentId }` — o id de uma versão de outro documento dá 404 (teste).
  - **Conteúdo do usuário:** `/content` responde `application/octet-stream` com `Content-Disposition: attachment` e `nosniff`; nunca inline.
  - **Sanitização no restore:** o estado passa pelos leitores defensivos e pelo reparo, então link `javascript:`, cor inválida e coordenada infinita guardados numa versão antiga **não voltam** (teste), e nó órfão volta reanexado.
  - **Vazamento:** a lista mostra nome de quem editou, nunca e-mail.
  - **DoS:** versão nunca passa do limite de 5 MB do documento; tetos por documento mais a retenção; rate limit de 20/min em criar e restaurar.
  - **Falha isolada:** se guardar a versão falhar, a edição e o "Organizar" continuam — o histórico só registra no log.
- `pnpm audit --prod`: **sem vulnerabilidades** (nenhuma dependência nova).

**Pendências / próximos passos**
- [ ] O histórico faz o banco crescer; considerar no PRD de backup (SPEC-005 §10).
- [ ] Restaurar enquanto alguém digita dentro de um bloco sobrescreve o texto ao confirmar (SPEC-005 §10).
- [ ] Comparar duas versões lado a lado ficou fora (PRD-005 §8).
- [ ] Implementar a SPEC-004 (pastas).

---

## 2026-09-22 — Mapa livre, formatos e cores de bloco, tema do quadro (SPEC-006)
**Tipo:** feature, fix
**Refs:** PRD-006, SPEC-006

**O que mudou**
- **Posição livre no mapa mental.** Cada bloco pode ter um deslocamento `dx`/`dy` **relativo ao pai**. Arrastar um bloco e soltar no vazio o deixa onde foi solto e o ramo inteiro vai junto — com **uma escrita só** no Yjs, mesmo num ramo de 1.000 blocos (teste). Soltar em cima de outro bloco continua trocando o pai (o bloco alvo fica destacado enquanto se arrasta) e devolve o bloco à posição automática. A raiz também arrasta, e arrastá-la move o mapa inteiro. Um filho criado depois nasce na posição automática perto do pai, mesmo com o pai movido.
- **Organizar automaticamente:** botão nos controles (mapa inteiro) e na barra do bloco (só o ramo). É uma transação só, então um Ctrl+Z desfaz.
- **Ordem entre irmãos** saiu do arrasto e foi para `Ctrl+↑`/`Ctrl+↓` e dois botões na barra.
- **Formato do bloco:** arredondado, cápsula, retângulo, elipse, hexágono e sublinhado. Elipse e hexágono são desenhados em SVG atrás do texto (borda e preenchimento que `clip-path` não faria), e o layout reserva a folga extra de cada formato.
- **Cor de preenchimento do bloco**, com o texto escolhendo sozinho entre escuro e claro (`readableInk`, luminância WCAG) — toda a paleta tem contraste ≥ 4,5:1 (teste).
- **Tema do quadro (claro/escuro)** num interruptor sol/lua no cabeçalho: redefine os tokens **dentro** do quadro, então o painel e os diálogos continuam seguindo o sistema. A escolha fica no `localStorage`, vale nos dois editores, e o PNG exportado sai com o fundo do quadro em uso.
- **Correção encontrada pelos testes (não era da SPEC):** `layoutMindMap` montava a árvore recursivamente e **estourava a pilha** num mapa muito profundo, derrubando o editor; a mesma coisa acontecia no cálculo das cores do ramo. Os dois viraram laços com pilha explícita — um mapa em cadeia de 5.000 níveis agora desenha (teste).
- **Sem migration, sem rota nova e sem dependência nova:** tudo são campos aditivos do documento Yjs mais uma preferência de navegador.
- **Testes:** 235 de unidade e integração (mais 17) e 6 E2E. Entre os novos: deslocamento inválido descartado, organizar em uma transação, ordem entre irmãos, formato/cor forjados, `readableInk` na paleta inteira, `resolvePositions` (ramo junto, raiz, filho novo, mapa profundo), desempenho com 1.000 blocos e o E2E que arrasta, organiza, desfaz, pinta e troca o tema.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** nenhuma regra nova. Teste novo pelo WebSocket: leitor que forja `dx`/`dy`, `shape` e `fill` tem o update **descartado no servidor**; editor grava e o colega recebe.
  - **Injeção de CSS:** `fill` só entra se casar com `#rrggbb` e `shape` só se estiver na lista — validado na **leitura** do Y.Doc, não só na escrita (teste com `url(javascript:…)` e com tag HTML no campo `shape`).
  - **XSS:** nenhum `dangerouslySetInnerHTML`; o SVG dos formatos é gerado por nós, com atributos literais — nada do usuário vira marcação.
  - **Coordenadas:** `dx`/`dy` só valem juntos, finitos e dentro de ±20.000 (NaN, Infinity e valores absurdos descartados na leitura e na escrita).
  - **Preferência local:** o `localStorage` guarda só `light`/`dark`, com validação na leitura e `try/catch` (navegador com storage bloqueado não quebra o editor).
- `pnpm audit --prod`: **sem vulnerabilidades** (nenhuma dependência nova).

**Pendências / próximos passos**
- [ ] Arrastar um ramo para o outro lado da raiz não troca o lado lógico do ramo (as ligações continuam saindo pelo lado original) — SPEC-006 §10.
- [ ] Blocos movidos à mão podem se sobrepor; "Organizar" resolve — é o preço da posição livre.
- [ ] Implementar a SPEC-005 e, nela, criar o checkpoint de versão antes de "Organizar" (SPEC-005 §8, tarefa 8).

---

## 2026-09-22 — SPECs 004 (pastas), 005 (versões) e 006 (mapa livre) escritas
**Tipo:** docs
**Refs:** PRD-004, PRD-005, PRD-006, SPEC-004, SPEC-005, SPEC-006

**O que mudou**
- **PRD-006 aprovado**, com as três perguntas em aberto respondidas pelo usuário: "ícones de formas" = **formato do bloco**; arrasto passa a só posicionar (ordem vai para o teclado e a barra) = **ok**; tema claro/escuro vale **só para o quadro**, não para a interface inteira. Junto veio um pedido novo, já no PRD: **cor de preenchimento do bloco**, com o texto escolhendo sozinho entre claro e escuro para manter contraste.
- **SPEC-004 (pastas)** em rascunho:
  - `Folder` (pessoal/compartilhada, 3 níveis, com `rootId` para achar a pasta principal num salto) e `FolderMember`;
  - dois vínculos diferentes: `DocumentPlacement` (pasta pessoal, por usuário) e `Document.sharedFolderId` (pasta compartilhada, global);
  - **papel efetivo = maior entre o papel direto e o herdado da pasta**, calculado num lugar só (`assertDocumentAccess`); a herança nunca dá `OWNER`;
  - tudo que tira acesso (remover membro, tirar da pasta, apagar pasta) derruba as conexões Yjs na hora;
  - painel com lateral de pastas, caminho, arrastar o cartão para a pasta e "Mover para…".
- **SPEC-005 (histórico de versões)** em rascunho:
  - tabela `Snapshot` com o estado binário do Y.Doc, tipos `AUTO`/`NAMED`/`CHECKPOINT`;
  - versões automáticas criadas **pelo servidor** (a cada 10 min de edição e quando o último sai), não pelo navegador;
  - restaurar reconcilia o Y.Doc **vivo** com o da versão, então quem está com o documento aberto vê a mudança na hora; o estado atual vira um checkpoint e nada é apagado;
  - retenção (30 dias completos, depois uma por dia até 1 ano) no mesmo job horário da lixeira, com teto por documento;
  - painel de histórico no editor e modo "vendo a versão de…" somente leitura.
- **SPEC-006 (mapa livre, formatos, cores e tema do quadro)** em rascunho:
  - posição manual como **deslocamento relativo ao pai** (`dx`/`dy`): mover um bloco leva o ramo junto com **uma escrita só**, e um filho novo continua nascendo na posição automática;
  - "Organizar" = apagar os deslocamentos numa transação (um Ctrl+Z desfaz);
  - `shape` (6 formatos) e `fill` (hex) no nó, com `readableInk` para o contraste do texto;
  - tema do quadro por escopo de tokens (`data-board`) no elemento do quadro, guardado no `localStorage` — o resto da interface continua seguindo o sistema;
  - sem migration e sem rota nova.

**Revisão de segurança**
- Só documentação; nenhuma linha de código alterada. O que as SPECs já deixam amarrado:
  - **SPEC-004 §6:** ponto único de autorização com papel efetivo; pasta alheia sempre 404 (IDOR); `PUT /shared-folder` exige ser dono do documento **e** ter poder na pasta (ninguém publica documento alheio para a equipe); derrubada de conexões em toda perda de acesso; rate limit no convite; tetos de profundidade, quantidade e membros; ADMIN sem exceção.
  - **SPEC-005 §6:** `versionId` sempre filtrado pelo `documentId` da URL; restaurar exige `EDITOR`; conteúdo servido como `attachment` com `nosniff`; estado restaurado passa pelos leitores defensivos e pelo reparo (link `javascript:` e cor inválida não voltam); tetos de tamanho e retenção contra crescimento sem controle; lista mostra nome, nunca e-mail.
  - **SPEC-006 §6:** `shape`, `fill`, `dx` e `dy` validados **na leitura** do Yjs (cliente adulterado não injeta CSS nem valor absurdo); cores só em `style`, nunca em HTML; leitor continua sem conseguir mover, formatar ou pintar, com teste de update forjado.
- `pnpm audit --prod`: sem dependência nova nesta etapa; resultado registrado na entrada anterior (sem vulnerabilidades).

**Pendências / próximos passos**
- [ ] Aprovação das SPECs 004, 005 e 006 (e da ordem de implementação).
- [ ] SPEC-004 §10: sem transferência de posse — se o dono de uma pasta compartilhada for desativado, só um ADMIN reativando devolve a gestão da pasta.
- [ ] SPEC-005 §10: o histórico aumenta o banco; considerar no PRD de backup.
- [ ] SPEC-006 §10: arrastar um ramo para o outro lado da raiz não troca o lado lógico do ramo.

---

## 2026-09-22 — Editor de fluxogramas (SPEC-003)
**Tipo:** feature, fix
**Refs:** PRD-003, SPEC-003, ADR-001

**O que mudou**
- **Painel:** virou "Documentos". O botão "+ Novo" pergunta o tipo, cada cartão mostra um ícone do tipo e há filtro Todos / Mapas mentais / Fluxogramas. A rota do editor continua `/m/:id` para os dois tipos.
- **Fluxograma** (`type = DIAGRAM`, sem migration):
  - paleta com 9 formas — arrastar para o quadro (com prévia seguindo o ponteiro) ou clicar, e nesse caso a forma nasce ligada à selecionada;
  - setas entre formas, com alças nos 4 lados; a forma inteira vira alvo enquanto a seta está sendo puxada;
  - soltar a seta no vazio abre um mini menu que cria a próxima forma já ligada;
  - rótulo no conector ("Sim"/"Não"), estilo reto / ângulo reto / curva, tracejado, ponta e cor;
  - redimensionar, grade de 16 px (Alt solta), guias de alinhamento;
  - seleção múltipla por caixa e Shift, copiar/recortar/colar (validado com Zod) e duplicar;
  - botão **Organizar** com `elkjs`, carregado sob demanda, desfeito com um Ctrl+Z;
  - tempo real, presença, somente leitura, exportar PNG e busca pelo texto das formas.
- **Modelo:** `shapes` e `edges` como mapas planos no Y.Doc; apagar forma apaga os conectores dela; conectores soltos são descartados na leitura e apagados pelo reparo.
- **Correção herdada da SPEC-002:** a detecção de duplo clique por tempo abria a edição quando a pessoa clicava no mesmo bloco em dois momentos seguidos. Agora usa o `detail` do evento, como o navegador manda.
- **Dependência nova:** `elkjs` 0.12 (EPL-2.0), prevista no ADR-001, em chunk separado de 1,43 MB, baixado só no primeiro "Organizar".
- **Testes:** 218 de unidade e integração (mais 57) e 5 E2E. Entre os novos: modelo do fluxograma (integridade, reparo, clipboard), guias de alinhamento, Organizar, desempenho com 500 formas, matriz de permissões rodando também com `DIAGRAM`, e o leitor forjando formas pelo WebSocket.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** nenhuma regra nova. A matriz de permissões (8 rotas × 6 papéis) agora roda **duas vezes**, com mapa e com fluxograma, e um teste confirma que forma e conector enviados por um leitor são descartados no servidor.
  - **Tipo do documento:** `z.enum(['MINDMAP','DIAGRAM'])` na criação; qualquer outro valor dá 400 (teste).
  - **XSS:** texto de forma e de conector renderizados como texto; nenhum `dangerouslySetInnerHTML` ou `innerHTML` no web.
  - **CSS por cor:** só hex `#rrggbb`; qualquer outra coisa é ignorada na leitura (teste com `url(javascript:…)`).
  - **Colar:** o JSON da área de transferência passa pelo Zod, com limite de 500 formas e 1.000 conectores; os ids colados nunca são reaproveitados; um clip inválido é ignorado.
  - **Coordenadas e tamanhos** limitados na leitura e na escrita (NaN, Infinity e valores absurdos descartados).
- `pnpm audit --prod`: **sem vulnerabilidades** (inclui o `elkjs`).

**Pendências / próximos passos**
- [ ] Mover uma forma só aparece para o colega ao soltar (decisão da SPEC-003 §4).
- [ ] Setas em ângulo reto não desviam de outras formas (React Flow não faz roteamento com obstáculos).
- [ ] PRD-006 aguardando aprovação; depois SPEC-004 (pastas) e SPEC-005 (versões).

---

## 2026-09-22 — SPEC-003 (fluxogramas) escrita
**Tipo:** docs
**Refs:** PRD-003, SPEC-003, ADR-001

**O que mudou**
- **SPEC-003** em rascunho:
  - fluxograma como `Document` `DIAGRAM`, sem migration;
  - Y.Doc com os mapas planos `shapes` e `edges`;
  - apagar forma apaga os conectores dela em cascata, e os conectores soltos são reparados;
  - editor React Flow com paleta de 9 formas, conectores com rótulo, `QuickShapeMenu` ao soltar a seta no vazio, grade, guias de alinhamento, seleção múltipla e copiar/colar validado com Zod;
  - "Organizar" com `elkjs` carregado sob demanda;
  - painel renomeado para "Documentos", com filtro por tipo.

**Revisão de segurança**
- Só documentação. A SPEC-003 §6 cobre:
  - IDOR, com a matriz de permissões rodando também com `DIAGRAM`;
  - leitor forjando formas pelo WebSocket;
  - XSS pelo texto e injeção de CSS pelas cores;
  - colagem de JSON malicioso ou gigante;
  - conectores soltos;
  - `type` forjado na criação.

**Pendências / próximos passos**
- [ ] Aprovação da SPEC-003.

---

## 2026-09-22 — Mapa mental com o mouse, notas e links (SPEC-002)
**Tipo:** feature, fix
**Refs:** PRD-002, SPEC-002

**O que mudou**
- **Barra flutuante** sobre o tópico selecionado:
  - + Filho, + Irmão, cor, negrito, nota, link, recolher/expandir e apagar;
  - cada botão mostra o atalho de teclado equivalente;
  - substitui a paleta fixa do canto superior;
  - para leitores, mostra só "ver nota" e "abrir link".
- **"+" ao passar o mouse** na borda de fora do tópico (dois na raiz). Também fica visível no tópico selecionado, para funcionar no toque.
- **Duplo clique** edita o texto, inclusive num tópico que não estava selecionado. O duplo clique não dá mais zoom.
- **Controles no canto inferior:**
  - desfazer e refazer, desabilitados quando não há o que fazer;
  - afastar, aproximar e ajustar à tela.
- **Nota** (texto simples, até 5.000 caracteres):
  - painel lateral com contador, que salva sozinho;
  - ícone no tópico que tem nota;
  - leitores leem a nota sem editar;
  - a busca do painel encontra palavras das notas.
- **Link** por tópico:
  - só http/https/mailto; endereço sem protocolo vira `https://`;
  - ícone no tópico, que abre em nova aba com `noopener noreferrer`.
- **Modelo:** campos opcionais `note` e `link` no nó do Y.Doc, sem migration.
- **Correções encontradas no caminho:**
  - **Nós escondidos a cada mudança** (vinha do MVP): o React Flow recebia os nós sem o tamanho medido, escondia todos e media de novo. Um clique nesse intervalo "atravessava" o tópico, e os 1.000 nós eram re-medidos a cada tecla. Agora o tamanho medido é guardado e devolvido.
  - **Desfazer juntava cliques rápidos** num passo só: cada ação discreta agora é um passo próprio.
- **Testes:** 145 de unidade e integração (13 novos) e 4 E2E, entre eles o fluxo "só com o mouse", com a leitora. Os novos cobrem:
  - `normalizeLink` e a leitura defensiva do link;
  - nota na busca;
  - leitor forjando nota e link pelo WebSocket;
  - `data` estável dos nós.

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada no que mudou:
  - **Autorização:** nenhuma rota nova. O `/collab` continua passando por `assertDocumentAccess`. O teste novo confirma que nota e link enviados por um leitor são descartados no servidor.
  - **XSS por link:** bloqueado em duas camadas:
    - `normalizeLink` na interface;
    - `isSafeLink` em `readNode`, de modo que um `javascript:` ou `data:` gravado direto no Y.Doc nunca vira `href`.
  - Os três `target="_blank"` têm `rel="noopener noreferrer"`.
  - **XSS pela nota:** a nota é renderizada como texto; `dangerouslySetInnerHTML` continua bloqueado pelo ESLint.
  - **Tamanho:** a nota é cortada em 5.000 caracteres na leitura, e os limites de 5 MB por documento e 2 MB por mensagem continuam valendo.
- `pnpm audit --prod`: **sem vulnerabilidades**.

**Pendências / próximos passos**
- [ ] Nota editada por duas pessoas ao mesmo tempo: vale a última gravação (risco aceito na SPEC-002 §10).
- [ ] A barra flutuante pode cobrir parte do tópico logo acima do selecionado. Aceitável por ora; reavaliar com uso real.
- [ ] SPEC-003 (fluxogramas).

---

## 2026-09-22 — PRDs 002 a 005 aprovados; SPEC-002 escrita
**Tipo:** docs
**Refs:** PRD-002, PRD-003, PRD-004, PRD-005, SPEC-002

**O que mudou**
- Usuário aprovou os quatro PRDs e respondeu às perguntas:
  - **PRD-002:** aprovado como está (nota até 5.000 caracteres; link só como ícone).
  - **PRD-003:** a lista de formas basta por enquanto; as abas passam a se chamar "Meus documentos".
  - **PRD-004:** quer pastas **pessoais e compartilhadas**. As regras das compartilhadas (acesso herdado pela pasta, só o dono do documento o coloca numa pasta compartilhada) foram escritas no §5.C e **aguardam confirmação** antes da SPEC-004.
  - **PRD-005:** o Editor também restaura versões, não só o Dono.
- **SPEC-002** escrita (rascunho):
  - novos campos `note` e `link` no nó do Y.Doc, sem migration;
  - `normalizeLink` e leitura defensiva;
  - barra flutuante com `NodeToolbar`, "+" no hover via CSS, painel de nota e barra de controles;
  - plano de testes com E2E "só mouse".

**Revisão de segurança**
- Só documentação. A SPEC-002 §6 cobre:
  - XSS por link, bloqueado em duas camadas (na interface e na leitura do Y.Doc);
  - `rel="noopener noreferrer"` nos links;
  - nota renderizada como texto;
  - leitor forjando a nota pelo WebSocket, com teste novo.

**Pendências / próximos passos**
- [ ] Aprovação da SPEC-002.
- [ ] Confirmar as regras de pastas compartilhadas (PRD-004 §9).
- [ ] SPEC-003 (fluxogramas) depois da SPEC-002.

---

## 2026-09-22 — PRDs 002 a 005 em rascunho (mouse, fluxogramas, pastas, versões)
**Tipo:** docs
**Refs:** PRD-002, PRD-003, PRD-004, PRD-005

**O que mudou**
- Pedido do usuário: adicionar blocos com o mouse (hoje só teclado), trabalhar com diagramas e "mais coisas". Escolhas dele: barra flutuante no bloco selecionado, "+" ao passar o mouse, duplo clique para editar; diagrama prioritário = fluxograma; extras = notas e links, pastas, histórico de versões.
- Dividido em 4 PRDs independentes, a entregar nesta ordem:
  - **PRD-002** — editar o mapa mental com o mouse + notas e links no nó;
  - **PRD-003** — editor de fluxogramas;
  - **PRD-004** — pastas pessoais no painel;
  - **PRD-005** — histórico de versões com restauração.

**Revisão de segurança**
- Só documentação. Riscos já apontados nos PRDs: links só `http/https/mailto` (PRD-002), IDOR em pastas e versões (PRD-004/005), somente leitura imposto no servidor para fluxogramas (PRD-003).

**Pendências / próximos passos**
- [ ] Aprovação e respostas às perguntas em aberto (§9) de cada PRD.
- [ ] SPEC-002 após aprovação do PRD-002.

---

## 2026-09-21 — Correção: seed do admin inválido não derruba mais a API
**Tipo:** fix
**Refs:** SPEC-001 §3.2

**O que mudou**
- No primeiro deploy na VPS, um `SEED_ADMIN_EMAIL` inválido (placeholder do exemplo) fazia a API cair em loop de restart com um `ZodError`. Agora a API sobe normalmente e loga em português o que corrigir no `.env` ("admin inicial NÃO criado — …").
- Deploy na VPS confirmado até aqui: build das imagens ok, Postgres saudável, migrations aplicadas, rede `traefik_default`.

**Revisão de segurança**
- Sem mudança de superfície; o log não inclui o valor das variáveis (só qual está inválida). Teste novo cobre o caso.

**Pendências / próximos passos**
- [ ] Concluir o primeiro deploy: corrigir `SEED_ADMIN_EMAIL`, subir, fazer o 1º login e apagar `SEED_ADMIN_PASSWORD` do `.env`.

---

## 2026-09-21 — MVP de mapas mentais colaborativo (SPEC-001)
**Tipo:** feature, security, infra
**Refs:** PRD-001, SPEC-001, ADR-002, ADR-003

**O que mudou**
- **Banco:** models `User`, `Session`, `Document`, `DocumentMember`, `AuditEvent` e migration inicial.
- **Autenticação:**
  - login com e-mail e senha (argon2id) e sessão opaca em cookie `__Host-sid`, com renovação e limite absoluto de 30 dias;
  - troca de senha obrigatória no 1º login;
  - bloqueio da conta após 10 falhas;
  - rate limit de login;
  - resposta igual e em tempo igual para e-mail inexistente;
  - auditoria.
- **Admin:**
  - criar acesso com senha provisória exibida uma vez;
  - redefinir senha, desativar e mudar papel;
  - o admin não consegue se trancar para fora;
  - o primeiro admin é criado no boot via `SEED_ADMIN_*`.
- **Documentos:**
  - painel com as abas Meus mapas, Compartilhados comigo e Lixeira;
  - busca pelo título e pelo texto dos nós;
  - criar, renomear, duplicar e lixeira com retenção de 30 dias e purga automática.
- **Compartilhamento:** digitando o e-mail, com os papéis Editor, Comentador e Leitor; o membro também pode sair do mapa.
- **Autorização central:** `assertDocumentAccess` é usada por toda rota e pelo WebSocket; sem acesso a resposta é 404.
- **Tempo real:**
  - Hocuspocus v4 em `/collab`, com o documento em Yjs persistido no Postgres;
  - leitores entram em somente leitura imposta no servidor;
  - remover ou rebaixar um membro derruba a conexão dele na hora;
  - a presença é mostrada com nome e cor validados no servidor.
- **Editor:**
  - React Flow com layout automático, ajustado ao tamanho de cada nó;
  - atalhos Tab, Enter, F2/digitar, Delete, Espaço, setas, Ctrl+Z/Y e Ctrl+B;
  - arrastar para mudar de pai ou reordenar;
  - cores e negrito;
  - desfazer só as próprias alterações;
  - reparo automático da árvore em edição concorrente;
  - status Salvando / Salvo / Offline;
  - exportar PNG;
  - carregado sob demanda.
- **Visual:** base grafite com acento âmbar "filamento", e o nó selecionado "acende". Fontes hospedadas localmente (Bricolage Grotesque e Instrument Sans).
- **Sem Docker:** o banco local e o dos testes é o PGlite (`pnpm db:local`, `pnpm db:deploy`, `pnpm db:new-migration`).
- **Testes:**
  - 132 de unidade e integração, entre eles a matriz de permissões do PRD §7 com 48 combinações e os testes de WebSocket real;
  - 3 E2E com Playwright no Chrome instalado (`pnpm test:e2e`);
  - teste de desempenho com 1.000 nós.
- **Fluxo:** push automático para o GitHub em toda atualização (CLAUDE.md §5 etapa 6).

**Revisão de segurança**
- Checklist CLAUDE.md §9 revisada. Achados corrigidos, cada um com teste de regressão:
  - **`trustProxy: true`** deixava um `X-Forwarded-For` forjado furar o rate limit de login. Agora só o Traefik é confiável.
  - **Logout em produção** não removia o cookie `__Host-`, porque faltava `Secure` no clear.
  - **Cor da presença** vinda do cliente ia para um `style`: agora só hex, validado no servidor.
  - **Documento na lixeira** respondia 403 a outros membros, revelando que existe. Agora responde 404.
- A matriz de permissões, o IDOR por troca de id, o somente leitura forjado no WebSocket, o CSRF por Origin (REST e WebSocket), a falsificação de nome na presença e o vazamento da senha provisória no log estão todos cobertos por testes.
- `pnpm audit --prod`: **sem vulnerabilidades**. `pnpm audit` (inclui dev): 1 baixa no `esbuild`, só no servidor de desenvolvimento; não expor `pnpm dev` na rede.
- **Risco aceito:** o bloqueio por conta pode ser usado para trancar alguém por 15 min (DoS leve); o rate limit por IP reduz esse risco.

**Pendências / próximos passos**
- [ ] **Primeiro deploy na VPS:**
  1. DNS de `diagram.paglamp.com.br` apontando para a VPS;
  2. `git clone` do repositório;
  3. `.env` com `POSTGRES_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`) e `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`;
  4. `docker compose up -d --build`;
  5. entrar como admin, trocar a senha e **apagar `SEED_ADMIN_PASSWORD` do `.env`**.
- [ ] PRD de **backup diário do Postgres** antes de liberar para a equipe.
- [ ] Modo escuro implementado via tokens, mas não conferido visualmente.
- [ ] Os Dockerfiles não foram testados localmente (não há Docker nesta máquina); o primeiro build na VPS valida.
- [ ] Próximas features (PRDs futuros): editor de **diagramas** (PRD-002), comentários, histórico de versões, pastas, importar/exportar outros formatos.

---

## 2026-09-21 — PRD-001 aprovado e SPEC-001 escrita
**Tipo:** docs
**Refs:** PRD-001, SPEC-001, ADR-003

**O que mudou**
- PRD-001 aprovado pelo usuário, com as perguntas em aberto respondidas: sem restrição de domínio de e-mail, sem SSO (empresa não usa Google nem Microsoft), acessos criados manualmente pelo admin, compartilhamento digitando o e-mail, sem espaço da equipe.
- ADR-003 revisado e **Aceito**: admin cria o acesso e recebe uma senha provisória (mostrada uma vez), troca obrigatória no 1º login, primeiro admin criado no boot via `SEED_ADMIN_*`.
- SPEC-001 escrita (rascunho): modelo Prisma, API de auth/admin/documentos/membros, Hocuspocus v4 em `/collab`, editor ligado ao Yjs, plano de testes e 16 tarefas em ordem.
- CLAUDE.md §2 e §9 atualizados para refletir o ADR-003.

**Revisão de segurança**
- Só documentação; sem código alterado. Os riscos da SPEC-001 estão mapeados na §6 dela.

**Pendências / próximos passos**
- [ ] Aprovação da SPEC-001.
- [ ] Testes de integração precisam de Postgres local (Docker não está no PATH desta máquina) — confirmar se o Docker Desktop está instalado.

---

## 2026-09-21 — Fundação do projeto (bootstrap)
**Tipo:** infra, docs
**Refs:** SPEC-000, ADR-001, ADR-002, ADR-003, PRD-001 (rascunho)

**O que mudou**
- Criados `CLAUDE.md` (regras, fluxo PRD → SPEC → implementação → segurança → STORY, glossário, checklist de segurança, Definition of Done) e este `STORY.md`.
- Templates em `docs/templates/` (PRD, SPEC, ADR).
- ADRs: stack (ADR-001), colaboração em tempo real com Yjs + Hocuspocus (ADR-002), autenticação por sessão com senha agora e SSO depois (ADR-003, ainda *Proposto*).
- PRD-001 (MVP de mapas mentais) em **rascunho**, aguardando aprovação.
- Monorepo pnpm: `apps/api` (Fastify 5 + Prisma 6), `apps/web` (React 19 + Vite 8 + Tailwind 4 + React Flow 12), `packages/shared` (Zod 4).
- API: validação de env com Zod, helmet (CSP `default-src 'none'`), rate limit global, checagem de `Origin` contra CSRF, handler de erro que não vaza detalhe interno, `GET /api/v1/health` com checagem do banco.
- Web: protótipo de editor de mapa mental **só em memória** (layout automático esquerda/direita, Tab/Enter/F2/Del/Espaço/Ctrl+B) e indicador de status da API.
- Infra: `docker-compose.yml` com Traefik (`leresolver`, rede externa `traefik`), autoheal, Postgres sem porta exposta, containers não-root; nginx com CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, `noindex`.
- Repositório git inicializado (sem commits).

**Revisão de segurança**
- Checagem de Origin: coberta por testes (POST de outra origem/sem Origin → 403).
- Handler de erro: teste garante que mensagem interna não vaza em 500.
- Links em nós: `isSafeLink` bloqueia `javascript:`/`data:` (testado). ESLint proíbe `dangerouslySetInnerHTML`.
- Smoke test da API compilada: health 503 com banco fora, 404 padronizado, cabeçalhos de segurança presentes.
- `pnpm audit --prod`: havia 1 alta em `deepmerge-ts` (transitiva do CLI do Prisma, sem entrada do usuário). Resolvida com `pnpm.overrides` → `deepmerge-ts@^8`. Resultado final: **sem vulnerabilidades**.
- `pnpm audit` (dev): 1 baixa em `esbuild` (leitura de arquivo pelo servidor de dev no Windows). Só afeta dev; aguardando tsup/vite atualizarem. Não rodar `pnpm dev` exposto na rede.
- Ainda **não há** autenticação nem autorização — nada pode ir para produção com dados reais antes da SPEC-001.

**Pendências / próximos passos**
- [x] PRD-001 aprovado e ADR-003 confirmado (ver entrada acima).
- [x] SPEC-001 escrita.
- [ ] PRD de backup diário do Postgres antes de liberar para a empresa.
- [ ] Bundle do web com 528 kB: dividir o editor em chunk separado (lazy) na SPEC-001.
- [ ] Protótipo visual ainda não conferido num navegador; o build passa, mas falta abrir e testar.
- [ ] Primeiro deploy na VPS: criar DNS `diagram.paglamp.com.br`, `.env` com `POSTGRES_PASSWORD` e `SESSION_SECRET`, `docker compose up -d --build`.
