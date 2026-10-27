import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Heart, Home, LayoutGrid, Search, ShoppingBag, Store, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { SearchBar } from './SearchBar';
import { IconButton } from './ui/Button';
import { MegaMenu, MenuButton, type NavItem } from './MegaMenu';
import { Logo } from './ui/Primitives';
import { ThemeToggle } from './ui/ThemeToggle';

export const NAV_ITEMS: NavItem[] = [
  { label: 'Novedades', to: '/tienda?orden=new' },
  { label: 'Geles y tips', to: '/tienda?cat=geles-bases-y-esmaltes,tips-y-unas-press-on' },
  { label: 'Nail art', to: '/tienda?cat=decoracion-y-glitter,pinceles-y-diseno' },
  { label: 'Herramientas', to: '/tienda?cat=alicates-tijeras-y-cortaunas,limas-y-pulidores,fresas-para-torno,lamparas-y-equipos' },
  { label: 'Pestañas', to: '/tienda?cat=pestanas-y-cejas' },
  { label: 'Spa', to: '/tienda?cat=spa-manos-y-cuerpo' },
  { label: 'Ofertas', to: '/tienda?oferta=1', highlight: true },
];

export function Header() {
  const { favs, user, openCart, totals } = useStore();
  const count = totals().count;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setHidden(false); }, [location.pathname, location.search]);

  /**
   * Se oculta al bajar y reaparece al subir.
   *
   * El umbral de 6px descarta el temblor del trackpad y el rebote elastico de
   * iOS, que si no lo hacen parpadear. Por encima del inicio de la pagina
   * nunca se oculta: ahi el header no estorba y esconderlo solo confunde.
   */
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY.current;
      if (Math.abs(diff) < 6) return;
      setHidden(y > 120 && diff > 0);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const accountTo = user ? '/cuenta' : '/ingresar';

  return (
    <>
      {/* Altura fija: el header que encogía al hacer scroll movía el contenido
          y obligaba a reservar espacio de más arriba de todo. */}
      <header
        // Si alguien llega con el tabulador mientras esta oculto, vuelve: si no,
        // el foco entraria en enlaces invisibles fuera de pantalla.
        onFocusCapture={() => setHidden(false)}
        className={cn(
          'sticky top-0 z-[60] border-b border-line bg-surface/95 backdrop-blur-md transition-transform duration-300 ease-soft',
          hidden && '-translate-y-full',
        )}
      >
        {/* Desktop */}
        {/* `relative` para que, en pantallas anchas, el botón del menú se vaya
            al borde izquierdo de la ventana, lejos del logo. */}
        <div className="relative hidden md:block">
          <div className="container-x flex items-center gap-6 py-3">
            <div className="flex shrink-0 items-center gap-6">
              <MenuButton
                open={menuOpen}
                onClick={() => setMenuOpen(true)}
                className="min-[1500px]:absolute min-[1500px]:left-6 min-[1500px]:top-1/2 min-[1500px]:-translate-y-1/2"
              />
              <Link to="/" aria-label="Natalia Sánchez, inicio" className="shrink-0"><Logo /></Link>
            </div>
            <div className="min-w-0 flex-1"><SearchBar /></div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Acceso directo a todo el catalogo. */}
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
              {/* Con los iconos de acción y no en el pie: es un ajuste, pero es
                  aquí donde se busca, junto a lo demás que no es navegación. */}
              <ThemeToggle size="md" />
              <Link to="/favoritos" aria-label="Favoritos" className="relative flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-sand">
                <Heart size={18} strokeWidth={2} />
                {favs.length > 0 && <span className="tnum absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-clay px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">{favs.length}</span>}
              </Link>
              <button onClick={openCart} aria-label={`Carrito, ${count} productos`} className="ml-1 flex h-10 cursor-pointer items-center gap-2 rounded bg-ink pl-3 pr-3.5 text-on-ink transition-colors hover:bg-ash">
                <ShoppingBag size={17} strokeWidth={2} /><span className="tnum text-body font-medium">{count}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Móvil */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-2 md:hidden">
          <div className="flex">
            <MenuButton open={menuOpen} onClick={() => setMenuOpen(true)} className="border-transparent" />
            <IconButton label="Buscar" onClick={() => setSearchOpen(true)}><Search size={19} strokeWidth={2} /></IconButton>
          </div>
          <Link to="/" aria-label="Natalia Sánchez, inicio"><Logo size="sm" /></Link>
          <div className="flex justify-end">
            <Link to={accountTo} aria-label="Mi cuenta" className="flex h-10 w-10 items-center justify-center rounded"><User size={19} strokeWidth={2} /></Link>
            <IconButton label="Carrito" onClick={openCart} badge={count}><ShoppingBag size={19} strokeWidth={2} /></IconButton>
          </div>
        </div>
      </header>

      <MegaMenu open={menuOpen} onClose={() => setMenuOpen(false)} items={NAV_ITEMS} />

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
    <nav aria-label="Accesos rápidos" className="fixed inset-x-0 bottom-0 z-[80] grid h-14 grid-cols-5 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <NavLink to="/" end className={active}><Home size={18} strokeWidth={2} />Inicio</NavLink>
      <NavLink to="/tienda" className={active}><Store size={18} strokeWidth={2} />Tienda</NavLink>
      <button onClick={onSearch} className={cn(item, 'text-ash')}><Search size={18} strokeWidth={2} />Buscar</button>
      <NavLink to="/favoritos" className={active}><Heart size={18} strokeWidth={2} />Favoritos</NavLink>
      <button onClick={openCart} className={cn(item, 'text-ash')}>
        <ShoppingBag size={18} strokeWidth={2} />Carrito
        {count > 0 && <span className="tnum absolute left-[calc(50%+4px)] top-1 min-w-[15px] rounded-full bg-clay px-1 text-[9px] font-semibold leading-[15px] text-on-accent">{count}</span>}
      </button>
    </nav>
  );
}
