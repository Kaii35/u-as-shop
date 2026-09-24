import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { getBrandBySlug, getCategory, getCategoryBySlug, normalize, products, searchText } from '../data/catalog';
import { cn, formatCOP } from '../lib/utils';
import { ProductGrid } from '../components/ProductCard';
import { PRICE_MAX, ProductFilters, type FilterState } from '../components/ProductFilters';
import { Button } from '../components/ui/Button';
import { CloseButton, Sheet } from '../components/ui/Overlays';

const PAGE = 12;
const SORTS = {
  rel: { label: 'Relevancia', fn: (a: P, b: P) => Number(b.tags.includes('best')) - Number(a.tags.includes('best')) || b.reviewCount - a.reviewCount },
  pop: { label: 'Popularidad', fn: (a: P, b: P) => b.reviewCount - a.reviewCount },
  new: { label: 'Novedades', fn: (a: P, b: P) => Number(b.tags.includes('new')) - Number(a.tags.includes('new')) },
  low: { label: 'Precio: menor a mayor', fn: (a: P, b: P) => a.price - b.price },
  high: { label: 'Precio: mayor a menor', fn: (a: P, b: P) => b.price - a.price },
} as const;
type P = (typeof products)[number];
type SortKey = keyof typeof SORTS;

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const catSlugs = params.get('cat')?.split(',').filter(Boolean) ?? [];
  const brandSlugs = params.get('marca')?.split(',').filter(Boolean) ?? [];
  const q = params.get('q') ?? '';
  const onlyOffers = params.get('oferta') === '1';

  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [onlyStock, setOnlyStock] = useState(false);
  const [minRating, setMinRating] = useState(0);
  // El menú enlaza /tienda?orden=nuevo, así que el orden inicial sale de la URL.
  const urlSort = params.get('orden');
  const [sort, setSort] = useState<SortKey>(urlSort && urlSort in SORTS ? (urlSort as SortKey) : 'rel');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const toggleIn = (key: string, list: string[], slug: string) =>
    setParam(key, (list.includes(slug) ? list.filter((x) => x !== slug) : [...list, slug]).join(',') || null);

  const filters: FilterState = { categories: catSlugs, brands: brandSlugs, maxPrice, onlyStock, onlyOffers, minRating };

  const results = useMemo(() => {
    const catIds = catSlugs.map((s) => getCategoryBySlug(s)?.id);
    const brandNames = brandSlugs.map((s) => getBrandBySlug(s)?.name);
    const term = normalize(q.trim());
    return products
      .filter((p) =>
        (!term || searchText(p).includes(term)) &&
        (!catIds.length || catIds.includes(p.categoryId)) &&
        (!brandNames.length || brandNames.includes(p.brand)) &&
        p.price <= maxPrice && (!onlyStock || p.stock > 0) && p.rating >= minRating && (!onlyOffers || !!p.oldPrice))
      .sort(SORTS[sort].fn);
  }, [catSlugs.join(), brandSlugs.join(), q, maxPrice, onlyStock, minRating, onlyOffers, sort]);

  const clearAll = () => { setParams(new URLSearchParams(), { replace: true }); setMaxPrice(PRICE_MAX); setOnlyStock(false); setMinRating(0); setLimit(PAGE); };

  const chips: Array<{ label: string; remove: () => void }> = [
    ...catSlugs.map((s) => ({ label: getCategoryBySlug(s)?.name ?? s, remove: () => toggleIn('cat', catSlugs, s) })),
    ...brandSlugs.map((s) => ({ label: getBrandBySlug(s)?.name ?? s, remove: () => toggleIn('marca', brandSlugs, s) })),
    ...(maxPrice < PRICE_MAX ? [{ label: `Hasta ${formatCOP(maxPrice)}`, remove: () => setMaxPrice(PRICE_MAX) }] : []),
    ...(onlyStock ? [{ label: 'Disponibles', remove: () => setOnlyStock(false) }] : []),
    ...(minRating ? [{ label: `${minRating}★ o más`, remove: () => setMinRating(0) }] : []),
    ...(onlyOffers ? [{ label: 'En oferta', remove: () => setParam('oferta', null) }] : []),
    ...(q ? [{ label: `“${q}”`, remove: () => setParam('q', null) }] : []),
  ];

  const oneCat = catSlugs.length === 1 ? getCategoryBySlug(catSlugs[0]) : undefined;
  const title = q ? `Resultados para “${q}”` : oneCat?.name ?? (onlyOffers ? 'Ofertas especiales' : brandSlugs.length === 1 ? getBrandBySlug(brandSlugs[0])?.name : 'La tienda');
  const desc = oneCat?.description ?? (onlyOffers ? 'Precios especiales en productos seleccionados, por tiempo limitado.' : 'Insumos profesionales para uñas, pestañas, piel y tu estación de trabajo.');
  const crumb = oneCat?.name ?? (q ? 'Búsqueda' : onlyOffers ? 'Ofertas' : null);

  const filterPanel = (
    <ProductFilters
      value={filters}
      onToggleCategory={(s) => toggleIn('cat', catSlugs, s)}
      onToggleBrand={(s) => toggleIn('marca', brandSlugs, s)}
      onChange={(patch) => {
        if (patch.maxPrice !== undefined) setMaxPrice(patch.maxPrice);
        if (patch.onlyStock !== undefined) setOnlyStock(patch.onlyStock);
        if (patch.minRating !== undefined) setMinRating(patch.minRating);
        if (patch.onlyOffers !== undefined) setParam('oferta', patch.onlyOffers ? '1' : null);
        setLimit(PAGE);
      }}
      onClear={clearAll}
    />
  );

  return (
    <div className="container-x pb-section pt-4 md:pb-section-lg">
      <nav aria-label="Migas de pan" className="mb-3 flex items-center gap-1.5 text-cap text-mist">
        <Link to="/" className="transition-colors hover:text-clay">Inicio</Link><span className="text-line">/</span>
        <Link to="/tienda" className="transition-colors hover:text-clay">Tienda</Link>
        {crumb && <><span className="text-line">/</span><span className="text-ink">{crumb}</span></>}
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="display text-h3">{title}</h1>
          <p className="max-w-[70ch] text-body text-ash">{desc}</p>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded border border-line bg-white px-3 text-mist transition-colors focus-within:border-clay sm:w-[300px]">
          <Search size={16} strokeWidth={2} />
          <input value={q} onChange={(e) => setParam('q', e.target.value || null)} placeholder="Buscar en la tienda" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-mist" />
        </label>
      </header>

      <div className="mt-4 grid items-start gap-6 md:grid-cols-[208px_minmax(0,1fr)]">
        <aside className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-auto pr-1 md:block" aria-label="Filtros">{filterPanel}</aside>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Button size="sm" variant="secondary" className="md:hidden" onClick={() => setSheet(true)}>
                <SlidersHorizontal size={14} strokeWidth={2} /> Filtros{chips.length ? ` (${chips.length})` : ''}
              </Button>
              <span className="tnum text-cap text-mist">{results.length} {results.length === 1 ? 'producto' : 'productos'}</span>
            </div>
            <div className="flex items-center gap-2">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por" className="h-9 cursor-pointer rounded border border-line bg-white px-2.5 text-body outline-none transition-colors hover:border-ink">
                {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <div className="flex rounded border border-line p-0.5" role="group" aria-label="Vista">
                {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={v === 'grid' ? 'Cuadrícula' : 'Lista'} className={cn('flex h-7 w-8 cursor-pointer items-center justify-center rounded-xs transition-colors', view === v ? 'bg-ink text-white' : 'text-mist hover:text-ink')}>
                    <Icon size={14} strokeWidth={2} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button key={c.label} onClick={c.remove} className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-line bg-sand pl-2.5 pr-2 text-cap text-ash transition-colors hover:border-clay hover:text-clay">
                  {c.label} <X size={12} strokeWidth={2} />
                </button>
              ))}
              <button onClick={clearAll} className="cursor-pointer px-1.5 text-cap text-clay underline underline-offset-4">Limpiar todo</button>
            </div>
          )}

          {results.length ? (
            <ProductGrid products={results.slice(0, limit)} layout={view} />
          ) : (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sand text-clay"><Search size={22} strokeWidth={1.75} /></span>
              <h3 className="display text-h4">No encontramos coincidencias</h3>
              <p className="max-w-[44ch] text-body text-mist">Prueba con menos filtros o busca por marca o categoría.</p>
              <Button onClick={clearAll}>Limpiar filtros</Button>
            </div>
          )}

          {results.length > limit && (
            <div className="mt-7 flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Cargar más productos</Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} side="bottom" label="Filtros">
        <div className="sticky top-0 z-[2] flex flex-col items-center gap-2 border-b border-line bg-white px-4 pb-2 pt-2">
          <span className="h-1 w-9 rounded-full bg-line" />
          <div className="flex w-full items-center justify-between"><span className="display text-h5">Filtros</span><CloseButton onClick={() => setSheet(false)} /></div>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">{filterPanel}</div>
        <div className="border-t border-line px-4 py-3">
          <Button block size="lg" onClick={() => setSheet(false)}>Ver {results.length} productos</Button>
        </div>
      </Sheet>
    </div>
  );
}

// Útil si necesitas mostrar el nombre de la categoría en resultados personalizados.
export const categoryName = (id: string) => getCategory(id)?.name ?? '';
