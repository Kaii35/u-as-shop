import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingBag, Sparkles, Trash2, Truck } from 'lucide-react';
import { getProduct } from '../data/catalog';
import { FREE_SHIPPING_FROM, formatCOP, unitPrice, variantLabel } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { Button } from './ui/Button';
import { CloseButton, Sheet } from './ui/Overlays';
import { Img, QuantitySelector } from './ui/Primitives';

export function CouponField() {
  const { applyCoupon, coupon } = useStore();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const apply = () => setMsg(applyCoupon(code) ? `Código ${code.trim().toUpperCase()} aplicado` : 'El código no es válido. Prueba con PRO10');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input value={code} onChange={(e) => { setCode(e.target.value); setMsg(''); }} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="Cupón de descuento" aria-label="Cupón de descuento" className="h-11 min-w-0 flex-1 rounded-full border border-ink/20 bg-ivory px-4 text-sm uppercase outline-none focus:border-wine" />
        <Button size="sm" variant="secondary" onClick={apply}>Aplicar</Button>
      </div>
      {(msg || coupon) && <span className="text-[12.5px] text-wine">{msg || `Código ${coupon} aplicado`}</span>}
    </div>
  );
}

export function CartDrawer() {
  const { cart, cartOpen, closeCart, setQty, removeLine, totals, coupon } = useStore();
  const navigate = useNavigate();
  const t = totals();
  const pct = Math.min(100, (t.net / FREE_SHIPPING_FROM) * 100);
  const go = (to: string) => { closeCart(); navigate(to); };

  return (
    <Sheet open={cartOpen} onClose={closeCart} side="right" label="Carrito de compras">
      <div className="flex items-center justify-between px-6 pb-[18px] pt-[22px]">
        <h2 className="font-display text-[28px]">Tu carrito <span className="font-sans text-[15px] text-muted">({t.count})</span></h2>
        <CloseButton onClick={closeCart} label="Cerrar carrito" />
      </div>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
          <span className="relative flex h-[120px] w-[120px] items-center justify-center rounded-t-full rounded-b bg-nude text-wine">
            <ShoppingBag size={30} strokeWidth={1.2} />
            <Sparkles size={16} strokeWidth={1.5} className="absolute right-3.5 top-[18px] text-blush" />
          </span>
          <h3 className="font-display text-[30px] leading-tight">Tu carrito está vacío</h3>
          <p className="font-light text-muted">Descubre esmaltes, geles y herramientas pensadas para tu próximo set.</p>
          <Button onClick={() => go('/tienda')}>Explorar productos</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 px-6 pb-[18px]">
            <span className="flex items-center gap-2 text-[13.5px] text-wine">
              <Truck size={16} strokeWidth={1.5} />
              {t.net >= FREE_SHIPPING_FROM ? 'Tu pedido tiene envío gratis a toda Colombia' : `Te faltan ${formatCOP(FREE_SHIPPING_FROM - t.net)} para envío gratis`}
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-nude"><span className="block h-full bg-wine transition-[width] duration-700" style={{ width: `${pct}%` }} /></span>
          </div>
          <ul className="flex-1 overflow-auto border-t border-ink/10 px-6">
            {cart.map((l, i) => {
              const p = getProduct(l.productId);
              if (!p) return null;
              const u = unitPrice(p, l.size);
              const v = variantLabel(p, l.shade, l.size);
              return (
                <li key={`${l.productId}-${l.shade}-${l.size}`} className="flex gap-4 border-b border-ink/10 py-[18px]">
                  <button onClick={() => go(`/producto/${p.slug}`)} className="h-[108px] w-[88px] shrink-0 overflow-hidden rounded-md"><Img src={p.images[0]} alt={p.name} /></button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex justify-between gap-2.5">
                      <button onClick={() => go(`/producto/${p.slug}`)} className="text-left text-[15px] leading-snug hover:text-wine">{p.name}</button>
                      <button onClick={() => removeLine(i)} aria-label={`Eliminar ${p.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center text-muted hover:text-danger"><Trash2 size={16} strokeWidth={1.5} /></button>
                    </div>
                    {v && (
                      <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                        {p.shades && <span className="h-[11px] w-[11px] rounded-full shadow-[inset_0_0_0_1px_rgba(36,33,36,.14)]" style={{ background: p.shades[l.shade].hex }} />}
                        {v}
                      </span>
                    )}
                    <span className="text-[12.5px] text-muted">{formatCOP(u)} c/u</span>
                    <div className="mt-auto flex items-center justify-between">
                      <QuantitySelector size="sm" value={l.qty} onChange={(q) => setQty(i, q)} max={Math.max(p.stock, 1)} />
                      <span className="font-medium text-wine">{formatCOP(u * l.qty)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-3 border-t border-ink/10 bg-white px-6 pb-6 pt-[18px]">
            <CouponField />
            <Row label="Subtotal" value={formatCOP(t.subtotal)} />
            {t.discount > 0 && <Row label={`Descuento ${coupon}`} value={`−${formatCOP(t.discount)}`} accent />}
            <Row label="Envío estimado" value={t.shipping ? formatCOP(t.shipping) : 'Gratis'} />
            <div className="flex items-baseline justify-between border-t border-ink/10 pt-2.5">
              <span className="font-display text-[22px]">Total</span>
              <span className="text-[22px] font-medium text-wine">{formatCOP(t.total)}</span>
            </div>
            <Button size="lg" onClick={() => go('/checkout')}>Continuar con la compra <ArrowRight size={16} strokeWidth={1.5} /></Button>
            <Button variant="secondary" onClick={closeCart}>Seguir comprando</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={`flex justify-between text-[14.5px] ${accent ? 'text-wine' : ''}`}><span>{label}</span><span>{value}</span></div>;
}
