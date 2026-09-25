import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  History,
  Info,
  Mail,
  MapPin,
  Package,
  Phone,
  Tag,
  User,
} from 'lucide-react';
import {
  Badge,
  FormError,
  Modal,
  Skeleton,
  TableWrap,
  Td,
  Th,
  formatDateTime,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { useAction, useResource } from '../../lib/useResource';
import {
  CHANNEL_LABEL,
  MOVEMENT_LABEL,
  ORDER_STATUS_LABEL,
  type AdminOrderDetail,
  type OrderStatus,
} from '../../lib/admin-types';
import { STATUS_TONE, TRANSITIONS, countUnits, type Transition } from './orderTransitions';

/**
 * Ficha de un pedido.
 *
 * El orden no es el del contrato sino el del día: primero qué se puede hacer
 * con este pedido ahora, y solo después los datos que ya se conocen.
 */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-meta font-semibold uppercase tracking-[.08em] text-mist">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DataRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-mist">{icon}</span>
      <div className="min-w-0">
        <p className="text-cap text-mist">{label}</p>
        <p className="break-words text-body text-ink">{value || '—'}</p>
      </div>
    </div>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row-kv">
      <span className={strong ? 'font-semibold text-ink' : 'text-ash'}>{label}</span>
      <span className={strong ? 'tnum text-lead font-semibold text-ink' : 'tnum text-ink'}>
        {value}
      </span>
    </div>
  );
}

export default function OrderDetailModal({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  /** El listado y los conteos de arriba se quedaron viejos: que se recarguen. */
  onChanged: () => void;
}) {
  const detail = useResource<AdminOrderDetail>(
    (signal) => api.get<AdminOrderDetail>(`/api/admin/orders/${orderId}`, undefined, signal),
    [orderId],
  );
  const order = detail.data;

  const [armed, setArmed] = useState<Transition | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  // Las notas se copian al estado local una sola vez por pedido: si se
  // reescribieran en cada recarga, un cambio de estado borraría lo que la
  // dueña acabara de teclear.
  const loadedId = order?.id;
  useEffect(() => {
    if (order) setNotes(order.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  // Los argumentos viajan en la llamada y no por cierre: `useAction` memoriza
  // la función de la primera renderización y leería estado viejo.
  const patch = useAction(async (body: { status?: OrderStatus; notes?: string }) =>
    api.patch<AdminOrderDetail>(`/api/admin/orders/${orderId}`, body),
  );

  const applyTransition = async (transition: Transition) => {
    const result = await patch.run({ status: transition.to });
    if (!result) return; // El error queda en `patch.error`, junto al botón que lo provocó.
    setArmed(null);
    detail.reload();
    onChanged();
  };

  const saveNotes = async () => {
    const result = await patch.run({ notes });
    if (!result) return;
    setNotesSaved(true);
    window.setTimeout(() => setNotesSaved(false), 2500);
    detail.reload();
    onChanged();
  };

  const units = order ? countUnits(order.items) : 0;
  const lineCount = order?.items.length ?? 0;
  const options: readonly Transition[] = order ? TRANSITIONS[order.status] : [];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={order ? `Pedido ${order.number}` : 'Pedido'}
      description={
        order
          ? `${formatDateTime(order.createdAt)} · ${CHANNEL_LABEL[order.channel]}`
          : 'Cargando la ficha…'
      }
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {detail.first && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!detail.first && detail.error && (
        <div className="flex flex-col items-start gap-2">
          <FormError message={detail.error} />
          <Button size="sm" variant="secondary" onClick={detail.reload}>
            Reintentar
          </Button>
        </div>
      )}

      {order && (
        <>
          {/* Lo accionable primero: qué se puede hacer hoy con este pedido. */}
          <Section title="Estado y qué sigue" icon={<ArrowRight size={12} strokeWidth={2.5} />}>
            <div className="rounded border border-line bg-sand p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                <span className="tnum text-cap text-ash">
                  {units.toLocaleString('es-CO')} unidades · {lineCount} líneas · {money(order.total)}
                </span>
              </div>

              {armed ? (
                // La confirmación aparece donde se pulsó y no en otro diálogo
                // encima: lo importante es leer el aviso de stock antes de decir
                // que sí, y para eso tiene que estar a la vista.
                <div className="mt-3 rounded border border-line bg-white p-3">
                  <p className="text-body font-semibold text-ink">
                    {ORDER_STATUS_LABEL[order.status]} → {ORDER_STATUS_LABEL[armed.to]}
                  </p>
                  <p className="mt-2 flex items-start gap-1.5 text-body text-ash">
                    <span
                      className={
                        armed.effect === 'consume'
                          ? 'mt-0.5 shrink-0 text-warn'
                          : armed.effect === 'restore'
                            ? 'mt-0.5 shrink-0 text-ok'
                            : 'mt-0.5 shrink-0 text-mist'
                      }
                    >
                      {armed.effect === 'none' ? (
                        <Info size={14} strokeWidth={2} />
                      ) : (
                        <Package size={14} strokeWidth={2} />
                      )}
                    </span>
                    {armed.note(units, lineCount)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      loading={patch.pending}
                      onClick={() => void applyTransition(armed)}
                      className={armed.danger ? 'bg-danger hover:bg-danger/85' : undefined}
                    >
                      Sí, {armed.action.toLowerCase()}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={patch.pending}
                      onClick={() => {
                        setArmed(null);
                        patch.clearError();
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {/* El 409 de stock nombra la referencia que falta: se muestra
                      tal cual, sin reescribirlo con palabras más vagas. */}
                  <div className="mt-2">
                    <FormError message={patch.error} />
                  </div>
                </div>
              ) : options.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {options.map((transition) => (
                    <Button
                      key={transition.to}
                      size="sm"
                      variant={transition.danger ? 'secondary' : 'primary'}
                      onClick={() => {
                        patch.clearError();
                        setArmed(transition);
                      }}
                      className={transition.danger ? 'text-danger hover:border-danger' : undefined}
                    >
                      {transition.action}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-body text-ash">
                  <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-mist" />
                  Este pedido está cerrado y ya no se mueve. Si la clienta vuelve, registra un pedido
                  nuevo: reabrir este borraría lo que de verdad pasó.
                </p>
              )}
            </div>
          </Section>

          <Section title="Clienta" icon={<User size={12} strokeWidth={2.5} />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DataRow
                icon={<User size={14} strokeWidth={2} />}
                label="Nombre"
                value={order.customerName}
              />
              <DataRow
                icon={<MapPin size={14} strokeWidth={2} />}
                label="Ciudad"
                value={order.customerCity}
              />
              <DataRow
                icon={<Mail size={14} strokeWidth={2} />}
                label="Correo"
                value={order.customerEmail}
              />
              <DataRow
                icon={<Phone size={14} strokeWidth={2} />}
                label="Teléfono"
                value={order.customerPhone ?? ''}
              />
            </div>
          </Section>

          <Section title="Qué llevó" icon={<Package size={12} strokeWidth={2.5} />}>
            <div className="card overflow-hidden">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th align="right">Cant.</Th>
                    <Th align="right">Precio unitario</Th>
                    <Th align="right">Total línea</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <Td>
                        <p className="font-medium text-ink">{item.name}</p>
                        <p className="text-cap text-mist">
                          {item.sku}
                          {item.variant ? ` · ${item.variant}` : ''}
                        </p>
                      </Td>
                      <Td align="right">{item.quantity.toLocaleString('es-CO')}</Td>
                      <Td align="right">{money(item.unitPrice)}</Td>
                      <Td align="right" className="font-medium">
                        {money(item.lineTotal)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <div className="flex flex-col gap-1.5 border-t border-line bg-sand px-4 py-3">
                <MoneyRow label="Subtotal" value={money(order.subtotal)} />
                {order.discount > 0 && (
                  <MoneyRow label="Descuento" value={`− ${money(order.discount)}`} />
                )}
                <MoneyRow
                  label="Envío"
                  value={order.shipping === 0 ? 'Gratis' : money(order.shipping)}
                />
                <MoneyRow label="Total" value={money(order.total)} strong />
                {order.couponCode && (
                  <p className="flex items-center gap-1.5 pt-1 text-cap text-ash">
                    <Tag size={12} strokeWidth={2} className="text-mist" />
                    Cupón aplicado:{' '}
                    <span className="font-semibold text-ink">{order.couponCode}</span>
                  </p>
                )}
              </div>
            </div>
          </Section>

          <Section title="Notas internas" icon={<Info size={12} strokeWidth={2.5} />}>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lo que haga falta recordar: horario de entrega, empaque de regalo, quién atendió…"
              hint="No la ve la clienta"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={notes === (order.notes ?? '')}
                loading={patch.pending && armed === null}
                onClick={() => void saveNotes()}
              >
                Guardar nota
              </Button>
              {notesSaved && (
                <span className="flex items-center gap-1 text-cap text-ok">
                  <Check size={13} strokeWidth={2.5} /> Guardada
                </span>
              )}
            </div>
            {armed === null && (
              <div className="mt-2">
                <FormError message={patch.error} />
              </div>
            )}
          </Section>

          <Section title="Qué le hizo al inventario" icon={<History size={12} strokeWidth={2.5} />}>
            {order.movements.length === 0 ? (
              <p className="rounded border border-line px-4 py-3 text-body text-ash">
                Todavía no movió stock. Un pedido descuenta bodega cuando se marca como pagado.
              </p>
            ) : (
              <div className="card overflow-hidden">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Cuándo</Th>
                      <Th>Movimiento</Th>
                      <Th>Producto</Th>
                      <Th align="right">Unidades</Th>
                      <Th align="right">Quedó en</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.movements.map((movement) => (
                      <tr key={movement.id}>
                        <Td className="whitespace-nowrap text-ash">
                          {formatDateTime(movement.createdAt)}
                        </Td>
                        <Td>
                          <Badge tone={movement.quantity < 0 ? 'warn' : 'ok'}>
                            {MOVEMENT_LABEL[movement.type]}
                          </Badge>
                          {movement.userName && (
                            <span className="ml-1.5 text-cap text-mist">{movement.userName}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-ink">{movement.productName}</span>
                          <span className="ml-1.5 text-cap text-mist">{movement.sku}</span>
                        </Td>
                        <Td align="right" className="font-medium">
                          {movement.quantity > 0 ? '+' : ''}
                          {movement.quantity.toLocaleString('es-CO')}
                        </Td>
                        <Td align="right" className="text-ash">
                          {movement.stockAfter.toLocaleString('es-CO')}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
}
