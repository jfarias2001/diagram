import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-004 §7 — pasta compartilhada: entrar dá acesso, sair tira.

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

test('pasta compartilhada: entrar dá acesso a tudo, sair tira na hora', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  // Acesso da Carla.
  const email = `carla-${Date.now()}@gmail.com`;
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Carla Comercial');
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();

  // Pasta compartilhada e um documento dentro dela.
  await admin.getByRole('link', { name: 'Documentos' }).click();
  await admin.getByRole('button', { name: 'Criar pasta em Pastas compartilhadas' }).click();
  await admin.getByLabel('Nome').fill('Comercial');
  await admin.getByRole('button', { name: 'Salvar' }).click();
  const pasta = admin.getByRole('navigation', { name: 'Pastas' }).getByRole('button', { name: /^Comercial/ });
  await expect(pasta).toBeVisible();
  await pasta.click();

  await admin.getByRole('button', { name: '+ Novo' }).click();
  await admin.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await admin.getByLabel('Título').fill('Tabela de preços');
  await admin.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  const docUrl = admin.url();
  await shot(admin, 'sp004-documento-na-pasta');

  // Carla entra na pasta como Leitora.
  await admin.getByRole('link', { name: 'Voltar para os documentos' }).click();
  await admin.getByRole('button', { name: 'Opções da pasta Comercial' }).click();
  await admin.getByRole('button', { name: 'Gerenciar membros' }).click();
  await admin.getByLabel('E-mail do colega').fill(email);
  await admin.getByLabel('Papel na pasta').selectOption('VIEWER');
  await admin.getByRole('button', { name: 'Adicionar' }).click();
  await expect(admin.getByText('Carla Comercial')).toBeVisible();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  // Carla vê o documento sem ele ter sido compartilhado um a um.
  const carla = await newPage(browser);
  await login(carla, email, temp);
  await choosePassword(carla, temp, 'senha da carla 123');
  await expect(carla.getByRole('button', { name: /^Comercial/ })).toBeVisible();
  await carla.goto(docUrl);
  await expect(carla.getByText('Somente leitura')).toBeVisible();
  await expect(carla.locator('.react-flow__node').filter({ hasText: 'Tabela de preços' })).toBeVisible();
  await shot(carla, 'sp004-carla-leitora');

  // Removida da pasta, perde o acesso — inclusive com o documento aberto.
  await admin.getByRole('button', { name: 'Opções da pasta Comercial' }).click();
  await admin.getByRole('button', { name: 'Gerenciar membros' }).click();
  await admin.getByRole('button', { name: 'Remover' }).click();
  await expect(admin.getByText('Ninguém além de você tem acesso a esta pasta.')).toBeVisible();

  await carla.reload();
  await expect(carla.getByText('Documento não encontrado')).toBeVisible();
  await shot(carla, 'sp004-sem-acesso');
});
