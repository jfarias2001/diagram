import { HEX_COLOR } from '@diagram/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, loadRecentColors, normalizeHex, pushRecentColor } from './color';

describe('normalizeHex', () => {
  it('aceita as formas que a pessoa digita', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex(' abc ')).toBe('#aabbcc');
  });

  it('recusa o que não é cor', () => {
    for (const input of ['', 'red', '#12345', 'javascript:alert(1)', '#xyzxyz', 'rgb(1,2,3)']) {
      expect(normalizeHex(input)).toBeNull();
    }
  });
});

describe('hex ↔ hsv', () => {
  it('ida e volta preserva a cor', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7c3aed', '#1971c2', '#f2f1ed']) {
      const hsv = hexToHsv(hex);
      expect(hsv).not.toBeNull();
      expect(hsvToHex(hsv!)).toBe(hex);
    }
  });

  it('valores conhecidos', () => {
    expect(hexToHsv('#ff0000')).toMatchObject({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toMatchObject({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toMatchObject({ h: 240, s: 1, v: 1 });
    expect(hexToHsv('#808080')).toMatchObject({ s: 0 });
    expect(hexToHsv('#000000')).toMatchObject({ s: 0, v: 0 });
  });

  it('hex inválido vira null', () => {
    expect(hexToHsv('vermelho')).toBeNull();
    expect(hexToHsv('#abc')).toBeNull(); // já normalizado antes de chegar aqui
  });

  it('matiz fora da volta e valores fora da faixa são acomodados', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: -60, s: 1, v: 1 })).toBe('#ff00ff');
    expect(hsvToHex({ h: 0, s: 5, v: 5 })).toBe('#ff0000');
    expect(hsvToHex({ h: 0, s: -1, v: -1 })).toBe('#000000');
  });

  it('sempre devolve #rrggbb', () => {
    for (let h = 0; h < 360; h += 17) {
      expect(hsvToHex({ h, s: 0.63, v: 0.42 })).toMatch(HEX_COLOR);
    }
  });
});

/** Os testes rodam em node: um localStorage de mentira basta para o que é testado. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

describe('cores recentes', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeStorage() };
  });

  it('guarda sem repetir, com a mais nova na frente', () => {
    pushRecentColor('#111111');
    pushRecentColor('#222222');
    pushRecentColor('#111111');
    expect(loadRecentColors()).toEqual(['#111111', '#222222']);
  });

  it('não guarda o que não é cor e ignora lixo no storage', () => {
    pushRecentColor('javascript:alert(1)');
    expect(loadRecentColors()).toEqual([]);
    window.localStorage.setItem('paglamp.recent-colors', '{"nao":"lista"}');
    expect(loadRecentColors()).toEqual([]);
    window.localStorage.setItem('paglamp.recent-colors', '["#aabbcc","red",7]');
    expect(loadRecentColors()).toEqual(['#aabbcc']);
  });

  it('guarda no máximo doze', () => {
    for (let i = 0; i < 20; i++) pushRecentColor(`#0000${i.toString(16).padStart(2, '0')}`);
    expect(loadRecentColors()).toHaveLength(12);
  });
});

describe('cores recentes sem storage', () => {
  it('navegador com storage bloqueado não quebra o seletor', () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error('bloqueado');
      },
    };
    expect(loadRecentColors()).toEqual([]);
    // A cor ainda volta para a tela: vale enquanto o seletor estiver aberto.
    expect(pushRecentColor('#aabbcc')).toEqual(['#aabbcc']);
  });
});
