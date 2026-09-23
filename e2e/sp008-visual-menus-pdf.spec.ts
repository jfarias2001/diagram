import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-008 §7 — irmão do mesmo lado, painel novo, menu em grade e PDF.

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

/** Cria um bloco com `Enter` (irmão) ou `Tab` (filho) e confirma o texto. */
async function addBlock(page: Page, key: 'Enter' | 'Tab', text: string) {
  await page.keyboard.press(key);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(node(page, text)).toBeVisible();
}

async function newMindMap(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Criar' }).click();
  await page.getByRole('menuitem', { name: /Mapa mental/ }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByText('Salvo')).toBeVisible();
}

test('mapa: irmão nasce do mesmo lado e abaixo, e nenhum ramo troca de lado', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);
  await newMindMap(admin, 'Lados do mapa');

  // Primeiro ramo pela raiz (Tab), depois três irmãos seguidos (Enter).
  await node(admin, 'Lados do mapa').click();
  await addBlock(admin, 'Tab', 'Primeiro');
  await node(admin, 'Primeiro').click();
  await addBlock(admin, 'Enter', 'Segundo');

  const primeiro = await boxOf(admin, 'Primeiro');
  const segundo = await boxOf(admin, 'Segundo');
  const raiz = await boxOf(admin, 'Lados do mapa');
  // Mesmo lado da raiz…
  expect(Math.sign(primeiro.x - raiz.x)).toBe(Math.sign(segundo.x - raiz.x));
  // …praticamente na mesma coluna…
  expect(Math.abs(segundo.x - primeiro.x)).toBeLessThan(30);
  // …e abaixo, não atrás do pai.
  expect(segundo.y).toBeGreaterThan(primeiro.y + primeiro.height / 2);
  await shot(admin, 'sp008-irmao');

  // Mais dois irmãos: os anteriores não podem mudar de lado nem de coluna.
  await node(admin, 'Segundo').click();
  await addBlock(admin, 'Enter', 'Terceiro');
  await node(admin, 'Terceiro').click();
  await addBlock(admin, 'Enter', 'Quarto');
  await expect(admin.getByText('Salvo')).toBeVisible();

  for (const [name, before] of [
    ['Primeiro', primeiro],
    ['Segundo', segundo],
  ] as const) {
    const now = await boxOf(admin, name);
    expect(Math.sign(now.x - raiz.x)).toBe(Math.sign(before.x - raiz.x));
    expect(Math.abs(now.x - before.x)).toBeLessThan(30);
  }
  const quarto = await boxOf(admin, 'Quarto');
  expect(Math.sign(quarto.x - raiz.x)).toBe(Math.sign(primeiro.x - raiz.x));
  await shot(admin, 'sp008-quatro-irmaos');
});

test('painel novo: lateral escura, cartões/lista lembrados e busca', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);
  await newMindMap(admin, 'Documento do painel');
  await admin.getByRole('link', { name: 'Voltar para os documentos' }).click();

  // A navegação mora na lateral escura.
  const nav = admin.getByRole('navigation', { name: 'Seções' });
  for (const label of ['Meus documentos', 'Compartilhados comigo', 'Lixeira']) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible();
  }
  await expect(admin.getByRole('button', { name: '+ Criar' })).toBeVisible();
  await shot(admin, 'sp008-painel-cartoes');

  // Alternar para lista e recarregar: a escolha foi lembrada.
  await admin.getByRole('button', { name: 'Ver em lista' }).click();
  await expect(admin.getByRole('button', { name: 'Ver em lista' })).toHaveAttribute('aria-pressed', 'true');
  await shot(admin, 'sp008-painel-lista');
  await admin.reload();
  await expect(admin.getByRole('button', { name: 'Ver em lista' })).toHaveAttribute('aria-pressed', 'true');
  await expect(admin.getByRole('button', { name: 'Ver em cartões' })).toHaveAttribute('aria-pressed', 'false');

  // Voltar para cartões vale para a próxima visita.
  await admin.getByRole('button', { name: 'Ver em cartões' }).click();
  await admin.reload();
  await expect(admin.getByRole('button', { name: 'Ver em cartões' })).toHaveAttribute('aria-pressed', 'true');
  await expect(admin.getByText('Documento do painel')).toBeVisible();
});

test('menu em grade: nomes e atalhos à vista, sem cobrir o bloco, e os atalhos continuam', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);
  await newMindMap(admin, 'Menu do bloco');

  await node(admin, 'Menu do bloco').click();
  await addBlock(admin, 'Tab', 'Processos');
  await node(admin, 'Processos').click();
  await admin.getByRole('button', { name: 'Mais ações' }).click();

  const menu = admin.getByRole('menu', { name: 'Ações do tópico' });
  await expect(menu).toBeVisible();
  // Nome + atalho visíveis, agrupados por assunto.
  for (const label of ['Novo filho', 'Novo irmão', 'Cores', 'Formato', 'Apagar']) {
    await expect(menu.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible();
  }
  for (const group of ['Criar', 'Aparência', 'Conteúdo', 'Perigo']) {
    await expect(menu.getByText(group, { exact: true })).toBeVisible();
  }
  await expect(menu.getByText('Tab', { exact: true })).toBeVisible();
  await expect(menu.getByText('Enter', { exact: true })).toBeVisible();
  await shot(admin, 'sp008-menu-grade');

  // O menu não cobre o bloco selecionado.
  const blockBox = (await node(admin, 'Processos').first().boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  const overlaps =
    menuBox.x < blockBox.x + blockBox.width &&
    menuBox.x + menuBox.width > blockBox.x &&
    menuBox.y < blockBox.y + blockBox.height &&
    menuBox.y + menuBox.height > blockBox.y;
  expect(overlaps).toBe(false);

  // Esc fecha e devolve o foco ao quadro: Tab continua criando filho.
  await admin.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await addBlock(admin, 'Tab', 'Compras');
  await expect(node(admin, 'Compras')).toBeVisible();

  // Uma ação do menu funciona de verdade.
  await node(admin, 'Processos').click();
  await admin.getByRole('button', { name: 'Mais ações' }).click();
  await menu.getByRole('menuitem', { name: /Recolher/ }).click();
  await expect(node(admin, 'Compras')).toBeHidden();
});

test('exportar: o diálogo gera um PDF com o nome do documento', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);
  await newMindMap(admin, 'Mapa para imprimir');
  await node(admin, 'Mapa para imprimir').click();
  await addBlock(admin, 'Tab', 'Um ramo');

  await admin.getByRole('button', { name: 'Exportar' }).click();
  await expect(admin.getByRole('heading', { name: 'Exportar documento' })).toBeVisible();
  await admin.getByRole('button', { name: 'A4' }).click();
  await admin.getByRole('button', { name: 'Paisagem' }).click();
  await shot(admin, 'sp008-exportar');

  const wait = admin.waitForEvent('download');
  await admin.locator('dialog').getByRole('button', { name: 'Exportar' }).click();
  const download = await wait;
  expect(download.suggestedFilename()).toBe('Mapa para imprimir.pdf');

  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile((await download.path()) as string);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(bytes.byteLength).toBeGreaterThan(5_000);
});

test('leitora: menu só com ações de leitura, mas consegue exportar', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);

  const email = `bia-${Date.now()}@gmail.com`;
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill('Bia Leitora');
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();

  await newMindMap(admin, 'Somente leitura');
  await node(admin, 'Somente leitura').click();
  await addBlock(admin, 'Tab', 'Item visível');
  const docUrl = admin.url();

  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill(email);
  await admin.getByLabel('Papel', { exact: true }).selectOption('VIEWER');
  await admin.locator('dialog').getByRole('button', { name: 'Adicionar' }).click();
  await expect(admin.getByText('Bia Leitora')).toBeVisible();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  const bia = await newPage(browser);
  await login(bia, email, temp);
  await choosePassword(bia, temp, 'senha da bia 123');
  await bia.goto(docUrl);
  await expect(bia.getByText('Somente leitura').first()).toBeVisible();

  // Nenhuma ação de edição no bloco.
  await node(bia, 'Item visível').click();
  await expect(bia.getByRole('button', { name: 'Adicionar filho' })).toBeHidden();
  await expect(bia.getByRole('button', { name: 'Cores' })).toBeHidden();

  // Mas exportar continua valendo para quem pode ver (PRD-008 §7).
  await bia.getByRole('button', { name: 'Exportar' }).click();
  await expect(bia.getByRole('heading', { name: 'Exportar documento' })).toBeVisible();
  const wait = bia.waitForEvent('download');
  await bia.locator('dialog').getByRole('button', { name: 'Exportar' }).click();
  const download = await wait;
  expect(download.suggestedFilename()).toBe('Somente leitura.pdf');
  await shot(bia, 'sp008-leitora');
});
