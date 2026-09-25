import { useState, type FormEvent } from 'react';
import { FolderTree, Pencil, Plus, Power, Tag, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Textarea } from '../../components/ui/Input';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormError,
  Modal,
  Panel,
  Refreshing,
  Skeleton,
  TableWrap,
  Td,
  Th,
} from '../../components/admin/Primitives';
import { api } from '../../lib/api';
import { useAction } from '../../lib/useResource';
import type { AdminBrand, AdminCategory } from '../../lib/admin-types';

/**
 * Categorías y marcas.
 *
 * Viven junto a los productos y no en su propia sección porque solo se tocan
 * al dar de alta algo que no encaja en lo que ya existe: son dos listas
 * cortas, no una pantalla de trabajo diario.
 */

type Kind = 'category' | 'brand';

interface Draft {
  name: string;
  description: string;
  image: string;
  order: string;
  active: boolean;
  featured: boolean;
}

const emptyDraft: Draft = {
  name: '',
  description: '',
  image: '',
  order: '0',
  active: true,
  featured: false,
};

type Editing =
  | { kind: 'category'; item: AdminCategory | null }
  | { kind: 'brand'; item: AdminBrand | null };

const KIND_LABEL: Record<Kind, { one: string; new: string }> = {
  category: { one: 'categoría', new: 'Nueva categoría' },
  brand: { one: 'marca', new: 'Nueva marca' },
};

// ---------------------------------------------------------------------------

function TaxonomyEditor({
  editing,
  onClose,
  onSaved,
}: {
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { kind, item } = editing;
  const [draft, setDraft] = useState<Draft>(() => {
    if (!item) return emptyDraft;
    if (editing.kind === 'category') {
      const c = editing.item as AdminCategory;
      return {
        name: c.name,
        description: c.description,
        image: c.image ?? '',
        order: String(c.order),
        active: c.active,
        featured: false,
      };
    }
    const b = editing.item as AdminBrand;
    return {
      name: b.name,
      description: '',
      image: '',
      order: String(b.order),
      active: b.active,
      featured: b.featured,
    };
  });
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const save = useAction(async (payload: Record<string, unknown>) => {
    const base = kind === 'category' ? '/api/admin/categories' : '/api/admin/brands';
    return item
      ? api.patch<unknown>(`${base}/${item.id}`, payload)
      : api.post<unknown>(base, payload);
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNameError(undefined);
    save.clearError();
  };

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (draft.name.trim().length < 2) {
      setNameError('El nombre necesita al menos 2 letras.');
      return;
    }
    const order = /^\d+$/.test(draft.order.trim()) ? Number(draft.order.trim()) : 0;
    const payload: Record<string, unknown> =
      kind === 'category'
        ? {
            name: draft.name.trim(),
            description: draft.description.trim(),
            image: draft.image.trim() === '' ? null : draft.image.trim(),
            order,
            active: draft.active,
          }
        : {
            name: draft.name.trim(),
            featured: draft.featured,
            order,
            active: draft.active,
          };

    const result = await save.run(payload);
    if (result !== null) onSaved();
  }

  const formId = 'aurelle-taxonomy-form';
  const words = KIND_LABEL[kind];

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={item ? `Editar ${words.one}` : words.new}
      footer={
        <>
          <div className="mr-auto min-w-0 max-w-[55%]">
            <FormError message={save.error} />
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.pending}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form={formId} loading={save.pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Input
          label="Nombre"
          value={draft.name}
          error={nameError}
          onChange={(e) => set('name', e.target.value)}
          placeholder={kind === 'category' ? 'Esmaltes semipermanentes' : 'Velours Pro'}
          autoComplete="off"
        />
        {kind === 'category' && (
          <>
            <Textarea
              label="Descripción"
              hint="se ve en la tienda"
              rows={2}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
            <Input
              label="Imagen"
              hint="ruta dentro del sitio"
              value={draft.image}
              onChange={(e) => set('image', e.target.value)}
              placeholder="/images/categories/c1.jpg"
            />
          </>
        )}
        <Input
          label="Orden"
          hint="menor primero"
          value={draft.order}
          onChange={(e) => set('order', e.target.value)}
          inputMode="numeric"
          inputClassName="tnum"
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2.5 pt-1">
          <Checkbox checked={draft.active} onChange={(v) => set('active', v)}>
            Se muestra en la tienda
          </Checkbox>
          {kind === 'brand' && (
            <Checkbox checked={draft.featured} onChange={(v) => set('featured', v)}>
              Marca destacada
            </Checkbox>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export default function ProductTaxonomy({
  categories,
  brands,
  first,
  loading,
  error,
  onReload,
}: {
  categories: AdminCategory[] | null;
  brands: AdminBrand[] | null;
  first: boolean;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: Kind; id: string; name: string } | null>(null);

  const toggle = useAction(async (kind: Kind, id: string, active: boolean) =>
    api.patch<unknown>(
      `${kind === 'category' ? '/api/admin/categories' : '/api/admin/brands'}/${id}`,
      { active },
    ),
  );
  const remove = useAction(async (kind: Kind, id: string) =>
    api.del<{ id: string }>(
      `${kind === 'category' ? '/api/admin/categories' : '/api/admin/brands'}/${id}`,
    ),
  );

  async function onToggle(kind: Kind, id: string, active: boolean): Promise<void> {
    const done = await toggle.run(kind, id, active);
    if (done !== null) onReload();
  }

  async function onConfirmDelete(): Promise<void> {
    if (!toDelete) return;
    const done = await remove.run(toDelete.kind, toDelete.id);
    if (done !== null) {
      setToDelete(null);
      onReload();
    }
  }

  if (error && !categories && !brands) {
    return <ErrorState message={error} onRetry={onReload} />;
  }

  const rowButtons = (
    kind: Kind,
    row: { id: string; name: string; active: boolean; productCount: number },
    onEdit: () => void,
  ) => (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${row.name}`}
        className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
      >
        <Pencil size={15} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => void onToggle(kind, row.id, !row.active)}
        aria-label={row.active ? `Apagar ${row.name}` : `Encender ${row.name}`}
        className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
      >
        <Power size={15} strokeWidth={2} />
      </button>
      {/* Sin productos dentro no hay nada que romper; con productos la API
          responde 409 y ofrecer el botón solo lleva a un callejón sin salida. */}
      {row.productCount === 0 && (
        <button
          type="button"
          onClick={() => setToDelete({ kind, id: row.id, name: row.name })}
          aria-label={`Borrar ${row.name}`}
          className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-danger"
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  const skeletonRows = (cols: number) =>
    Array.from({ length: 4 }, (_, i) => (
      <tr key={i}>
        {Array.from({ length: cols }, (__, j) => (
          <Td key={j}>
            <Skeleton className="h-4 w-full" />
          </Td>
        ))}
      </tr>
    ));

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Categorías"
        description="Cómo se agrupa el catálogo en la tienda."
        bodyClassName=""
        actions={
          <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: 'category', item: null })}>
            <Plus size={14} strokeWidth={2} /> Nueva
          </Button>
        }
      >
        <Refreshing active={loading && !first}>
          <TableWrap>
            <thead>
              <tr>
                <Th>Categoría</Th>
                <Th align="right">Productos</Th>
                <Th>Estado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {first && skeletonRows(4)}
              {!first && categories?.length === 0 && (
                <tr>
                  <Td colSpan={4}>
                    <EmptyState
                      icon={<FolderTree size={22} strokeWidth={1.5} />}
                      title="Todavía no hay categorías"
                      description="Crea la primera para poder dar de alta productos."
                    />
                  </Td>
                </tr>
              )}
              {!first &&
                categories?.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-sand">
                    <Td>
                      <p className="font-medium text-ink">{c.name}</p>
                      <p className="text-cap text-mist">{c.slug}</p>
                    </Td>
                    <Td align="right">{c.productCount.toLocaleString('es-CO')}</Td>
                    <Td>
                      <Badge tone={c.active ? 'ok' : 'neutral'}>
                        {c.active ? 'Visible' : 'Apagada'}
                      </Badge>
                    </Td>
                    <Td align="right">
                      {rowButtons('category', c, () => setEditing({ kind: 'category', item: c }))}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
        </Refreshing>
      </Panel>

      <Panel
        title="Marcas"
        description="Los proveedores cuyos productos vendes."
        bodyClassName=""
        actions={
          <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: 'brand', item: null })}>
            <Plus size={14} strokeWidth={2} /> Nueva
          </Button>
        }
      >
        <Refreshing active={loading && !first}>
          <TableWrap>
            <thead>
              <tr>
                <Th>Marca</Th>
                <Th align="right">Productos</Th>
                <Th>Portada</Th>
                <Th>Estado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {first && skeletonRows(5)}
              {!first && brands?.length === 0 && (
                <tr>
                  <Td colSpan={5}>
                    <EmptyState
                      icon={<Tag size={22} strokeWidth={1.5} />}
                      title="Todavía no hay marcas"
                      description="Crea la primera para poder dar de alta productos."
                    />
                  </Td>
                </tr>
              )}
              {!first &&
                brands?.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-sand">
                    <Td>
                      <p className="font-medium text-ink">{b.name}</p>
                      <p className="text-cap text-mist">{b.slug}</p>
                    </Td>
                    <Td align="right">{b.productCount.toLocaleString('es-CO')}</Td>
                    <Td>
                      {b.featured ? (
                        <Badge tone="clay">Destacada</Badge>
                      ) : (
                        <span className="text-cap text-mist">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={b.active ? 'ok' : 'neutral'}>
                        {b.active ? 'Visible' : 'Apagada'}
                      </Badge>
                    </Td>
                    <Td align="right">
                      {rowButtons('brand', b, () => setEditing({ kind: 'brand', item: b }))}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
        </Refreshing>
      </Panel>

      <FormError message={toggle.error} />

      {editing && (
        <TaxonomyEditor
          key={`${editing.kind}-${editing.item?.id ?? 'nuevo'}`}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onReload();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        danger
        pending={remove.pending}
        title={`Borrar ${toDelete ? KIND_LABEL[toDelete.kind].one : ''}`}
        message={
          remove.error ??
          `«${toDelete?.name}» no tiene productos, así que se puede borrar sin dejar nada colgando. Esto no se puede deshacer.`
        }
        confirmLabel="Borrar"
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => {
          setToDelete(null);
          remove.clearError();
        }}
      />
    </div>
  );
}
