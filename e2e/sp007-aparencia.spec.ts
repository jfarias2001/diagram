import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-007 §7 — arrasto que move só o bloco, cortar e religar, tema do
// documento, fonte e cor livre.

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

async function boxOf(page: Page, text: string) {
  const box = await node(page, text).first().boundingBox();
  if (!box) throw new Error(`bloco "${text}" não encontrado`);
  return box;
}

/** Cria um filho do bloco selecionado com o texto dado. */
async function addChild(page: Page, parent: string, text: string) {
  await node(page, parent).first().click();
  await page.keyboard.press('Tab');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(node(page, text)).toBeVisible();
}

test('mapa: arrastar move só o bloco, cortar e religar, tema, fonte e cor livre', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  await admin.goto('/');
  await admin.getByRole('button', { name: '+ Criar' }).click();
  await admin.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await admin.getByLabel('Título').fill('Aparência');
  await admin.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();

  await addChild(admin, 'Aparência', 'Marketing');
  await addChild(admin, 'Marketing', 'Campanhas');
  await addChild(admin, 'Aparência', 'Financeiro');
  await expect(node(admin, 'Financeiro')).toBeVisible();

  // 1) Arrastar move SÓ o bloco: o filho fica parado e a linha continua visível.
  const before = await boxOf(admin, 'Marketing');
  const childBefore = await boxOf(admin, 'Campanhas');
  await admin.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await admin.mouse.down();
  await admin.mouse.move(before.x + before.width / 2, before.y + 200, { steps: 12 });
  // Durante o arrasto, a ligação com o pai continua desenhada (PRD §5.1).
  await expect(admin.locator('.react-flow__edge')).toHaveCount(3);
  await admin.mouse.move(before.x + before.width / 2, before.y + 220, { steps: 4 });
  await admin.mouse.up();
  await expect(admin.getByText('Salvo')).toBeVisible();

  const after = await boxOf(admin, 'Marketing');
  const childAfter = await boxOf(admin, 'Campanhas');
  expect(after.y).toBeGreaterThan(before.y + 120);
  expect(Math.abs(childAfter.y - childBefore.y)).toBeLessThan(20); // o filho ficou
  expect(Math.abs(childAfter.x - childBefore.x)).toBeLessThan(20);
  await shot(admin, 'sp007-arrasto-solo');

  // 2) Cortar e religar: "Campanhas" passa a pertencer a "Financeiro".
  await node(admin, 'Campanhas').first().click();
  await admin.keyboard.press('Control+x');
  await expect(admin.getByText(/Escolha o novo tópico-pai/)).toBeVisible();

  // Esc cancela e nada muda.
  await admin.keyboard.press('Escape');
  await expect(admin.getByText(/Escolha o novo tópico-pai/)).toHaveCount(0);

  await node(admin, 'Campanhas').first().click();
  await admin.keyboard.press('Control+x');
  await shot(admin, 'sp007-religar');
  await node(admin, 'Financeiro').first().click();
  await expect(admin.getByText(/Escolha o novo tópico-pai/)).toHaveCount(0);
  await expect(admin.getByText('Salvo')).toBeVisible();

  // Recolher "Financeiro" esconde "Campanhas": prova de que ele é filho dele.
  await node(admin, 'Financeiro').first().click();
  await admin.keyboard.press(' ');
  await expect(node(admin, 'Campanhas')).toHaveCount(0);
  await admin.keyboard.press(' ');
  await expect(node(admin, 'Campanhas')).toBeVisible();

  // Ctrl+Z devolve o bloco ao pai anterior.
  await admin.locator('.react-flow').click({ position: { x: 10, y: 10 } });
  await admin.keyboard.press('Control+z');
  await expect(admin.getByText('Salvo')).toBeVisible();
  await node(admin, 'Marketing').first().click();
  await admin.keyboard.press(' ');
  await expect(node(admin, 'Campanhas')).toHaveCount(0);
  await admin.keyboard.press(' ');

  // 3) Cor livre por código hexadecimal.
  await node(admin, 'Financeiro').first().click();
  await admin.getByRole('button', { name: 'Cores' }).click();
  await admin.getByLabel('Preenchimento: código hexadecimal').fill('#7c3aed');
  await admin.getByLabel('Preenchimento: código hexadecimal').press('Enter');
  await expect(admin.getByText('Salvo')).toBeVisible();
  await expect(node(admin, 'Financeiro').locator('> div')).toHaveCSS('background-color', 'rgb(124, 58, 237)');
  await shot(admin, 'sp007-cor-livre');

  // 4) Tema e fonte do documento: valem para todos e sobrevivem ao recarregar.
  const boardBg = () => admin.locator('[data-board]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  // A fonte do documento vale para o conteúdo; a interface segue a do sistema.
  const boardFont = () => node(admin, 'Aparência').first().evaluate((el) => getComputedStyle(el).fontFamily);
  const uiFont = () => admin.locator('header').first().evaluate((el) => getComputedStyle(el).fontFamily);
  const antes = await boardBg();

  await admin.getByRole('button', { name: 'Aparência' }).click();
  await admin.getByRole('button', { name: 'Oceano' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  const depois = await boardBg();
  expect(depois).not.toBe(antes);

  await admin.getByRole('tab', { name: 'Fonte' }).click();
  const uiAntes = await uiFont();
  await admin.getByRole('button', { name: /Manuscrita/ }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  expect(await boardFont()).toContain('Caveat');
  expect(await uiFont()).toBe(uiAntes); // o cabeçalho não virou manuscrito
  await shot(admin, 'sp007-tema');

  await admin.reload();
  await expect(admin.getByText('Salvo')).toBeVisible();
  expect(await boardBg()).toBe(depois);
  expect(await boardFont()).toContain('Caveat');

  // 5) Quem só lê vê o tema aplicado, sem poder trocar.
  const url = admin.url();
  const email = `leitora-${Date.now()}@gmail.com`;
  await admin.getByRole('link', { name: 'Voltar para os documentos' }).click();
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Lia Leitora');
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();

  await admin.goto(url);
  await expect(admin.getByText('Salvo')).toBeVisible();
  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill(email);
  await admin.getByLabel('Papel').selectOption('VIEWER');
  await admin.getByRole('dialog').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(admin.getByText('Lia Leitora')).toBeVisible();
  await admin.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();

  const leitora = await newPage(browser);
  await login(leitora, email, temp);
  await choosePassword(leitora, temp, 'senha da leitora sp007');
  await leitora.goto(url);
  await expect(leitora.getByText('Somente leitura')).toBeVisible();
  expect(await leitora.locator('[data-board]').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    depois,
  );
  await leitora.getByRole('button', { name: 'Aparência' }).click();
  await expect(leitora.getByText('Só quem edita pode mudar a aparência.')).toBeVisible();
  await expect(leitora.getByRole('button', { name: 'Oceano' })).toBeDisabled();
  await shot(leitora, 'sp007-leitora');
});
