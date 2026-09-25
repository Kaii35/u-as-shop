import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  Pagination,
  Panel,
  Refreshing,
  SearchInput,
  SegmentedControl,
  Skeleton,
  TableWrap,
  Td,
  Th,
  formatDate,
  money,
  type Tone,
} from '../../components/admin/Primitives';
import { api } from '../../lib/api';
import { useAction, useDebounced, useResource } from '../../lib/useResource';
import { cn } from '../../lib/utils';
import type {
  AdminBrand,
  AdminCategory,
  AdminProduct,
  ProductListResponse,
  StockStatus,
} from '../../lib/admin-types';
import ProductForm from './ProductForm';
import ProductTaxonomy from './ProductTaxonomy';

/**
 * Catálogo del panel.
 *
 * Todo lo que se pregunta a diario sobre un producto —a cuánto se vende, qué
 * deja, cuánto queda, si se está vendiendo— cabe en una fila, para no tener
 * que abrir dieciséis fichas para comparar dos.
 */

type SortKey = 'name' | 'price' | 'stock' | 'created' | 'sales';
type SortDir = 'asc' | 'desc';
type StockFilter = 'all' | 'low' | 'out' | 'ok';
type StatusFilter = 'all' | 'active' | 'inactive';
type Section = 'catalogo' | 'organizacion';

const LIMIT = 25;

/** Al cambiar de columna se ordena por lo que se suele querer ver primero. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  price: 'desc',
  stock: 'asc',
  created: 'desc',
  sales: 'desc',
};

const STOCK_LABEL: Record<StockStatus, { text: string; tone: Tone }> = {
  ok: { text: 'Bien', tone: 'ok' },
  low: { text: 'Bajo', tone: 'warn' },
  out: { text: 'Agotado', tone: 'danger' },
};

const SECTIONS: ReadonlyArray<{ value: Section; label: string }> = [
  { value: 'catalogo', label: 'Productos' },
  { value: 'organizacion', label: 'Categorías y marcas' },
];

/** Lo que no se escribe en la URL: es el estado por defecto de la pantalla. */
const DEFAULTS: Record<string, string> = {
  buscar: '',
  categoria: '',
  marca: '',
  stock: 'all',
  estado: 'all',
  orden: 'created',
  dir: 'desc',
  pagina: '1',
  seccion: 'catalogo',
};

const oneOf = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(raw as T) ? (raw as T) : fallback;

// ---------------------------------------------------------------------------

/** Miniatura con reserva: una ruta rota no puede dejar un hueco sin tamaño. */
function Thumb({ src, alt }: { src: string | undefined; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-line bg-sand text-mist">
        <Package size={15} strokeWidth={1.75} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-10 w-10 shrink-0 rounded border border-line bg-sand object-cover"
    />
  );
}

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="label-xs">{label}</span>
      {children}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand',
        danger ? 'hover:text-danger' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function AdminProducts() {
  const [params, setParams] = useSearchParams();

  const section = oneOf<Section>(params.get('seccion'), ['catalogo', 'organizacion'], 'catalogo');
  const search = params.get('buscar') ?? '';
  const category = params.get('categoria') ?? '';
  const brand = params.get('marca') ?? '';
  const stock = oneOf<StockFilter>(params.get('stock'), ['all', 'low', 'out', 'ok'], 'all');
  const status = oneOf<StatusFilter>(params.get('estado'), ['all', 'active', 'inactive'], 'all');
  const sort = oneOf<SortKey>(
    params.get('orden'),
    ['name', 'price', 'stock', 'created', 'sales'],
    'created',
  );
  const dir = oneOf<SortDir>(params.get('dir'), ['asc', 'desc'], 'desc');
  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);

  /**
   * El filtro vive en la URL: así el enlace se puede compartir tal cual y el
   * botón Atrás deshace el último filtro en vez de sacar de la pantalla.
   */
  const patchParams = (patch: Record<string, string>, replace = false): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === DEFAULTS[key]) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace });
  };

  // El buscador se escribe aquí y viaja a la URL con retraso. Y lo hace con
  // `replace` porque una entrada de historial por pulsación dejaría el botón
  // Atrás inservible.
  const [typed, setTyped] = useState(search);
  const debounced = useDebounced(typed, 300);
  useEffect(() => setTyped(search), [search]);
  useEffect(() => {
    if (debounced !== search) patchParams({ buscar: debounced, pagina: '1' }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useResource<ProductListResponse>(
    (signal) =>
      api.get<ProductListResponse>(
        '/api/admin/products',
        {
          search,
          category,
          brand,
          stock,
          status,
          sort,
          dir,
          page,
          limit: LIMIT,
        },
        signal,
      ),
    [search, category, brand, stock, status, sort, dir, page],
  );

  // Categorías y marcas completas: las facetas solo traen las que ya tienen
  // productos, y para dar de alta el primero de una categoría nueva hace falta
  // la lista entera.
  const taxonomy = useResource<{ categories: AdminCategory[]; brands: AdminBrand[] }>(
    async (signal) => {
      const [categories, brands] = await Promise.all([
        api.get<AdminCategory[]>('/api/admin/categories', undefined, signal),
        api.get<AdminBrand[]>('/api/admin/brands', undefined, signal),
      ]);
      return { categories, brands };
    },
    [],
  );

  const [editing, setEditing] = useState<{ product: AdminProduct | null } | null>(null);
  /**
   * `soft` desactiva, `hard` borra de verdad y `blocked` es lo que queda
   * cuando la API se niega: solo hay que leer el motivo y cerrar.
   */
  const [toDelete, setToDelete] = useState<{
    product: AdminProduct;
    mode: 'soft' | 'hard' | 'blocked';
  } | null>(null);

  const toggleActive = useAction(async (product: AdminProduct) =>
    api.patch<AdminProduct>(`/api/admin/products/${product.id}`, { active: !product.active }),
  );
  const remove = useAction(async (id: string, hard: boolean) =>
    api.del<{ id: string }>(`/api/admin/products/${id}`, hard ? { hard: 'true' } : undefined),
  );

  async function onToggle(product: AdminProduct): Promise<void> {
    if ((await toggleActive.run(product)) !== null) list.reload();
  }

  const openDelete = (product: AdminProduct): void => {
    remove.clearError();
    // Un producto ya apagado es el único al que tiene sentido ofrecerle el
    // borrado definitivo: el primer clic desactiva, el segundo insiste.
    setToDelete({ product, mode: product.active ? 'soft' : 'hard' });
  };

  async function onConfirmDelete(): Promise<void> {
    if (!toDelete) return;
    if (toDelete.mode === 'blocked') {
      setToDelete(null);
      remove.clearError();
      return;
    }
    const done = await remove.run(toDelete.product.id, toDelete.mode === 'hard');
    if (done !== null) {
      setToDelete(null);
      list.reload();
      taxonomy.reload();
      return;
    }
    // El borrado definitivo falló (casi siempre: el producto ya se vendió). El
    // motivo que dio la API se queda a la vista, sin acción que ofrecer.
    if (toDelete.mode === 'hard') setToDelete({ product: toDelete.product, mode: 'blocked' });
  }

  const onSort = (key: SortKey): void => {
    const nextDir: SortDir = sort === key ? (dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[key];
    patchParams({ orden: key, dir: nextDir, pagina: '1' });
  };

  const data = list.data;
  const facets = data?.facets;
  const items = data?.items ?? [];
  const filtered =
    search !== '' || category !== '' || brand !== '' || stock !== 'all' || status !== 'all';

  const clearFilters = (): void =>
    patchParams({ buscar: '', categoria: '', marca: '', stock: 'all', estado: 'all', pagina: '1' });

  const columns = 11;

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Lo que vendes, a cuánto y qué te deja cada cosa."
        actions={
          <>
            <SegmentedControl<Section>
              label="Qué administrar"
              value={section}
              options={SECTIONS}
              onChange={(value) => patchParams({ seccion: value })}
            />
            {section === 'catalogo' && (
              <Button
                size="sm"
                onClick={() => setEditing({ product: null })}
                disabled={taxonomy.data === null}
              >
                <Plus size={15} strokeWidth={2} /> Nuevo producto
              </Button>
            )}
          </>
        }
      />

      {section === 'organizacion' ? (
        <ProductTaxonomy
          categories={taxonomy.data?.categories ?? null}
          brands={taxonomy.data?.brands ?? null}
          first={taxonomy.first}
          loading={taxonomy.loading}
          error={taxonomy.error}
          onReload={() => {
            taxonomy.reload();
            list.reload();
          }}
        />
      ) : (
        <Panel bodyClassName="">
          <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
            <FilterField label="Buscar" className="flex-1 basis-56">
              <SearchInput
                value={typed}
                onChange={setTyped}
                placeholder="Buscar por nombre o referencia"
              />
            </FilterField>

            <FilterField label="Categoría" className="basis-44">
              <Select
                aria-label="Filtrar por categoría"
                value={category}
                onChange={(e) => patchParams({ categoria: e.target.value, pagina: '1' })}
              >
                <option value="">Todas</option>
                {facets?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField label="Marca" className="basis-40">
              <Select
                aria-label="Filtrar por marca"
                value={brand}
                onChange={(e) => patchParams({ marca: e.target.value, pagina: '1' })}
              >
                <option value="">Todas</option>
                {facets?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField label="Existencias" className="basis-36">
              <Select
                aria-label="Filtrar por existencias"
                value={stock}
                onChange={(e) => patchParams({ stock: e.target.value, pagina: '1' })}
              >
                <option value="all">Todas</option>
                <option value="low">Por debajo del mínimo</option>
                <option value="out">Agotados</option>
                <option value="ok">Con existencias</option>
              </Select>
            </FilterField>

            <FilterField label="En la tienda" className="basis-32">
              <Select
                aria-label="Filtrar por estado"
                value={status}
                onChange={(e) => patchParams({ estado: e.target.value, pagina: '1' })}
              >
                <option value="all">Todos</option>
                <option value="active">A la venta</option>
                <option value="inactive">Apagados</option>
              </Select>
            </FilterField>

            {filtered && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Limpiar
              </Button>
            )}
          </div>

          {list.error && !data ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : (
            <>
              <Refreshing active={list.loading && !list.first}>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th
                        sortable
                        active={sort === 'name'}
                        dir={dir}
                        onSort={() => onSort('name')}
                      >
                        Producto
                      </Th>
                      <Th>Categoría</Th>
                      <Th>Marca</Th>
                      <Th
                        align="right"
                        sortable
                        active={sort === 'price'}
                        dir={dir}
                        onSort={() => onSort('price')}
                      >
                        Precio
                      </Th>
                      <Th align="right">Costo</Th>
                      <Th align="right">Te queda</Th>
                      <Th
                        align="right"
                        sortable
                        active={sort === 'stock'}
                        dir={dir}
                        onSort={() => onSort('stock')}
                      >
                        Existencias
                      </Th>
                      <Th>En la tienda</Th>
                      <Th
                        align="right"
                        sortable
                        active={sort === 'sales'}
                        dir={dir}
                        onSort={() => onSort('sales')}
                      >
                        Vendidas 30 d
                      </Th>
                      <Th
                        align="right"
                        sortable
                        active={sort === 'created'}
                        dir={dir}
                        onSort={() => onSort('created')}
                      >
                        Alta
                      </Th>
                      <Th align="right">Acciones</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.first &&
                      Array.from({ length: 6 }, (_, row) => (
                        <tr key={row}>
                          {Array.from({ length: columns }, (__, col) => (
                            <Td key={col}>
                              <Skeleton className={col === 0 ? 'h-9 w-full' : 'h-4 w-full'} />
                            </Td>
                          ))}
                        </tr>
                      ))}

                    {!list.first && items.length === 0 && (
                      <tr>
                        <Td colSpan={columns}>
                          <EmptyState
                            icon={<Package size={22} strokeWidth={1.5} />}
                            title={
                              filtered ? 'Ningún producto coincide' : 'Todavía no hay productos'
                            }
                            description={
                              filtered
                                ? 'Prueba con menos filtros o con otra palabra en el buscador.'
                                : 'Da de alta el primero para que aparezca en la tienda.'
                            }
                            action={
                              filtered ? (
                                <Button size="sm" variant="secondary" onClick={clearFilters}>
                                  Limpiar filtros
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => setEditing({ product: null })}
                                  disabled={taxonomy.data === null}
                                >
                                  <Plus size={15} strokeWidth={2} /> Nuevo producto
                                </Button>
                              )
                            }
                          />
                        </Td>
                      </tr>
                    )}

                    {!list.first &&
                      items.map((product) => {
                        const badge = STOCK_LABEL[product.stockStatus];
                        return (
                          <tr key={product.id} className="transition-colors hover:bg-sand">
                            <Td className="min-w-[220px]">
                              <div className="flex items-center gap-2.5">
                                <Thumb src={product.images[0]} alt="" />
                                <div className="min-w-0">
                                  <p
                                    className={cn(
                                      'truncate font-medium',
                                      product.active ? 'text-ink' : 'text-mist',
                                    )}
                                    title={product.name}
                                  >
                                    {product.name}
                                  </p>
                                  <p className="tnum truncate text-cap text-mist">
                                    {product.sku}
                                    {product.content ? ` · ${product.content}` : ''}
                                  </p>
                                </div>
                              </div>
                            </Td>
                            <Td className="text-ash">{product.category.name}</Td>
                            <Td className="text-ash">{product.brand.name}</Td>
                            <Td align="right">
                              <span className="font-medium">{money(product.price)}</span>
                              {product.compareAtPrice !== null && (
                                <span className="block text-cap text-mist line-through">
                                  {money(product.compareAtPrice)}
                                </span>
                              )}
                            </Td>
                            <Td align="right" className="text-ash">
                              {money(product.cost)}
                            </Td>
                            <Td align="right">
                              <span
                                className={cn(
                                  'font-medium',
                                  product.margin < 0 ? 'text-danger' : 'text-ink',
                                )}
                              >
                                {money(product.margin)}
                              </span>
                              <span
                                className={cn(
                                  'block text-cap',
                                  product.margin < 0 ? 'text-danger' : 'text-mist',
                                )}
                              >
                                {product.marginPct.toLocaleString('es-CO', {
                                  maximumFractionDigits: 1,
                                })}{' '}
                                %
                              </span>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">
                                {product.stock.toLocaleString('es-CO')}
                              </span>
                              <span className="mt-0.5 block">
                                <Badge tone={badge.tone}>{badge.text}</Badge>
                              </span>
                            </Td>
                            <Td>
                              <Badge tone={product.active ? 'ok' : 'neutral'}>
                                {product.active ? 'A la venta' : 'Apagado'}
                              </Badge>
                            </Td>
                            <Td align="right" className="text-ash">
                              {(product.unitsSold30d ?? 0).toLocaleString('es-CO')}
                            </Td>
                            <Td align="right" className="whitespace-nowrap text-cap text-mist">
                              {formatDate(product.createdAt)}
                            </Td>
                            <Td align="right">
                              <div className="flex justify-end gap-0.5">
                                <IconAction
                                  label={`Editar ${product.name}`}
                                  onClick={() => setEditing({ product })}
                                >
                                  <Pencil size={15} strokeWidth={2} />
                                </IconAction>
                                <IconAction
                                  label={
                                    product.active
                                      ? `Quitar ${product.name} de la tienda`
                                      : `Poner ${product.name} a la venta`
                                  }
                                  onClick={() => void onToggle(product)}
                                >
                                  <Power size={15} strokeWidth={2} />
                                </IconAction>
                                <IconAction
                                  danger
                                  label={
                                    product.active
                                      ? `Quitar ${product.name} del catálogo`
                                      : `Borrar ${product.name} definitivamente`
                                  }
                                  onClick={() => openDelete(product)}
                                >
                                  <Trash2 size={15} strokeWidth={2} />
                                </IconAction>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                  </tbody>
                </TableWrap>
              </Refreshing>

              {(toggleActive.error || (list.error && data)) && (
                <div className="px-4 pt-3">
                  <FormError message={toggleActive.error ?? list.error} />
                </div>
              )}

              <Pagination
                page={data?.page ?? page}
                totalPages={data?.totalPages ?? 1}
                total={data?.total ?? 0}
                onPage={(next) => patchParams({ pagina: String(next) })}
              />
            </>
          )}
        </Panel>
      )}

      {/* La `key` hace que el formulario nazca limpio en cada apertura: sin
          ella conservaría lo escrito para otro producto. */}
      {editing && (
        <ProductForm
          key={editing.product?.id ?? 'nuevo'}
          product={editing.product}
          categories={taxonomy.data?.categories ?? []}
          brands={taxonomy.data?.brands ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
            taxonomy.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        danger={toDelete?.mode === 'hard'}
        pending={remove.pending}
        title={
          toDelete?.mode === 'soft' ? 'Quitar de la tienda' : 'Borrar definitivamente'
        }
        confirmLabel={
          toDelete?.mode === 'soft'
            ? 'Quitar de la tienda'
            : toDelete?.mode === 'hard'
              ? 'Borrar definitivamente'
              : 'Entendido'
        }
        message={
          // El motivo del 409 se muestra tal cual: es la razón real y ninguna
          // reescritura la explica mejor que la propia API.
          remove.error ??
          (toDelete?.mode === 'soft'
            ? `«${toDelete.product.name}» deja de verse en la tienda, pero no se borra: sus pedidos y su historial de inventario siguen intactos y puedes volver a ponerlo cuando quieras.`
            : `«${toDelete?.product.name}» ya está apagado. Borrarlo del todo solo es posible si nunca se ha vendido, y no se puede deshacer.`)
        }
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => {
          setToDelete(null);
          remove.clearError();
        }}
      />
    </>
  );
}
