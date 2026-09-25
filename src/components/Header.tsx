import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronRight, Heart, Home, LayoutGrid, Menu, Search, ShoppingBag, Store, User } from 'lucide-react';
import { categories } from '../data/catalog';
import { cn } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { SearchBar } from './SearchBar';
import { Button, IconButton } from './ui/Button';
import { CloseButton, Sheet } from './ui/Overlays';
import { Logo } from './ui/Primitives';

export const NAV_ITEMS: Array<{ label: string; to: string; highlight?: boolean }> = [
  { label: 'Novedades', to: '/tienda?orden=new' },
  { label: 'Uñas', to: '/tienda?cat=unas-y-manicura' },
  { label: 'Gel y acrílico', to: '/tienda?cat=gel-acrilico-y-polygel' },
  { label: 'Nail art', to: '/tienda?cat=nail-art-y-decoracion' },
  { label: 'Herramientas', to: '/tienda?cat=herramientas-y-equipos' },
  { label: 'Pestañas', to: '/tienda?cat=pestanas-y-cejas' },
  { label: 'Ofertas', to: '/tienda?oferta=1', highlight: true },
];

export function AnnouncementBar() {
  return (
    <div className="bg-ink px-4 py-2 text-center text-meta text-white/85 text-balance">
      Envío gratis desde $250.000 <span className="mx-2 text-white/30">·</span> 10% para profesionales con el código <strong className="font-semibold text-white">PRO10</strong>
    </div>
  );
}

export function Header() {
  const { favs, user, openCart, totals } = useStore();
  const count = totals().count;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [location.pathname, location.search]);

  const accountTo = user ? '/cuenta' : '/ingresar';

  return (
    <>
      {/* Altura fija: el header que encogía al hacer scroll movía el contenido
          y obligaba a reservar espacio de más arriba de todo. */}
      <header className="sticky top-0 z-[60] border-b border-line bg-white/95 backdrop-blur-md">
        {/* Desktop */}
        <div className="hidden md:block">
          <div className="container-x flex items-center gap-6 py-3">
            <Link to="/" aria-label="Aurelle, inicio" className="shrink-0"><Logo /></Link>
            <div className="min-w-0 flex-1"><SearchBar /></div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Acceso directo a todo el catalogo: la navegacion de abajo solo
                  lleva a categorias sueltas. */}
              <Link
                to="/tienda"
                className="mr-1 hidden h-10 items-center gap-1.5 rounded border border-line px-3 text-body font-medium transition-colors hover:border-ink hover:bg-sand md:flex"
              >
                <LayoutGrid size={15} strokeWidth={2} /> Productos
              </Link>
              {user ? (
                <Link to="/cuenta" className="mr-1 flex h-10 items-center gap-2 rounded px-2.5 text-body transition-colors hover:bg-sand">
                  <User size={17} strokeWidth={2} /> {user.firstName}
                </Link>
              ) : (
                <div className="mr-1 hidden items-center gap-1 text-body lg:flex">
                  <Link to="/ingresar" className="rounded px-2 py-2 transition-colors hover:text-clay">Ingresar</Link>
                  <span className="text-line">|</span>
                  <Link to="/registro" className="rounded px-2 py-2 transition-colors hover:text-clay">Crear cuenta</Link>
                </div>
              )}
              <Link to={accountTo} aria-label="Mi cuenta" className="flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-sand lg:hidden"><User size={18} strokeWidth={2} /></Link>
              <Link to="/favoritos" aria-label="Favoritos" className="relative flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-sand">
                <Heart size={18} strokeWidth={2} />
                {favs.length > 0 && <span className="tnum absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-clay px-1 text-center text-[10px] font-semibold leading-4 text-white">{favs.length}</span>}
              </Link>
              <button onClick={openCart} aria-label={`Carrito, ${count} productos`} className="ml-1 flex h-10 cursor-pointer items-center gap-2 rounded bg-ink pl-3 pr-3.5 text-white transition-colors hover:bg-ash">
                <ShoppingBag size={17} strokeWidth={2} /><span className="tnum text-body font-medium">{count}</span>
              </button>
            </div>
          </div>
          <nav className="container-x flex items-center gap-1 overflow-x-auto pb-1.5">
            {NAV_ITEMS.map((n) => {
              // Marca el enlace activo comparando ruta + query: varios apuntan
              // a /tienda y solo se distinguen por sus parametros.
              const active = location.pathname + location.search === n.to;
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap rounded px-2.5 py-1.5 text-body transition-colors hover:bg-sand hover:text-ink',
                    active ? 'bg-sand font-medium text-ink' : 'text-ash',
                    n.highlight && !active && 'text-clay hover:text-clay-dark',
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Móvil */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-2 md:hidden">
          <div className="flex">
            <IconButton label="Menú" onClick={() => setMenuOpen(true)}><Menu size={19} strokeWidth={2} /></IconButton>
            <IconButton label="Buscar" onClick={() => setSearchOpen(true)}><Search size={19} strokeWidth={2} /></IconButton>
          </div>
          <Link to="/" aria-label="Aurelle, inicio"><Logo size="sm" /></Link>
          <div className="flex justify-end">
            <Link to={accountTo} aria-label="Mi cuenta" className="flex h-10 w-10 items-center justify-center rounded"><User size={19} strokeWidth={2} /></Link>
            <IconButton label="Carrito" onClick={openCart} badge={count}><ShoppingBag size={19} strokeWidth={2} /></IconButton>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="left" label="Menú">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><Logo size="sm" /><CloseButton onClick={() => setMenuOpen(false)} /></div>
        <div className="flex-1 overflow-auto">
          <nav className="flex flex-col p-2">
            <Link to="/tienda" className="mb-1 flex h-11 items-center justify-between rounded bg-sand px-2 text-body font-medium">
              Todos los productos<ChevronRight size={15} strokeWidth={2} className="text-mist" />
            </Link>
            {NAV_ITEMS.map((n) => (
              <Link key={n.label} to={n.to} className="flex h-11 items-center justify-between rounded px-2 text-body font-medium hover:bg-sand">
                {n.label}<ChevronRight size={15} strokeWidth={2} className="text-mist" />
              </Link>
            ))}
          </nav>
          <div className="flex flex-col p-2 pt-4">
            <span className="kicker px-2 pb-1.5">Todas las categorías</span>
            {categories.map((c) => (
              <Link key={c.id} to={`/tienda?cat=${c.slug}`} className="flex h-10 items-center rounded px-2 text-body text-ash hover:bg-sand hover:text-ink">{c.name}</Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line p-4">
          {user ? (
            <Link to="/cuenta"><Button block>Mi cuenta</Button></Link>
          ) : (
            <>
              <Link to="/ingresar"><Button block>Iniciar sesión</Button></Link>
              <Link to="/registro"><Button block variant="secondary">Crear cuenta</Button></Link>
            </>
          )}
        </div>
      </Sheet>

      <AnimatePresence>{searchOpen && <SearchBar variant="overlay" onClose={() => setSearchOpen(false)} />}</AnimatePresence>

      <MobileBottomBar onSearch={() => setSearchOpen(true)} />
    </>
  );
}

function MobileBottomBar({ onSearch }: { onSearch: () => void }) {
  const { openCart, totals } = useStore();
  const count = totals().count;
  const item = 'relative flex cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px]';
  const active = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-clay' : 'text-ash');
  return (
    <nav aria-label="Accesos rápidos" className="fixed inset-x-0 bottom-0 z-[80] grid h-14 grid-cols-5 border-t border-line bg-white/95 backdrop-blur md:hidden">
      <NavLink to="/" end className={active}><Home size={18} strokeWidth={2} />Inicio</NavLink>
      <NavLink to="/tienda" className={active}><Store size={18} strokeWidth={2} />Tienda</NavLink>
      <button onClick={onSearch} className={cn(item, 'text-ash')}><Search size={18} strokeWidth={2} />Buscar</button>
      <NavLink to="/favoritos" className={active}><Heart size={18} strokeWidth={2} />Favoritos</NavLink>
      <button onClick={openCart} className={cn(item, 'text-ash')}>
        <ShoppingBag size={18} strokeWidth={2} />Carrito
        {count > 0 && <span className="tnum absolute left-[calc(50%+4px)] top-1 min-w-[15px] rounded-full bg-clay px-1 text-[9px] font-semibold leading-[15px] text-white">{count}</span>}
      </button>
    </nav>
  );
}
