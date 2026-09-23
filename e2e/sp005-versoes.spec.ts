import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-005 §7 — salvar versão com nome, visualizar e restaurar.

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

test('histórico: salvar versão com nome, visualizar e restaurar um ramo apagado', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  await admin.goto('/');
  await admin.getByRole('button', { name: '+ Criar' }).click();
  await admin.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await admin.getByLabel('Título').fill('Plano com histórico');
  await admin.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();

  // Um ramo com filho.
  await node(admin, 'Plano com histórico').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('Contratações');
  await admin.keyboard.press('Enter');
  await node(admin, 'Contratações').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('Vagas abertas');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Vagas abertas')).toBeVisible();
  await expect(admin.getByText('Salvo')).toBeVisible();

  // 1) Salvar versão com nome.
  await admin.getByRole('button', { name: 'Histórico' }).click();
  await admin.getByRole('button', { name: 'Salvar versão com nome' }).click();
  await admin.getByLabel('Nome da versão').fill('Antes da limpeza');
  await admin.getByRole('button', { name: 'Salvar versão' }).click();
  const aside = admin.getByRole('complementary', { name: 'Histórico de versões' });
  await expect(aside.getByText('Antes da limpeza')).toBeVisible();
  await shot(admin, 'sp005-versao-salva');

  // 2) Apagar o ramo inteiro.
  await node(admin, 'Contratações').click();
  await admin.keyboard.press('Delete');
  await expect(node(admin, 'Vagas abertas')).toHaveCount(0);
  await expect(admin.getByText('Salvo')).toBeVisible();

  // 3) Visualizar a versão: o atual não muda enquanto se olha.
  await aside.getByText('Antes da limpeza').click();
  await expect(admin.getByText(/Você está vendo a versão de/)).toBeVisible();
  await expect(node(admin, 'Vagas abertas')).toBeVisible();
  await shot(admin, 'sp005-visualizando');

  // 4) Restaurar: o ramo volta e nasce a versão "Antes de restaurar…".
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Restaurar esta versão' }).click();
  await expect(admin.getByText(/Você está vendo a versão de/)).toHaveCount(0);
  await expect(node(admin, 'Vagas abertas')).toBeVisible();
  await expect(aside.getByText(/^Antes de restaurar de /)).toBeVisible();
  await shot(admin, 'sp005-restaurado');

  // 5) Continua lá depois de recarregar (foi para o servidor, não só para a tela).
  await admin.reload();
  await expect(node(admin, 'Vagas abertas')).toBeVisible();
});
