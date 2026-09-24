import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronRight, Heart, Home, Menu, Search, ShoppingBag, Store, User } from 'lucide-react';
import { categories } from '../data/catalog';
import { cn } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { SearchBar } from './SearchBar';
import { Button, IconButton } from './ui/Button';
import { CloseButton, Sheet } from './ui/Overlays';
import { Logo } from './ui/Primitives';

export const NAV_ITEMS = [
  { label: 'Inicio', to: '/' },
  { label: 'Tienda', to: '/tienda' },
  { label: 'Categorías', to: '/#categorias' },
  { label: 'Marcas', to: '/#marcas' },
  { label: 'Ofertas', to: '/tienda?oferta=1' },
];

export function AnnouncementBar() {
  return (
    <div className="bg-wine px-5 py-[9px] text-center text-[11.5px] uppercase tracking-[.16em] text-ivory text-balance">
      Envío gratis a toda Colombia desde $250.000 <span className="mx-2.5 opacity-45">·</span> 10% para profesionales con el código PRO10
    </div>
  );
}

export function Header() {
  const { favs, user, openCart, totals } = useStore();
  const count = totals().count;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 30);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [location.pathname, location.search]);

  const accountTo = user ? '/cuenta' : '/ingresar';

  return (
    <>
      <header className={cn(
        'sticky top-0 z-60 border-b backdrop-blur-md transition-[background,box-shadow,border-color] duration-300',
        scrolled ? 'border-ink/10 bg-ivory/90 shadow-[0_10px_30px_-20px_rgba(87,43,58,.35)]' : 'border-transparent bg-ivory',
      )} style={{ zIndex: 60 }}>
        {/* Desktop */}
        <div className="hidden md:block">
          <div className={cn('container-x grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[clamp(24px,3vw,48px)] transition-[padding] duration-300', scrolled ? 'py-3' : 'py-[22px]')}>
            <Link to="/" aria-label="Aurelle, inicio"><Logo /></Link>
            <div className="flex justify-center"><SearchBar /></div>
            <div className="flex items-center gap-1.5">
              {user ? (
                <span className="mr-2 font-display italic text-wine">Hola, {user.firstName}</span>
              ) : (
                <div className="mr-2.5 hidden items-center gap-1 text-[13px] lg:flex">
                  <Link to="/ingresar" className="px-1.5 py-2 hover:text-wine">Ingresar</Link>
                  <span className="text-[#B9AEB2]">/</span>
                  <Link to="/registro" className="px-1.5 py-2 hover:text-wine">Crear cuenta</Link>
                </div>
              )}
              <Link to={accountTo} aria-label="Mi cuenta" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-nude"><User size={20} strokeWidth={1.5} /></Link>
              <Link to="/favoritos" aria-label="Favoritos" className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-nude">
                <Heart size={20} strokeWidth={1.5} />
                {favs.length > 0 && <span className="absolute right-1 top-1.5 min-w-[17px] rounded-full bg-blush px-1 text-center text-[10px] font-semibold leading-[17px] text-wine">{favs.length}</span>}
              </Link>
              <button onClick={openCart} aria-label={`Carrito, ${count} productos`} className="flex h-11 items-center gap-2.5 rounded-full bg-ink pl-3.5 pr-4 text-ivory transition-colors hover:bg-wine">
                <ShoppingBag size={20} strokeWidth={1.5} /><span className="text-[13px] font-medium">{count}</span>
              </button>
            </div>
          </div>
          <nav className={cn('flex justify-center gap-[clamp(24px,3.4vw,52px)] overflow-hidden transition-all duration-300', scrolled ? 'max-h-0 pb-0 opacity-0' : 'max-h-[60px] pb-[18px] opacity-100')}>
            {NAV_ITEMS.map((n) => (
              <Link key={n.label} to={n.to} className="border-b border-transparent py-1 text-[11.5px] font-medium uppercase tracking-[.22em] transition-colors hover:border-wine hover:text-wine">{n.label}</Link>
            ))}
          </nav>
        </div>

        {/* Mobile */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2.5 md:hidden">
          <div className="flex">
            <IconButton label="Menú" onClick={() => setMenuOpen(true)}><Menu size={20} strokeWidth={1.5} /></IconButton>
            <IconButton label="Buscar" onClick={() => setSearchOpen(true)}><Search size={20} strokeWidth={1.5} /></IconButton>
          </div>
          <Link to="/" aria-label="Aurelle, inicio" className="[&>span]:items-center"><Logo size="sm" /></Link>
          <div className="flex justify-end">
            <Link to={accountTo} aria-label="Mi cuenta" className="flex h-11 w-11 items-center justify-center"><User size={20} strokeWidth={1.5} /></Link>
            <IconButton label="Carrito" onClick={openCart} badge={count}><ShoppingBag size={20} strokeWidth={1.5} /></IconButton>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="left" label="Menú">
        <div className="flex items-center justify-between px-5 py-[18px]"><Logo size="sm" /><CloseButton onClick={() => setMenuOpen(false)} /></div>
        <div className="flex-1 overflow-auto">
          <nav className="flex flex-col px-5 py-2">
            {NAV_ITEMS.map((n) => (
              <Link key={n.label} to={n.to} className="flex h-14 items-center justify-between border-b border-ink/10 font-display text-[26px]">
                {n.label}<ChevronRight size={16} strokeWidth={1.5} className="text-muted" />
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-1 p-5">
            <span className="label-xs mb-2 text-wine">Categorías</span>
            {categories.map((c) => <Link key={c.id} to={`/tienda?cat=${c.slug}`} className="flex h-10 items-center text-[15.5px]">{c.name}</Link>)}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-5">
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
  const item = 'relative flex flex-col items-center justify-center gap-1 text-[10.5px] tracking-[.04em]';
  const active = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-blush' : 'text-ivory');
  return (
    <>
      <nav aria-label="Accesos rápidos" className="fixed inset-x-2.5 bottom-2.5 z-[80] grid h-16 grid-cols-5 rounded-[22px] bg-ink/95 px-1 backdrop-blur md:hidden">
        <NavLink to="/" end className={active}><Home size={20} strokeWidth={1.5} />Inicio</NavLink>
        <NavLink to="/tienda" className={active}><Store size={20} strokeWidth={1.5} />Tienda</NavLink>
        <button onClick={onSearch} className={cn(item, 'text-ivory')}><Search size={20} strokeWidth={1.5} />Buscar</button>
        <NavLink to="/favoritos" className={active}><Heart size={20} strokeWidth={1.5} />Favoritos</NavLink>
        <button onClick={openCart} className={cn(item, 'text-ivory')}>
          <ShoppingBag size={20} strokeWidth={1.5} />Carrito
          {count > 0 && <span className="absolute left-[calc(50%+6px)] top-2 min-w-[17px] rounded-full bg-blush px-1 text-[10px] font-semibold leading-[17px] text-wine">{count}</span>}
        </button>
      </nav>
    </>
  );
}
