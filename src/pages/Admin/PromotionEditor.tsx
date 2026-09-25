import { useEffect, useState, type ReactNode } from 'react';
import { Calculator, Image as ImageIcon, Megaphone, Percent, Tag, X } from 'lucide-react';
import { api, request } from '../../lib/api';
import { useAction, useDebounced, useResource } from '../../lib/useResource';
import {
  POPUP_FREQUENCY_LABEL,
  PROMOTION_TYPE_LABEL,
  type AdminBrand,
  type AdminCategory,
  type AdminPromotion,
  type PopupFrequency,
  type ProductListResponse,
  type PromotionScope,
  type PromotionType,
} from '../../lib/admin-types';
import {
  FormError,
  Modal,
  SearchInput,
  Skeleton,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Input';
import { SCOPE_LABEL, TYPE_HINT, fromLocalInput, longDate, toLocalInput } from './promotion-text';

/**
 * Crear o editar una promoción.
 *
 * El formulario está partido en dos bloques porque son dos cosas distintas que
 * la gente confunde todo el tiempo: la **regla** decide cuánto se le baja al
 * carrito, y el **anuncio** solo lo cuenta en la portada. Una promoción puede
 * descontar sin anunciarse; anunciarse sin descontar sería mentir.
 *
 * Al lado, las dos vistas previas: cuánto dinero descontaría sobre un carrito
 * de ejemplo y cómo se vería el aviso. Las dos se refrescan mientras se
 * escribe, que es el único momento en que todavía se puede corregir.
 */

// ---------------------------------------------------------------------------
// El borrador
// ---------------------------------------------------------------------------

/**
 * Los números viven como texto mientras se editan.
 *
 * Con `number` en el estado, borrar el contenido del campo deja un `NaN` o un
 * `0` pegado que hay que volver a borrar. Se convierten una sola vez, al
 * validar y al enviar.
 */
interface Draft {
  name: string;
  code: string;
  type: PromotionType;
  scope: PromotionScope;
  targetIds: string[];
  value: string;
  maxDiscount: string;
  minPurchase: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  priority: string;
  usageLimit: string;

  showPopup: boolean;
  popupTitle: string;
  popupSubtitle: string;
  popupBadge: string;
  popupImage: string;
  popupCtaLabel: string;
  popupCtaUrl: string;
  popupFrequency: PopupFrequency;
  /** En segundos: nadie piensa un retardo en milisegundos. */
  popupDelaySec: string;
}

type DraftErrors = Partial<Record<keyof Draft, string>>;

const toInt = (value: string, fallback = 0): number => {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const trimmed = (value: string): string | null => {
  const clean = value.trim();
  return clean === '' ? null : clean;
};

function toDraft(promotion: AdminPromotion | null): Draft {
  if (!promotion) {
    const now = new Date();
    return {
      name: '',
      code: '',
      type: 'PERCENTAGE',
      scope: 'ALL',
      targetIds: [],
      value: '10',
      maxDiscount: '',
      minPurchase: '0',
      startsAt: toLocalInput(now.toISOString()),
      endsAt: '',
      active: true,
      priority: '0',
      usageLimit: '',
      showPopup: true,
      popupTitle: '',
      popupSubtitle: '',
      popupBadge: '',
      popupImage: '',
      popupCtaLabel: 'Ver la colección',
      popupCtaUrl: '/tienda',
      popupFrequency: 'SESSION',
      popupDelaySec: '1,2',
    };
  }
  return {
    name: promotion.name,
    code: promotion.code ?? '',
    type: promotion.type,
    scope: promotion.scope,
    targetIds: [...promotion.targetIds],
    value: String(promotion.value),
    maxDiscount: promotion.maxDiscount === null ? '' : String(promotion.maxDiscount),
    minPurchase: String(promotion.minPurchase),
    startsAt: toLocalInput(promotion.startsAt),
    endsAt: toLocalInput(promotion.endsAt),
    active: promotion.active,
    priority: String(promotion.priority),
    usageLimit: promotion.usageLimit === null ? '' : String(promotion.usageLimit),
    showPopup: promotion.showPopup,
    popupTitle: promotion.popupTitle ?? '',
    popupSubtitle: promotion.popupSubtitle ?? '',
    popupBadge: promotion.popupBadge ?? '',
    popupImage: promotion.popupImage ?? '',
    popupCtaLabel: promotion.popupCtaLabel ?? '',
    popupCtaUrl: promotion.popupCtaUrl ?? '',
    popupFrequency: promotion.popupFrequency,
    popupDelaySec: String(promotion.popupDelayMs / 1000).replace('.', ','),
  };
}

const delayToMs = (value: string): number => {
  const seconds = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(seconds) ? Math.round(Math.max(0, seconds) * 1000) : 0;
};

/**
 * Las mismas reglas que la API, dichas antes de salir.
 *
 * No sustituyen a las del servidor —esas mandan— pero le ahorran a la dueña un
 * viaje y un mensaje genérico donde aquí se puede señalar el campo exacto.
 */
function validate(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};

  if (draft.name.trim().length < 2) errors.name = 'Ponle un nombre para reconocerla.';

  const value = toInt(draft.value);
  if (draft.type === 'PERCENTAGE' && (value < 1 || value > 100)) {
    errors.value = 'Un porcentaje va entre 1 y 100.';
  }
  if (draft.type === 'FIXED_AMOUNT' && value < 1) {
    errors.value = 'El descuento tiene que ser de al menos $1.';
  }

  if (draft.maxDiscount.trim() !== '' && toInt(draft.maxDiscount) < 1) {
    errors.maxDiscount = 'El tope tiene que ser de al menos $1.';
  }
  if (toInt(draft.minPurchase) < 0) errors.minPurchase = 'No puede ser negativa.';
  if (draft.usageLimit.trim() !== '' && toInt(draft.usageLimit) < 1) {
    errors.usageLimit = 'El límite tiene que ser de al menos 1 uso.';
  }

  const startsAt = fromLocalInput(draft.startsAt);
  if (!startsAt) errors.startsAt = 'Indica cuándo empieza.';
  const endsAt = fromLocalInput(draft.endsAt);
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    errors.endsAt = 'Tiene que terminar después de empezar.';
  }

  if (draft.scope !== 'ALL' && draft.targetIds.length === 0) {
    errors.targetIds = 'Elige al menos uno, o cambia el alcance a toda la tienda.';
  }

  if (draft.showPopup && draft.popupTitle.trim() === '') {
    errors.popupTitle = 'Un anuncio sin titular no es un anuncio.';
  }
  const url = draft.popupCtaUrl.trim();
  if (url !== '' && !url.startsWith('/') && !url.startsWith('http')) {
    errors.popupCtaUrl = 'Usa una ruta de la tienda (/tienda) o una dirección completa.';
  }

  return errors;
}

/** El cuerpo de `POST`/`PATCH`, ya con los tipos del contrato. */
function toPayload(draft: Draft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    code: draft.code.trim().toUpperCase(),
    type: draft.type,
    scope: draft.scope,
    targetIds: draft.scope === 'ALL' ? [] : draft.targetIds,
    value: draft.type === 'FREE_SHIPPING' ? 0 : toInt(draft.value),
    maxDiscount: draft.maxDiscount.trim() === '' ? null : toInt(draft.maxDiscount),
    minPurchase: toInt(draft.minPurchase),
    startsAt: fromLocalInput(draft.startsAt) ?? new Date().toISOString(),
    endsAt: fromLocalInput(draft.endsAt),
    active: draft.active,
    priority: toInt(draft.priority),
    usageLimit: draft.usageLimit.trim() === '' ? null : toInt(draft.usageLimit),
    showPopup: draft.showPopup,
    popupTitle: trimmed(draft.popupTitle),
    popupSubtitle: trimmed(draft.popupSubtitle),
    popupBadge: trimmed(draft.popupBadge),
    popupImage: trimmed(draft.popupImage),
    popupCtaLabel: trimmed(draft.popupCtaLabel),
    popupCtaUrl: trimmed(draft.popupCtaUrl),
    popupFrequency: draft.popupFrequency,
    popupDelayMs: delayToMs(draft.popupDelaySec),
  };
}

// ---------------------------------------------------------------------------
// Vista previa del descuento
// ---------------------------------------------------------------------------

interface PreviewResult {
  discount: number;
  freeShipping: boolean;
  applies: boolean;
  reason: string | null;
}

interface PreviewLine {
  productId: string;
  categoryId?: string;
  brandId?: string;
  price: number;
  quantity: number;
}

interface PreviewBody {
  promotion: {
    type: PromotionType;
    scope: PromotionScope;
    targetIds: string[];
    value: number;
    maxDiscount: number | null;
    minPurchase: number;
    active: true;
  };
  subtotal: number;
  items: PreviewLine[];
}

/**
 * El carrito de ejemplo: una línea que sí cae dentro del alcance.
 *
 * La pregunta que responde la vista previa es «cuánto baja», no «a quién le
 * toca», así que el carrito se arma de forma que la regla alcance: si además
 * hubiera que adivinar si el ejemplo entra en la categoría elegida, el número
 * de abajo no diría nada.
 */
function previewBody(draft: Draft, subtotal: number): PreviewBody {
  const target = draft.targetIds[0];
  const line: PreviewLine = { productId: 'carrito-de-ejemplo', price: subtotal, quantity: 1 };

  const items: PreviewLine[] =
    draft.scope === 'ALL' || !target
      ? []
      : draft.scope === 'CATEGORY'
        ? [{ ...line, categoryId: target }]
        : draft.scope === 'BRAND'
          ? [{ ...line, brandId: target }]
          : [{ ...line, productId: target }];

  return {
    promotion: {
      type: draft.type,
      scope: draft.scope,
      targetIds: draft.scope === 'ALL' ? [] : draft.targetIds,
      value: draft.type === 'FREE_SHIPPING' ? 0 : toInt(draft.value),
      maxDiscount: draft.maxDiscount.trim() === '' ? null : toInt(draft.maxDiscount),
      minPurchase: toInt(draft.minPurchase),
      // A propósito sin fechas ni `active`: el calendario se lee arriba, en el
      // estado. Si la vista previa respondiera «todavía no empieza» para una
      // campaña programada, dejaría de contestar lo que se le pregunta, que es
      // cuánto dinero descuenta la regla.
      active: true,
    },
    subtotal,
    items,
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PromotionEditor({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: AdminPromotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(promotion));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sample, setSample] = useState('180000');

  // El error de un campo se borra al tocarlo: dejarlo puesto mientras la
  // persona corrige es ruido que ya no describe lo que hay escrito.
  const clearFieldError = (key: keyof Draft): void =>
    setErrors((current) => {
      if (!current[key]) return current;
      const next: DraftErrors = { ...current };
      delete next[key];
      return next;
    });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => {
      const next: Draft = { ...current };
      next[key] = value;
      return next;
    });
    clearFieldError(key);
  };

  const categories = useResource<AdminCategory[]>(
    (signal) => api.get<AdminCategory[]>('/api/admin/categories', undefined, signal),
    [],
  );
  const brands = useResource<AdminBrand[]>(
    (signal) => api.get<AdminBrand[]>('/api/admin/brands', undefined, signal),
    [],
  );

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const products = useResource<ProductListResponse | null>(
    (signal) =>
      draft.scope === 'PRODUCT'
        ? api.get<ProductListResponse>(
            '/api/admin/products',
            { search: debouncedSearch, status: 'all', limit: 30 },
            signal,
          )
        : Promise.resolve(null),
    [draft.scope, debouncedSearch],
  );

  // Los nombres de los productos se van acumulando: el buscador solo devuelve
  // la página actual y las fichas de lo ya elegido tienen que seguir diciendo
  // un nombre aunque la búsqueda haya cambiado.
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const items = products.data?.items;
    if (!items || items.length === 0) return;
    setProductNames((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of items) {
        if (next[item.id] !== item.name) {
          next[item.id] = item.name;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [products.data]);

  const subtotal = toInt(sample);
  const bodyKey = JSON.stringify(previewBody(draft, subtotal));
  const debouncedKey = useDebounced(bodyKey, 400);

  // Se debouncea el JSON y no el objeto: un objeto nuevo en cada render nunca
  // dejaría de ser "un valor distinto" y el retardo no llegaría a cumplirse.
  const preview = useResource<PreviewResult | null>(
    (signal) => {
      const body = JSON.parse(debouncedKey) as PreviewBody;
      if (body.subtotal <= 0) return Promise.resolve(null);
      return request<PreviewResult>('/api/admin/promotions/preview', {
        method: 'POST',
        body,
        signal,
      });
    },
    [debouncedKey],
  );

  const save = useAction(async (payload: Record<string, unknown>) =>
    promotion
      ? api.patch<AdminPromotion>(`/api/admin/promotions/${promotion.id}`, payload)
      : api.post<AdminPromotion>('/api/admin/promotions', payload),
  );

  const submit = async (): Promise<void> => {
    const found = validate(draft);
    setErrors(found);
    // El formulario no se limpia ni se cierra si algo falla: lo escrito es
    // trabajo de la dueña, no se tira por un mensaje del servidor.
    if (Object.values(found).some(Boolean)) return;
    const result = await save.run(toPayload(draft));
    if (result) onSaved();
  };

  const isPercentage = draft.type === 'PERCENTAGE';
  const isFreeShipping = draft.type === 'FREE_SHIPPING';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={promotion ? 'Editar promoción' : 'Nueva promoción'}
      description="Primero lo que descuenta, después cómo se anuncia. Son dos cosas distintas."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <FormError message={save.error} />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => void submit()}>
            {promotion ? 'Guardar cambios' : 'Crear promoción'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ------------------------------------------------ regla */}
          <Block
            step={1}
            icon={<Percent size={14} strokeWidth={2} />}
            title="Lo que descuenta"
            description="La rebaja de verdad: a qué se le aplica y cuánto baja."
          >
            <Input
              label="Nombre de la campaña"
              hint="solo lo ves tú"
              value={draft.name}
              error={errors.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Semana Aurelle"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Tipo de descuento"
                hint={TYPE_HINT[draft.type]}
                value={draft.type}
                onChange={(e) => set('type', e.target.value as PromotionType)}
              >
                {(Object.keys(PROMOTION_TYPE_LABEL) as PromotionType[]).map((type) => (
                  <option key={type} value={type}>
                    {PROMOTION_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>

              {!isFreeShipping && (
                <Input
                  label={isPercentage ? 'Porcentaje' : 'Cuánto se le quita'}
                  hint={isPercentage ? 'de 1 a 100' : 'en pesos'}
                  inputMode="numeric"
                  value={draft.value}
                  error={errors.value}
                  onChange={(e) => set('value', e.target.value)}
                  trailing={
                    <span className="pr-2 text-cap text-mist">{isPercentage ? '%' : 'COP'}</span>
                  }
                />
              )}
            </div>

            <Select
              label="¿Sobre qué se aplica?"
              value={draft.scope}
              onChange={(e) => {
                const scope = e.target.value as PromotionScope;
                setDraft((current) => ({ ...current, scope, targetIds: [] }));
                clearFieldError('targetIds');
              }}
            >
              {(Object.keys(SCOPE_LABEL) as PromotionScope[]).map((scope) => (
                <option key={scope} value={scope}>
                  {SCOPE_LABEL[scope]}
                </option>
              ))}
            </Select>

            {draft.scope !== 'ALL' && (
              <TargetPicker
                scope={draft.scope}
                selected={draft.targetIds}
                error={errors.targetIds}
                onToggle={(id) =>
                  setDraft((current) => ({
                    ...current,
                    targetIds: current.targetIds.includes(id)
                      ? current.targetIds.filter((t) => t !== id)
                      : [...current.targetIds, id],
                  }))
                }
                categories={categories.data}
                brands={brands.data}
                products={products.data}
                loading={
                  draft.scope === 'PRODUCT'
                    ? products.loading
                    : draft.scope === 'CATEGORY'
                      ? categories.loading
                      : brands.loading
                }
                search={search}
                onSearch={setSearch}
                productNames={productNames}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {!isFreeShipping && (
                <Input
                  label="Tope del descuento"
                  hint="opcional, en pesos"
                  inputMode="numeric"
                  value={draft.maxDiscount}
                  error={errors.maxDiscount}
                  onChange={(e) => set('maxDiscount', e.target.value)}
                  placeholder="Sin tope"
                />
              )}
              <Input
                label="Compra mínima"
                hint="en pesos"
                inputMode="numeric"
                value={draft.minPurchase}
                error={errors.minPurchase}
                onChange={(e) => set('minPurchase', e.target.value)}
              />
            </div>

            <Input
              label="Cupón"
              hint="opcional; si lo dejas vacío se aplica sola"
              value={draft.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="AURELLE20"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Empieza"
                type="datetime-local"
                value={draft.startsAt}
                error={errors.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
              <Input
                label="Termina"
                hint="vacío = sin fin"
                type="datetime-local"
                value={draft.endsAt}
                error={errors.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Prioridad"
                hint="gana la más alta"
                inputMode="numeric"
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value)}
              />
              <Input
                label="Límite de usos"
                hint="vacío = sin límite"
                inputMode="numeric"
                value={draft.usageLimit}
                error={errors.usageLimit}
                onChange={(e) => set('usageLimit', e.target.value)}
                placeholder="Sin límite"
              />
            </div>

            <Checkbox checked={draft.active} onChange={(v) => set('active', v)}>
              <span className="font-medium text-ink">Promoción encendida</span>
              <span className="block text-cap text-mist">
                Apagada se guarda igual, pero no descuenta ni se anuncia.
              </span>
            </Checkbox>
          </Block>

          {/* ------------------------------------------------ anuncio */}
          <Block
            step={2}
            icon={<Megaphone size={14} strokeWidth={2} />}
            title="Cómo se anuncia"
            description="El aviso que ve la clienta al entrar a la portada."
          >
            <Checkbox checked={draft.showPopup} onChange={(v) => set('showPopup', v)}>
              <span className="font-medium text-ink">Anunciarla en la portada</span>
              <span className="block text-cap text-mist">
                Sin esto la promoción sigue descontando, solo que en silencio.
              </span>
            </Checkbox>

            {draft.showPopup && (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <Input
                  label="Titular"
                  value={draft.popupTitle}
                  error={errors.popupTitle}
                  onChange={(e) => set('popupTitle', e.target.value)}
                  placeholder="20 % en esmaltes semipermanentes"
                />
                <Textarea
                  label="Texto"
                  hint="opcional"
                  rows={2}
                  value={draft.popupSubtitle}
                  onChange={(e) => set('popupSubtitle', e.target.value)}
                  placeholder="Solo esta semana, en toda la categoría."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Distintivo"
                    hint="opcional"
                    value={draft.popupBadge}
                    onChange={(e) => set('popupBadge', e.target.value)}
                    placeholder="Semana Aurelle"
                  />
                  <Input
                    label="Imagen"
                    hint="ruta de la foto"
                    value={draft.popupImage}
                    onChange={(e) => set('popupImage', e.target.value)}
                    placeholder="/images/editorial/promo.jpg"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Texto del botón"
                    value={draft.popupCtaLabel}
                    onChange={(e) => set('popupCtaLabel', e.target.value)}
                    placeholder="Ver la colección"
                  />
                  <Input
                    label="A dónde lleva"
                    value={draft.popupCtaUrl}
                    error={errors.popupCtaUrl}
                    onChange={(e) => set('popupCtaUrl', e.target.value)}
                    placeholder="/tienda?categoria=esmaltes-semipermanentes"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Cada cuánto se muestra"
                    value={draft.popupFrequency}
                    onChange={(e) => set('popupFrequency', e.target.value as PopupFrequency)}
                  >
                    {(Object.keys(POPUP_FREQUENCY_LABEL) as PopupFrequency[]).map((f) => (
                      <option key={f} value={f}>
                        {POPUP_FREQUENCY_LABEL[f]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Aparece a los"
                    hint="segundos"
                    inputMode="decimal"
                    value={draft.popupDelaySec}
                    onChange={(e) => set('popupDelaySec', e.target.value)}
                    trailing={<span className="pr-2 text-cap text-mist">s</span>}
                  />
                </div>
              </div>
            )}
          </Block>
        </div>

        {/* -------------------------------------------------- vistas previas */}
        <aside className="flex min-w-0 flex-col gap-4">
          <section className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <Calculator size={14} strokeWidth={2} className="text-mist" aria-hidden />
              <h3 className="text-body font-semibold text-ink">Cuánto descuenta</h3>
            </header>
            <div className="flex flex-col gap-2.5 p-3">
              <Input
                label="Carrito de ejemplo"
                hint="en pesos"
                inputMode="numeric"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
              />
              <DiscountPreview
                subtotal={subtotal}
                result={preview.data}
                loading={preview.loading}
                error={preview.error}
                scope={draft.scope}
              />
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <ImageIcon size={14} strokeWidth={2} className="text-mist" aria-hidden />
              <h3 className="text-body font-semibold text-ink">Cómo se verá el anuncio</h3>
            </header>
            <div className="bg-sand p-3">
              {draft.showPopup ? (
                <PopupMock draft={draft} />
              ) : (
                <p className="py-4 text-center text-cap text-mist">
                  Esta promoción descuenta, pero no se anuncia en la portada.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Piezas del formulario
// ---------------------------------------------------------------------------

function Block({
  step,
  icon,
  title,
  description,
  children,
}: {
  step: number;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line">
      <header className="flex items-start gap-2.5 border-b border-line bg-sand px-3.5 py-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-ink">
            <span className="tnum text-mist">{step}. </span>
            {title}
          </h3>
          <p className="text-cap text-mist">{description}</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 p-3.5">{children}</div>
    </section>
  );
}

function TargetPicker({
  scope,
  selected,
  error,
  onToggle,
  categories,
  brands,
  products,
  loading,
  search,
  onSearch,
  productNames,
}: {
  scope: PromotionScope;
  selected: string[];
  error?: string;
  onToggle: (id: string) => void;
  categories: AdminCategory[] | null;
  brands: AdminBrand[] | null;
  products: ProductListResponse | null;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  productNames: Readonly<Record<string, string>>;
}) {
  const options: Array<{ id: string; name: string; note: string }> =
    scope === 'CATEGORY'
      ? (categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          note: `${c.productCount} productos`,
        }))
      : scope === 'BRAND'
        ? (brands ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            note: `${b.productCount} productos`,
          }))
        : (products?.items ?? []).map((p) => ({ id: p.id, name: p.name, note: money(p.price) }));

  // Lo ya elegido que no está en la lista visible (el buscador de productos
  // solo trae una página): sin estas fichas, seleccionar y volver a buscar
  // daría la sensación de haber perdido lo marcado.
  const hidden = selected.filter((id) => !options.some((o) => o.id === id));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-cap font-medium text-ash">
        {scope === 'CATEGORY' ? 'Categorías' : scope === 'BRAND' ? 'Marcas' : 'Productos'} en oferta
        <span className="ml-1.5 font-normal text-mist">
          {selected.length === 0 ? 'ninguno elegido' : `${selected.length} elegidos`}
        </span>
      </span>

      {scope === 'PRODUCT' && (
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar por nombre o SKU…" />
      )}

      {hidden.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hidden.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-sm bg-clay-soft px-1.5 py-1 text-cap text-clay-dark transition-colors hover:bg-clay hover:text-white"
            >
              {productNames[id] ?? 'Elegido'}
              <X size={11} strokeWidth={2.5} aria-hidden />
              <span className="sr-only">Quitar</span>
            </button>
          ))}
        </div>
      )}

      <div className="max-h-44 overflow-y-auto rounded border border-line p-2">
        {loading && options.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : options.length === 0 ? (
          <p className="py-2 text-center text-cap text-mist">No hay nada que elegir aquí.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {options.map((option) => (
              <Checkbox
                key={option.id}
                checked={selected.includes(option.id)}
                onChange={() => onToggle(option.id)}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-ink">{option.name}</span>
                  <span className="tnum text-cap text-mist">{option.note}</span>
                </span>
              </Checkbox>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-cap text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function DiscountPreview({
  subtotal,
  result,
  loading,
  error,
  scope,
}: {
  subtotal: number;
  result: PreviewResult | null;
  loading: boolean;
  error: string | null;
  scope: PromotionScope;
}) {
  if (subtotal <= 0) {
    return <p className="text-cap text-mist">Escribe cuánto suma el carrito de ejemplo.</p>;
  }
  if (loading && !result) return <Skeleton className="h-12 w-full" />;
  if (error) return <p className="text-cap text-mist">{error}</p>;
  if (!result) return null;

  if (!result.applies) {
    return (
      <p className="rounded bg-sand p-2.5 text-cap text-ash">
        {result.reason ?? 'Con este carrito no aplicaría.'}
      </p>
    );
  }

  if (result.freeShipping) {
    return (
      <p className="text-body text-ink">
        Sobre un carrito de <strong className="tnum">{money(subtotal)}</strong> el envío le saldría
        gratis.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-ash">
        Sobre un carrito de <span className="tnum font-medium text-ink">{money(subtotal)}</span>{' '}
        descontaría
      </p>
      <p className="tnum display text-h3 leading-none text-clay">{money(result.discount)}</p>
      <p className="tnum text-cap text-mist">Pagaría {money(subtotal - result.discount)}</p>
      {scope !== 'ALL' && (
        <p className="mt-1 text-cap text-mist">
          Contando que todo el carrito sea de lo que elegiste arriba.
        </p>
      )}
    </div>
  );
}

/** Maqueta del anuncio. Imita la portada, no la reemplaza. */
function PopupMock({ draft }: { draft: Draft }) {
  const endsAt = fromLocalInput(draft.endsAt);
  const image = draft.popupImage.trim();

  // Una ruta mal escrita es lo normal mientras se teclea; se deja de pintar el
  // hueco roto, pero se vuelve a intentar en cuanto la ruta cambia.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);

  return (
    <div className="overflow-hidden rounded bg-white shadow-card">
      {image !== '' && !broken && (
        <div className="h-20 w-full bg-sand">
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        </div>
      )}
      <div className="flex flex-col gap-2 p-3">
        {draft.popupBadge.trim() !== '' && <span className="kicker">{draft.popupBadge}</span>}
        <p className="display text-h5 text-ink">
          {draft.popupTitle.trim() === '' ? 'Aquí va el titular' : draft.popupTitle}
        </p>
        {draft.popupSubtitle.trim() !== '' && (
          <p className="text-cap text-ash">{draft.popupSubtitle}</p>
        )}
        {draft.code.trim() !== '' && (
          <span className="inline-flex w-fit items-center gap-1 rounded-sm border border-dashed border-clay bg-clay-soft px-2 py-1 text-cap font-semibold tracking-[.08em] text-clay-dark">
            <Tag size={11} strokeWidth={2} aria-hidden />
            {draft.code.trim().toUpperCase()}
          </span>
        )}
        <span className="mt-1 inline-flex h-8 w-fit items-center rounded bg-ink px-3 text-cap font-medium text-white">
          {draft.popupCtaLabel.trim() === '' ? 'Ver la promoción' : draft.popupCtaLabel}
        </span>
        {endsAt && <p className="text-meta text-mist">Hasta el {longDate(endsAt)}</p>}
      </div>
    </div>
  );
}
