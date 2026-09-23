import type { SVGProps } from 'react';

// Conjunto único de ícones (SPEC-008 §5.2): painel, editor e fluxograma usam
// estes. SVG inline, sem dependência, mesma grade de 24, mesmo traço, cor
// herdada de `currentColor` — é o que faz a interface parecer um produto só.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

export const IconScissors = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
  </Svg>
);

export const IconBranch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="19" cy="18" r="2" />
    <path d="M7 12h4c0-3 1-6 6-6M7 12h4c0 3 1 6 6 6" />
  </Svg>
);

export const IconTheme = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none" opacity=".45" />
  </Svg>
);

export const IconFont = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19 10 5l6 14M6.5 14h7M17 19h4" />
  </Svg>
);

export const IconInk = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 17 10 5l5 12M7 13h6" />
    <path d="M4 21h16" strokeWidth={3} />
  </Svg>
);

// SPEC-008 §5.2 — ícones do painel, do menu em grade e da exportação.

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.8V19a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1V9.8" />
  </Svg>
);

export const IconDocs = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="12" height="16" rx="2" />
    <path d="M8 8h4M8 12h4M18 7v12a2 2 0 0 1-2 2H7" />
  </Svg>
);

export const IconShared = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="8" r="3" />
    <circle cx="17" cy="8" r="3" />
    <path d="M2 20c0-2.8 2.2-5 5-5M22 20c0-2.8-2.2-5-5-5M9.5 20h5" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconFolderPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 11v6M9 14h6" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

export const IconGridView = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

export const IconListView = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9l7 7 7-7" />
  </Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 5.2A3.2 3.2 0 0 1 16 11M18 20c0-2.2-.8-4.2-2-5.6" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M16 15l3-3-3-3M9 12h10" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M15.5 12v2.5" />
  </Svg>
);

export const IconExport = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
);

export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
    <path d="M12 8v4.5l3 1.8" />
  </Svg>
);

export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="17" cy="6" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="17" cy="18" r="2.6" />
    <path d="m8.4 10.8 6.2-3.3M8.4 13.2l6.2 3.3" />
  </Svg>
);

export const IconMindMap = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="9.5" width="7" height="5" rx="1.5" />
    <rect x="18" y="4" width="5" height="4" rx="1.3" />
    <rect x="18" y="16" width="5" height="4" rx="1.3" />
    <rect x="1" y="10" width="5" height="4" rx="1.3" />
    <path d="M15.5 11.5c1.5 0 1-5.5 2.5-5.5M15.5 12.5c1.5 0 1 5.5 2.5 5.5M8.5 12H6" />
  </Svg>
);

export const IconFlow = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="2.5" width="6" height="4.5" rx="1.3" />
    <path d="m12 12.5 3 3-3 3-3-3z" />
    <rect x="3" y="18" width="5" height="3.5" rx="1.2" />
    <rect x="16" y="18" width="5" height="3.5" rx="1.2" />
    <path d="M12 7v5.5" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Svg>
);

/** "Mais ações": abre o menu em grade (SPEC-008 §5.4). */
export const IconGridMenu = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconBold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </Svg>
);

export const IconPdf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 17v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M13.5 17v-4h1.3a2 2 0 0 1 0 4z" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 4" />
  </Svg>
);

export const IconTrashDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3M10 11v6M14 11v6" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 4 2.5 5.2 5.5.8-4 4 1 5.5-5-2.7-5 2.7 1-5.5-4-4 5.5-.8z" />
  </Svg>
);
