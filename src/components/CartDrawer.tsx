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
        <input value={code} onChange={(e) => { setCode(e.target.value); setMsg(''); }} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="Cupón de descuento" aria-label="Cupón de descuento" className="h-9 min-w-0 flex-1 rounded border border-line bg-white px-2.5 text-body uppercase outline-none transition-colors focus:border-clay" />
        <Button size="sm" variant="secondary" onClick={apply}>Aplicar</Button>
      </div>
      {(msg || coupon) && <span className="text-cap text-clay">{msg || `Código ${coupon} aplicado`}</span>}
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
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="display text-h5">Tu carrito <span className="tnum font-sans text-body font-normal text-mist">({t.count})</span></h2>
        <CloseButton onClick={closeCart} label="Cerrar carrito" />
      </div>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-sand text-clay">
            <ShoppingBag size={24} strokeWidth={1.75} />
            <Sparkles size={12} strokeWidth={2} className="absolute right-3 top-3.5 text-clay/50" />
          </span>
          <h3 className="display text-h5">Tu carrito está vacío</h3>
          <p className="max-w-[34ch] text-body text-mist">Descubre esmaltes, geles y herramientas para tu próximo set.</p>
          <Button onClick={() => go('/tienda')}>Explorar productos</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 px-4 py-3">
            <span className="flex items-center gap-1.5 text-cap text-ash">
              <Truck size={14} strokeWidth={2} className="shrink-0 text-clay" />
              {t.net >= FREE_SHIPPING_FROM ? 'Tu pedido tiene envío gratis a toda Colombia' : `Te faltan ${formatCOP(FREE_SHIPPING_FROM - t.net)} para envío gratis`}
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-sand"><span className="block h-full rounded-full bg-clay transition-[width] duration-500" style={{ width: `${pct}%` }} /></span>
          </div>
          <ul className="flex-1 overflow-auto border-t border-line px-4">
            {cart.map((l, i) => {
              const p = getProduct(l.productId);
              if (!p) return null;
              const u = unitPrice(p, l.size);
              const v = variantLabel(p, l.shade, l.size);
              return (
                <li key={`${l.productId}-${l.shade}-${l.size}`} className="flex gap-3 border-b border-line py-3">
                  <button onClick={() => go(`/producto/${p.slug}`)} className="h-[84px] w-[68px] shrink-0 cursor-pointer overflow-hidden rounded border border-line bg-sand"><Img src={p.images[0]} alt={p.name} /></button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex justify-between gap-2">
                      <button onClick={() => go(`/producto/${p.slug}`)} className="cursor-pointer text-left text-body leading-snug transition-colors hover:text-clay">{p.name}</button>
                      <button onClick={() => removeLine(i)} aria-label={`Eliminar ${p.name}`} className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-mist transition-colors hover:bg-sand hover:text-danger"><Trash2 size={14} strokeWidth={2} /></button>
                    </div>
                    {v && (
                      <span className="flex items-center gap-1.5 text-meta text-mist">
                        {p.shades && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/10" style={{ background: p.shades[l.shade].hex }} />}
                        {v}
                      </span>
                    )}
                    <span className="tnum text-meta text-mist">{formatCOP(u)} c/u</span>
                    <div className="mt-auto flex items-center justify-between">
                      <QuantitySelector size="sm" value={l.qty} onChange={(q) => setQty(i, q)} max={Math.max(p.stock, 1)} />
                      <span className="tnum text-body font-semibold">{formatCOP(u * l.qty)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line bg-white px-4 pb-4 pt-3">
            <CouponField />
            <Row label="Subtotal" value={formatCOP(t.subtotal)} />
            {t.discount > 0 && <Row label={`Descuento ${coupon}`} value={`−${formatCOP(t.discount)}`} accent />}
            <Row label="Envío estimado" value={t.shipping ? formatCOP(t.shipping) : 'Gratis'} />
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <span className="display text-h5">Total</span>
              <span className="tnum display text-h5">{formatCOP(t.total)}</span>
            </div>
            <Button size="lg" onClick={() => go('/checkout')}>Continuar con la compra <ArrowRight size={15} strokeWidth={2} /></Button>
            <Button variant="secondary" onClick={closeCart}>Seguir comprando</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={`row-kv ${accent ? 'text-clay' : 'text-ash'}`}><span>{label}</span><span className="tnum">{value}</span></div>;
}
