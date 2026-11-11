import { describe, expect, it } from 'vitest';
import { panToReveal } from './camera';

// SPEC-009 §5.6.3 / §7 — câmera que acompanha, sem nunca mexer no zoom.

const screen = { width: 1000, height: 600 };
const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });

describe('panToReveal', () => {
  it('bloco dentro da área segura: não mexe', () => {
    expect(panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(400, 300))).toBeNull();
  });

  it('saiu pela direita: desliza até ficar a 80 px da borda', () => {
    const v = panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(950, 300));
    expect(v).toEqual({ x: 1000 - 80 - 1050, y: 0 });
  });

  it('saiu pela esquerda, por cima e por baixo', () => {
    expect(panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(-50, 300))).toEqual({ x: 130, y: 0 });
    expect(panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(400, 10))).toEqual({ x: 0, y: 70 });
    expect(panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(400, 590))).toEqual({ x: 0, y: 600 - 80 - 630 });
  });

  it('respeita o zoom e o deslocamento atuais', () => {
    // zoom 2, deslocado: o bloco em x=450 fica em 450*2-100 = 800 → 800+200 > 920
    const v = panToReveal({ x: -100, y: 0, zoom: 2 }, screen, box(450, 100));
    expect(v).toEqual({ x: -100 + (920 - 1000), y: 0 });
  });

  it('bloco maior que a tela: alinha pelo começo', () => {
    const v = panToReveal({ x: 0, y: 0, zoom: 1 }, screen, box(500, 100, 2000, 40));
    expect(v?.x).toBe(80 - 500);
  });

  it('tela pequena: a margem cai para um quarto da tela', () => {
    expect(panToReveal({ x: 0, y: 0, zoom: 1 }, { width: 200, height: 200 }, box(60, 60, 50, 20))).toBeNull();
  });

  it('nunca devolve zoom (só desloca)', () => {
    const v = panToReveal({ x: 0, y: 0, zoom: 1.7 }, screen, box(2000, 2000));
    expect(v && Object.keys(v).sort()).toEqual(['x', 'y']);
  });
});
