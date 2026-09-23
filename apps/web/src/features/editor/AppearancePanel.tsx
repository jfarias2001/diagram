import {
  clearNodeColors,
  DOC_FONTS,
  DOC_THEMES,
  type DocumentTheme,
  findRoot,
  FONT_IDS,
  type FontId,
  readNodes,
  THEME_IDS,
  type ThemeId,
} from '@diagram/shared';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { ColorPicker } from '../../components/ColorPicker';
import { type BoardTheme, mix } from './boardTheme';
import { loadFont } from './fonts';
import { IconClose } from '../../components/icons';
import { LOCAL_ORIGIN } from './useMindMap';

// Painel Aparência (SPEC-007 §5.3): tema, fonte e fundo do documento. Um só
// para os dois editores. Leitor e comentador veem o que está em uso, sem poder
// mudar — e a garantia de verdade é o servidor, não este `canEdit`.

type Tab = 'tema' | 'fonte' | 'fundo';

const TABS: Array<[Tab, string]> = [
  ['tema', 'Temas'],
  ['fonte', 'Fonte'],
  ['fundo', 'Fundo'],
];

/** Tons prontos de fundo, claros e escuros (PRD §5.23). */
const BACKGROUNDS = [
  '#ffffff',
  '#f6f4ef',
  '#f2f1ed',
  '#eef1f4',
  '#eaf2ee',
  '#f7f0f4',
  '#2a2f3a',
  '#1e242e',
  '#14181f',
  '#0b0e14',
];

export function AppearancePanel({
  doc,
  board,
  canEdit,
  onClose,
}: {
  doc: Y.Doc;
  board: BoardTheme;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('tema');
  const [cleared, setCleared] = useState(false);

  // As miniaturas de fonte aparecem na própria fonte: carrega ao abrir a aba.
  useEffect(() => {
    if (tab === 'fonte') for (const id of FONT_IDS) void loadFont(id);
  }, [tab]);

  const applyTheme = (id: ThemeId) => {
    board.apply({ theme: id, background: '', font: '' });
    setCleared(false);
  };

  /** Aplica e apaga as cores escolhidas bloco a bloco (PRD §5.29). */
  const applyAndClear = () => {
    if (!canEdit) return;
    const root = findRoot(readNodes(doc));
    if (root) clearNodeColors(doc, root.id, LOCAL_ORIGIN);
    setCleared(true);
  };

  return (
    <aside
      aria-label="Aparência do documento"
      className="absolute top-0 right-0 z-20 flex h-full w-80 flex-col border-l border-line bg-surface shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-sm font-semibold">Aparência</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar aparência"
          className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <IconClose />
        </button>
      </header>

      <div role="tablist" aria-label="Seções da aparência" className="flex shrink-0 gap-0.5 border-b border-line p-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`h-8 flex-1 rounded-lg text-xs font-medium transition ${
              tab === id ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!canEdit && (
          <p className="mb-3 rounded-lg bg-surface-2 p-2 text-xs text-muted">
            Você está vendo o documento. Só quem edita pode mudar a aparência.
          </p>
        )}

        {tab === 'tema' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {THEME_IDS.map((id) => (
                <ThemeCard
                  key={id}
                  theme={DOC_THEMES[id]}
                  current={board.theme.id === id}
                  disabled={!canEdit}
                  onPick={() => applyTheme(id)}
                />
              ))}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={applyAndClear}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                Aplicar e limpar as cores manuais
              </button>
            )}
            {cleared && (
              <p role="status" className="text-xs text-muted">
                As cores escolhidas bloco a bloco foram apagadas. Ctrl+Z desfaz.
              </p>
            )}
          </div>
        )}

        {tab === 'fonte' && (
          <div className="flex flex-col gap-1.5">
            {FONT_IDS.map((id) => (
              <FontRow
                key={id}
                id={id}
                current={board.font.id === id}
                disabled={!canEdit}
                onPick={() => board.apply({ font: id })}
              />
            ))}
            {canEdit && board.style.font && (
              <button
                type="button"
                onClick={() => board.apply({ font: '' })}
                className="mt-1 self-start rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink"
              >
                Usar a fonte do tema
              </button>
            )}
          </div>
        )}

        {tab === 'fundo' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tons prontos de fundo">
              {BACKGROUNDS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={!canEdit}
                  aria-label={`Fundo ${color}`}
                  aria-pressed={board.theme.canvas === color}
                  title={color}
                  onClick={() => board.apply({ background: color })}
                  className={`h-7 w-7 rounded-lg border border-line transition disabled:cursor-not-allowed ${
                    board.theme.canvas === color ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : 'hover:scale-105'
                  }`}
                  style={{ background: color }}
                />
              ))}
            </div>
            {canEdit && (
              <ColorPicker
                label="Fundo do quadro"
                value={board.style.background}
                palette={board.theme.branches}
                onChange={(hex) => board.apply({ background: hex })}
                onAuto={() => board.apply({ background: '' })}
                autoLabel="Voltar ao fundo do tema"
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ThemeCard({
  theme,
  current,
  disabled,
  onPick,
}: {
  theme: DocumentTheme;
  current: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={current}
      onClick={onPick}
      title={theme.name}
      className={`flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition disabled:cursor-not-allowed ${
        current ? 'border-ink' : 'border-line hover:border-muted'
      }`}
    >
      <ThemeThumb theme={theme} />
      <span className="px-0.5 text-xs font-medium">{theme.name}</span>
    </button>
  );
}

/** Miniatura desenhada em código — sem imagem, sem pedido de rede. */
function ThemeThumb({ theme }: { theme: DocumentTheme }) {
  const [c1, c2, c3] = [theme.branches[0] ?? theme.rootColor, theme.branches[1] ?? theme.rootColor, theme.branches[2] ?? theme.rootColor];
  const blockFill = (color: string) => (theme.filledBranches ? color : theme.surface);
  return (
    <svg viewBox="0 0 120 68" className="h-16 w-full rounded-lg" aria-hidden>
      <rect width="120" height="68" rx="6" fill={theme.canvas} />
      <path d={`M60 34C72 34 72 20 84 20`} stroke={c1} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M60 34C72 34 72 48 84 48`} stroke={c2} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M60 34C48 34 48 26 36 26`} stroke={c3} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="45" y="27" width="30" height="14" rx="5" fill={theme.rootColor} />
      <rect x="84" y="14" width="26" height="12" rx="4" fill={blockFill(c1)} stroke={c1} strokeWidth="1.5" />
      <rect x="84" y="42" width="26" height="12" rx="4" fill={blockFill(c2)} stroke={c2} strokeWidth="1.5" />
      <rect x="12" y="20" width="24" height="12" rx="4" fill={blockFill(c3)} stroke={c3} strokeWidth="1.5" />
      <rect
        x="0.5"
        y="0.5"
        width="119"
        height="67"
        rx="6"
        fill="none"
        stroke={mix(theme.canvas, theme.ink, 0.12)}
      />
    </svg>
  );
}

function FontRow({
  id,
  current,
  disabled,
  onPick,
}: {
  id: FontId;
  current: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const font = DOC_FONTS[id];
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={current}
      onClick={onPick}
      className={`flex items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed ${
        current ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2'
      }`}
    >
      <span className="text-base" style={{ fontFamily: font.stack }}>
        Mapa de ideias
      </span>
      <span className="shrink-0 text-[11px] text-muted">{font.name}</span>
    </button>
  );
}
