import type { Node } from '@xyflow/react';
import { useState } from 'react';
import { IconImage, IconPdf } from '../../components/icons';
import { Button, Modal } from '../../components/ui';
import {
  DEFAULT_EXPORT,
  exportCanvas,
  type ExportFormat,
  type ExportOptions,
  type Orientation,
  type PageSize,
} from './exportCanvas';

// Diálogo único de exportação (SPEC-008 §5.6), usado pelo mapa e pelo
// fluxograma — inclusive no modo versão, porque o que sai é o que está na tela.

const FORMATS: Array<{ value: ExportFormat; label: string; hint: string; icon: typeof IconPdf }> = [
  { value: 'pdf', label: 'PDF', hint: 'Para imprimir ou anexar num e-mail', icon: IconPdf },
  { value: 'png', label: 'PNG', hint: 'Imagem para colar num slide', icon: IconImage },
];

const PAGES: Array<{ value: PageSize; label: string }> = [
  { value: 'fit', label: 'Ajustado ao mapa' },
  { value: 'a4', label: 'A4' },
  { value: 'a3', label: 'A3' },
];

const ORIENTATIONS: Array<{ value: Orientation; label: string }> = [
  { value: 'landscape', label: 'Paisagem' },
  { value: 'portrait', label: 'Retrato' },
];

export function ExportDialog({
  open,
  title,
  nodes,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Nós do quadro, para medir o desenho inteiro. */
  nodes: Node[];
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const run = async () => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const result = await exportCanvas(nodes, title, options);
      if (result.reduced) {
        setWarning('O documento é muito grande: a resolução foi reduzida para o arquivo caber.');
      } else {
        onClose();
      }
    } catch {
      setError('Não foi possível exportar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Exportar documento">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-sm font-medium">Formato</legend>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={options.format === f.value}
                onClick={() => set('format', f.value)}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  options.format === f.value
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:border-muted/50'
                }`}
              >
                <f.icon size={20} />
                <span>
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-xs text-muted">{f.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {options.format === 'pdf' && (
          <>
            <fieldset>
              <legend className="pb-1.5 text-sm font-medium">Tamanho da página</legend>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tamanho da página">
                {PAGES.map((p) => (
                  <Pill
                    key={p.value}
                    active={options.page === p.value}
                    label={p.label}
                    onClick={() => set('page', p.value)}
                  />
                ))}
              </div>
            </fieldset>

            {options.page !== 'fit' && (
              <fieldset>
                <legend className="pb-1.5 text-sm font-medium">Orientação</legend>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Orientação">
                  {ORIENTATIONS.map((o) => (
                    <Pill
                      key={o.value}
                      active={options.orientation === o.value}
                      label={o.label}
                      onClick={() => set('orientation', o.value)}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={options.background}
            onChange={(e) => set('background', e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Incluir o fundo do quadro
        </label>

        {warning && <p className="text-sm text-warn">{warning}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" busy={busy} onClick={() => void run()}>
            Exportar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
        active ? 'border-transparent bg-brand text-on-brand' : 'border-line text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
