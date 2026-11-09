import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from 'lucide-react';
import { assetUrl } from '../../lib/api';
import { uploadImage } from '../../lib/uploadImage';
import { cn } from '../../lib/utils';
import { FormError } from './Primitives';

/**
 * Campos de foto del panel.
 *
 * Se elige el archivo (o se arrastra), se sube en el momento y el campo guarda
 * la ruta. Lo que se ve es la foto, no la ruta: quien administra la tienda no
 * tiene por qué saber dónde vive un archivo.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Sube varias fotos en orden. Devuelve las que salieron y el primer error. */
async function uploadAll(files: File[]): Promise<{ urls: string[]; error: string | null }> {
  const urls: string[] = [];
  let error: string | null = null;
  for (const file of files) {
    try {
      urls.push(await uploadImage(file));
    } catch (e) {
      error ??= e instanceof Error ? e.message : 'No se pudo subir la foto.';
    }
  }
  return { urls, error };
}

const filesFrom = (list: FileList | null): File[] => (list ? Array.from(list) : []);

function useDropZone(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        onFiles(filesFrom(e.dataTransfer.files));
      },
    },
  };
}

/** Varias fotos con orden: la primera es la del listado de la tienda. */
export function ImageListField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Lo subido se agrega a lo que haya en ese momento, no a lo que había al
  // empezar: si se quita una foto mientras otra sube, no vuelve a aparecer.
  const latest = useRef(value);
  latest.current = value;

  const add = async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    setUploadError(null);
    setPending((n) => n + files.length);
    const { urls, error: failed } = await uploadAll(files);
    setPending((n) => n - files.length);
    if (urls.length) onChange([...latest.current, ...urls]);
    setUploadError(failed);
  };

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange(next);
  };

  const drop = useDropZone((files) => void add(files));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((src, i) => (
          <figure
            key={`${src}-${i}`}
            className="group relative aspect-[4/5] overflow-hidden rounded border border-line bg-sand"
          >
            <img src={assetUrl(src)} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-sm bg-ink px-1.5 py-0.5 text-meta font-semibold text-on-ink">
                Principal
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Quitar la foto ${i + 1}`}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-surface/95 text-ink shadow-card transition-colors hover:bg-danger hover:text-on-accent"
            >
              <X size={14} strokeWidth={2.25} />
            </button>
            {value.length > 1 && (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                <MoveButton label={`Mover la foto ${i + 1} antes`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ChevronLeft size={14} strokeWidth={2.25} />
                </MoveButton>
                <MoveButton
                  label={`Mover la foto ${i + 1} después`}
                  disabled={i === value.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronRight size={14} strokeWidth={2.25} />
                </MoveButton>
              </div>
            )}
          </figure>
        ))}

        {Array.from({ length: pending }, (_, i) => (
          <div
            key={`subiendo-${i}`}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded border border-line bg-sand text-cap text-mist"
          >
            <Loader2 size={18} className="animate-spin" />
            Subiendo…
          </div>
        ))}

        <button
          type="button"
          onClick={() => input.current?.click()}
          {...drop.handlers}
          className={cn(
            'flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1.5 rounded border border-dashed px-2 text-center text-cap transition-colors',
            drop.over ? 'border-ink bg-sand text-ink' : 'border-line text-ash hover:border-ink hover:text-ink',
          )}
        >
          <ImagePlus size={20} strokeWidth={1.75} />
          {value.length ? 'Agregar fotos' : 'Subir fotos'}
          <span className="text-meta text-mist">o arrástralas aquí</span>
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void add(filesFrom(e.target.files));
          e.target.value = '';
        }}
      />
      <FormError message={uploadError ?? error ?? null} />
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-surface/95 text-ink shadow-card transition-opacity hover:bg-surface disabled:pointer-events-none disabled:opacity-0"
    >
      {children}
    </button>
  );
}

/** Una sola imagen, entera (sin recortar): el flyer de una promoción. */
export function SingleImageField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pick = async (files: File[]): Promise<void> => {
    const file = files[0];
    if (!file) return;
    setUploadError(null);
    setBusy(true);
    const { urls, error: failed } = await uploadAll([file]);
    setBusy(false);
    if (urls[0]) onChange(urls[0]);
    setUploadError(failed);
  };

  const drop = useDropZone((files) => void pick(files));

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex flex-col gap-2">
          <div className="flex max-h-[360px] justify-center overflow-hidden rounded border border-line bg-sand">
            <img src={assetUrl(value)} alt="Flyer" className="max-h-[360px] w-auto object-contain" />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="cursor-pointer text-cap font-medium text-ink underline-offset-4 hover:underline"
            >
              {busy ? 'Subiendo…' : 'Cambiar imagen'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="cursor-pointer text-cap text-mist underline-offset-4 hover:text-danger hover:underline"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          {...drop.handlers}
          className={cn(
            'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded border border-dashed px-3 text-center text-body transition-colors',
            drop.over ? 'border-ink bg-sand text-ink' : 'border-line text-ash hover:border-ink hover:text-ink',
          )}
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={22} strokeWidth={1.75} />}
          {busy ? 'Subiendo…' : 'Subir el flyer'}
          {!busy && <span className="text-cap text-mist">JPG, PNG o WebP. También puedes arrastrarlo.</span>}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void pick(filesFrom(e.target.files));
          e.target.value = '';
        }}
      />
      <FormError message={uploadError ?? error ?? null} />
    </div>
  );
}
