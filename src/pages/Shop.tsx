import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { getBrandBySlug, getCategory, getCategoryBySlug, normalize, products, searchText } from '../data/catalog';
import { cn, formatCOP } from '../lib/utils';
import { ProductGrid } from '../components/ProductCard';
import { PRICE_MAX, ProductFilters, type FilterState } from '../components/ProductFilters';
import { Button } from '../components/ui/Button';
import { CloseButton, Sheet } from '../components/ui/Overlays';

const PAGE = 9;
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
  const [sort, setSort] = useState<SortKey>('rel');
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
    <div className="container-x pb-[clamp(64px,7vw,110px)] pt-[clamp(20px,3vw,40px)]">
      <nav aria-label="Migas de pan" className="mb-[22px] flex items-center gap-2 text-[12.5px] text-muted">
        <Link to="/" className="hover:text-wine">Inicio</Link><span>/</span>
        <Link to="/tienda" className="hover:text-wine">Tienda</Link>
        {crumb && <><span>/</span><span className="text-ink">{crumb}</span></>}
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-ink/10 pb-[clamp(24px,3vw,36px)]">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="h-display text-[clamp(40px,5.4vw,80px)] tracking-[-.03em]">{title}</h1>
          <p className="text-[16.5px] font-light leading-relaxed">{desc}</p>
        </div>
        <label className="flex h-12 w-full items-center gap-2.5 rounded-full border border-ink/20 bg-white px-[18px] text-muted sm:w-[360px]">
          <Search size={18} strokeWidth={1.5} />
          <input value={q} onChange={(e) => setParam('q', e.target.value || null)} placeholder="Buscar en la tienda" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none" />
        </label>
      </header>

      <div className="mt-[clamp(20px,2.4vw,32px)] grid items-start gap-[clamp(28px,3.4vw,56px)] md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-[150px] hidden max-h-[calc(100vh-170px)] overflow-auto pr-1 md:block" aria-label="Filtros">{filterPanel}</aside>

        <div className="min-w-0">
          <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3.5">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" className="md:hidden" onClick={() => setSheet(true)}>
                <SlidersHorizontal size={16} strokeWidth={1.5} /> Filtros{chips.length ? ` (${chips.length})` : ''}
              </Button>
              <span className="text-sm text-muted">{results.length} {results.length === 1 ? 'producto' : 'productos'}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por" className="h-11 cursor-pointer rounded-full border border-ink/20 bg-white px-4 text-sm outline-none">
                {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <div className="flex rounded-full border border-ink/20 p-[3px]" role="group" aria-label="Vista">
                {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={v === 'grid' ? 'Cuadrícula' : 'Lista'} className={cn('flex h-9 w-[38px] items-center justify-center rounded-full', view === v && 'bg-ink text-ivory')}>
                    <Icon size={16} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.label} onClick={c.remove} className="flex h-[34px] items-center gap-2 rounded-full bg-nude pl-3.5 pr-2.5 text-[13px] text-wine hover:bg-blush">
                  {c.label} <X size={14} strokeWidth={1.5} />
                </button>
              ))}
              <button onClick={clearAll} className="px-1.5 text-[13px] underline">Limpiar todo</button>
            </div>
          )}

          {results.length ? (
            <ProductGrid products={results.slice(0, limit)} layout={view} />
          ) : (
            <div className="flex flex-col items-center gap-4 px-5 py-20 text-center">
              <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-nude text-wine"><Search size={28} strokeWidth={1.2} /></span>
              <h3 className="font-display text-[30px]">No encontramos coincidencias</h3>
              <p className="max-w-[380px] font-light text-muted">Prueba con menos filtros o busca por marca o categoría.</p>
              <Button onClick={clearAll}>Limpiar filtros</Button>
            </div>
          )}

          {results.length > limit && (
            <div className="mt-12 flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + 6)}>Cargar más productos</Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} side="bottom" label="Filtros">
        <div className="sticky top-0 z-[2] flex flex-col items-center gap-3.5 bg-ivory px-[22px] pb-2.5 pt-2">
          <span className="h-1 w-10 rounded-full bg-ink/20" />
          <div className="flex w-full items-center justify-between"><span className="font-display text-2xl">Filtros</span><CloseButton onClick={() => setSheet(false)} /></div>
        </div>
        <div className="flex-1 overflow-auto px-[22px] pb-4">{filterPanel}</div>
        <div className="border-t border-ink/10 px-[22px] py-4">
          <Button block size="lg" onClick={() => setSheet(false)}>Ver {results.length} productos</Button>
        </div>
      </Sheet>
    </div>
  );
}

// Útil si necesitas mostrar el nombre de la categoría en resultados personalizados.
export const categoryName = (id: string) => getCategory(id)?.name ?? '';
