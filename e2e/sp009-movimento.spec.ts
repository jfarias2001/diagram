import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-009 §7 — movimento e acabamento.

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** Por padrão o E2E roda com "reduzir movimento"; aqui dá para ligar o movimento. */
async function newPage(browser: Browser, motion = false) {
  const context = await browser.newContext(motion ? { reducedMotion: 'no-preference' } : {});
  return context.newPage();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function choosePassword(page: Page, current: string, next: string) {
  await expect(page.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible();
  await page.getByLabel('Senha provisória').fill(current);
  await page.getByLabel('Nova senha', { exact: true }).fill(next);
  await page.getByLabel('Confirme a nova senha').fill(next);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
}

async function loginAdmin(page: Page) {
  await login(page, 'admin@paglamp.com.br', 'nova senha do admin');
  const ok = await page
    .getByRole('heading', { name: 'Documentos' })
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (ok) return;
  await login(page, 'admin@paglamp.com.br', 'senha-admin-e2e');
  await choosePassword(page, 'senha-admin-e2e', 'nova senha do admin');
}

const node = (page: Page, text: string | RegExp) => page.locator('.react-flow__node').filter({ hasText: text });

async function boxOf(page: Page, text: string) {
  const box = await node(page, text).first().boundingBox();
  if (!box) throw new Error(`bloco "${text}" não encontrado`);
  return box;
}

/** Cria um bloco com `Enter` (irmão) ou `Tab` (filho) e confirma o texto. */
async function addBlock(page: Page, key: 'Enter' | 'Tab', text: string) {
  await page.keyboard.press(key);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(node(page, text)).toBeVisible();
}

async function newMindMap(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByText('Salvo')).toBeVisible();
}


/** Espera o quadro assentar (nenhuma animação de layout em curso). */
async function settled(page: Page) {
  await expect(page.locator('[data-animating="true"]')).toHaveCount(0);
}

/**
 * Grava, a cada frame, o topo do bloco `text` durante `ms` — começa a gravar
 * ANTES de `act` e devolve as alturas vistas.
 */
async function sampleTop(page: Page, text: string, act: () => Promise<void>, ms = 600): Promise<number[]> {
  await page.evaluate(
    ({ text, ms }) => {
      const w = window as unknown as { __tops: number[] };
      w.__tops = [];
      const t0 = performance.now();
      const tick = () => {
        const el = [...document.querySelectorAll('.react-flow__node')].find(
          (n) => !n.classList.contains('node-ghost') && n.textContent?.trim() === text,
        );
        if (el) w.__tops.push(Math.round(el.getBoundingClientRect().top * 10) / 10);
        if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { text, ms },
  );
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __tops: number[] }).__tops);
}

async function mapWithFive(page: Page, title: string) {
  await newMindMap(page, title);
  await node(page, title).click();
  await addBlock(page, 'Tab', 'Um');
  for (const text of ['Dois', 'Três', 'Quatro', 'Cinco']) await addBlock(page, 'Enter', text);
  await settled(page);
}

test('irmão no meio: os de baixo DESLIZAM até o lugar novo', async ({ browser }) => {
  const page = await newPage(browser, true);
  await loginAdmin(page);
  await mapWithFive(page, 'Flui');

  await node(page, 'Três').click();
  const before = (await boxOf(page, 'Quatro')).y;
  const tops = await sampleTop(page, 'Quatro', () => page.keyboard.press('Enter'));
  await page.keyboard.press('Escape');
  await settled(page);
  const after = (await boxOf(page, 'Quatro')).y;

  expect(after).toBeGreaterThan(before + 10);
  // Passou por posições intermediárias: houve movimento, não teletransporte.
  const between = tops.filter((y) => y > before + 1 && y < after - 1);
  expect(between.length).toBeGreaterThanOrEqual(3);
  await shot(page, 'sp009-flui');
});

test('"reduzir movimento": o mesmo irmão aparece sem animação', async ({ browser }) => {
  const page = await newPage(browser); // padrão do E2E: reduce
  await loginAdmin(page);
  await mapWithFive(page, 'Sem movimento');

  await node(page, 'Três').click();
  const before = (await boxOf(page, 'Quatro')).y;
  const tops = await sampleTop(page, 'Quatro', () => page.keyboard.press('Enter'));
  await page.keyboard.press('Escape');
  const after = (await boxOf(page, 'Quatro')).y;

  expect(after).toBeGreaterThan(before + 10);
  expect(tops.filter((y) => y > before + 1 && y < after - 1)).toEqual([]);
  await expect(page.locator('[data-animating="true"]')).toHaveCount(0);
});

const zoomOf = (page: Page) =>
  page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

test('câmera: o filho criado na borda termina dentro da tela, sem mudar o zoom', async ({ browser }) => {
  const page = await newPage(browser, true);
  await loginAdmin(page);
  await newMindMap(page, 'Câmera');
  await node(page, 'Câmera').click();
  await addBlock(page, 'Tab', 'Na borda');
  await settled(page);

  // Arrasta o quadro até o bloco encostar na borda direita.
  const pane = page.locator('.react-flow__pane');
  const paneBox = (await pane.boundingBox())!;
  const blockBox = await boxOf(page, 'Na borda');
  const startX = paneBox.x + 60;
  const startY = paneBox.y + paneBox.height - 60;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + (paneBox.x + paneBox.width - 20 - (blockBox.x + blockBox.width)), startY, { steps: 8 });
  await page.mouse.up();

  const zoom = await zoomOf(page);
  await node(page, 'Na borda').click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Neto visível');
  await page.keyboard.press('Enter');
  await settled(page);
  await page.waitForTimeout(500); // a câmera desliza em ~320 ms

  const neto = await boxOf(page, 'Neto visível');
  expect(neto.x + neto.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  expect(neto.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(await zoomOf(page)).toBeCloseTo(zoom, 5);
  await shot(page, 'sp009-camera');
});

const blockCount = (page: Page) => page.locator('.react-flow__node:not(.node-ghost)').count();

test('ramo recolhido: o selo diz quantos esconde e, clicado, ABRE (sem criar bloco)', async ({ browser }) => {
  const page = await newPage(browser);
  await loginAdmin(page);
  await newMindMap(page, 'Selo');
  await node(page, 'Selo').click();
  await addBlock(page, 'Tab', 'Ramo');
  await addBlock(page, 'Tab', 'F1');
  for (let i = 2; i <= 7; i++) await addBlock(page, 'Enter', `F${i}`);

  await node(page, 'Ramo').click();
  await page.keyboard.press(' '); // Espaço recolhe
  const badge = page.getByRole('button', { name: 'Expandir ramo (7 tópicos escondidos)' });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('7');
  const before = await blockCount(page);

  // Passar o mouse NÃO troca o selo pelo "+" (a armadilha antiga).
  await node(page, 'Ramo').hover();
  await expect(badge).toBeVisible();
  await badge.click();

  await expect(node(page, 'F7')).toBeVisible();
  expect(await blockCount(page)).toBe(before + 7);
  await expect(page.getByRole('button', { name: /Expandir ramo/ })).toHaveCount(0);
  await shot(page, 'sp009-selo');
});

test('apagar ramo de 25 tópicos: guarda versão antes e oferece Desfazer', async ({ browser }) => {
  const page = await newPage(browser);
  await loginAdmin(page);
  await newMindMap(page, 'Exclusão');
  await node(page, 'Exclusão').click();
  await addBlock(page, 'Tab', 'Grande');
  await addBlock(page, 'Tab', 'G1');
  for (let i = 2; i <= 24; i++) await addBlock(page, 'Enter', `G${i}`);
  await expect(page.getByText('Salvo')).toBeVisible();

  await node(page, 'Grande').click();
  await page.keyboard.press('Delete');
  const toast = page.getByRole('status').filter({ hasText: '25 tópicos apagados.' });
  await expect(toast).toBeVisible();
  await expect(node(page, 'Grande')).toHaveCount(0);

  await page.getByRole('button', { name: 'Histórico' }).click();
  const aside = page.getByRole('complementary', { name: 'Histórico de versões' });
  await expect(aside.getByText('Antes de apagar "Grande"')).toBeVisible();

  await toast.getByRole('button', { name: 'Desfazer' }).click();
  // O ramo volta (só o que está na tela é desenhado; "Grande" está à vista).
  await expect(node(page, 'Grande')).toBeVisible();
  await shot(page, 'sp009-apagar-grande');
});

test('Ctrl+F: revela o resultado escondido SÓ para quem busca', async ({ browser }) => {
  const owner = await newPage(browser);
  await loginAdmin(owner);
  await newMindMap(owner, 'Busca');
  await node(owner, 'Busca').click();
  await addBlock(owner, 'Tab', 'Orçamento anual');
  await addBlock(owner, 'Enter', 'Equipe');
  await addBlock(owner, 'Tab', 'Cursos');
  await addBlock(owner, 'Enter', 'Orçamento de cursos');
  await node(owner, 'Equipe').click();
  await addBlock(owner, 'Enter', 'Orçamento extra');
  await node(owner, 'Equipe').click();
  await owner.keyboard.press(' '); // recolhe "Equipe" — para todos
  await expect(node(owner, 'Orçamento de cursos')).toHaveCount(0);
  await expect(owner.getByText('Salvo')).toBeVisible();

  // A "colega" é outra sessão no mesmo documento.
  const url = owner.url();
  const peer = await newPage(browser);
  await loginAdmin(peer);
  await peer.goto(url);
  await expect(node(peer, 'Equipe')).toBeVisible();
  await expect(node(peer, 'Orçamento de cursos')).toHaveCount(0);

  await node(owner, 'Busca').click();
  await owner.keyboard.press('Control+f');
  const bar = owner.getByRole('search', { name: 'Buscar no documento' });
  await bar.getByRole('textbox').fill('orcamento');
  await expect(bar.getByText('1 de 3')).toBeVisible();
  await owner.keyboard.press('Enter');
  await expect(bar.getByText('2 de 3')).toBeVisible();
  // O 2º resultado está no ramo recolhido: aparece para quem busca…
  await expect(node(owner, 'Orçamento de cursos')).toBeVisible();
  await shot(owner, 'sp009-busca');

  // …e o ramo continua recolhido para a colega.
  await peer.waitForTimeout(800);
  await expect(node(peer, 'Orçamento de cursos')).toHaveCount(0);
  await expect(peer.getByRole('button', { name: /Expandir ramo \(2 tópicos escondidos\)/ })).toBeVisible();

  // Esc fecha a busca e o desenho volta a ser o do documento.
  await owner.keyboard.press('Escape');
  await expect(node(owner, 'Orçamento de cursos')).toHaveCount(0);
});

const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });

test('Ctrl+K: abre documento pelo nome; a leitora não vê ação de edição', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  const email = `leo-${Date.now()}@gmail.com`;
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Leo Leitor');
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();

  const title = `Paleta ${Date.now()}`;
  await newMindMap(admin, title);
  await node(admin, title).click();
  await addBlock(admin, 'Tab', 'Conteúdo');
  const docUrl = admin.url();
  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill(email);
  await admin.getByLabel('Papel', { exact: true }).selectOption('VIEWER');
  await admin.locator('dialog').getByRole('button', { name: 'Adicionar' }).click();
  await expect(admin.getByText('Leo Leitor')).toBeVisible();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  // No painel: Ctrl+K, parte do título, Enter → abre o documento.
  await admin.goto('/');
  await expect(admin.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await admin.keyboard.press('Control+k');
  await expect(palette(admin)).toBeVisible();
  await admin.keyboard.type(title.slice(0, 12));
  await expect(palette(admin).getByRole('option', { name: title })).toBeVisible();
  await admin.keyboard.press('ArrowDown');
  // Navega até o documento (ações vêm antes) e abre.
  await palette(admin).getByRole('option', { name: title }).click();
  await expect(admin).toHaveURL(docUrl);
  await expect(node(admin, 'Conteúdo')).toBeVisible();

  // Dono no editor: vê ações do tópico.
  await node(admin, 'Conteúdo').click();
  await admin.keyboard.press('Control+k');
  await expect(palette(admin).getByRole('option', { name: /Novo filho/ })).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(palette(admin)).toBeHidden();

  // Leitora: nenhuma ação de edição, mas exportar e buscar sim.
  const leo = await newPage(browser);
  await login(leo, email, temp);
  await choosePassword(leo, temp, 'senha do leo 123');
  await leo.goto(docUrl);
  await node(leo, 'Conteúdo').click();
  await leo.keyboard.press('Control+k');
  const p = palette(leo);
  await expect(p.getByRole('option', { name: /Exportar/ })).toBeVisible();
  await expect(p.getByRole('option', { name: /Buscar no documento/ })).toBeVisible();
  for (const name of [/Novo filho/, /Novo irmão/, /Apagar/, /Cores/, /Aparência/, /Organizar/]) {
    await expect(p.getByRole('option', { name })).toHaveCount(0);
  }
  await shot(leo, 'sp009-paleta-leitor');
});

const folderButton = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Pastas' }).getByRole('button', { name: new RegExp(`^${name}`) });

async function createFolder(page: Page, section: 'Minhas pastas' | 'Pastas compartilhadas', name: string) {
  await page.getByRole('button', { name: `Criar pasta em ${section}` }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(folderButton(page, name)).toBeVisible();
}

test('Desfazer: lixeira e mover voltam ao lugar; nada de caixa do navegador', async ({ browser }) => {
  const page = await newPage(browser);
  const nativeDialogs: string[] = [];
  page.on('dialog', (d) => {
    nativeDialogs.push(d.message());
    void d.dismiss();
  });
  await loginAdmin(page);
  const stamp = Date.now();
  const mine = `Pessoal ${stamp}`;
  const team = `Equipe ${stamp}`;
  const title = `Relatório ${stamp}`;
  await page.goto('/');
  await createFolder(page, 'Minhas pastas', mine);
  await createFolder(page, 'Pastas compartilhadas', team);

  // Documento dentro da pasta pessoal.
  await folderButton(page, mine).click();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByText('Salvo')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para os documentos' }).click();
  await folderButton(page, mine).click();
  const card = page.getByRole('link', { name: title });
  await expect(card).toBeVisible();

  // 1) Lixeira → Desfazer: volta para a MESMA pasta.
  await page.getByRole('button', { name: `Ações de ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click();
  const trashed = page.getByRole('status').filter({ hasText: 'foi para a lixeira' });
  await expect(trashed).toBeVisible();
  await expect(card).toHaveCount(0);
  await trashed.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'voltou para o lugar de antes' })).toBeVisible();
  await expect(card).toBeVisible();

  // 2) Pessoal → compartilhada → Desfazer: volta para a pessoal e sai da compartilhada.
  await page.getByRole('button', { name: `Ações de ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  await page.locator('dialog').getByRole('button', { name: team }).click();
  const moved = page.getByRole('status').filter({ hasText: `Movido para "${team}"` });
  await expect(moved).toBeVisible();
  await moved.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('status').filter({ hasText: `De volta para "${mine}"` })).toBeVisible();
  await folderButton(page, team).click();
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  await folderButton(page, mine).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();

  // 3) Apagar de vez e apagar pasta pedem confirmação DO SISTEMA, com foco em Cancelar.
  await page.getByRole('button', { name: `Ações de ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click();
  await page.getByRole('button', { name: 'Lixeira' }).click();
  await page.getByRole('button', { name: `Ações de ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Apagar de vez' }).click();
  const confirm = page.getByRole('dialog', { name: `Apagar "${title}" de vez?` });
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Apagar de vez' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'foi apagado de vez' })).toBeVisible();

  await page.getByRole('button', { name: `Opções da pasta ${mine}` }).click();
  await page.getByRole('menuitem', { name: 'Apagar pasta' }).click();
  await page
    .getByRole('dialog', { name: `Apagar a pasta "${mine}"?` })
    .getByRole('button', { name: 'Apagar pasta' })
    .click();
  await expect(folderButton(page, mine)).toHaveCount(0);

  expect(nativeDialogs).toEqual([]);
  await shot(page, 'sp009-desfazer');
});

test('teclado: Esc fecha o menu do cartão e devolve o foco ao botão de ações', async ({ browser }) => {
  const page = await newPage(browser);
  await loginAdmin(page);
  const title = `Foco ${Date.now()}`;
  await newMindMap(page, title);
  await page.getByRole('link', { name: 'Voltar para os documentos' }).click();
  const more = page.getByRole('button', { name: `Ações de ${title}` });
  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: `Ações de ${title}` });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('celular: status visível, gaveta fecha com Esc e opções da pasta no toque', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await loginAdmin(page);
  const name = `Toque ${Date.now()}`;

  const menuButton = page.getByRole('button', { name: 'Abrir menu' });
  await menuButton.click();
  await page.getByRole('button', { name: 'Criar pasta em Minhas pastas' }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByRole('button', { name: 'Salvar' }).click();
  // Sem hover no toque: o botão de opções da pasta já está visível.
  const options = page.getByRole('button', { name: `Opções da pasta ${name}` });
  await expect(options).toBeVisible();
  await options.tap();
  await expect(page.getByRole('menuitem', { name: 'Renomear' })).toBeVisible();
  await page.keyboard.press('Escape'); // fecha o menu
  await page.keyboard.press('Escape'); // fecha a gaveta
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

  // Editor no celular: o estado de salvamento continua visível (o ponto).
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await page.getByLabel('Título').fill(`Celular ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByRole('button', { name: 'Estado: Salvo' })).toBeVisible();
  await shot(page, 'sp009-celular');
});

test('fluxograma: segurar Espaço para mover o quadro não apaga o texto da forma', async ({ browser }) => {
  const page = await newPage(browser);
  await loginAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('menuitem', { name: /Fluxograma/ }).click();
  await page.getByLabel('Título').fill('Espaço');
  await page.getByRole('button', { name: 'Criar fluxograma' }).click();
  await expect(page.getByText('Salvo')).toBeVisible();
  await page.getByRole('button', { name: 'Processo', exact: true }).click();
  await page.getByLabel('Texto da forma').fill('Etapa um');
  await page.keyboard.press('Enter');
  const etapa = page.locator('.react-flow__node').filter({ hasText: 'Etapa um' });
  await etapa.click();

  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.keyboard.down(' ');
  await page.mouse.move(pane.x + 100, pane.y + pane.height - 80);
  await page.mouse.down();
  await page.mouse.move(pane.x + 260, pane.y + pane.height - 120, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  await page.waitForTimeout(200);

  await expect(etapa).toBeVisible();
  await expect(page.getByLabel('Texto da forma')).toHaveCount(0);
});

/** Conta, durante a exportação, quantos blocos chegaram a estar no DOM ao mesmo tempo. */
async function exportAndCountRendered(page: Page): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __maxNodes: number; __obs: MutationObserver };
    w.__maxNodes = 0;
    const count = () => {
      w.__maxNodes = Math.max(w.__maxNodes, document.querySelectorAll('.react-flow__node:not(.node-ghost)').length);
    };
    w.__obs = new MutationObserver(count);
    w.__obs.observe(document.body, { subtree: true, childList: true });
  });
  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.locator('dialog').getByRole('button', { name: /PNG/ }).first().click();
  const wait = page.waitForEvent('download');
  await page.locator('dialog').getByRole('button', { name: 'Exportar', exact: true }).click();
  await wait;
  return page.evaluate(() => (window as unknown as { __maxNodes: number }).__maxNodes);
}

test('exportar com zoom: a imagem inclui o que está fora da tela', async ({ browser }) => {
  const page = await newPage(browser);
  await loginAdmin(page);
  await newMindMap(page, 'Exporta tudo');
  await node(page, 'Exporta tudo').click();
  await addBlock(page, 'Tab', 'Longe 1');
  for (let i = 2; i <= 6; i++) await addBlock(page, 'Enter', `Longe ${i}`);
  await node(page, 'Exporta tudo').click();
  for (let i = 1; i <= 6; i++) await addBlock(page, 'Tab', `Fundo ${i}`);
  await settled(page);
  await page.getByRole('button', { name: 'Ajustar à tela' }).click();
  await page.waitForTimeout(400);
  const total = await page.locator('.react-flow__node').count();

  // Aproxima muito: boa parte do mapa sai da tela (e deixa de ser desenhada).
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Aproximar' }).click();
  await page.waitForTimeout(300);
  expect(await page.locator('.react-flow__node').count()).toBeLessThan(total);

  expect(await exportAndCountRendered(page)).toBe(total);
});
