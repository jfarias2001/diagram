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
