import { type Browser, expect, type Page, test } from '@playwright/test';

// SPEC-003 §7 — desenhar um fluxograma, editar junto e limitar o leitor.

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

/** Admin do stack, rodando antes ou depois dos outros testes. */
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

async function createUser(admin: Page, name: string, email: string): Promise<string> {
  await admin.getByRole('link', { name: 'Usuários' }).click();
  await admin.getByRole('button', { name: '+ Criar acesso' }).click();
  await admin.getByLabel('Nome').fill(name);
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByRole('button', { name: 'Criar acesso' }).last().click();
  const code = admin.locator('dialog code');
  await expect(code).toHaveText(/^[A-Za-z0-9]{16}$/);
  const temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: 'Pronto' }).click();
  return temp;
}

const shape = (page: Page, text: string | RegExp) => page.locator('.react-flow__node').filter({ hasText: text });

/** Arrasta uma forma da paleta para uma posição do quadro. */
async function dragShape(page: Page, name: string, to: { x: number; y: number }) {
  const item = page.getByRole('button', { name, exact: true });
  const box = (await item.boundingBox())!;
  const canvas = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + to.x, canvas.y + to.y, { steps: 12 });
  await page.mouse.up();
}

/** Puxa uma seta da alça de baixo de uma forma até o meio de outra (ou até um ponto). */
async function connect(page: Page, from: string, to: string | { x: number; y: number }) {
  const source = shape(page, from);
  const box = (await source.boundingBox())!;
  await source.hover();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height);
  await page.mouse.down();
  if (typeof to === 'string') {
    const target = (await shape(page, to).boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  } else {
    const canvas = (await page.locator('.react-flow__pane').boundingBox())!;
    await page.mouse.move(canvas.x + to.x, canvas.y + to.y, { steps: 12 });
  }
  await page.mouse.up();
}

test('fluxograma: paleta, setas, organizar, colar e leitor só lê', async ({ browser }) => {
  const admin = await newPage(browser);
  await loginAdmin(admin);
  const carlaTemp = await createUser(admin, 'Carla Leitora', 'carla@gmail.com');
  const brunoTemp = await createUser(admin, 'Bruno Editor', 'bruno@gmail.com');

  // Novo fluxograma pelo menu do painel.
  await admin.getByRole('link', { name: 'Documentos' }).click();
  await admin.getByRole('button', { name: '+ Novo' }).click();
  await admin.getByRole('menuitem', { name: /Fluxograma/ }).click();
  await admin.getByLabel('Título').fill('Fluxo de pedido');
  await admin.getByRole('button', { name: 'Criar fluxograma' }).click();
  await expect(admin.getByText('Salvo')).toBeVisible();
  await expect(admin.getByRole('complementary', { name: 'Formas' })).toBeVisible();

  // 1) Arrasta Início/Fim e Decisão da paleta e escreve o texto.
  await dragShape(admin, 'Início / Fim', { x: 320, y: 120 });
  await admin.getByLabel('Texto da forma').fill('Pedido recebido');
  await admin.keyboard.press('Enter');
  await expect(shape(admin, 'Pedido recebido')).toBeVisible();

  await dragShape(admin, 'Decisão', { x: 320, y: 300 });
  await admin.getByLabel('Texto da forma').fill('Crédito aprovado xilofluxo?');
  await admin.keyboard.press('Enter');
  await expect(shape(admin, /Crédito aprovado/)).toBeVisible();

  // 2) Liga as duas formas.
  await connect(admin, 'Pedido recebido', 'Crédito aprovado xilofluxo?');
  await expect(admin.locator('.react-flow__edge')).toHaveCount(1);

  // 3) Soltar a seta no vazio cria a próxima forma já ligada.
  await connect(admin, 'Crédito aprovado xilofluxo?', { x: 560, y: 480 });
  await admin.getByRole('menu', { name: 'Criar forma ligada' }).getByRole('menuitem', { name: 'Processo', exact: true }).click();
  await admin.getByLabel('Texto da forma').fill('Faturar');
  await admin.keyboard.press('Enter');
  await expect(shape(admin, 'Faturar')).toBeVisible();
  await expect(admin.locator('.react-flow__edge')).toHaveCount(2);

  // 4) Rótulo "Sim" no conector novo, por duplo clique.
  const edges = admin.locator('.react-flow__edge');
  await edges.last().dblclick();
  await admin.getByLabel('Texto do conector').fill('Sim');
  await admin.keyboard.press('Enter');
  await expect(admin.getByText('Sim', { exact: true })).toBeVisible();
  await shot(admin, '20-fluxograma');

  // 5) Um colega Editor vê ao vivo.
  const bruno = await newPage(browser);
  await login(bruno, 'bruno@gmail.com', brunoTemp);
  await choosePassword(bruno, brunoTemp, 'senha do bruno 2026');

  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill('bruno@gmail.com');
  await admin.getByLabel('Papel', { exact: true }).selectOption('EDITOR');
  await admin.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(admin.locator('dialog').getByText('Bruno Editor')).toBeVisible();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  await bruno.getByRole('tab', { name: 'Compartilhados comigo' }).click();
  await bruno.getByRole('link', { name: /Fluxo de pedido/ }).click();
  await expect(shape(bruno, 'Faturar')).toBeVisible();
  await shape(bruno, 'Faturar').dblclick();
  await bruno.getByLabel('Texto da forma').fill('Faturar agora');
  await bruno.keyboard.press('Enter');
  await expect(shape(admin, 'Faturar agora')).toBeVisible(); // chegou ao vivo

  // 6) Apagar a decisão apaga as setas dela; Ctrl+Z traz tudo de volta.
  await shape(admin, /Crédito aprovado/).click();
  await admin.getByRole('button', { name: 'Apagar (Delete)' }).click();
  await expect(shape(admin, /Crédito aprovado/)).toHaveCount(0);
  await expect(admin.locator('.react-flow__edge')).toHaveCount(0);
  await admin.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  await expect(shape(admin, /Crédito aprovado/)).toBeVisible();
  await expect(admin.locator('.react-flow__edge')).toHaveCount(2);

  // 7) Organizar arruma de cima para baixo; Ctrl+Z volta.
  const before = (await shape(admin, 'Faturar agora').boundingBox())!;
  await admin.getByRole('button', { name: 'Organizar', exact: false }).click();
  await expect
    .poll(async () => (await shape(admin, 'Faturar agora').boundingBox())!.y, { timeout: 15_000 })
    .not.toBe(before.y);
  await admin.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  await expect.poll(async () => (await shape(admin, 'Faturar agora').boundingBox())!.y).toBe(before.y);

  // 8) Copiar e colar duplica a forma selecionada.
  await shape(admin, 'Pedido recebido').click();
  await admin.keyboard.press('Control+c');
  await admin.keyboard.press('Control+v');
  await expect(shape(admin, 'Pedido recebido')).toHaveCount(2);

  // 9) Recarregar mantém tudo.
  await expect(admin.getByText('Salvo')).toBeVisible();
  await admin.waitForTimeout(2500);
  await admin.reload();
  await expect(shape(admin, 'Faturar agora')).toBeVisible();
  await expect(shape(admin, 'Pedido recebido')).toHaveCount(2);
  await expect(admin.getByText('Sim', { exact: true })).toBeVisible();

  // 10) Leitora: sem paleta e sem conseguir mover.
  const carla = await newPage(browser);
  await login(carla, 'carla@gmail.com', carlaTemp);
  await choosePassword(carla, carlaTemp, 'senha da carla 2026');
  await admin.getByRole('button', { name: 'Compartilhar' }).click();
  await admin.getByLabel('Convidar pelo e-mail').fill('carla@gmail.com');
  await admin.getByLabel('Papel', { exact: true }).selectOption('VIEWER');
  await admin.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await admin.getByRole('button', { name: 'Fechar' }).click();

  await carla.getByRole('tab', { name: 'Compartilhados comigo' }).click();
  await carla.getByRole('link', { name: /Fluxo de pedido/ }).click();
  await expect(carla.getByText('Somente leitura')).toBeVisible();
  await expect(carla.getByRole('complementary', { name: 'Formas' })).toHaveCount(0);
  await expect(carla.getByRole('button', { name: 'Desfazer (Ctrl+Z)' })).toHaveCount(0);
  const target = shape(carla, 'Faturar agora');
  const posBefore = (await target.boundingBox())!;
  await target.hover();
  await carla.mouse.down();
  await carla.mouse.move(posBefore.x + 150, posBefore.y + 150, { steps: 8 });
  await carla.mouse.up();
  await carla.waitForTimeout(300);
  expect((await target.boundingBox())!.x).toBe(posBefore.x);
  await shot(carla, '21-fluxograma-leitora');

  // 11) Painel: filtro por tipo e busca pelo texto de uma forma.
  await admin.getByRole('link', { name: 'Voltar para os documentos' }).click();
  await admin.getByRole('button', { name: 'Fluxogramas' }).click();
  await expect(admin.getByRole('link', { name: /Fluxo de pedido/ })).toBeVisible();
  await admin.getByLabel('Buscar documentos').fill('xilofluxo');
  await expect(admin.getByRole('link', { name: /Fluxo de pedido/ })).toBeVisible();
});
