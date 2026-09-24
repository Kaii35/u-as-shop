import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Search } from 'lucide-react';
import { brands, categories, normalize, products, searchText, trendingSearches } from '../data/catalog';
import { cn, formatCOP, usePersistentState } from '../lib/utils';
import { Img } from './ui/Primitives';

interface Props {
  variant?: 'inline' | 'overlay';
  onClose?: () => void;
}

export function SearchBar({ variant = 'inline', onClose }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(variant === 'overlay');
  const [recent, setRecent] = usePersistentState<string[]>('aurelle.recent', ['Builder gel', 'Top coat', 'Lámpara LED']);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const term = normalize(q.trim());

  const suggestions = term
    ? products.filter((p) => searchText(p).includes(term)).slice(0, 4)
    : products.filter((p) => p.tags.includes('best')).slice(0, 4);
  const cats = term ? categories.filter((c) => normalize(c.name).includes(term)).slice(0, 3) : [];
  const brs = term ? brands.filter((b) => normalize(b.name).includes(term)).slice(0, 3) : [];

  useEffect(() => {
    if (variant !== 'inline') return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [variant]);

  const close = () => { setOpen(false); setQ(''); onClose?.(); };
  const go = (to: string) => { close(); navigate(to); };
  const submit = (value = q) => {
    const t = value.trim();
    if (t) setRecent((r) => [t, ...r.filter((x) => x !== t)].slice(0, 5));
    go(t ? `/tienda?q=${encodeURIComponent(t)}` : '/tienda');
  };

  const field = (
    <div className={cn('flex items-center gap-2.5 rounded border border-line bg-white text-mist transition-colors focus-within:border-clay', variant === 'inline' ? 'h-10 pl-3 pr-1' : 'h-10 flex-1 px-3')}>
      <Search size={16} strokeWidth={2} />
      <input
        value={q}
        autoFocus={variant === 'overlay'}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }}
        placeholder={variant === 'inline' ? 'Busca esmaltes, polygel, lámparas, marcas…' : '¿Qué estás buscando?'}
        aria-label="Buscar productos"
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-mist"
      />
      {variant === 'inline' && (
        <button onClick={() => submit()} className="h-8 cursor-pointer rounded bg-ink px-3 text-cap font-medium text-white transition-colors hover:bg-ash">Buscar</button>
      )}
    </div>
  );

  const panel = (
    <div className={cn('grid gap-6', variant === 'inline' && 'md:grid-cols-[190px_minmax(0,1fr)]')}>
      <div className="flex flex-col gap-5">
        {!term ? (
          <>
            <Group title="Búsquedas recientes">
              {recent.map((r) => (
                <button key={r} onClick={() => submit(r)} className="flex items-center gap-2 py-0.5 text-left text-body text-ash transition-colors hover:text-clay">
                  <Clock size={13} strokeWidth={2} className="text-mist" />{r}
                </button>
              ))}
            </Group>
            <Group title="Tendencias">
              <div className="flex flex-wrap gap-1.5">
                {trendingSearches.map((t) => (
                  <button key={t} onClick={() => submit(t)} className="cursor-pointer rounded border border-line px-2.5 py-1 text-cap text-ash transition-colors hover:border-clay hover:text-clay">{t}</button>
                ))}
              </div>
            </Group>
          </>
        ) : (
          <>
            {cats.length > 0 && (
              <Group title="Categorías">
                {cats.map((c) => <button key={c.id} onClick={() => go(`/tienda?cat=${c.slug}`)} className="py-0.5 text-left text-body text-ash transition-colors hover:text-clay">{c.name}</button>)}
              </Group>
            )}
            {brs.length > 0 && (
              <Group title="Marcas">
                {brs.map((b) => <button key={b.slug} onClick={() => go(`/tienda?marca=${b.slug}`)} className="py-0.5 text-left text-body text-ash transition-colors hover:text-clay">{b.name}</button>)}
              </Group>
            )}
          </>
        )}
      </div>
      <Group title={term ? 'Productos sugeridos' : 'Populares ahora'}>
        {term && !suggestions.length && <p className="text-body text-mist">No encontramos productos con ese término. Prueba con una marca o una categoría.</p>}
        <div className={cn('grid gap-2.5', variant === 'inline' && 'sm:grid-cols-2')}>
          {suggestions.map((p) => (
            <button key={p.id} onClick={() => go(`/producto/${p.slug}`)} className="flex cursor-pointer items-center gap-2.5 rounded p-1.5 text-left transition-colors hover:bg-sand">
              <span className="h-14 w-11 shrink-0 overflow-hidden rounded-sm border border-line bg-sand"><Img src={p.images[0]} /></span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="label-xs">{p.brand}</span>
                <span className="truncate text-body leading-tight">{p.name}</span>
                <span className="tnum text-cap font-semibold text-ink">{formatCOP(p.price)}</span>
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => submit()} className="link-arrow mt-1 self-start">
          {term ? `Ver todos los resultados para “${q.trim()}”` : 'Ver toda la tienda'} <ArrowRight size={14} strokeWidth={2} />
        </button>
      </Group>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <motion.div className="fixed inset-0 z-[130] flex flex-col overflow-auto bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          {field}
          <button onClick={close} className="cursor-pointer px-1 py-2 text-body font-medium text-ash">Cerrar</button>
        </div>
        <div className="px-3 py-4">{panel}</div>
      </motion.div>
    );
  }

  return (
    <div ref={ref} className="relative z-[72] w-full max-w-[560px]">
      {field}
      {open && (
        <>
          <div className="fixed inset-0 -z-10 bg-ink/10" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 top-[calc(100%+8px)] w-[min(720px,calc(100vw-80px))] rounded-lg border border-line bg-white p-5 shadow-pop"
          >
            {panel}
          </motion.div>
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="label-xs">{title}</span>
      {children}
    </div>
  );
}
