import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-002 §7 — montar um mapa só com o mouse, com nota e link; leitor só lê.

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

/** Admin do stack; funciona rodando antes ou depois do mvp.spec (que troca a senha). */
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

test('mapa só com o mouse: barra, "+", duplo clique, nota e link; leitor só lê', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  // Acesso da leitora.
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Bia Leitora');
  await admin.getByLabel('E-mail').fill('bia@gmail.com');
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const biaTemp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();

  // Mapa novo.
  await admin.getByRole('link', { name: 'Documentos' }).click();
  await admin.getByRole('button', { name: '+ Novo' }).click();
  await admin.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await admin.getByLabel('Título').fill('Compras pelo mouse');
  await admin.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();

  // 1) Clica na raiz e usa "+ Filho" da barra flutuante.
  await node(admin, 'Compras pelo mouse').click();
  await admin.getByRole('button', { name: 'Adicionar filho (Tab)' }).click();
  await admin.keyboard.type('Fornecedores');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Fornecedores')).toBeVisible();

  // 2) "+" que aparece ao passar o mouse.
  const fornecedores = node(admin, 'Fornecedores');
  await fornecedores.hover();
  await fornecedores.getByRole('button', { name: 'Adicionar tópico filho' }).click();
  await admin.keyboard.type('Cotação');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Cotação')).toBeVisible();

  // "+ Irmão" pela barra.
  await node(admin, 'Cotação').click();
  await admin.getByRole('button', { name: 'Adicionar irmão (Enter)' }).click();
  await admin.keyboard.type('Contrato');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Contrato')).toBeVisible();

  // 3) Duplo clique num tópico não selecionado edita, com o cursor no fim, e não dá zoom.
  const zoomBefore = await admin.locator('.react-flow__viewport').getAttribute('style');
  await node(admin, 'Fornecedores').dblclick();
  expect(await admin.locator('.react-flow__viewport').getAttribute('style')).toBe(zoomBefore);
  await admin.getByLabel('Texto do nó').press('End');
  await admin.keyboard.type(' 2027');
  await admin.keyboard.press('Enter');
  await expect(node(admin, 'Fornecedores 2027')).toBeVisible();

  // Cor pela barra.
  await node(admin, 'Fornecedores 2027').click();
  await admin.getByRole('button', { name: 'Cor' }).click();
  await admin.getByRole('button', { name: 'Cor #2f9e44' }).click();
  await expect(node(admin, 'Fornecedores 2027').locator('> div')).toHaveCSS('border-color', 'rgb(47, 158, 68)');

  // 4) Nota.
  await admin.getByRole('button', { name: 'Adicionar nota' }).click();
  await admin.getByLabel('Texto da nota').fill('Negociar prazo com a zebraquinta');
  await admin.getByRole('button', { name: 'Fechar nota (Esc)' }).click();
  await expect(node(admin, 'Fornecedores 2027').getByRole('button', { name: 'Ver nota' })).toBeVisible();

  // 5) Link: javascript: é recusado; endereço sem protocolo vira https.
  await node(admin, 'Fornecedores 2027').click();
  await admin.getByRole('button', { name: 'Adicionar link' }).click();
  await admin.getByLabel('Endereço do link').fill('javascript:alert(1)');
  await admin.getByRole('button', { name: 'Salvar' }).click();
  await expect(admin.getByRole('alert')).toContainText('Link inválido');
  await admin.getByLabel('Endereço do link').fill('paglamp.com.br');
  await admin.getByRole('button', { name: 'Salvar' }).click();
  const link = node(admin, 'Fornecedores 2027').getByRole('link', { name: 'Abrir link: https://paglamp.com.br' });
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await shot(admin, '10-barra-flutuante');

  // 6) Recolher / expandir pela barra.
  await node(admin, 'Fornecedores 2027').click();
  await admin.getByRole('button', { name: 'Recolher ramo (Espaço)' }).click();
  await expect(node(admin, 'Cotação')).toBeHidden();
  await admin.getByRole('button', { name: 'Expandir ramo (Espaço)' }).click();
  await expect(node(admin, 'Cotação')).toBeVisible();

  // 7) Apagar pela barra e desfazer pelo botão.
  await node(admin, 'Contrato').click();
  await admin.getByRole('button', { name: 'Apagar tópico e seus filhos (Delete)' }).click();
  await expect(node(admin, 'Contrato')).toBeHidden();
  await admin.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  await expect(node(admin, 'Contrato')).toBeVisible();

  // Zoom e ajustar à tela não quebram nada.
  await admin.getByRole('button', { name: 'Aproximar' }).click();
  await admin.getByRole('button', { name: 'Ajustar à tela' }).click();

  // 8) Recarregar mantém tudo.
  await expect(admin.getByText('Salvo')).toBeVisible();
  await admin.waitForTimeout(2500); // debounce de persistência do servidor
  await admin.reload();
  await expect(node(admin, 'Fornecedores 2027').getByRole('button', { name: 'Ver nota' })).toBeVisible();
  await expect(node(admin, 'Contrato')).toBeVisible();
  await expect(node(admin, 'Cotação')).toBeVisible();

  // Compartilha com a Bia como Leitora.
  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill('bia@gmail.com');
  await admin.getByLabel('Papel', { exact: true }).selectOption('VIEWER');
  await admin.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(admin.locator('dialog').getByText('Bia Leitora')).toBeVisible();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  // Leitora: vê nota e link, sem ações de edição.
  const bia = await newPage(browser);
  await login(bia, 'bia@gmail.com', biaTemp);
  await choosePassword(bia, biaTemp, 'senha da bia 2026');
  await bia.getByRole('tab', { name: 'Compartilhados comigo' }).click();
  await bia.getByRole('link', { name: /Compras pelo mouse/ }).click();
  await expect(bia.getByText('Somente leitura')).toBeVisible();
  await node(bia, 'Fornecedores 2027').click();
  await expect(bia.getByRole('button', { name: 'Adicionar filho (Tab)' })).toHaveCount(0);
  await expect(bia.getByRole('button', { name: 'Desfazer (Ctrl+Z)' })).toHaveCount(0);
  await expect(node(bia, 'Fornecedores 2027').getByRole('button', { name: 'Adicionar tópico filho' })).toHaveCount(0);
  await expect(bia.getByRole('link', { name: 'Abrir link: https://paglamp.com.br' }).first()).toBeVisible();
  await bia.getByRole('button', { name: 'Ver nota' }).first().click();
  await expect(bia.getByLabel('Nota do tópico')).toContainText('Negociar prazo com a zebraquinta');
  await expect(bia.getByLabel('Texto da nota')).toHaveCount(0);
  await shot(bia, '11-leitora-nota');

  // 9) Busca do painel encontra pela nota.
  await admin.getByRole('link', { name: 'Voltar para os documentos' }).click();
  await admin.getByLabel('Buscar documentos').fill('zebraquinta');
  await expect(admin.getByRole('link', { name: /Compras pelo mouse/ })).toBeVisible();
});
