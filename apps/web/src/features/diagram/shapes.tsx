import type { ShapeKind } from '@diagram/shared';
import type { ReactNode } from 'react';

// Desenho de cada forma (SPEC-003 §5.3), num viewBox 100×100 esticado para o
// tamanho do nó. `vector-effect: non-scaling-stroke` mantém a borda fina.

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  process: 'Processo',
  terminator: 'Início / Fim',
  decision: 'Decisão',
  io: 'Entrada / Saída',
  document: 'Documento',
  database: 'Banco de dados',
  subprocess: 'Sub-processo',
  text: 'Texto livre',
  note: 'Nota',
};

export const PALETTE_ORDER: ShapeKind[] = [
  'terminator',
  'process',
  'decision',
  'io',
  'document',
  'database',
  'subprocess',
  'note',
  'text',
];

/** Cores do documento: fixas (claras), para ficarem iguais em qualquer tema (§5.3). */
export const DEFAULT_FILL = '#ffffff';
export const DEFAULT_STROKE = '#475467';
export const SHAPE_INK = '#1b2230';

export const FILL_COLORS = ['#ffffff', '#fff3bf', '#ffe8cc', '#ffe3e3', '#f3d9fa', '#dbe4ff', '#d0ebff', '#c3fae8', '#d3f9d8'];
export const STROKE_COLORS = ['#475467', '#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c7cfa'];

/** Margem interna do texto em cada forma, em % da largura/altura. */
export const TEXT_INSET: Record<ShapeKind, { x: number; y: number }> = {
  process: { x: 6, y: 8 },
  terminator: { x: 14, y: 8 },
  decision: { x: 22, y: 22 },
  io: { x: 16, y: 8 },
  document: { x: 6, y: 6 },
  database: { x: 8, y: 22 },
  subprocess: { x: 14, y: 8 },
  text: { x: 2, y: 2 },
  note: { x: 8, y: 10 },
};

export function ShapeSvg({
  kind,
  fill,
  stroke,
  strokeWidth = 1.6,
  className = '',
}: {
  kind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  className?: string;
}) {
  const common = { fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  switch (kind) {
    case 'process':
      body = <rect x={1} y={1} width={98} height={98} rx={4} {...common} />;
      break;
    case 'terminator':
      // Cápsula: esticar um SVG deformaria as pontas; desenhada em CSS (ver ShapeNode).
      body = null;
      break;
    case 'decision':
      body = <polygon points="50,1 99,50 50,99 1,50" {...common} />;
      break;
    case 'io':
      body = <polygon points="14,1 99,1 86,99 1,99" {...common} />;
      break;
    case 'document':
      body = <path d="M1,1 H99 V86 C75,72 60,100 35,94 C20,90 10,86 1,90 Z" {...common} />;
      break;
    case 'database':
      body = (
        <>
          <path d="M1,12 C1,-3 99,-3 99,12 V88 C99,103 1,103 1,88 Z" {...common} />
          <path d="M1,12 C1,27 99,27 99,12" {...common} fill="none" />
        </>
      );
      break;
    case 'subprocess':
      body = (
        <>
          <rect x={1} y={1} width={98} height={98} rx={3} {...common} />
          <path d="M10,1 V99 M90,1 V99" {...common} fill="none" />
        </>
      );
      break;
    case 'note':
      body = <path d="M1,1 H84 L99,16 V99 H1 Z M84,1 V16 H99" {...common} />;
      break;
    case 'text':
      body = null;
      break;
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`overflow-visible ${className}`} aria-hidden>
      {body}
    </svg>
  );
}
