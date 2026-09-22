import type { DiagramSnapshot } from '@diagram/shared';

// "Organizar" (SPEC-003 §5.4): elk em camadas, de cima para baixo. O elk
// (~1,4 MB) só é baixado na primeira vez que alguém clica no botão.

export const GRID = 16;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export async function autoLayout(
  diagram: DiagramSnapshot,
  sizes: Map<string, { width: number; height: number }> = new Map(),
): Promise<Array<{ id: string; x: number; y: number }>> {
  const shapes = Object.values(diagram.shapes);
  if (shapes.length === 0) return [];
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.spacing.componentComponent': '64',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: shapes.map((s) => ({
      id: s.id,
      width: sizes.get(s.id)?.width ?? s.w,
      height: sizes.get(s.id)?.height ?? s.h,
    })),
    edges: Object.values(diagram.edges).map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });

  // Mantém o desenho perto de onde estava: ancora no canto superior esquerdo atual.
  const originX = Math.min(...shapes.map((s) => s.x));
  const originY = Math.min(...shapes.map((s) => s.y));
  return (graph.children ?? []).map((c) => ({
    id: c.id,
    x: snap(originX + (c.x ?? 0)),
    y: snap(originY + (c.y ?? 0)),
  }));
}
