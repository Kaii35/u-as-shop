import { useNavigate } from 'react-router-dom';
import { getProduct } from '../data/catalog';
import { cn, hasPriceBySize, stockInfo } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { Button } from './ui/Button';
import { CloseButton, Modal } from './ui/Overlays';
import { Img, PriceDisplay } from './ui/Primitives';

export function QuickView() {
  const { quickViewId, closeQuickView, addToCart } = useStore();
  const navigate = useNavigate();
  const p = quickViewId ? getProduct(quickViewId) : undefined;
  const stock = p ? stockInfo(p.stock) : null;

  return (
    <Modal open={!!p} onClose={closeQuickView} className="max-w-[880px]" label="Vista rápida">
      {p && stock && (
        <div className="flex flex-wrap">
          <div className="relative min-h-[360px] flex-[1_1_320px]"><div className="absolute inset-0"><Img src={p.images[0]} alt={p.name} label="Foto de producto" /></div></div>
          <div className="flex flex-[1_1_320px] flex-col gap-4 p-[clamp(24px,3vw,40px)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[.2em] text-wine">{p.brand}</span>
              <CloseButton onClick={closeQuickView} />
            </div>
            <h3 className="font-display text-[32px] leading-[1.08]">{p.name}</h3>
            <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} size="md" />
            <p className="font-light leading-relaxed">{p.description}</p>
            {p.shades && (
              <div className="flex flex-wrap gap-1.5">
                {p.shades.map((s) => <span key={s.name} title={s.name} className="h-[26px] w-[26px] rounded-full shadow-[inset_0_0_0_1px_rgba(36,33,36,.14)]" style={{ background: s.hex }} />)}
              </div>
            )}
            <span className="flex items-center gap-2 text-[13.5px]"><span className={cn('h-[7px] w-[7px] rounded-full', stock.dot)} />{stock.label}</span>
            <div className="mt-auto flex flex-col gap-2.5">
              <Button size="lg" onClick={() => addToCart(p.id)} disabled={!p.stock}>Agregar al carrito</Button>
              <Button variant="secondary" onClick={() => { closeQuickView(); navigate(`/producto/${p.slug}`); }}>Ver detalle completo</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
