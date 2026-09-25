import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Equal,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAction, useDebounced, useResource } from '../../lib/useResource';
import type { AdminProduct, Movement, MovementType, Paged } from '../../lib/admin-types';
import { MOVEMENT_LABEL } from '../../lib/admin-types';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input } from '../../components/ui/Input';
import {
  Badge,
  EmptyState,
  FormError,
  Modal,
  SearchInput,
  Skeleton,
  TableWrap,
  Td,
  Th,
  money,
} from '../../components/admin/Primitives';

/**
 * Formularios de inventario.
 *
 * Viven fuera de la pantalla porque los tres (movimiento, conteo de una
 * referencia y conteo de bodega) son largos y la pantalla ya tiene bastante
 * con las alertas y el historial. Los tres van en `Modal` y no en un panel
 * fijo: la pantalla existe para *ver el problema*, y un formulario siempre
 * desplegado empujaría las alertas fuera de la primera pantalla justo en el
 * móvil, que es donde se revisa la bodega. Además el atajo "Registrar
 * entrada" de cada alerta necesita abrirse ya rellenado y con el foco dentro;
 * al cerrarlo se vuelve exactamente a la fila desde la que se salió.
 */

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

/** Los movimientos que se pueden crear a mano. `SALE` e `INITIAL` los escribe el servidor. */
export type EntryType = Extract<MovementType, 'PURCHASE' | 'RETURN' | 'ADJUSTMENT'>;

/**
 * Lo mínimo que un formulario necesita saber de un producto.
 *
 * No duplica `AdminProduct`: es la vista que comparten sus dos orígenes, el
 * buscador (que devuelve `AdminProduct`) y el atajo de una alerta (que solo
 * tiene un `StockAlert`). Sin este tipo, el atajo tendría que pedir el
 * producto entero a la API solo para rellenar un campo que ya conoce.
 */
export interface PickedProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

export interface MovementSeed {
  product: PickedProduct | null;
  type: EntryType;
  quantity: string;
}

interface MovementResponse {
  movement: Movement;
  product: AdminProduct;
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

/** Entero o `null`. `Number('')` vale 0 y `Number('1,5')` vale NaN: los dos mienten. */
function toInt(value: string): number | null {
  const text = value.trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}

const units = (n: number): string => `${Math.abs(n).toLocaleString('es-CO')} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`;

// ---------------------------------------------------------------------------
// Buscador de producto
// ---------------------------------------------------------------------------

export function ProductPicker({
  selected,
  onSelect,
  label,
  placeholder = 'Escribe el nombre o el SKU…',
  excludeIds = [],
}: {
  selected: PickedProduct | null;
  onSelect: (product: PickedProduct | null) => void;
  label?: string;
  placeholder?: string;
  excludeIds?: readonly string[];
}) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term, 300);
  const query = debounced.trim();

  // Menos de dos letras devuelve medio catálogo y nada útil: no se pregunta.
  const search = useResource<Paged<AdminProduct> | null>(
    (signal) =>
      query.length < 2
        ? Promise.resolve(null)
        : api.get<Paged<AdminProduct>>(
            '/api/admin/products',
            { search: query, limit: 10 },
            signal,
          ),
    [query],
  );

  const results = useMemo(
    () => (search.data?.items ?? []).filter((p) => !excludeIds.includes(p.id)),
    [search.data, excludeIds],
  );

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <span className="text-cap font-medium text-ash">{label}</span>}
        <div className="flex items-center gap-2 rounded border border-line bg-sand px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">{selected.name}</p>
            <p className="tnum text-cap text-mist">
              {selected.sku} · el sistema dice {units(selected.stock)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setTerm('');
            }}
            aria-label="Elegir otro producto"
            className="shrink-0 cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-white hover:text-ink"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-cap font-medium text-ash">{label}</span>}
      <div className="relative">
        <SearchInput value={term} onChange={setTerm} placeholder={placeholder} />

        {query.length >= 2 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-60 overflow-y-auto rounded border border-line bg-white shadow-pop">
            {search.first ? (
              <div className="flex flex-col gap-1.5 p-2.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : search.error ? (
              <p className="px-2.5 py-2 text-cap text-danger">{search.error}</p>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-2 text-cap text-mist">
                Ningún producto coincide con «{query}».
              </p>
            ) : (
              <ul>
                {results.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect({
                          id: product.id,
                          sku: product.sku,
                          name: product.name,
                          stock: product.stock,
                        });
                        setTerm('');
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-sand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-ink">{product.name}</span>
                        <span className="tnum block text-cap text-mist">{product.sku}</span>
                      </span>
                      <span className="tnum shrink-0 text-cap text-ash">{product.stock} en bodega</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registrar movimiento
// ---------------------------------------------------------------------------

const ENTRY_TYPES: ReadonlyArray<{ value: EntryType; title: string; help: string }> = [
  {
    value: 'PURCHASE',
    title: 'Entrada de mercancía',
    help: 'Llegó el pedido del proveedor. Suma unidades.',
  },
  {
    value: 'RETURN',
    title: 'Devolución de una clienta',
    help: 'Volvió algo vendido y se puede volver a vender. Suma unidades.',
  },
  {
    value: 'ADJUSTMENT',
    title: 'Ajuste',
    help: 'Se dañó, se perdió o el número no cuadra. Suma o resta.',
  },
];

/** Motivos que se escriben una y otra vez. Un clic evita teclearlos mal. */
const REASON_HINTS: Record<EntryType, readonly string[]> = {
  PURCHASE: ['Pedido a proveedor', 'Reposición urgente'],
  RETURN: ['Devolución de una clienta', 'Cambio por otra referencia'],
  ADJUSTMENT: ['Se dañó o se perdió', 'Producto vencido', 'Sobró en el conteo'],
};

export function MovementModal({
  seed,
  onClose,
  onSaved,
}: {
  seed: MovementSeed;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [product, setProduct] = useState<PickedProduct | null>(seed.product);
  const [type, setType] = useState<EntryType>(seed.type);
  const [quantity, setQuantity] = useState(seed.quantity);
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const save = useAction((body: Record<string, unknown>) =>
    api.post<MovementResponse>('/api/admin/inventory/movements', body),
  );

  const qty = toInt(quantity);
  const cost = toInt(unitCost);
  const resulting = product && qty !== null ? product.stock + qty : null;

  async function submit(): Promise<void> {
    setInvalid(null);
    if (!product) return setInvalid('Elige primero de qué producto se trata.');
    if (qty === null) return setInvalid('La cantidad son unidades enteras, sin comas ni puntos.');
    if (qty === 0) {
      return setInvalid('Con cero no se mueve nada. Escribe cuántas unidades entran o salen.');
    }
    if (qty < 0 && type !== 'ADJUSTMENT') {
      return setInvalid('Una entrada suma: escribe la cantidad en positivo. Para restar, usa Ajuste.');
    }
    if (resulting !== null && resulting < 0) {
      return setInvalid(
        `No alcanza: el sistema dice que hay ${units(product.stock)} y estás restando ${units(qty)}.`,
      );
    }
    // Solo se valida el costo si de verdad va a viajar: al cambiar de tipo el
    // campo desaparece, y lo que quedó escrito no puede bloquear el guardado.
    if (type === 'PURCHASE' && unitCost.trim() !== '' && (cost === null || cost < 0)) {
      return setInvalid('El costo son pesos enteros, sin centavos ni puntos de miles.');
    }

    const saved = await save.run({
      productId: product.id,
      type,
      quantity: qty,
      // El costo solo viaja en la compra: en una devolución o un ajuste no hay
      // factura de proveedor que lo respalde y el servidor lo descartaría.
      ...(type === 'PURCHASE' && cost !== null ? { unitCost: cost } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (saved) {
      onSaved();
      onClose();
    }
  }

  const error = invalid ?? save.error;

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar un movimiento"
      description="El stock nunca se escribe a mano: entra o sale con un motivo, y queda en el historial."
      footer={
        <>
          <FormError message={error} />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => void submit()}>
            Guardar movimiento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Qué pasó con la mercancía" className="grid gap-1.5">
          {ENTRY_TYPES.map((option) => (
            <div
              key={option.value}
              className={cn(
                'rounded border px-2.5 py-2 transition-colors',
                type === option.value ? 'border-ink bg-sand' : 'border-line',
              )}
            >
              <Checkbox radio checked={type === option.value} onChange={() => setType(option.value)}>
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-body font-medium text-ink">{option.title}</span>
                  {/* El nombre del sistema va de apoyo: sirve para cuadrar con
                      el historial, pero no es lo que se lee primero. */}
                  <span className="text-meta uppercase text-mist">
                    {MOVEMENT_LABEL[option.value]}
                  </span>
                </span>
                <span className="mt-0.5 block text-cap text-ash">{option.help}</span>
              </Checkbox>
            </div>
          ))}
        </div>

        <ProductPicker selected={product} onSelect={setProduct} label="Producto" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Cantidad"
            hint={type === 'ADJUSTMENT' ? '(puede ser negativa)' : '(unidades que entran)'}
            type="number"
            inputMode="numeric"
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            inputClassName="tnum"
          />
          {type === 'PURCHASE' && (
            <Input
              label="Costo por unidad"
              hint="(lo que te costó a ti)"
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="14200"
              inputClassName="tnum"
            />
          )}
        </div>

        {type === 'ADJUSTMENT' && (
          <p className="rounded border border-line bg-sand px-2.5 py-2 text-cap leading-relaxed text-ash">
            Un número <strong className="font-semibold text-ink">negativo resta</strong>: es lo que
            se usa cuando algo se averió, se perdió o el conteo quedó por debajo. Un número positivo
            suma unidades que aparecieron.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Input
            label="Motivo"
            hint="(lo verá quien revise el historial)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder={type === 'PURCHASE' ? 'Pedido a proveedor #4471' : 'En dos palabras, qué pasó'}
          />
          <div className="flex flex-wrap gap-1.5">
            {REASON_HINTS[type].map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => setReason(hint)}
                className="cursor-pointer rounded-sm border border-line px-2 py-0.5 text-cap text-ash transition-colors hover:border-ink hover:text-ink"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>

        {product && qty !== null && qty !== 0 && resulting !== null && (
          <p
            className={cn(
              'tnum rounded border px-2.5 py-2 text-cap',
              resulting < 0 ? 'border-danger bg-sand text-danger' : 'border-line bg-sand text-ash',
            )}
          >
            {resulting < 0 ? (
              <>No alcanza: hay {units(product.stock)} y estás restando {units(qty)}.</>
            ) : (
              <>
                El stock pasa de{' '}
                <strong className="font-semibold text-ink">{product.stock}</strong> a{' '}
                <strong className="font-semibold text-ink">{resulting}</strong> unidades.
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Conteo físico de una referencia
// ---------------------------------------------------------------------------

/** Explica la diferencia con palabras antes de confirmarla. */
function CountPreview({ current, counted }: { current: number; counted: number }) {
  const delta = counted - current;
  if (delta === 0) {
    return (
      <p className="flex items-start gap-1.5 rounded border border-line bg-sand px-2.5 py-2 text-cap text-ash">
        <Equal size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-ok" />
        Coincide con lo que dice el sistema. No se registra ningún movimiento.
      </p>
    );
  }
  const inbound = delta > 0;
  return (
    <p className="flex items-start gap-1.5 rounded border border-line bg-sand px-2.5 py-2 text-cap leading-relaxed text-ash">
      {inbound ? (
        <ArrowDownToLine size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-ok" />
      ) : (
        <ArrowUpFromLine size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
      )}
      <span className="tnum">
        Hay <strong className="font-semibold text-ink">{current}</strong>, vas a dejar{' '}
        <strong className="font-semibold text-ink">{counted}</strong>: se registrará{' '}
        {inbound ? 'una entrada' : 'una salida'} de{' '}
        <strong className={cn('font-semibold', inbound ? 'text-ok' : 'text-danger')}>
          {Math.abs(delta)}
        </strong>{' '}
        como ajuste.
      </span>
    </p>
  );
}

export function CountModal({
  seed,
  onClose,
  onSaved,
}: {
  seed: PickedProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [product, setProduct] = useState<PickedProduct | null>(seed);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const save = useAction((body: Record<string, unknown>) =>
    api.post<{ movement: Movement | null; product: AdminProduct }>(
      '/api/admin/inventory/count',
      body,
    ),
  );

  const value = toInt(counted);

  async function submit(): Promise<void> {
    setInvalid(null);
    if (!product) return setInvalid('Elige primero qué referencia contaste.');
    if (value === null) return setInvalid('Escribe cuántas unidades contaste, en número entero.');
    if (value < 0) return setInvalid('No se pueden contar unidades negativas en una estantería.');

    const saved = await save.run({
      productId: product.id,
      newStock: value,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (saved) {
      onSaved();
      onClose();
    }
  }

  const error = invalid ?? save.error;

  return (
    <Modal
      open
      onClose={onClose}
      title="Conteo físico"
      description="Cuántas hay de verdad en la estantería."
      size="sm"
      footer={
        <>
          <FormError message={error} />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => void submit()}>
            Fijar el stock
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ash">
          Este número <strong className="font-semibold text-ink">fija el stock</strong>: manda sobre
          lo que diga el sistema. La diferencia queda registrada como un ajuste, para que el
          historial siga explicando cada unidad.
        </p>

        <ProductPicker selected={product} onSelect={setProduct} label="Producto contado" />

        <Input
          label="¿Cuántas hay en la estantería?"
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          placeholder="0"
          inputClassName="tnum"
        />

        {product && value !== null && value >= 0 && (
          <CountPreview current={product.stock} counted={value} />
        )}

        <Input
          label="Motivo"
          hint="(opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Conteo físico"
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Conteo de bodega (varias referencias de una vez)
// ---------------------------------------------------------------------------

interface BulkRow {
  product: PickedProduct;
  counted: string;
}

export function BulkCountModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null);

  const save = useAction((body: Record<string, unknown>) =>
    api.post<{ updated: number; skipped: number }>('/api/admin/inventory/bulk', body),
  );

  const ids = useMemo(() => rows.map((r) => r.product.id), [rows]);

  function setCounted(id: string, counted: string): void {
    setRows((prev) => prev.map((row) => (row.product.id === id ? { ...row, counted } : row)));
  }

  async function submit(): Promise<void> {
    setInvalid(null);

    // Una fila sin número no es un conteo de cero: es una referencia que
    // todavía no se ha contado, y mandarla en cero vaciaría la bodega.
    const filled = rows.filter((row) => row.counted.trim() !== '');
    if (filled.length === 0) {
      return setInvalid('Escribe el conteo de al menos una referencia.');
    }
    const bad = filled.find((row) => {
      const n = toInt(row.counted);
      return n === null || n < 0;
    });
    if (bad) {
      return setInvalid(`El conteo de ${bad.product.sku} no es un número entero de cero en adelante.`);
    }

    const saved = await save.run({
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      items: filled.map((row) => ({ productId: row.product.id, newStock: toInt(row.counted) })),
    });
    if (saved) {
      setResult(saved);
      onSaved();
    }
  }

  const error = invalid ?? save.error;

  if (result) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Conteo de bodega guardado"
        size="sm"
        footer={
          <Button size="sm" onClick={onClose}>
            Listo
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="tnum text-body text-ash">
            <strong className="font-semibold text-ink">{result.updated}</strong>{' '}
            {result.updated === 1 ? 'referencia cambió' : 'referencias cambiaron'} de stock y quedaron
            con su ajuste en el historial.
          </p>
          <p className="tnum text-body text-ash">
            <strong className="font-semibold text-ink">{result.skipped}</strong>{' '}
            {result.skipped === 1 ? 'ya estaba' : 'ya estaban'} en el número que contaste: no se
            registró nada.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Conteo de bodega"
      description="Para el día del inventario: se teclea lo contado de varias referencias y se manda todo junto."
      size="lg"
      footer={
        <>
          <FormError message={error} />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => void submit()}>
            Guardar el conteo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ash">
          Todo entra o no entra nada: si una referencia falla, ninguna se guarda. Las filas que
          dejes en blanco no se mandan.
        </p>

        <ProductPicker
          selected={null}
          onSelect={(product) => {
            if (product) setRows((prev) => [...prev, { product, counted: '' }]);
          }}
          label="Añadir referencia a contar"
          placeholder="Busca y añade el producto que tienes delante…"
          excludeIds={ids}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<Search size={22} strokeWidth={1.5} />}
            title="Todavía no has añadido ninguna referencia"
            description="Busca arriba el primer producto de la estantería y ve añadiendo los que cuentes."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th align="right">Dice el sistema</Th>
                <Th align="right">Contaste</Th>
                <Th align="right">Diferencia</Th>
                <Th align="right">Quitar</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const counted = toInt(row.counted);
                const delta =
                  row.counted.trim() === '' || counted === null || counted < 0
                    ? null
                    : counted - row.product.stock;
                return (
                  <tr key={row.product.id}>
                    <Td>
                      <span className="block truncate font-medium text-ink">{row.product.name}</span>
                      <span className="tnum block text-cap text-mist">{row.product.sku}</span>
                    </Td>
                    <Td align="right">{row.product.stock}</Td>
                    <Td align="right">
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={0}
                        value={row.counted}
                        onChange={(e) => setCounted(row.product.id, e.target.value)}
                        aria-label={`Unidades contadas de ${row.product.name}`}
                        placeholder="—"
                        className="tnum h-9 w-20 rounded border border-line bg-white px-2 text-right text-body outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/25"
                      />
                    </Td>
                    <Td align="right">
                      {delta === null ? (
                        <span className="text-mist">sin contar</span>
                      ) : delta === 0 ? (
                        <span className="text-mist">cuadra</span>
                      ) : (
                        <span className={cn('font-semibold', delta > 0 ? 'text-ok' : 'text-danger')}>
                          {delta > 0 ? '+' : '−'}
                          {Math.abs(delta)}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((r) => r.product.id !== row.product.id))
                        }
                        aria-label={`Quitar ${row.product.name} del conteo`}
                        className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-danger"
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <Input
          label="Motivo del conteo"
          hint="(se guarda en todas las filas)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Inventario de bodega de septiembre"
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Piezas que la pantalla reutiliza
// ---------------------------------------------------------------------------

/** Cantidad con signo. El color acompaña; el signo y el número mandan. */
export function SignedQuantity({ quantity }: { quantity: number }) {
  const inbound = quantity > 0;
  return (
    <span className={cn('tnum font-semibold', inbound ? 'text-ok' : 'text-danger')}>
      {inbound ? '+' : '−'}
      {Math.abs(quantity).toLocaleString('es-CO')}
    </span>
  );
}

/**
 * Tipo de movimiento.
 *
 * Lleva color *y* flecha *y* la palabra escrita: quien no distingue el verde
 * del rojo tiene que poder saber igual si esa fila sumó o restó.
 */
export function MovementBadge({ type, quantity }: { type: MovementType; quantity: number }) {
  const inbound = quantity > 0;
  return (
    <Badge
      tone={inbound ? 'ok' : 'danger'}
      icon={
        inbound ? (
          <ArrowDownToLine size={11} strokeWidth={2.5} />
        ) : (
          <ArrowUpFromLine size={11} strokeWidth={2.5} />
        )
      }
    >
      {MOVEMENT_LABEL[type]}
    </Badge>
  );
}

/** Costo unitario, que solo traen las compras. */
export function UnitCost({ value }: { value: number | null }) {
  if (value === null) return <span className="text-mist">—</span>;
  return <span className="tnum">{money(value)}</span>;
}
