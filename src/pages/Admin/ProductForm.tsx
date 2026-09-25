import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Input';
import { FormError, Modal, money } from '../../components/admin/Primitives';
import { api } from '../../lib/api';
import { useAction } from '../../lib/useResource';
import { cn } from '../../lib/utils';
import type { AdminBrand, AdminCategory, AdminProduct } from '../../lib/admin-types';
import type { ProductTag } from '../../types';

/**
 * Alta y edición de producto, en el mismo formulario.
 *
 * Son dos operaciones distintas para la API y una sola para quien atiende la
 * tienda: los campos son los mismos y aprender dos pantallas para lo mismo no
 * tiene sentido. Lo único que cambia es el stock inicial, que solo existe el
 * primer día.
 */

const TAGS: ReadonlyArray<{ value: ProductTag; label: string }> = [
  { value: 'best', label: 'Más vendido' },
  { value: 'new', label: 'Novedad' },
  { value: 'pro', label: 'Uso profesional' },
];
const TAG_VALUES: readonly ProductTag[] = TAGS.map((t) => t.value);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Gris del selector de color cuando el hex escrito todavía no es válido. */
const HEX_FALLBACK = '#CCCCCC';

interface SizeDraft {
  label: string;
  price: string;
}

interface Draft {
  sku: string;
  name: string;
  categoryId: string;
  brandId: string;
  price: string;
  compareAtPrice: string;
  cost: string;
  taxPct: string;
  minStock: string;
  initialStock: string;
  unitCost: string;
  content: string;
  description: string;
  usage: string;
  tags: ProductTag[];
  active: boolean;
  featured: boolean;
  images: string[];
  shades: Array<{ name: string; hex: string }>;
  sizes: SizeDraft[];
}

type Errors = Record<string, string | undefined>;

const blank = (v: string): boolean => v.trim() === '';
/** Solo enteros: el dinero en pesos no lleva decimales y un "12,5" aquí es un error. */
const toInt = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const toDecimal = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

function draftFrom(product: AdminProduct | null): Draft {
  if (!product) {
    return {
      sku: '',
      name: '',
      categoryId: '',
      brandId: '',
      price: '',
      compareAtPrice: '',
      cost: '',
      taxPct: '19',
      minStock: '5',
      initialStock: '',
      unitCost: '',
      content: '',
      description: '',
      usage: '',
      tags: [],
      active: true,
      featured: false,
      images: [''],
      shades: [],
      sizes: [],
    };
  }
  return {
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    brandId: product.brandId,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice === null ? '' : String(product.compareAtPrice),
    cost: String(product.cost),
    taxPct: String(Number((product.taxRate * 100).toFixed(2))),
    minStock: String(product.minStock),
    initialStock: '',
    unitCost: '',
    content: product.content,
    description: product.description,
    usage: product.usage,
    tags: product.tags.filter((t): t is ProductTag => TAG_VALUES.includes(t as ProductTag)),
    active: product.active,
    featured: product.featured,
    images: product.images.length > 0 ? [...product.images] : [''],
    shades: product.shades.map((s) => ({ ...s })),
    sizes: product.sizes.map((s) => ({
      label: s.label,
      price: s.price === undefined ? '' : String(s.price),
    })),
  };
}

// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  single,
  children,
}: {
  title: string;
  hint?: string;
  single?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-meta font-semibold uppercase tracking-[.06em] text-mist">{title}</h3>
      {hint && <p className="mt-1 text-cap text-ash">{hint}</p>}
      <div className={cn('mt-3 grid gap-3', !single && 'sm:grid-cols-2')}>{children}</div>
    </section>
  );
}

/**
 * Botón de quitar de una fila editable (imagen, tono, tamaño).
 *
 * `offset` alinea el botón con la caja cuando la fila lleva etiqueta encima:
 * sin eso queda pegado al texto de la etiqueta y no al campo.
 */
function RemoveRow({
  label,
  offset,
  onRemove,
}: {
  label: string;
  offset?: boolean;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      className={cn(
        'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-mist transition-colors hover:border-danger hover:text-danger',
        offset && 'mt-6',
      )}
    >
      <Trash2 size={15} strokeWidth={2} />
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function ProductForm({
  product,
  categories,
  brands,
  onClose,
  onSaved,
}: {
  /** `null` para crear. El componente se monta con `key` para nacer limpio. */
  product: AdminProduct | null;
  categories: AdminCategory[];
  brands: AdminBrand[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = product !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(product));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useAction(async (payload: Record<string, unknown>) =>
    product
      ? api.patch<AdminProduct>(`/api/admin/products/${product.id}`, payload)
      : api.post<AdminProduct>('/api/admin/products', payload),
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }));
    // El error de la API deja de ser cierto en cuanto se cambia algo: dejarlo
    // puesto haría creer que el nuevo intento también falló.
    setFormError(null);
    save.clearError();
  };

  // Margen en vivo: es el número por el que se decide si vale la pena vender
  // algo, y hacerlo de cabeza en la caja es justo lo que no se hace.
  const priceValue = toInt(draft.price);
  const costValue = toInt(draft.cost);
  const marginPreview = useMemo(() => {
    if (priceValue === null || priceValue <= 0) return null;
    const cost = costValue ?? 0;
    const margin = priceValue - cost;
    return { margin, pct: (margin / priceValue) * 100, hasCost: cost > 0 };
  }, [priceValue, costValue]);

  function validate(): Errors {
    const e: Errors = {};

    if (blank(draft.sku)) e.sku = 'Escribe la referencia. Es lo que la identifica en la bodega.';
    if (blank(draft.name)) e.name = 'Escribe el nombre del producto.';
    else if (draft.name.trim().length < 3) e.name = 'El nombre necesita al menos 3 letras.';
    if (blank(draft.categoryId)) e.categoryId = 'Elige una categoría.';
    if (blank(draft.brandId)) e.brandId = 'Elige una marca.';

    const price = toInt(draft.price);
    if (price === null) e.price = 'Escribe el precio de venta, en pesos y sin puntos.';
    else if (price < 1) e.price = 'El precio tiene que ser mayor que cero.';

    if (!blank(draft.compareAtPrice)) {
      const compare = toInt(draft.compareAtPrice);
      if (compare === null) e.compareAtPrice = 'El precio tachado va en pesos, sin puntos.';
      else if (price !== null && compare <= price)
        e.compareAtPrice = 'El precio tachado tiene que ser mayor que el de venta, o no hay oferta que mostrar.';
    }

    if (!blank(draft.cost) && toInt(draft.cost) === null)
      e.cost = 'El costo va en pesos, sin puntos ni decimales.';

    const tax = toDecimal(draft.taxPct);
    if (tax === null || tax > 100) e.taxPct = 'El IVA va entre 0 y 100.';

    if (!blank(draft.minStock) && toInt(draft.minStock) === null)
      e.minStock = 'El mínimo va en unidades enteras.';

    if (!editing) {
      if (!blank(draft.initialStock) && toInt(draft.initialStock) === null)
        e.initialStock = 'Las unidades van en números enteros.';
      if (!blank(draft.unitCost) && toInt(draft.unitCost) === null)
        e.unitCost = 'El costo unitario va en pesos, sin puntos.';
    }

    draft.shades.forEach((s, i) => {
      if (blank(s.name) && blank(s.hex)) return;
      if (blank(s.name)) e[`shade-${i}`] = 'El tono necesita nombre.';
      else if (!HEX.test(s.hex.trim()))
        e[`shade-${i}`] = 'El color va en formato #RRGGBB (por ejemplo #D9A5AE).';
    });

    draft.sizes.forEach((s, i) => {
      if (blank(s.label) && blank(s.price)) return;
      if (blank(s.label)) e[`size-${i}`] = 'La presentación necesita una etiqueta.';
      else if (!blank(s.price) && (toInt(s.price) === null || (toInt(s.price) ?? 0) < 1))
        e[`size-${i}`] = 'El precio de esta presentación va en pesos y mayor que cero.';
    });

    return e;
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Revisa los campos marcados en rojo.');
      return;
    }
    setFormError(null);

    const images = draft.images.map((i) => i.trim()).filter((i) => i !== '');
    const shades = draft.shades
      .filter((s) => !blank(s.name))
      .map((s) => ({ name: s.name.trim(), hex: s.hex.trim().toUpperCase() }));
    const sizes = draft.sizes
      .filter((s) => !blank(s.label))
      .map((s) => {
        const price = toInt(s.price);
        return price === null ? { label: s.label.trim() } : { label: s.label.trim(), price };
      });

    const payload: Record<string, unknown> = {
      sku: draft.sku.trim(),
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      brandId: draft.brandId,
      price: toInt(draft.price),
      compareAtPrice: blank(draft.compareAtPrice) ? null : toInt(draft.compareAtPrice),
      cost: toInt(draft.cost) ?? 0,
      taxRate: (toDecimal(draft.taxPct) ?? 0) / 100,
      minStock: toInt(draft.minStock) ?? 0,
      active: draft.active,
      featured: draft.featured,
      tags: draft.tags,
      content: draft.content.trim(),
      description: draft.description.trim(),
      usage: draft.usage.trim(),
      images,
      shades,
      sizes,
    };

    // El stock nunca viaja en el PATCH: la API lo rechaza a propósito para no
    // dejar un cambio de existencias sin el movimiento que lo explica.
    if (!editing) {
      const initial = toInt(draft.initialStock) ?? 0;
      payload.initialStock = initial;
      if (initial > 0) payload.unitCost = toInt(draft.unitCost) ?? toInt(draft.cost) ?? 0;
    }

    const result = await save.run(payload);
    // Si falla (un SKU repetido, por ejemplo) no se cierra nada: lo escrito se
    // queda donde está y solo hay que corregir el campo que chocó.
    if (result) onSaved();
  }

  const formId = 'aurelle-product-form';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar producto' : 'Nuevo producto'}
      description={
        editing
          ? `${product.sku} · creado el ${new Date(product.createdAt).toLocaleDateString('es-CO')}`
          : 'Los campos con nombre en negrita son los únicos obligatorios.'
      }
      footer={
        <>
          <div className="mr-auto min-w-0 max-w-[58%]">
            <FormError message={formError ?? save.error} />
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form={formId} loading={save.pending}>
            {editing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Section title="Identificación">
          <Input
            label="Referencia (SKU)"
            hint="única"
            value={draft.sku}
            error={errors.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="VP-1037"
            autoComplete="off"
          />
          <Input
            label="Nombre del producto"
            value={draft.name}
            error={errors.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Esmalte semipermanente Rosé Silk"
            autoComplete="off"
          />
          <Select
            label="Categoría"
            value={draft.categoryId}
            error={errors.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">Elegir…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? '' : ' (apagada)'}
              </option>
            ))}
          </Select>
          <Select
            label="Marca"
            value={draft.brandId}
            error={errors.brandId}
            onChange={(e) => set('brandId', e.target.value)}
          >
            <option value="">Elegir…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? '' : ' (apagada)'}
              </option>
            ))}
          </Select>
        </Section>

        <Section title="Precios">
          <Input
            label="Precio de venta"
            hint="en pesos"
            value={draft.price}
            error={errors.price}
            onChange={(e) => set('price', e.target.value)}
            inputMode="numeric"
            placeholder="32900"
            inputClassName="tnum"
          />
          <Input
            label="Precio tachado"
            hint="opcional, para mostrar oferta"
            value={draft.compareAtPrice}
            error={errors.compareAtPrice}
            onChange={(e) => set('compareAtPrice', e.target.value)}
            inputMode="numeric"
            placeholder="39900"
            inputClassName="tnum"
          />
          <Input
            label="Costo"
            hint="lo que te cuesta"
            value={draft.cost}
            error={errors.cost}
            onChange={(e) => set('cost', e.target.value)}
            inputMode="numeric"
            placeholder="14200"
            inputClassName="tnum"
          />
          <Input
            label="IVA"
            hint="en porcentaje"
            value={draft.taxPct}
            error={errors.taxPct}
            onChange={(e) => set('taxPct', e.target.value)}
            inputMode="decimal"
            placeholder="19"
            inputClassName="tnum"
            trailing={<span className="px-1.5 text-cap text-mist">%</span>}
          />

          <div className="rounded border border-line bg-sand px-3 py-2.5 sm:col-span-2">
            {marginPreview === null ? (
              <p className="text-cap text-mist">
                Escribe el precio de venta y el costo para ver cuánto te queda por unidad.
              </p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-cap text-ash">Te queda por unidad</span>
                <span
                  className={cn(
                    'tnum text-lead font-semibold',
                    marginPreview.margin < 0 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {money(marginPreview.margin)}
                </span>
                <span
                  className={cn(
                    'tnum text-cap font-medium',
                    marginPreview.margin < 0 ? 'text-danger' : 'text-ash',
                  )}
                >
                  ({marginPreview.pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })} % del
                  precio)
                </span>
                {marginPreview.margin < 0 && (
                  <span className="w-full text-cap text-danger">
                    Estarías vendiendo por debajo de lo que te cuesta.
                  </span>
                )}
                {!marginPreview.hasCost && marginPreview.margin >= 0 && (
                  <span className="w-full text-cap text-mist">
                    Sin costo cargado el margen sale igual al precio, y no es real.
                  </span>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Existencias">
          <Input
            label="Avisarme cuando queden menos de"
            hint="unidades"
            value={draft.minStock}
            error={errors.minStock}
            onChange={(e) => set('minStock', e.target.value)}
            inputMode="numeric"
            placeholder="6"
            inputClassName="tnum"
          />
          {editing ? (
            // Se dice antes de que lo intente, no después: la API rechaza el
            // stock en el PATCH y un error al guardar no explicaría por qué.
            <div className="flex items-start gap-2 rounded border border-line bg-sand px-3 py-2.5 text-cap text-ash">
              <Boxes size={15} strokeWidth={2} className="mt-px shrink-0 text-mist" />
              <p>
                Hoy hay <span className="tnum font-semibold text-ink">{product.stock}</span>{' '}
                unidades. Las existencias no se editan aquí: se cambian en{' '}
                <Link to="/admin/inventario" className="link-quiet font-medium">
                  Inventario
                </Link>
                , donde cada entrada o salida queda registrada con su motivo.
              </p>
            </div>
          ) : (
            <>
              <Input
                label="Stock inicial"
                hint="unidades que ya tienes"
                value={draft.initialStock}
                error={errors.initialStock}
                onChange={(e) => set('initialStock', e.target.value)}
                inputMode="numeric"
                placeholder="0"
                inputClassName="tnum"
              />
              <Input
                label="Costo de esa primera entrada"
                hint="por unidad; si lo dejas vacío usamos el costo"
                value={draft.unitCost}
                error={errors.unitCost}
                onChange={(e) => set('unitCost', e.target.value)}
                inputMode="numeric"
                placeholder="14200"
                inputClassName="tnum"
                className="sm:col-span-2"
              />
            </>
          )}
        </Section>

        <Section title="Ficha de la tienda" single>
          <Input
            label="Presentación"
            hint="lo que dice el envase"
            value={draft.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder="15 ml"
          />
          <Textarea
            label="Descripción"
            rows={3}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Qué es y para quién."
          />
          <Textarea
            label="Modo de uso"
            rows={3}
            value={draft.usage}
            onChange={(e) => set('usage', e.target.value)}
            placeholder="Cómo se aplica, paso a paso."
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2.5 pt-1">
            {TAGS.map((tag) => (
              <Checkbox
                key={tag.value}
                checked={draft.tags.includes(tag.value)}
                onChange={(on) =>
                  set(
                    'tags',
                    on ? [...draft.tags, tag.value] : draft.tags.filter((t) => t !== tag.value),
                  )
                }
              >
                {tag.label}
              </Checkbox>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            <Checkbox checked={draft.active} onChange={(v) => set('active', v)}>
              A la venta en la tienda
            </Checkbox>
            <Checkbox checked={draft.featured} onChange={(v) => set('featured', v)}>
              Mostrar en portada
            </Checkbox>
          </div>
        </Section>

        <Section title="Imágenes" hint="Rutas dentro del sitio. La primera es la que se ve en el listado." single>
          <div className="flex flex-col gap-2">
            {draft.images.map((src, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  className="flex-1"
                  aria-label={`Ruta de la imagen ${i + 1}`}
                  value={src}
                  onChange={(e) =>
                    set(
                      'images',
                      draft.images.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                  placeholder="/images/products/p1-a.svg"
                />
                <RemoveRow
                  label={`Quitar la imagen ${i + 1}`}
                  onRemove={() =>
                    set(
                      'images',
                      draft.images.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={() => set('images', [...draft.images, ''])}
            >
              <Plus size={14} strokeWidth={2} /> Añadir imagen
            </Button>
          </div>
        </Section>

        <Section title="Tonos" hint="Solo si el producto viene en varios colores." single>
          <div className="flex flex-col gap-2">
            {draft.shades.map((shade, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  className="flex-1"
                  label={i === 0 ? 'Nombre del tono' : undefined}
                  aria-label={`Nombre del tono ${i + 1}`}
                  value={shade.name}
                  error={errors[`shade-${i}`]}
                  onChange={(e) =>
                    set(
                      'shades',
                      draft.shades.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                    )
                  }
                  placeholder="Rosé Silk"
                />
                <Input
                  className="w-32"
                  label={i === 0 ? 'Color' : undefined}
                  aria-label={`Código de color del tono ${i + 1}`}
                  value={shade.hex}
                  onChange={(e) =>
                    set(
                      'shades',
                      draft.shades.map((s, j) => (j === i ? { ...s, hex: e.target.value } : s)),
                    )
                  }
                  placeholder="#D9A5AE"
                  inputClassName="tnum uppercase"
                />
                {/* El único hex fuera del sistema: por definición pinta el color
                    del producto, no el de la interfaz. */}
                <input
                  type="color"
                  aria-label={`Elegir el color del tono ${i + 1}`}
                  value={HEX.test(shade.hex.trim()) ? shade.hex.trim() : HEX_FALLBACK}
                  onChange={(e) =>
                    set(
                      'shades',
                      draft.shades.map((s, j) =>
                        j === i ? { ...s, hex: e.target.value.toUpperCase() } : s,
                      ),
                    )
                  }
                  className={cn(
                    'h-10 w-11 shrink-0 cursor-pointer rounded border border-line bg-white p-1',
                    i === 0 && 'mt-6',
                  )}
                />
                <RemoveRow
                  label={`Quitar el tono ${i + 1}`}
                  offset={i === 0}
                  onRemove={() =>
                    set(
                      'shades',
                      draft.shades.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={() => set('shades', [...draft.shades, { name: '', hex: '' }])}
            >
              <Plus size={14} strokeWidth={2} /> Añadir tono
            </Button>
          </div>
        </Section>

        <Section
          title="Tamaños"
          hint="Si una presentación cuesta distinto, escribe su precio; si no, se usa el de arriba."
          single
        >
          <div className="flex flex-col gap-2">
            {draft.sizes.map((size, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  className="flex-1"
                  label={i === 0 ? 'Presentación' : undefined}
                  aria-label={`Etiqueta del tamaño ${i + 1}`}
                  value={size.label}
                  error={errors[`size-${i}`]}
                  onChange={(e) =>
                    set(
                      'sizes',
                      draft.sizes.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)),
                    )
                  }
                  placeholder="15 g"
                />
                <Input
                  className="w-36"
                  label={i === 0 ? 'Precio' : undefined}
                  aria-label={`Precio del tamaño ${i + 1}`}
                  value={size.price}
                  onChange={(e) =>
                    set(
                      'sizes',
                      draft.sizes.map((s, j) => (j === i ? { ...s, price: e.target.value } : s)),
                    )
                  }
                  inputMode="numeric"
                  placeholder="opcional"
                  inputClassName="tnum"
                />
                <RemoveRow
                  label={`Quitar el tamaño ${i + 1}`}
                  offset={i === 0}
                  onRemove={() =>
                    set(
                      'sizes',
                      draft.sizes.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={() => set('sizes', [...draft.sizes, { label: '', price: '' }])}
            >
              <Plus size={14} strokeWidth={2} /> Añadir tamaño
            </Button>
          </div>
        </Section>
      </form>
    </Modal>
  );
}
