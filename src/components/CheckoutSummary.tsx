import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getProduct } from '../data/catalog';
import { cn, formatCOP, unitPrice, variantLabel, type Totals } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { CouponField } from './CartDrawer';
import { Img } from './ui/Primitives';

export function CheckoutSummary({ totals }: { totals: Totals }) {
  const { cart, coupon } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <aside className="card flex w-full min-w-0 flex-col gap-3 p-4 lg:sticky lg:top-24">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center justify-between text-left lg:pointer-events-none">
        <span className="flex flex-col gap-1">
          <span className="display text-h5">Resumen del pedido</span>
          <span className="text-cap text-mist">{totals.count} {totals.count === 1 ? 'producto' : 'productos'}</span>
        </span>
        <span className="tnum flex items-center gap-1.5 font-semibold lg:hidden">
          {formatCOP(totals.total)}
          <ChevronDown size={15} strokeWidth={2} className={cn('text-mist transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      <div className={cn('flex-col gap-3', open ? 'flex' : 'hidden lg:flex')}>
        <ul className="flex max-h-72 flex-col gap-2.5 overflow-auto">
          {cart.map((l) => {
            const p = getProduct(l.productId);
            if (!p) return null;
            return (
              <li key={`${l.productId}-${l.shade}-${l.size}`} className="flex items-center gap-2.5">
                <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded border border-line bg-sand">
                  <Img src={p.images[0]} alt={p.name} />
                  <span className="tnum absolute right-0.5 top-0.5 min-w-4 rounded-full bg-ink px-1 text-center text-[10px] font-semibold leading-4 text-white">{l.qty}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body leading-snug">{p.name}</span>
                  <span className="text-meta text-mist">{variantLabel(p, l.shade, l.size)}</span>
                </div>
                <span className="tnum text-body font-semibold">{formatCOP(unitPrice(p, l.size) * l.qty)}</span>
              </li>
            );
          })}
        </ul>
        <CouponField />
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <div className="row-kv text-ash"><span>Subtotal</span><span className="tnum">{formatCOP(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="row-kv text-clay"><span>Descuento {coupon}</span><span className="tnum">−{formatCOP(totals.discount)}</span></div>}
          <div className="row-kv text-ash"><span>Envío</span><span className="tnum">{totals.shipping ? formatCOP(totals.shipping) : 'Gratis'}</span></div>
          <div className="flex items-baseline justify-between border-t border-line pt-2.5">
            <span className="display text-h5">Total</span>
            <span className="tnum display text-h5">{formatCOP(totals.total)}</span>
          </div>
          <span className="text-meta text-mist">Incluye IVA. Factura electrónica a tu correo.</span>
        </div>
      </div>
    </aside>
  );
}
