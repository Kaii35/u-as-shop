import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, useResource } from '../../lib/useResource';
import {
  POPUP_FREQUENCY_LABEL,
  type AdminCategory,
  type AdminPromotion,
  type PopupFrequency,
} from '../../lib/admin-types';
import { FormError, Modal } from '../../components/admin/Primitives';
import { SingleImageField } from '../../components/admin/ImageFields';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Input';
import { fromLocalInput, toLocalInput } from './promotion-text';
import { cn } from '../../lib/utils';
import { RichText } from '../../components/LandingPromos';

/**
 * Crear o editar una promoción en el panel reducido.
 *
 * Una promoción aquí es un anuncio: una imagen, un título y un texto que salen
 * en la tienda donde se elija: pop-up al entrar, franja de texto arriba de
 * todas las páginas o banner dentro de la portada (una, dos o las tres). No descuenta nada en un carrito (las compras van
 * por WhatsApp), así que se guarda como tipo `ANNOUNCEMENT`.
 *
 * Al editar una promoción vieja que sí tenía descuento, solo se cambian los
 * campos del anuncio: la regla de descuento queda como estaba.
 */

const DESCRIPTION_MAX = 1000;
/** Por encima de las de ejemplo y las del panel completo (que van de 0 a 90). */
const PUBLISH_PRIORITY = 500;
const FREQUENCIES = Object.keys(POPUP_FREQUENCY_LABEL) as PopupFrequency[];

interface Draft {
  popup: boolean;
  bar: boolean;
  banner: boolean;
  barText: string;
  badge: string;
  title: string;
  description: string;
  image: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
  frequency: PopupFrequency;
  active: boolean;
}

type Errors = Partial<Record<keyof Draft | 'where', string>>;

const BAR_MAX = 200;

const PLACES: ReadonlyArray<{ key: 'popup' | 'bar' | 'banner'; label: string; hint: string }> = [
  { key: 'popup', label: 'Pop-up', hint: 'Aparece al entrar a la tienda.' },
  { key: 'bar', label: 'Franja', hint: 'Una línea de texto arriba de todas las páginas.' },
  { key: 'banner', label: 'Banner', hint: 'Una tarjeta con foto dentro de la portada.' },
];

/** El nombre interno de una promoción que es solo franja: su texto sin marcas. */
const plain = (text: string): string => text.replace(/\*\*|_/g, '').trim().slice(0, 120);

function toDraft(p: AdminPromotion | null): Draft {
  if (!p) {
    return {
      popup: true,
      bar: false,
      banner: false,
      barText: '',
      badge: '',
      title: '',
      description: '',
      image: '',
      ctaLabel: 'Ver productos',
      ctaUrl: '/tienda',
      startsAt: toLocalInput(new Date().toISOString()),
      endsAt: '',
      frequency: 'SESSION',
      active: true,
    };
  }
  return {
    popup: p.showPopup,
    bar: p.showBar,
    banner: p.showBanner,
    barText: p.barText ?? '',
    badge: p.popupBadge ?? '',
    title: p.popupTitle ?? p.name,
    description: p.popupSubtitle ?? '',
    image: p.popupImage ?? '',
    ctaLabel: p.popupCtaLabel ?? '',
    ctaUrl: p.popupCtaUrl ?? '',
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
    frequency: p.popupFrequency,
    active: p.active,
  };
}

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.popup && !d.bar && !d.banner) e.where = 'Elige al menos un lugar donde se muestre.';
  if (d.bar && d.barText.trim().length < 3) e.barText = 'Escribe el texto de la franja.';
  if (d.barText.length > BAR_MAX) e.barText = `Máximo ${BAR_MAX} caracteres.`;
  if (d.popup || d.banner) {
    if (d.title.trim().length < 2) e.title = 'Escribe un título para el anuncio.';
    if (d.description.length > DESCRIPTION_MAX) e.description = `Máximo ${DESCRIPTION_MAX} caracteres.`;
    if (d.banner && !d.image) e.image = 'El banner necesita una imagen.';
    else if (!d.image && d.description.trim() === '') e.image = 'Sube una imagen o escribe una descripción.';
    if (d.ctaLabel.trim() && !d.ctaUrl) e.ctaUrl = 'Elige a dónde lleva el botón.';
  }
  const starts = fromLocalInput(d.startsAt);
  if (!starts) e.startsAt = 'Indica cuándo empieza.';
  const ends = fromLocalInput(d.endsAt);
  if (starts && ends && new Date(ends) <= new Date(starts)) e.endsAt = 'Tiene que terminar después de empezar.';
  return e;
}

const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export function AnnouncementEditor({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: AdminPromotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(promotion));
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] || e.where ? { ...e, [key]: undefined, where: undefined } : e));
  };

  const categories = useResource<AdminCategory[]>(
    (signal) => api.get<AdminCategory[]>('/api/admin/categories', undefined, signal),
    [],
  );

  // A dónde puede llevar el botón: la tienda, una categoría o ninguna parte.
  const destinations: Array<{ value: string; label: string }> = [
    { value: '/tienda', label: 'Toda la tienda' },
    ...(categories.data ?? [])
      .filter((c) => c.active)
      .map((c) => ({ value: `/tienda?cat=${c.slug}`, label: `Categoría: ${c.name}` })),
  ];
  // Un enlace guardado que ya no está en la lista (otra ruta) se conserva.
  if (draft.ctaUrl && !destinations.some((d) => d.value === draft.ctaUrl)) {
    destinations.push({ value: draft.ctaUrl, label: draft.ctaUrl });
  }

  const save = useAction(async (payload: Record<string, unknown>) =>
    promotion
      ? api.patch<AdminPromotion>(`/api/admin/promotions/${promotion.id}`, payload)
      : api.post<AdminPromotion>('/api/admin/promotions', payload),
  );

  const submit = async (): Promise<void> => {
    const found = validate(draft);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const visual = draft.popup || draft.banner;
    const noButton = !visual || draft.ctaLabel.trim() === '';
    const payload: Record<string, unknown> = {
      name: visual ? draft.title.trim() : plain(draft.barText),
      showPopup: draft.popup,
      showBar: draft.bar,
      showBanner: draft.banner,
      barText: orNull(draft.barText),
      popupBadge: orNull(draft.badge),
      popupTitle: orNull(draft.title),
      popupSubtitle: orNull(draft.description),
      popupImage: orNull(draft.image),
      popupCtaLabel: noButton ? null : draft.ctaLabel.trim(),
      popupCtaUrl: noButton ? null : orNull(draft.ctaUrl),
      popupFrequency: draft.frequency,
      startsAt: fromLocalInput(draft.startsAt) ?? new Date().toISOString(),
      endsAt: fromLocalInput(draft.endsAt),
      active: draft.active,
    };
    // Solo al crear: una promoción existente conserva su regla de descuento.
    // La prioridad alta hace que la recién publicada sea la que sale en la
    // tienda (entre dos iguales gana la más nueva).
    if (!promotion) {
      Object.assign(payload, { type: 'ANNOUNCEMENT', scope: 'ALL', value: 0, priority: PUBLISH_PRIORITY });
    }

    const result = await save.run(payload);
    if (result) onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={promotion ? 'Editar promoción' : 'Nueva promoción'}
      description="Elige dónde sale y llena lo que pide cada lugar."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <FormError message={save.error} />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => void submit()}>
            {promotion ? 'Guardar cambios' : 'Publicar promoción'}
          </Button>
        </div>
      }
    >
      <fieldset className="mb-5 flex flex-col gap-2">
        <legend className="label-xs mb-2">Dónde se muestra</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLACES.map((place) => (
            <label
              key={place.key}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded border p-3 transition-colors',
                draft[place.key] ? 'border-ink bg-sand' : 'border-line hover:border-mist',
              )}
            >
              <input
                type="checkbox"
                checked={draft[place.key]}
                onChange={(e) => set(place.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-ink"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-body font-semibold text-ink">{place.label}</span>
                <span className="text-cap text-mist">{place.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FormError message={errors.where ?? null} />
      </fieldset>

      {draft.bar && (
        <div className="mb-5 flex flex-col gap-2">
          <Textarea
            label="Texto de la franja"
            hint={`${draft.barText.length}/${BAR_MAX} · **negrita** y _cursiva_`}
            rows={2}
            value={draft.barText}
            error={errors.barText}
            onChange={(e) => set('barText', e.target.value)}
            placeholder="**Envío gratis** por compras superiores a **$200.000** _*No aplica envíos express_"
          />
          {draft.barText.trim() && (
            <div className="flex flex-col gap-1">
              <span className="label-xs">Así se ve</span>
              <div className="rounded border border-line bg-surface px-4 py-2 text-center text-cap text-ink">
                <RichText text={draft.barText} />
              </div>
            </div>
          )}
        </div>
      )}

      {(draft.popup || draft.banner) && (
        <div className="mb-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <span className="label-xs">Imagen</span>
            <SingleImageField value={draft.image} onChange={(v) => set('image', v)} error={errors.image} />
            <p className="text-cap text-mist">
              {draft.banner
                ? 'Para el banner va mejor una foto horizontal (por ejemplo 1600 × 600). El texto se escribe encima, así que evita que la foto ya traiga letras.'
                : 'Para el pop-up sirve un flyer vertical: se muestra entero, sin recortar.'}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <Input
              label="Etiqueta"
              hint="opcional, va arriba del título en letra pequeña"
              value={draft.badge}
              onChange={(e) => set('badge', e.target.value)}
              placeholder="Colección cápsula"
              maxLength={40}
            />
            <Input
              label="Título"
              value={draft.title}
              error={errors.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="20 % en toda la línea ILÚ"
              maxLength={120}
            />
            <Textarea
              label="Descripción"
              hint={`${draft.description.length}/${DESCRIPTION_MAX}`}
              rows={4}
              value={draft.description}
              error={errors.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Qué incluye, hasta cuándo va y cómo pedirla."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Texto del botón"
                hint="vacío = sin botón"
                value={draft.ctaLabel}
                onChange={(e) => set('ctaLabel', e.target.value)}
                placeholder="Ver productos"
                maxLength={40}
              />
              <Select
                label="El botón lleva a"
                value={draft.ctaUrl}
                error={errors.ctaUrl}
                disabled={draft.ctaLabel.trim() === ''}
                onChange={(e) => set('ctaUrl', e.target.value)}
              >
                {!draft.ctaUrl && <option value="">Elige…</option>}
                {destinations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="datetime-local"
          label="Empieza"
          value={draft.startsAt}
          error={errors.startsAt}
          onChange={(e) => set('startsAt', e.target.value)}
        />
        <Input
          type="datetime-local"
          label="Termina"
          hint="opcional"
          value={draft.endsAt}
          error={errors.endsAt}
          onChange={(e) => set('endsAt', e.target.value)}
        />
        {draft.popup && (
          <Select
            label="Cada cuánto sale el pop-up"
            value={draft.frequency}
            onChange={(e) => set('frequency', e.target.value as PopupFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {POPUP_FREQUENCY_LABEL[f]}
              </option>
            ))}
          </Select>
        )}
      </div>
      <Checkbox className="mt-4" checked={draft.active} onChange={(v) => set('active', v)}>
        Publicada en la tienda
      </Checkbox>
    </Modal>
  );
}
