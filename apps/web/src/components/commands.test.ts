import { describe, expect, it } from 'vitest';
import { type Command, rankCommands } from './commands';

// SPEC-009 §5.10 / §7 — ordenação da paleta de comandos.

const cmd = (label: string, keywords?: string): Command => ({ id: label, label, group: 'g', keywords, run: () => {} });
const list = [
  cmd('Novo irmão'),
  cmd('Exportar', 'pdf png imagem'),
  cmd('Novo filho'),
  cmd('Organizar ramo'),
  cmd('Apagar tópico'),
  cmd('Criar fluxograma'),
];
const labels = (q: string) => rankCommands(list, q).map((c) => c.label);

describe('rankCommands', () => {
  it('começo do rótulo vem antes de começo de palavra, que vem antes de "contém"', () => {
    // "ramo" começa com "ra" (palavra); "fluxograma" só contém "ra".
    expect(labels('ra')).toEqual(['Organizar ramo', 'Criar fluxograma']);
    // "Apagar…" começa com "ap" (rótulo) — vem antes de quem só contém.
    expect(labels('ap')).toEqual(['Apagar tópico']);
    // começo de palavra ("filho", "fluxograma") antes da palavra-chave ("pdf").
    expect(labels('f')).toEqual(['Novo filho', 'Criar fluxograma', 'Exportar']);
  });

  it('ignora acento e caixa', () => {
    expect(labels('IRMAO')).toEqual(['Novo irmão']);
    expect(labels('tópico')).toEqual(['Apagar tópico']);
  });

  it('palavras-chave também acham (sinônimos)', () => {
    expect(labels('pdf')).toEqual(['Exportar']);
  });

  it('mantém a ordem de registro dentro da mesma faixa', () => {
    expect(labels('novo')).toEqual(['Novo irmão', 'Novo filho']);
  });

  it('consulta vazia devolve tudo, na ordem original', () => {
    expect(labels('  ')).toEqual(list.map((c) => c.label));
  });

  it('nada parecido: lista vazia', () => {
    expect(labels('zzz')).toEqual([]);
  });
});
