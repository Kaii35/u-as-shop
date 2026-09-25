import { useState } from 'react';
import { AlertTriangle, Minus, Package, Plus, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  FormError,
  Modal,
  SearchInput,
  Skeleton,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { isEmail } from '../../lib/utils';
import { useAction, useDebounced, useResource } from '../../lib/useResource';
import {
  CHANNEL_LABEL,
  type AdminOrderDetail,
  type AdminProduct,
  type ProductListResponse,
  type SalesChannel,
} from '../../lib/admin-types';

/**
 * Venta de mostrador.
 *
 * Es la pantalla que se usa con la clienta enfrente, así que el buscador va
 * primero y el total se recalcula a cada tecla: quien cobra necesita decir la
 * cifra en voz alta antes de guardar nada.
 */

interface Line {
  productId: string;
  sku: string;
  name: string;
  /** Stock que tenía el producto al buscarlo: sirve para avisar, no para decidir. */
  stock: number;
  quantity: number;
  unitPrice: number;
}

interface CounterSaleBody {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerCity?: string;
  channel: SalesChannel;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  discount: number;
  shipping: number;
  couponCode?: string;
  notes?: string;
}

const CHANNELS: readonly SalesChannel[] = ['COUNTER', 'SOCIAL', 'ONLINE'];

/** Pesos enteros: la API rechaza decimales y en COP no existen los centavos. */
const toPesos = (raw: string): number => {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
};

export default function CounterSaleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: AdminOrderDetail) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [channel, setChannel] = useState<SalesChannel>('COUNTER');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [notes, setNotes] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const results = useResource<AdminProduct[]>(
    async (signal) => {
      const term = debounced.trim();
      // Con una sola letra la lista no ayuda y son diez consultas por palabra.
      if (term.length < 2) return [];
      const data = await api.get<ProductListResponse>(
        '/api/admin/products',
        { search: term, limit: 10, status: 'active' },
        signal,
      );
      return data.items;
    },
    [debounced],
  );

  const create = useAction(async (body: CounterSaleBody) =>
    api.post<AdminOrderDetail>('/api/admin/orders', body),
  );

  const addProduct = (product: AdminProduct) => {
    setInvalid(null);
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      // La API rechaza el mismo producto en dos líneas, así que aquí se suma.
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          stock: product.stock,
          quantity: 1,
          unitPrice: product.price,
        },
      ];
    });
    setQuery('');
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)),
    );

  const removeLine = (productId: string) =>
    setLines((current) => current.filter((line) => line.productId !== productId));

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = subtotal - discount + shipping;
  const short = lines.filter((line) => line.quantity > line.stock);

  const submit = async () => {
    if (customerName.trim().length < 2) {
      setInvalid('Escribe a nombre de quién va la venta.');
      return;
    }
    if (lines.length === 0) {
      setInvalid('Agrega al menos un producto: un pedido sin productos no es un pedido.');
      return;
    }
    if (customerEmail.trim() !== '' && !isEmail(customerEmail)) {
      setInvalid('Ese correo no parece válido. Déjalo en blanco si no lo tienes.');
      return;
    }
    if (total < 0) {
      setInvalid(`El descuento se come el pedido: el total quedaría en ${money(total)}.`);
      return;
    }
    setInvalid(null);

    const body: CounterSaleBody = {
      customerName: customerName.trim(),
      channel,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      discount,
      shipping,
      // Los opcionales vacíos no se mandan: un `""` en el correo no pasa la
      // validación de la API y no significa lo mismo que no tener correo.
      ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
      ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
      ...(customerCity.trim() ? { customerCity: customerCity.trim() } : {}),
      ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    const order = await create.run(body);
    if (order) onCreated(order);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Registrar venta de mostrador"
      description="Para lo que se vende en el local o por WhatsApp y no pasó por la tienda en línea."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="tnum text-body text-ash">
            Total a cobrar <span className="text-lead font-semibold text-ink">{money(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={create.pending}>
              Cancelar
            </Button>
            <Button size="sm" loading={create.pending} onClick={() => void submit()}>
              Registrar venta
            </Button>
          </div>
        </div>
      }
    >
      {/* Se dice antes de empezar, no después de guardar: esta venta nace
          pagada y baja el stock en el acto. */}
      <p className="flex items-start gap-1.5 rounded border border-line bg-sand p-3 text-body text-ash">
        <Package size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warn" />
        La venta queda registrada como <strong className="font-semibold text-ink">pagada</strong> y
        descuenta el stock en el acto. Si alguna referencia no alcanza, no se guarda nada.
      </p>

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-meta font-semibold uppercase tracking-[.08em] text-mist">
          <Search size={12} strokeWidth={2.5} />
          Productos
        </h3>

        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar por nombre o SKU…"
        />

        {debounced.trim().length >= 2 && (
          <div className="mt-2 overflow-hidden rounded border border-line">
            {results.first ? (
              <div className="flex flex-col gap-1.5 p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : results.error ? (
              <p className="px-3 py-2.5 text-body text-danger">{results.error}</p>
            ) : (results.data ?? []).length === 0 ? (
              <p className="px-3 py-2.5 text-body text-ash">
                Ningún producto activo coincide con «{debounced.trim()}».
              </p>
            ) : (
              <ul>
                {(results.data ?? []).map((product) => (
                  <li key={product.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-ink">{product.name}</span>
                        <span className="block text-cap text-mist">
                          {product.sku} · {product.stock.toLocaleString('es-CO')} en bodega
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-body text-ink">
                        {money(product.price)}
                      </span>
                      <Plus size={15} strokeWidth={2} className="shrink-0 text-mist" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3">
          {lines.length === 0 ? (
            <p className="rounded border border-dashed border-line px-3 py-6 text-center text-body text-mist">
              Busca arriba y ve agregando lo que se llevó.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.productId} className="rounded border border-line p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{line.name}</p>
                      <p className="text-cap text-mist">
                        {line.sku} · {line.stock.toLocaleString('es-CO')} en bodega
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      aria-label={`Quitar ${line.name}`}
                      className="shrink-0 cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-danger"
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-cap font-medium text-ash">Cantidad</span>
                      <div className="flex h-10 items-center rounded border border-line bg-white">
                        <button
                          type="button"
                          onClick={() =>
                            patchLine(line.productId, {
                              quantity: Math.max(1, line.quantity - 1),
                            })
                          }
                          aria-label={`Una unidad menos de ${line.name}`}
                          className="h-full cursor-pointer px-2.5 text-mist transition-colors hover:text-ink"
                        >
                          <Minus size={14} strokeWidth={2} />
                        </button>
                        <input
                          value={line.quantity}
                          inputMode="numeric"
                          aria-label={`Cantidad de ${line.name}`}
                          onChange={(e) =>
                            patchLine(line.productId, {
                              quantity: Math.max(1, toPesos(e.target.value)),
                            })
                          }
                          className="tnum h-full w-12 bg-transparent text-center text-body outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => patchLine(line.productId, { quantity: line.quantity + 1 })}
                          aria-label={`Una unidad más de ${line.name}`}
                          className="h-full cursor-pointer px-2.5 text-mist transition-colors hover:text-ink"
                        >
                          <Plus size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <Input
                      label="Precio unitario"
                      hint="editable"
                      inputMode="numeric"
                      className="w-36"
                      inputClassName="tnum"
                      value={line.unitPrice === 0 ? '' : String(line.unitPrice)}
                      onChange={(e) =>
                        patchLine(line.productId, { unitPrice: toPesos(e.target.value) })
                      }
                    />

                    <p className="tnum ml-auto pb-2.5 text-body text-ink">
                      {money(line.unitPrice * line.quantity)}
                    </p>
                  </div>

                  {line.quantity > line.stock && (
                    <p className="mt-2 flex items-start gap-1.5 text-cap text-warn">
                      <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" />
                      En bodega solo hay {line.stock.toLocaleString('es-CO')}. Si sigue así, la API
                      rechaza la venta entera.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-meta font-semibold uppercase tracking-[.08em] text-mist">
          Quién compra
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Nombre"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nombre de la clienta"
          />
          <Input
            label="Ciudad"
            hint="opcional"
            value={customerCity}
            onChange={(e) => setCustomerCity(e.target.value)}
          />
          <Input
            label="Correo"
            hint="opcional"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <Input
            label="Teléfono"
            hint="opcional"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
          <Select
            label="Canal"
            value={channel}
            onChange={(e) => setChannel(e.target.value as SalesChannel)}
          >
            {CHANNELS.map((value) => (
              <option key={value} value={value}>
                {CHANNEL_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-meta font-semibold uppercase tracking-[.08em] text-mist">Cobro</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Descuento"
            hint="en pesos"
            inputMode="numeric"
            inputClassName="tnum"
            value={discount === 0 ? '' : String(discount)}
            placeholder="0"
            onChange={(e) => setDiscount(toPesos(e.target.value))}
          />
          <Input
            label="Envío"
            hint="en pesos"
            inputMode="numeric"
            inputClassName="tnum"
            value={shipping === 0 ? '' : String(shipping)}
            placeholder="0"
            onChange={(e) => setShipping(toPesos(e.target.value))}
          />
          <Input
            label="Cupón"
            hint="opcional"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="AURELLE20"
          />
        </div>

        <div className="mt-3 flex flex-col gap-1.5 rounded border border-line bg-sand px-4 py-3">
          <div className="row-kv">
            <span className="text-ash">
              Subtotal · {units.toLocaleString('es-CO')} unidades en {lines.length} líneas
            </span>
            <span className="tnum text-ink">{money(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="row-kv">
              <span className="text-ash">Descuento</span>
              <span className="tnum text-ink">− {money(discount)}</span>
            </div>
          )}
          {shipping > 0 && (
            <div className="row-kv">
              <span className="text-ash">Envío</span>
              <span className="tnum text-ink">{money(shipping)}</span>
            </div>
          )}
          <div className="row-kv">
            <span className="font-semibold text-ink">Total</span>
            <span className="tnum text-lead font-semibold text-ink">{money(total)}</span>
          </div>
        </div>

        <div className="mt-3">
          <Textarea
            label="Notas"
            hint="opcional, no las ve la clienta"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </section>

      {short.length > 0 && (
        <p className="mt-3">
          <Badge tone="warn">
            {short.length === 1
              ? '1 referencia sin stock suficiente'
              : `${short.length} referencias sin stock suficiente`}
          </Badge>
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <FormError message={invalid} />
        {/* El 409 llega con el SKU y las unidades que faltan. Tal cual. */}
        <FormError message={create.error} />
      </div>
    </Modal>
  );
}
