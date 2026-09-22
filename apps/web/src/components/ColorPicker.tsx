import { contrastRatio, HEX_COLOR } from '@diagram/shared';
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { hexToHsv, type Hsv, hsvToHex, loadRecentColors, normalizeHex, pushRecentColor } from '../lib/color';

// Seletor de cor livre (SPEC-007 §5.6): todo o sRGB, por área de cor, matiz ou
// código hexadecimal, mais as cores do tema e as usadas recentemente.
// A cor só é aplicada ao SOLTAR (ou ao confirmar o hex): arrastar não escreve
// uma cor nova no documento a cada pixel.

const FALLBACK: Hsv = { h: 210, s: 0.6, v: 0.8 };

export interface ColorPickerProps {
  /** Cor em uso, ou undefined quando o bloco segue o tema. */
  value: string | undefined;
  /** Cores do tema do documento, em destaque. */
  palette: readonly string[];
  label: string;
  onChange: (hex: string) => void;
  /** Volta ao padrão do tema. */
  onAuto?: () => void;
  autoLabel?: string;
  /** Cor de fundo contra a qual avisar sobre legibilidade (PRD §5.18). */
  contrastWith?: string | null;
}

export function ColorPicker({ value, palette, label, onChange, onAuto, autoLabel, contrastWith }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => (value && hexToHsv(value)) || FALLBACK);
  const [text, setText] = useState(value ?? '');
  const [recent, setRecent] = useState<string[]>(() => loadRecentColors());
  const areaRef = useRef<HTMLDivElement>(null);

  // Cor escolhida por fora (swatch, outro bloco): o seletor acompanha.
  useEffect(() => {
    const next = value ? hexToHsv(value) : null;
    if (next) setHsv(next);
    setText(value ?? '');
  }, [value]);

  const draft = hsvToHex(hsv);

  const commit = (hex: string) => {
    if (!HEX_COLOR.test(hex)) return;
    setRecent(pushRecentColor(hex));
    onChange(hex);
  };

  const pointToHsv = (e: ReactPointerEvent<HTMLDivElement>): Hsv => {
    const box = areaRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return hsv;
    return {
      h: hsv.h,
      s: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      v: Math.min(1, Math.max(0, 1 - (e.clientY - box.top) / box.height)),
    };
  };

  const weakContrast = useMemo(() => {
    if (!contrastWith || !HEX_COLOR.test(contrastWith)) return false;
    return contrastRatio(draft, contrastWith) < 4.5;
  }, [draft, contrastWith]);

  return (
    <div className="flex w-64 flex-col gap-2" role="group" aria-label={label}>
      {/* Área de saturação e brilho. Focável: as setas ajustam. */}
      <div
        ref={areaRef}
        role="application"
        aria-label={`${label}: saturação e brilho. Use as setas para ajustar.`}
        tabIndex={0}
        className="relative h-28 w-full cursor-crosshair rounded-lg border border-line focus-visible:outline-2"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex({ h: hsv.h, s: 1, v: 1 })})`,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setHsv(pointToHsv(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setHsv(pointToHsv(e));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          commit(hsvToHex(pointToHsv(e)));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const delta: Record<string, Partial<Hsv>> = {
            ArrowLeft: { s: -step },
            ArrowRight: { s: step },
            ArrowUp: { v: step },
            ArrowDown: { v: -step },
          };
          const move = delta[e.key];
          if (!move) return;
          e.preventDefault();
          e.stopPropagation();
          const next = {
            h: hsv.h,
            s: Math.min(1, Math.max(0, hsv.s + (move.s ?? 0))),
            v: Math.min(1, Math.max(0, hsv.v + (move.v ?? 0))),
          };
          setHsv(next);
          commit(hsvToHex(next));
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: draft }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label={`${label}: matiz`}
        className="hue-slider h-4 w-full cursor-pointer appearance-none rounded-full"
        onChange={(e) => setHsv({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-lg border border-line"
          style={{ background: draft }}
        />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) setHsv(hexToHsv(hex) ?? hsv);
          }}
          onBlur={() => {
            const hex = normalizeHex(text);
            if (hex) commit(hex);
            else setText(value ?? '');
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              const hex = normalizeHex(text);
              if (hex) commit(hex);
            }
          }}
          aria-label={`${label}: código hexadecimal`}
          placeholder="#aabbcc"
          maxLength={7}
          spellCheck={false}
          className="nodrag h-8 w-24 rounded-lg border border-line bg-surface px-2 font-mono text-xs text-ink placeholder:text-muted focus:border-filament focus:outline-none"
        />
        {onAuto && (
          <button
            type="button"
            onClick={onAuto}
            title={autoLabel ?? 'Voltar ao padrão do tema'}
            className="ml-auto h-8 rounded-lg px-2 text-xs text-muted hover:bg-surface-2 hover:text-ink"
          >
            Auto
          </button>
        )}
      </div>

      {weakContrast && (
        <p role="status" className="text-xs text-muted">
          Texto pouco legível neste fundo.
        </p>
      )}

      <Swatches label="Cores do tema" colors={palette} current={value} onPick={commit} />
      {recent.length > 0 && <Swatches label="Usadas recentemente" colors={recent} current={value} onPick={commit} />}
    </div>
  );
}

function Swatches({
  label,
  colors,
  current,
  onPick,
}: {
  label: string;
  colors: readonly string[];
  current: string | undefined;
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label}: ${color}`}
            aria-pressed={current === color}
            title={color}
            onClick={() => onPick(color)}
            className={`h-5 w-5 rounded-md border border-line transition hover:scale-110 ${
              current === color ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''
            }`}
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  );
}
