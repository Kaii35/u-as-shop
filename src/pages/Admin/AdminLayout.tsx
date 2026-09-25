import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Boxes,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../../store/AdminAuth';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { StockAlert } from '../../lib/admin-types';

/**
 * Armazón del panel.
 *
 * Pensado para quien atiende la tienda, no para un analista: siete secciones y
 * ni una más, nombradas con la palabra que usaría ella ("Pedidos", no
 * "Órdenes"; "Inventario", no "Stock"). Todo lo que se hace a diario está a un
 * clic desde cualquier pantalla.
 */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** `end` para que "Resumen" no quede activo en todas las rutas hijas. */
  end?: boolean;
  description: string;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true, description: 'Ventas y alertas' },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag, description: 'Qué hay que despachar' },
  { to: '/admin/pagos', label: 'Pagos', icon: CreditCard, description: 'Cobros y su estado' },
  { to: '/admin/productos', label: 'Productos', icon: Package, description: 'Catálogo y precios' },
  { to: '/admin/inventario', label: 'Inventario', icon: Boxes, description: 'Entradas, salidas y conteos' },
  { to: '/admin/promociones', label: 'Promociones', icon: Megaphone, description: 'Descuentos y anuncios' },
  { to: '/admin/ajustes', label: 'Ajustes', icon: SlidersHorizontal, description: 'Envíos, equipo y parámetros' },
];

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState(0);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  /**
   * Cuántas referencias están en alerta, para el distintivo de Inventario.
   *
   * Se pide aparte de la pantalla porque el número tiene que verse desde
   * cualquier sección: es lo único del panel que exige actuar hoy, y esconderlo
   * detrás de un clic hace que se descubra cuando ya falta mercancía.
   */
  useEffect(() => {
    let alive = true;
    api
      .get<{ items: StockAlert[] }>('/api/admin/inventory/alerts')
      .then((data) => {
        if (alive) setAlerts(data.items.length);
      })
      .catch(() => {
        /* Si falla, el distintivo simplemente no sale. No vale un error. */
      });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-2.5 rounded px-2.5 py-2 text-body transition-colors',
              isActive ? 'bg-ink text-white' : 'text-ash hover:bg-sand hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={17} strokeWidth={2} className="shrink-0" />
              <span className="flex-1 truncate font-medium">{item.label}</span>
              {item.to === '/admin/inventario' && alerts > 0 && (
                <span
                  className={cn(
                    'tnum min-w-[20px] rounded-full px-1.5 py-px text-center text-[10px] font-semibold leading-4',
                    isActive ? 'bg-white text-ink' : 'bg-danger text-white',
                  )}
                  title={`${alerts} referencias necesitan reposición`}
                >
                  {alerts}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-[100dvh] bg-sand">
      {/* Barra superior. En escritorio solo lleva identidad y sesión: la
          navegación vive en la columna, donde no compite con ella. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-white px-3 md:px-4">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          className="-ml-1 cursor-pointer rounded p-2 text-ink transition-colors hover:bg-sand lg:hidden"
        >
          {menuOpen ? <X size={19} strokeWidth={2} /> : <Menu size={19} strokeWidth={2} />}
        </button>

        <Link to="/admin" className="flex items-baseline gap-2">
          <span className="display text-h5 leading-none tracking-[-.03em] text-ink">Aurelle</span>
          <span className="label-xs">Panel</span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/"
            className="hidden h-9 items-center gap-1.5 rounded border border-line px-2.5 text-cap font-medium text-ash transition-colors hover:border-ink hover:text-ink sm:flex"
          >
            Ver la tienda <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
          {user && (
            <div className="flex items-center gap-1.5 rounded border border-line py-1 pl-2.5 pr-1">
              <div className="hidden leading-tight sm:block">
                <p className="text-cap font-medium text-ink">{user.name}</p>
                <p className="text-meta text-mist">
                  {user.role === 'ADMIN' ? 'Administradora' : 'Equipo'}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-danger"
              >
                <LogOut size={16} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-line bg-white lg:block">
          {nav}
          <p className="px-4 py-3 text-meta leading-relaxed text-mist">
            Los cambios que hagas aquí se ven en la tienda al instante.
          </p>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 top-14 z-30 lg:hidden">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 cursor-default bg-ink/25"
            />
            <div className="relative h-full w-64 max-w-[80vw] overflow-y-auto border-r border-line bg-white shadow-drawer">
              {nav}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-4 md:px-5 md:py-6">
          <div className="mx-auto w-full max-w-[1260px]">
            {/* La suspensión se corta AQUÍ y no más arriba: cada sección se
                descarga por separado, y con el límite fuera del armazón la
                barra lateral se borraría y volvería en cada navegación. */}
            <Suspense
              fallback={<p className="py-16 text-center text-body text-mist">Cargando…</p>}
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
