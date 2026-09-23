import type { MindMapNode } from '@diagram/shared';
import { describe, expect, it, vi } from 'vitest';
import { shapeMenuGroups } from '../diagram/SelectionBar';
import { mindMenuGroups, type MenuContext } from './NodeActionBar';

// SPEC-008 §7 — o menu em grade é montado por função pura, então dá para
// conferir o que cada papel enxerga sem montar DOM nenhum. O que importa aqui:
// leitor NÃO vê ação de edição (PRD-008 §7).

const node = (extra: Partial<MindMapNode> = {}): MindMapNode => ({
  id: 'n1',
  parentId: 'root',
  order: 1,
  text: 'Bloco',
  ...extra,
});

const actions = () =>
  ({
    createChild: vi.fn(),
    createSibling: vi.fn(),
    removeNode: vi.fn(),
    toggleCollapse: vi.fn(),
    toggleBold: vi.fn(),
    setColor: vi.fn(),
    setFill: vi.fn(),
    setInk: vi.fn(),
    setShape: vi.fn(),
    reorder: vi.fn(),
    tidy: vi.fn(),
    setLink: vi.fn(() => true),
    openNote: vi.fn(),
    cutEdge: vi.fn(),
    toggleBranchDrag: vi.fn(),
    branchDrag: false,
    focusCanvas: vi.fn(),
  }) satisfies MenuContext['actions'];

function groups(overrides: Partial<MenuContext> = {}) {
  const ctx: MenuContext = {
    node: node(),
    canEdit: true,
    isRoot: false,
    hasChildren: false,
    siblingCount: 1,
    branchMoved: false,
    actions: actions(),
    openPopover: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return mindMenuGroups(ctx);
}

const ids = (list: ReturnType<typeof groups>) => list.flatMap((g) => g.items.map((i) => i.id));

describe('menu do bloco no mapa (SPEC-008 §5.4)', () => {
  it('editor vê criar, aparência, conteúdo e apagar', () => {
    const list = ids(groups());
    expect(list).toEqual(expect.arrayContaining(['child', 'sibling', 'cut', 'colors', 'shape', 'bold', 'note', 'link', 'delete']));
  });

  it('todo item tem nome e ícone, e os de atalho conhecido trazem o atalho', () => {
    for (const group of groups()) {
      expect(group.title).toBeTruthy();
      for (const item of group.items) {
        expect(item.label).toBeTruthy();
        expect(item.icon).toBeTruthy();
      }
    }
    const byId = Object.fromEntries(groups().flatMap((g) => g.items.map((i) => [i.id, i])));
    expect(byId.child?.shortcut).toBe('Tab');
    expect(byId.sibling?.shortcut).toBe('Enter');
    expect(byId.delete?.shortcut).toBe('Delete');
  });

  it('a raiz não oferece irmão, religar nem apagar', () => {
    const list = ids(groups({ isRoot: true, node: node({ parentId: null }) }));
    expect(list).toContain('child');
    expect(list).not.toContain('sibling');
    expect(list).not.toContain('cut');
    expect(list).not.toContain('delete');
  });

  it('sem irmãos não mostra subir/descer; com irmãos mostra', () => {
    expect(ids(groups({ siblingCount: 1 }))).not.toContain('up');
    expect(ids(groups({ siblingCount: 3 }))).toEqual(expect.arrayContaining(['up', 'down']));
  });

  it('sem filhos não mostra recolher nem "levar o ramo"', () => {
    expect(ids(groups({ hasChildren: false }))).not.toContain('collapse');
    expect(ids(groups({ hasChildren: true }))).toEqual(expect.arrayContaining(['collapse', 'branch-drag']));
  });

  it('"Organizar ramo" só aparece quando há bloco movido à mão', () => {
    expect(ids(groups({ branchMoved: false }))).not.toContain('tidy');
    expect(ids(groups({ branchMoved: true }))).toContain('tidy');
  });

  it('leitor só vê o que é leitura — nenhuma ação de edição', () => {
    const reader = groups({ canEdit: false, node: node({ note: 'uma nota', link: 'https://exemplo.com' }) });
    expect(ids(reader).sort()).toEqual(['link', 'note']);
    expect(reader.every((g) => g.title === 'Conteúdo')).toBe(true);
  });

  it('leitor num bloco sem nota e sem link não vê menu nenhum', () => {
    expect(groups({ canEdit: false })).toEqual([]);
  });

  it('apagar é marcado como perigoso', () => {
    const del = groups()
      .flatMap((g) => g.items)
      .find((i) => i.id === 'delete');
    expect(del?.danger).toBe(true);
  });
});

describe('menu da forma no fluxograma (SPEC-008 §5.4)', () => {
  const shapeActions = {
    setFill: vi.fn(),
    setStroke: vi.fn(),
    setInk: vi.fn(),
    toggleBold: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
  };

  it('traz aparência, duplicar e apagar, com atalhos', () => {
    const list = shapeMenuGroups({
      allBold: false,
      count: 1,
      actions: shapeActions,
      openPopover: vi.fn(),
      close: vi.fn(),
    });
    const byId = Object.fromEntries(list.flatMap((g) => g.items.map((i) => [i.id, i])));
    expect(Object.keys(byId).sort()).toEqual(['bold', 'delete', 'duplicate', 'fill', 'ink', 'stroke']);
    expect(byId.duplicate?.shortcut).toBe('Ctrl+D');
    expect(byId.delete?.danger).toBe(true);
  });

  it('com várias formas, o rótulo do duplicar fica no plural', () => {
    const list = shapeMenuGroups({
      allBold: true,
      count: 3,
      actions: shapeActions,
      openPopover: vi.fn(),
      close: vi.fn(),
    });
    const duplicate = list.flatMap((g) => g.items).find((i) => i.id === 'duplicate');
    expect(duplicate?.label).toBe('Duplicar formas');
  });
});
