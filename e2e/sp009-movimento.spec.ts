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
