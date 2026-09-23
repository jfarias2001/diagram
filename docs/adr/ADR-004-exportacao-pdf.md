# ADR-004 — Como gerar o PDF do documento

| Campo | Valor |
|---|---|
| Status | Aceito |
| Data | 2026-09-23 |

## Contexto

O PRD-008 (R6) pede exportar mapa e fluxograma em **PDF**, com tamanho (ajustado ao mapa, A4, A3) e orientação escolhidos, legível ao imprimir. Hoje só existe PNG, gerado no navegador com `html-to-image` a partir do `.react-flow__viewport` (`exportPng.ts`).

Restrições que a decisão precisa respeitar:

- **O conteúdo do documento não pode sair do navegador** sem necessidade. Mandar o documento para o servidor para virar PDF aumenta a superfície de risco e contraria a CSP e o desenho atual (o PNG já é feito no cliente).
- **Nenhum serviço novo no compose** (CLAUDE.md §12) e nada de Chromium na VPS.
- A dependência **não pode entrar no carregamento inicial** do app.
- O quadro é HTML + SVG com fontes auto-hospedadas e formatos desenhados em SVG; qualquer solução precisa reproduzir isso fielmente.

## Decisão

**PDF gerado no navegador com `jspdf` (MIT), embutindo uma imagem rasterizada em alta resolução do quadro, produzida pelo mesmo `html-to-image` que o PNG já usa. A biblioteca entra por `import()` dinâmico — só é baixada quando alguém exporta.**

Detalhes:

- Uma função só, `exportCanvas(nodes, title, options)`, atende PNG e PDF; os dois compartilham o cálculo de limites, viewport, fundo e espera de fontes que já existe hoje.
- A resolução do raster é calculada a partir do **tamanho final da página**, mirando **~200 dpi** (limitado por um teto de pixels, para não estourar o `<canvas>` do navegador). A 200 dpi, texto de 10 pt sai nítido em impressão de escritório.
- "Ajustado ao mapa" gera uma página do tamanho exato do desenho (em pontos); A4/A3 reduzem o desenho para caber na página com margem.
- Metadados do PDF: só o **título do documento**. Nada de autor, e-mail ou nome de usuário.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **jsPDF + raster de alta resolução (escolhida)** | Reaproveita todo o caminho do PNG; fidelidade total (fontes, SVG, sombras); MIT; sem servidor; ~110 kB gzip carregados sob demanda | Texto vira imagem: não dá para selecionar/copiar no PDF, e o arquivo é maior |
| Diálogo de impressão do navegador (`window.print` + `@page`) | Zero dependência; texto vetorial e selecionável | Não controla o nome do arquivo nem garante "Salvar como PDF"; o usuário tem de acertar margens e escala na caixa do sistema; resultado varia por navegador. Reprovado na experiência exigida pelo PRD (dois cliques) |
| `jspdf` + `svg2pdf.js` (vetorial) | Texto selecionável e nitidez infinita | `html-to-image` produz SVG com `foreignObject` (HTML dentro do SVG), que o `svg2pdf` **não** desenha; exigiria redesenhar o quadro inteiro em SVG puro — muito trabalho e risco de divergir do que se vê na tela |
| `pdf-lib` desenhando o mapa a partir do modelo | Vetorial de verdade, arquivo pequeno | Reimplementar todo o desenho (formatos, ligações afinadas, quebras de linha, 8 fontes embutidas com `fontkit`); duas implementações de render para manter em sincronia |
| Puppeteer/Chromium no servidor | PDF vetorial perfeito | Serviço novo e pesado na VPS, conteúdo do documento trafegando para o servidor, sessão autenticada dentro do headless — contraria CLAUDE.md §12 e a §9 (superfície) |

## Consequências

- **Fica fácil:** exportar o que se vê, inclusive o modo "vendo a versão de…", porque a fonte da verdade é o DOM já renderizado. PNG e PDF passam a ter um caminho só.
- **Fica difícil:** texto selecionável dentro do PDF. Se a empresa pedir isso, o caminho é a opção `pdf-lib`, e vira outro ADR.
- **Precisa ser feito:** `jspdf` entra como dependência de `apps/web` **carregada por `import()`**; o `pnpm build` precisa manter esse pedaço separado do carregamento inicial (verificado no plano de testes da SPEC-008 §7).
- **Limite consciente:** mapas gigantescos são limitados pelo teto de pixels; acima disso a exportação reduz a resolução em vez de falhar, e o aviso aparece no diálogo.
