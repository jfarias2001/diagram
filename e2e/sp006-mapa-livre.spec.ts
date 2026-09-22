import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-006 §7 — posição livre, formato e cor do bloco, e tema do quadro.

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function newPage(browser: Browser) {
  const context = await browser.newContext();
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

/** Posição do bloco no quadro (canto superior esquerdo, em coordenadas da tela). */
async function boxOf(page: Page, text: string) {
  const box = await node(page, text).first().boundingBox();
  if (!box) throw new Error(`bloco "${text}" não encontrado`);
  return box;
}

test('mapa: arrastar posiciona, organizar volta, formato e cor do bloco, tema do quadro', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  await admin.getByRole('link', { name: 'Documentos' }).click();
  await admin.getByRole('button', { name: '+ Novo' }).click();
  await admin.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await admin.getByLabel('Título').fill('Mapa livre');
  await admin.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();

  // Um ramo com filho, para conferir que o ramo anda junto.
  await node(admin, 'Mapa livre').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('Processos');
  await admin.keyboard.press('Enter');
  await node(admin, 'Processos').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('Compras');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Compras')).toBeVisible();

  // 1) Arrastar "Processos" para o vazio: ele e o filho ficam onde foram soltos.
  const before = await boxOf(admin, 'Processos');
  const childBefore = await boxOf(admin, 'Compras');
  await admin.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await admin.mouse.down();
  await admin.mouse.move(before.x + before.width / 2, before.y + 220, { steps: 12 });
  await admin.mouse.up();
  await expect(admin.getByText('Salvo')).toBeVisible();

  const after = await boxOf(admin, 'Processos');
  const childAfter = await boxOf(admin, 'Compras');
  expect(after.y).toBeGreaterThan(before.y + 120);
  // O filho acompanhou, mantendo a distância relativa.
  expect(childAfter.y - childBefore.y).toBeGreaterThan(120);
  expect(Math.abs(childAfter.x - childBefore.x)).toBeLessThan(40);
  await shot(admin, 'sp006-movido');

  // 2) Formato e cor do bloco.
  await node(admin, 'Processos').click();
  await admin.getByRole('button', { name: 'Formato do bloco' }).click();
  await admin.getByRole('button', { name: 'Elipse' }).click();
  await node(admin, 'Processos').click();
  await admin.getByRole('button', { name: 'Cores' }).click();
  await admin.getByRole('button', { name: 'Preenchimento #1b2230' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  // Texto claro sobre o preenchimento escuro (contraste, PRD-006 §5.13).
  // A cor fica no bloco em si, dentro do invólucro do React Flow.
  const ink = await node(admin, 'Processos')
    .locator('div')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(ink).toBe('rgb(255, 255, 255)');
  // A elipse desenhada recebeu o preenchimento escolhido.
  await expect(node(admin, 'Processos').locator('ellipse')).toHaveAttribute('fill', '#1b2230');
  await shot(admin, 'sp006-formato-cor');

  // 3) Organizar automaticamente volta ao layout, e Ctrl+Z desfaz.
  await admin.getByRole('button', { name: 'Organizar automaticamente' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  const tidied = await boxOf(admin, 'Processos');
  expect(Math.abs(tidied.y - before.y)).toBeLessThan(40);

  await admin.locator('.react-flow').click({ position: { x: 10, y: 10 } });
  await admin.keyboard.press('Control+z');
  await expect(admin.getByText('Salvo')).toBeVisible();
  expect((await boxOf(admin, 'Processos')).y).toBeGreaterThan(before.y + 120);

  // 4) Tema do quadro: só o quadro muda, e a escolha sobrevive ao recarregar.
  const boardBg = () =>
    admin.locator('[data-board]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const headerBg = () => admin.locator('header').first().evaluate((el) => getComputedStyle(el).backgroundColor);

  const lightBoard = await boardBg();
  const headerBefore = await headerBg();
  await admin.getByRole('button', { name: /Mudar o quadro para o modo/ }).click();
  const darkBoard = await boardBg();
  expect(darkBoard).not.toBe(lightBoard);
  // O cabeçalho (resto da interface) não mudou.
  expect(await headerBg()).toBe(headerBefore);
  await shot(admin, 'sp006-tema');

  await admin.reload();
  await expect(admin.getByText('Salvo')).toBeVisible();
  expect(await boardBg()).toBe(darkBoard);
});
