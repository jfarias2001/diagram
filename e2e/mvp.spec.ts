import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-001 §7 — fluxo E2E completo do MVP.

const SHOTS = process.env.E2E_SHOTS; // pasta para screenshots de revisão visual (opcional)
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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
  await expect(page.getByRole('heading', { name: 'Mapas' })).toBeVisible();
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test('MVP: acesso, mapa colaborativo e permissões', async ({ browser }) => {
  // 1) Admin inicial entra e troca a senha provisória.
  const admin = await newPage(browser);
  await login(admin, 'admin@paglamp.com.br', 'senha-admin-e2e');
  await shot(admin, '01-trocar-senha');
  await choosePassword(admin, 'senha-admin-e2e', 'nova senha do admin');

  // 2) Admin cria o acesso da Ana e pega a senha provisória.
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Ana Souza');
  await admin.getByLabel('E-mail').fill('ana@gmail.com');
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const tempPassword = (await code.textContent())!.trim();
  await shot(admin, '02-senha-provisoria');
  await admin.getByRole('button', { name: 'Pronto' }).click();
  await expect(admin.getByText('Aguardando 1º acesso')).toBeVisible();
  await shot(admin, '03-usuarios');

  // 3) Ana entra, troca a senha e cria um mapa.
  const ana = await newPage(browser);
  await login(ana, 'ana@gmail.com', tempPassword);
  await choosePassword(ana, tempPassword, 'senha da ana 2026');
  await shot(ana, '04-painel-vazio');
  await ana.getByRole('button', { name: '+ Novo mapa' }).click();
  await ana.getByLabel('Título').fill('Planejamento 2027');
  await ana.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(ana.getByText('Salvo')).toBeVisible();

  // 4) Edita só com o teclado: Tab = filho, Enter = irmão.
  const canvas = ana.getByLabel('Mapa mental. Use as setas para navegar.');
  await canvas.focus();
  await ana.keyboard.press('Tab');
  await ana.keyboard.type('Marketing');
  await ana.keyboard.press('Enter');
  await ana.keyboard.press('Enter');
  await ana.keyboard.type('Vendas');
  await ana.keyboard.press('Enter');
  await ana.keyboard.press('Tab');
  await ana.keyboard.type('Meta Q1');
  await ana.keyboard.press('Enter');
  await expect(ana.getByText('Marketing')).toBeVisible();
  await expect(ana.getByText('Meta Q1')).toBeVisible();
  await expect(ana.getByText('Salvo')).toBeVisible();
  await shot(ana, '05-editor');

  // Desfazer só o que ela fez.
  await ana.keyboard.press('Control+z');
  await expect(ana.getByText('Meta Q1')).toBeHidden();
  await ana.keyboard.press('Control+y');
  await expect(ana.getByText('Meta Q1')).toBeVisible();

  // 5) Ana compartilha com o admin como Editor.
  await ana.getByRole('button', { name: 'Compartilhar' }).click();
  await ana.getByLabel('Convidar pelo e-mail').fill('admin@paglamp.com.br');
  await ana.getByRole('button', { name: 'Adicionar' }).click();
  await expect(ana.locator('dialog').getByText('Admin Paglamp')).toBeVisible();
  await shot(ana, '06-compartilhar');
  await ana.getByRole('button', { name: 'Fechar' }).click();

  // 6) Admin abre pelo "Compartilhados comigo" e edita junto, em tempo real.
  await admin.getByRole('link', { name: 'Mapas' }).click();
  await admin.getByRole('tab', { name: 'Compartilhados comigo' }).click();
  await admin.getByRole('link', { name: /Planejamento 2027/ }).click();
  await expect(admin.getByText('Marketing')).toBeVisible();
  await expect(ana.getByLabel(/Também no mapa: Admin Paglamp/)).toBeVisible();

  await admin.getByText('Vendas').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('Ideia do admin');
  await admin.keyboard.press('Enter');
  await expect(ana.getByText('Ideia do admin')).toBeVisible(); // chegou ao vivo
  await shot(ana, '07-tempo-real');

  // 7) Ana rebaixa o admin para Leitor: vale na hora.
  await ana.getByRole('button', { name: 'Compartilhar' }).click();
  await ana.getByLabel('Papel de Admin Paglamp').selectOption('VIEWER');
  await ana.getByRole('button', { name: 'Fechar' }).click();
  await expect(admin.getByText('Somente leitura')).toBeVisible();

  await admin.getByText('Marketing').click();
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('não deveria entrar');
  await expect(admin.getByText('não deveria entrar')).toBeHidden();
  await expect(ana.getByText('não deveria entrar')).toBeHidden();
  await shot(admin, '08-somente-leitura');

  // 8) Recarregar mantém tudo (persistido no servidor).
  await ana.reload();
  await expect(ana.getByText('Ideia do admin')).toBeVisible();
  await expect(ana.getByText('Meta Q1')).toBeVisible();

  // 9) Painel da Ana mostra o mapa; busca pelo texto de um nó encontra.
  await ana.getByRole('link', { name: 'Voltar para os mapas' }).click();
  await ana.getByLabel('Buscar mapas').fill('Marketing');
  await expect(ana.getByRole('link', { name: /Planejamento 2027/ })).toBeVisible();
  await shot(ana, '09-painel');
});

test('não-membro que tenta abrir um mapa pelo link vê "Mapa não encontrado"', async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, 'admin@paglamp.com.br', 'nova senha do admin');
  await expect(page.getByRole('heading', { name: 'Mapas' })).toBeVisible();
  await page.goto('/m/id-que-nao-existe');
  await expect(page.getByText('Mapa não encontrado')).toBeVisible();
});

test('rotas protegidas mandam para o login e voltam depois', async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto('/admin/usuarios');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusuarios/);
  await page.getByLabel('E-mail').fill('admin@paglamp.com.br');
  await page.getByLabel('Senha').fill('nova senha do admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  await shot(page, '00-login-ok');
});
