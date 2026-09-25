import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Pencil, Plus, Power, Ticket, Trash2 } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useAction, useResource } from '../../lib/useResource';
import {
  PROMOTION_STATE_LABEL,
  type AdminBrand,
  type AdminCategory,
  type AdminPromotion,
} from '../../lib/admin-types';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  Panel,
  Refreshing,
  SegmentedControl,
  Skeleton,
  TableWrap,
  Td,
  Th,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { PromotionEditor } from './PromotionEditor';
import { STATE_TONE, ruleSummary, validityText } from './promotion-text';

/**
 * Promociones.
 *
 * Una fila por campaña con las dos caras que tiene: lo que descontó (pedidos,
 * ingresos, descuento entregado) y lo que consiguió el anuncio (vistas, clics
 * y de cada cien cuántas hicieron clic). Están juntas porque la pregunta real
 * de la dueña es una sola: si la campaña valió la pena.
 */

type StatusFilter = 'all' | 'active' | 'scheduled' | 'expired' | 'inactive';

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'scheduled', label: 'Programadas' },
  { value: 'expired', label: 'Vencidas' },
  { value: 'inactive', label: 'Apagadas' },
];

const count = (n: number): string => n.toLocaleString('es-CO');

export default function AdminPromotions() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<{ promotion: AdminPromotion | null } | null>(null);
  const [toDelete, setToDelete] = useState<AdminPromotion | null>(null);

  const list = useResource<AdminPromotion[]>(
    (signal) => api.get<AdminPromotion[]>('/api/admin/promotions', { status }, signal),
    [status],
  );

  // Categorías y marcas solo para poner nombres donde la API manda ids: sin
  // esto la fila diría «20 % en c2», que no significa nada para quien vende.
  const categories = useResource<AdminCategory[]>(
    (signal) => api.get<AdminCategory[]>('/api/admin/categories', undefined, signal),
    [],
  );
  const brands = useResource<AdminBrand[]>(
    (signal) => api.get<AdminBrand[]>('/api/admin/brands', undefined, signal),
    [],
  );

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const category of categories.data ?? []) map[category.id] = category.name;
    for (const brand of brands.data ?? []) map[brand.id] = brand.name;
    return map;
  }, [categories.data, brands.data]);

  const toggle = useAction(async (promotion: AdminPromotion) => {
    await api.patch<AdminPromotion>(`/api/admin/promotions/${promotion.id}`, {
      active: !promotion.active,
    });
    return true;
  });

  const promotions = list.data ?? [];
  const announced = promotions.some((p) => p.showPopup && p.active);

  const runToggle = async (promotion: AdminPromotion): Promise<void> => {
    if (await toggle.run(promotion)) list.reload();
  };

  return (
    <>
      <PageHeader
        title="Promociones"
        subtitle="Lo que descuenta y, si quieres, el anuncio que lo cuenta en la portada."
        actions={
          <Button size="sm" onClick={() => setEditing({ promotion: null })}>
            <Plus size={15} strokeWidth={2} aria-hidden />
            Nueva promoción
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Filtrar por estado"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        {announced && (
          <p className="text-cap text-mist">
            ¿No ves el anuncio en la portada? Revisa el interruptor general en{' '}
            <Link to="/admin/ajustes" className="link-quiet">
              Ajustes
            </Link>
            .
          </p>
        )}
      </div>

      <FormError message={toggle.error} />

      {list.first ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <Refreshing active={list.loading}>
          <Panel bodyClassName="p-0">
            {promotions.length === 0 ? (
              <EmptyState
                icon={<Megaphone size={22} strokeWidth={1.5} />}
                title={
                  status === 'all'
                    ? 'Todavía no hay promociones'
                    : 'Ninguna promoción en este estado'
                }
                description="Una promoción anunciada en la portada es la forma más rápida de mover una categoría entera."
                action={
                  <Button size="sm" onClick={() => setEditing({ promotion: null })}>
                    Crear la primera
                  </Button>
                }
              />
            ) : (
              <>
                {/* En móvil la tabla no cabe sin volverse ilegible; cada
                    promoción se lee como ficha y no como fila. */}
                <div className="flex flex-col gap-3 p-3 md:hidden">
                  {promotions.map((promotion) => (
                    <PromotionCard
                      key={promotion.id}
                      promotion={promotion}
                      names={names}
                      pending={toggle.pending}
                      onEdit={() => setEditing({ promotion })}
                      onToggle={() => void runToggle(promotion)}
                      onDelete={() => setToDelete(promotion)}
                    />
                  ))}
                </div>

                <div className="hidden md:block">
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Promoción</Th>
                        <Th>Descuento</Th>
                        <Th>Vigencia</Th>
                        <Th>Estado</Th>
                        <Th align="right">Pedidos</Th>
                        <Th align="right">Ingresos</Th>
                        <Th align="right">Descuento dado</Th>
                        <Th align="right">Vistas</Th>
                        <Th align="right">Clics</Th>
                        <Th align="right">CTR</Th>
                        <Th align="right">Acciones</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotions.map((promotion) => (
                        <tr key={promotion.id}>
                          <Td className="min-w-[200px]">
                            <span className="block font-medium text-ink">{promotion.name}</span>
                            <PromotionMeta promotion={promotion} />
                          </Td>
                          <Td className="min-w-[180px] text-ash">
                            {ruleSummary(promotion, names)}
                          </Td>
                          <Td className="min-w-[170px] text-ash">
                            {validityText(promotion.startsAt, promotion.endsAt)}
                            <UsageLine promotion={promotion} />
                          </Td>
                          <Td>
                            <Badge tone={STATE_TONE[promotion.state]}>
                              {PROMOTION_STATE_LABEL[promotion.state]}
                            </Badge>
                          </Td>
                          <Td align="right">{count(promotion.orders)}</Td>
                          <Td align="right" className="font-medium">
                            {money(promotion.revenue)}
                          </Td>
                          <Td align="right" className="text-ash">
                            {money(promotion.discountGiven)}
                          </Td>
                          <Td align="right">{count(promotion.popupViews)}</Td>
                          <Td align="right">{count(promotion.popupClicks)}</Td>
                          <Td align="right" className="text-ash">
                            {promotion.popupViews === 0
                              ? '—'
                              : `${promotion.ctr.toLocaleString('es-CO')} %`}
                          </Td>
                          <Td align="right">
                            <RowActions
                              promotion={promotion}
                              pending={toggle.pending}
                              onEdit={() => setEditing({ promotion })}
                              onToggle={() => void runToggle(promotion)}
                              onDelete={() => setToDelete(promotion)}
                            />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </div>
                <p className="tnum border-t border-line px-4 py-3 text-cap text-mist">
                  {count(promotions.length)}{' '}
                  {promotions.length === 1 ? 'promoción' : 'promociones'}
                </p>
              </>
            )}
          </Panel>
        </Refreshing>
      )}

      {editing && (
        // La clave reinicia el formulario al cambiar de promoción: sin ella se
        // editaría una campaña con lo que quedó escrito de la anterior.
        <PromotionEditor
          key={editing.promotion?.id ?? 'nueva'}
          promotion={editing.promotion}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}

      <DeleteDialog
        promotion={toDelete}
        onClose={() => setToDelete(null)}
        onDone={() => {
          setToDelete(null);
          list.reload();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Piezas de la fila
// ---------------------------------------------------------------------------

function PromotionMeta({ promotion }: { promotion: AdminPromotion }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-mist">
      {promotion.code ? (
        <span className="inline-flex items-center gap-1 text-clay-dark">
          <Ticket size={11} strokeWidth={2} aria-hidden />
          Solo con cupón {promotion.code}
        </span>
      ) : (
        <span>Se aplica sola</span>
      )}
      {promotion.showPopup && (
        <span className="inline-flex items-center gap-1">
          <Megaphone size={11} strokeWidth={2} aria-hidden />
          Se anuncia en la portada
        </span>
      )}
    </span>
  );
}

function UsageLine({ promotion }: { promotion: AdminPromotion }) {
  if (promotion.usageLimit === null) return null;
  return (
    <span className="tnum mt-0.5 block text-cap text-mist">
      {count(promotion.usageCount)} de {count(promotion.usageLimit)} usos
    </span>
  );
}

function RowActions({
  promotion,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  promotion: AdminPromotion;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={onToggle}
        title={promotion.active ? 'Apagar la promoción' : 'Encender la promoción'}
      >
        <Power size={14} strokeWidth={2} aria-hidden />
        {promotion.active ? 'Apagar' : 'Encender'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onEdit} title="Editar">
        <Pencil size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Editar</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} title="Borrar">
        <Trash2 size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Borrar</span>
      </Button>
    </span>
  );
}

function PromotionCard({
  promotion,
  names,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  promotion: AdminPromotion;
  names: Readonly<Record<string, string>>;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{promotion.name}</p>
          <PromotionMeta promotion={promotion} />
        </div>
        <Badge tone={STATE_TONE[promotion.state]}>
          {PROMOTION_STATE_LABEL[promotion.state]}
        </Badge>
      </div>

      <p className="mt-2 text-body text-ash">{ruleSummary(promotion, names)}</p>
      <p className="text-cap text-mist">{validityText(promotion.startsAt, promotion.endsAt)}</p>
      <UsageLine promotion={promotion} />

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
        <Metric label="Pedidos" value={count(promotion.orders)} />
        <Metric label="Ingresos" value={money(promotion.revenue)} />
        <Metric label="Descuento" value={money(promotion.discountGiven)} />
        <Metric label="Vistas" value={count(promotion.popupViews)} />
        <Metric label="Clics" value={count(promotion.popupClicks)} />
        <Metric
          label="CTR"
          value={
            promotion.popupViews === 0 ? '—' : `${promotion.ctr.toLocaleString('es-CO')} %`
          }
        />
      </dl>

      <div className="mt-2 flex flex-wrap justify-end">
        <RowActions
          promotion={promotion}
          pending={pending}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-xs">{label}</dt>
      <dd className="tnum truncate text-body text-ink">{value}</dd>
    </div>
  );
}

function ListSkeleton() {
  return (
    <Panel bodyClassName="p-3">
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Borrado
// ---------------------------------------------------------------------------

/**
 * Borrar de verdad o apagar.
 *
 * El borrado definitivo responde 409 cuando algún pedido tiene la promoción
 * aplicada. Ese mensaje se muestra tal cual —dice cuántos pedidos son— y el
 * diálogo se queda abierto ofreciendo lo único que sí se puede hacer: apagarla.
 */
function DeleteDialog({
  promotion,
  onClose,
  onDone,
}: {
  promotion: AdminPromotion | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [softOnly, setSoftOnly] = useState(false);

  const close = (): void => {
    setMessage(null);
    setSoftOnly(false);
    onClose();
  };

  const confirm = async (): Promise<void> => {
    if (!promotion) return;
    setPending(true);
    setMessage(null);
    try {
      await api.del(`/api/admin/promotions/${promotion.id}`, softOnly ? undefined : { hard: 'true' });
      setSoftOnly(false);
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSoftOnly(true);
        setMessage(error.message);
      } else {
        setMessage(
          error instanceof ApiError ? error.message : 'No se pudo borrar la promoción.',
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      open={!!promotion}
      title={softOnly ? 'No se puede borrar' : 'Borrar promoción'}
      message={
        message ??
        `«${promotion?.name ?? ''}» se borrará para siempre, con sus vistas y sus clics. Si algún pedido la tiene aplicada no se podrá borrar y quedará la opción de apagarla.`
      }
      confirmLabel={softOnly ? 'Apagarla' : 'Borrar definitivamente'}
      danger={!softOnly}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={close}
    />
  );
}
