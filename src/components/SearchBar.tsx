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
    <div className={cn('flex items-center gap-3 rounded-full border border-ink/10 bg-white text-muted', variant === 'inline' ? 'h-12 pl-5 pr-2' : 'h-12 flex-1 px-4')}>
      <Search size={18} strokeWidth={1.5} />
      <input
        value={q}
        autoFocus={variant === 'overlay'}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }}
        placeholder={variant === 'inline' ? 'Busca esmaltes, polygel, lámparas, marcas…' : '¿Qué estás buscando?'}
        aria-label="Buscar productos"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/80"
      />
      {variant === 'inline' && (
        <button onClick={() => submit()} className="h-[34px] rounded-full bg-ink px-4 text-[10.5px] font-medium uppercase tracking-[.16em] text-ivory hover:bg-wine">Buscar</button>
      )}
    </div>
  );

  const panel = (
    <div className={cn('grid gap-8', variant === 'inline' && 'md:grid-cols-[210px_minmax(0,1fr)]')}>
      <div className="flex flex-col gap-6">
        {!term ? (
          <>
            <Group title="Búsquedas recientes">
              {recent.map((r) => (
                <button key={r} onClick={() => submit(r)} className="flex items-center gap-2.5 py-1 text-left text-[14.5px] hover:text-wine">
                  <Clock size={15} strokeWidth={1.5} className="text-[#B9AEB2]" />{r}
                </button>
              ))}
            </Group>
            <Group title="Tendencias">
              <div className="flex flex-wrap gap-1.5">
                {trendingSearches.map((t) => (
                  <button key={t} onClick={() => submit(t)} className="rounded-full border border-ink/15 px-3 py-[7px] text-[13px] hover:border-blush hover:bg-nude">{t}</button>
                ))}
              </div>
            </Group>
          </>
        ) : (
          <>
            {cats.length > 0 && (
              <Group title="Categorías">
                {cats.map((c) => <button key={c.id} onClick={() => go(`/tienda?cat=${c.slug}`)} className="py-0.5 text-left text-[14.5px] hover:text-wine">{c.name}</button>)}
              </Group>
            )}
            {brs.length > 0 && (
              <Group title="Marcas">
                {brs.map((b) => <button key={b.slug} onClick={() => go(`/tienda?marca=${b.slug}`)} className="py-0.5 text-left font-display text-[17px] italic hover:text-wine">{b.name}</button>)}
              </Group>
            )}
          </>
        )}
      </div>
      <Group title={term ? 'Productos sugeridos' : 'Populares ahora'}>
        {term && !suggestions.length && <p className="text-[14.5px] text-muted">No encontramos productos con ese término. Prueba con una marca o una categoría.</p>}
        <div className={cn('grid gap-2.5', variant === 'inline' && 'sm:grid-cols-2')}>
          {suggestions.map((p) => (
            <button key={p.id} onClick={() => go(`/producto/${p.slug}`)} className="flex items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-ivory">
              <span className="h-[68px] w-14 shrink-0 overflow-hidden rounded-lg"><Img src={p.images[0]} /></span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-[.16em] text-muted">{p.brand}</span>
                <span className="text-sm leading-tight">{p.name}</span>
                <span className="text-[13.5px] font-medium text-wine">{formatCOP(p.price)}</span>
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => submit()} className="link-underline mt-2 self-start">
          {term ? `Ver todos los resultados para “${q.trim()}”` : 'Ver toda la tienda'} <ArrowRight size={15} strokeWidth={1.5} />
        </button>
      </Group>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <motion.div className="fixed inset-0 z-[130] flex flex-col overflow-auto bg-ivory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="flex items-center gap-2.5 border-b border-ink/10 px-4 py-3.5">
          {field}
          <button onClick={close} className="px-1 py-3 text-xs font-medium uppercase tracking-[.1em]">Cerrar</button>
        </div>
        <div className="px-4 py-5">{panel}</div>
      </motion.div>
    );
  }

  return (
    <div ref={ref} className="relative z-[72] w-full max-w-[620px]">
      {field}
      {open && (
        <>
          <div className="fixed inset-0 -z-10 bg-ink/15" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-1/2 top-[calc(100%+12px)] w-[min(760px,calc(100vw-80px))] -translate-x-1/2 rounded-[22px] border border-ink/10 bg-white p-7 shadow-pop"
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
    <div className="flex min-w-0 flex-col gap-2.5">
      <span className="label-xs">{title}</span>
      {children}
    </div>
  );
}
