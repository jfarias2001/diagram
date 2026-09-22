import type { SVGProps } from 'react';

// Ícones do editor em SVG inline (sem dependência). Traço herda `currentColor`.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

/** Filho: nó com um galho saindo para a direita. */
export const IconChild = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="8" height="6" rx="2" />
    <path d="M7 10v5a2 2 0 0 0 2 2h4" />
    <rect x="13" y="14" width="8" height="6" rx="2" />
  </Svg>
);

/** Irmão: dois nós empilhados. */
export const IconSibling = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="3" width="12" height="7" rx="2" />
    <rect x="6" y="14" width="12" height="7" rx="2" />
  </Svg>
);

export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);

export const IconCollapse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
  </Svg>
);

export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6l4 4 4-4M8 18l4-4 4 4" />
  </Svg>
);

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);

export const IconZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
  </Svg>
);

export const IconZoomOut = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M8 11h6" />
  </Svg>
);

export const IconFit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

// SPEC-006: organizar, ordem entre irmãos, formato, preenchimento e tema do quadro.

export const IconTidy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h10M4 18h13" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const IconShape = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="8" height="7" rx="2" />
    <circle cx="17" cy="7.5" r="3.5" />
    <path d="m8 13 5 8H3z" />
  </Svg>
);

export const IconPaint = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 3 4 10l7 7 7-7z" />
    <path d="M4 10 11 3" />
    <path d="M19 15c0 1.7-1 2.8-2 2.8s-2-1.1-2-2.8 2-3.5 2-3.5 2 1.8 2 3.5Z" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Svg>
);
