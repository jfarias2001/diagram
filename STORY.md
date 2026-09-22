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

- **Fase:** MVP (SPEC-001), mapa com o mouse (SPEC-002) e **fluxogramas (SPEC-003)** implementados e testados; ainda não publicados na VPS. PRDs 004, 005 e 006 aprovados; **SPEC-004, SPEC-005 e SPEC-006 escritas, aguardando aprovação**.
- **Em produção:** nada ainda.
- **Repositório:** https://github.com/jfarias2001/diagram (branch `main`; push automático a cada atualização — CLAUDE.md §5 etapa 6).
- **Próximo passo:** aprovação das SPECs 004–006 e escolha da ordem de implementação; em paralelo, concluir o primeiro deploy na VPS e PRD de backup do banco antes de liberar para a equipe.

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
