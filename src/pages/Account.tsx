import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, CreditCard, Heart, Lock, LogOut, MapPin, Package, Plus, User } from 'lucide-react';
import { addresses, getProduct, orders } from '../data/catalog';
import { cn, formatCOP } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Img } from '../components/ui/Primitives';
import type { OrderStatus } from '../types';

const TABS = [
  { id: 'pedidos', label: 'Mis pedidos', Icon: Package },
  { id: 'perfil', label: 'Información personal', Icon: User },
  { id: 'direcciones', label: 'Direcciones', Icon: MapPin },
  { id: 'favoritos', label: 'Favoritos', Icon: Heart },
  { id: 'pagos', label: 'Métodos de pago', Icon: CreditCard },
  { id: 'contrasena', label: 'Contraseña', Icon: Lock },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STATUS_STYLE: Record<OrderStatus, string> = {
  Confirmado: 'bg-nude text-wine',
  Preparando: 'bg-nude text-wine',
  'En camino': 'bg-nude text-wine',
  Entregado: 'bg-[#E4EDE3] text-[#2F5A3C]',
};

export default function Account() {
  const { user, logout, notify, favs, addToCart } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'pedidos';
  const [openOrder, setOpenOrder] = useState<string | null>(orders[0].number);

  if (!user) return <Navigate to="/ingresar?next=/cuenta" replace />;
  const setTab = (id: TabId) => setParams({ tab: id }, { replace: true });

  return (
    <div className="container-x pb-[clamp(64px,7vw,110px)] pt-[clamp(24px,3vw,48px)]">
      <header className="mb-[clamp(24px,3vw,40px)] flex flex-wrap items-center gap-5 border-b border-ink/10 pb-[clamp(24px,3vw,40px)]">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-blush font-display text-[28px] italic text-wine">{user.firstName[0]}{user.lastName[0]}</span>
        <div className="flex flex-col gap-1.5">
          <h1 className="h-display text-[clamp(34px,4vw,56px)]">Hola, <em className="text-wine">{user.firstName}</em></h1>
          <span className="text-sm text-muted">Miembro Aurelle Pro · {user.email}</span>
        </div>
      </header>

      <div className="grid items-start gap-[clamp(24px,4vw,64px)] md:grid-cols-[270px_minmax(0,1fr)]">
        <nav aria-label="Secciones de la cuenta" className="-mx-5 flex gap-2 overflow-x-auto px-5 md:sticky md:top-[150px] md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id}
              className={cn('flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-full border border-ink/15 px-4 text-sm transition-colors md:h-12 md:rounded-xl md:border-0 md:text-[15px]',
                tab === id ? 'bg-nude text-wine' : 'hover:bg-nude')}>
              <Icon size={20} strokeWidth={1.5} className="hidden md:block" />{label}
            </button>
          ))}
          <button onClick={logout} className="flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-full border border-ink/15 px-4 text-sm text-muted hover:text-wine md:mt-3 md:h-12 md:border-0 md:text-[15px]">
            <LogOut size={20} strokeWidth={1.5} className="hidden md:block" />Cerrar sesión
          </button>
        </nav>

        <section className="min-w-0">
          {tab === 'pedidos' && (
            <>
              <Title>Mis pedidos</Title>
              <div className="flex flex-col gap-3.5">
                {orders.map((o) => {
                  const open = openOrder === o.number;
                  return (
                    <div key={o.number} className="overflow-hidden rounded-[18px] border border-ink/10 bg-white">
                      <button onClick={() => setOpenOrder(open ? null : o.number)} aria-expanded={open} className="grid w-full grid-cols-[repeat(auto-fit,minmax(130px,1fr))] items-center gap-4 px-[22px] py-5 text-left">
                        <span className="flex flex-col gap-1"><span className="font-medium">#{o.number}</span><span className="text-[13px] text-muted">{o.date}</span></span>
                        <span className="flex items-center gap-1.5">
                          {o.productIds.slice(0, 3).map((id) => <span key={id} className="h-12 w-10 overflow-hidden rounded-md"><Img src={getProduct(id)?.images[0]} /></span>)}
                          {o.productIds.length > 3 && <span className="text-xs text-muted">+{o.productIds.length - 3}</span>}
                        </span>
                        <span className="flex flex-col gap-1"><span className="font-medium text-wine">{formatCOP(o.total)}</span><span className="text-[13px] text-muted">{o.productIds.length} productos</span></span>
                        <span className="flex items-center justify-between gap-2.5">
                          <span className={cn('rounded-full px-3 py-[7px] text-[11px] font-medium uppercase tracking-[.1em]', STATUS_STYLE[o.status])}>{o.status}</span>
                          <ChevronDown size={16} strokeWidth={1.5} className={cn('text-muted transition-transform', open && 'rotate-180')} />
                        </span>
                      </button>
                      {open && (
                        <div className="flex flex-wrap items-end justify-between gap-6 border-t border-ink/10 px-[22px] pb-6 pt-[18px]">
                          <ol className="flex flex-col" aria-label="Seguimiento del envío">
                            {o.tracking.map((s, i) => (
                              <li key={s.label} className="flex gap-3.5">
                                <div className="flex flex-col items-center">
                                  <span className={cn('h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px]', s.done ? 'border-wine bg-wine' : 'border-ink/30 bg-ivory')} />
                                  {i < o.tracking.length - 1 && <span className={cn('min-h-7 w-[1.5px] flex-1', o.tracking[i + 1].done ? 'bg-wine' : 'bg-ink/15')} />}
                                </div>
                                <div className="-mt-0.5 flex flex-col gap-0.5 pb-4">
                                  <span className={cn('text-[14.5px]', !s.done && 'text-muted')}>{s.label}</span>
                                  <span className="text-[12.5px] text-muted">{s.date}</span>
                                </div>
                              </li>
                            ))}
                          </ol>
                          <Button size="sm" variant="secondary" onClick={() => o.productIds.forEach((id) => addToCart(id))}>Volver a comprar</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'perfil' && (
            <>
              <Title>Información personal</Title>
              <div className="grid max-w-[680px] gap-4 sm:grid-cols-2">
                <Input label="Nombre" defaultValue={user.firstName} />
                <Input label="Apellido" defaultValue={user.lastName} />
                <Input label="Correo" type="email" defaultValue={user.email} />
                <Input label="Teléfono" type="tel" defaultValue={user.phone} />
              </div>
              <Button className="mt-6" onClick={() => notify({ title: 'Cambios guardados', description: 'Tu información se actualizó' })}>Guardar cambios</Button>
            </>
          )}

          {tab === 'direcciones' && (
            <>
              <Title>Direcciones guardadas</Title>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
                {addresses.map((a) => (
                  <div key={a.label} className={cn('flex flex-col gap-2 rounded-[18px] border bg-white p-[22px]', a.primary ? 'border-wine' : 'border-ink/10')}>
                    <span className="flex items-center justify-between">
                      <span className="font-display text-xl">{a.label}</span>
                      {a.primary && <span className="rounded-full bg-nude px-2.5 py-[5px] text-[10px] font-medium uppercase tracking-[.14em] text-wine">Principal</span>}
                    </span>
                    <span className="text-[14.5px] leading-normal">{a.line1}<br />{a.line2}</span>
                  </div>
                ))}
                <AddCard label="Agregar dirección" />
              </div>
            </>
          )}

          {tab === 'favoritos' && (
            <>
              <Title>Favoritos</Title>
              {favs.length ? <ProductGrid products={favs.map((id) => getProduct(id)!).filter(Boolean)} /> : <p className="text-muted">Aún no tienes productos guardados.</p>}
            </>
          )}

          {tab === 'pagos' && (
            <>
              <Title>Métodos de pago</Title>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
                <div className="flex aspect-[1.6] flex-col justify-between rounded-[18px] bg-wine p-[22px] text-ivory">
                  <span className="flex justify-between"><span className="font-display text-xl italic">Aurelle</span><span className="text-sm font-semibold tracking-[.1em]">VISA</span></span>
                  <span className="text-lg tracking-[.14em]">•••• •••• •••• 4821</span>
                  <span className="flex justify-between text-[12.5px] opacity-85"><span>{user.firstName} {user.lastName}</span><span>09/29</span></span>
                </div>
                <div className="flex aspect-[1.6] flex-col justify-between rounded-[18px] border border-ink/10 bg-white p-[22px]">
                  <span className="label-xs">Billetera digital</span>
                  <span className="font-display text-[22px]">Nequi</span>
                  <span className="text-sm">•••• 1177</span>
                </div>
                <AddCard label="Agregar método" className="aspect-[1.6]" />
              </div>
            </>
          )}

          {tab === 'contrasena' && (
            <>
              <Title>Cambiar contraseña</Title>
              <form className="flex max-w-[420px] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); notify({ title: 'Contraseña actualizada', description: 'Úsala en tu próximo inicio de sesión' }); }}>
                <Input label="Contraseña actual" type="password" autoComplete="current-password" />
                <Input label="Nueva contraseña" type="password" autoComplete="new-password" />
                <Input label="Confirmar nueva contraseña" type="password" autoComplete="new-password" />
                <Button type="submit" className="self-start">Actualizar contraseña</Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 font-display text-[clamp(28px,3vw,38px)] leading-none">{children}</h2>;
}

function AddCard({ label, className }: { label: string; className?: string }) {
  return (
    <button className={cn('flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-ink/30 text-[14.5px] transition-colors hover:border-wine hover:text-wine', className)}>
      <Plus size={20} strokeWidth={1.5} />{label}
    </button>
  );
}
