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
    <aside className="flex w-full min-w-0 flex-col gap-[18px] rounded-[20px] border border-ink/10 bg-white p-[clamp(20px,2.4vw,32px)] lg:sticky lg:top-6">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center justify-between text-left lg:pointer-events-none">
        <span className="flex flex-col gap-1">
          <span className="font-display text-2xl">Resumen del pedido</span>
          <span className="text-[13px] text-muted">{totals.count} {totals.count === 1 ? 'producto' : 'productos'}</span>
        </span>
        <span className="flex items-center gap-2 font-medium text-wine lg:hidden">
          {formatCOP(totals.total)}
          <ChevronDown size={16} strokeWidth={1.5} className={cn('transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      <div className={cn('flex-col gap-[18px]', open ? 'flex' : 'hidden lg:flex')}>
        <ul className="flex max-h-80 flex-col gap-3.5 overflow-auto">
          {cart.map((l) => {
            const p = getProduct(l.productId);
            if (!p) return null;
            return (
              <li key={`${l.productId}-${l.shade}-${l.size}`} className="flex items-center gap-3.5">
                <div className="relative h-[72px] w-[60px] shrink-0 overflow-hidden rounded-lg">
                  <Img src={p.images[0]} alt={p.name} />
                  <span className="absolute right-1 top-1 min-w-5 rounded-full bg-ink text-center text-[11px] font-medium leading-5 text-ivory">{l.qty}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug">{p.name}</span>
                  <span className="text-[12.5px] text-muted">{variantLabel(p, l.shade, l.size)}</span>
                </div>
                <span className="text-sm font-medium">{formatCOP(unitPrice(p, l.size) * l.qty)}</span>
              </li>
            );
          })}
        </ul>
        <CouponField />
        <div className="flex flex-col gap-2.5 border-t border-ink/10 pt-3.5 text-[14.5px]">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCOP(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between text-wine"><span>Descuento {coupon}</span><span>−{formatCOP(totals.discount)}</span></div>}
          <div className="flex justify-between"><span>Envío</span><span>{totals.shipping ? formatCOP(totals.shipping) : 'Gratis'}</span></div>
          <div className="flex items-baseline justify-between border-t border-ink/10 pt-3">
            <span className="font-display text-[22px]">Total</span>
            <span className="text-[22px] font-medium text-wine">{formatCOP(totals.total)}</span>
          </div>
          <span className="text-xs text-muted">Incluye IVA. Factura electrónica a tu correo.</span>
        </div>
      </div>
    </aside>
  );
}
