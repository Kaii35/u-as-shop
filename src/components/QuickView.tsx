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
    <Modal open={!!p} onClose={closeQuickView} className="max-w-[760px]" label="Vista rápida">
      {p && stock && (
        <div className="flex flex-wrap">
          <div className="relative min-h-[280px] flex-[1_1_280px] bg-sand"><div className="absolute inset-0"><Img src={p.images[0]} alt={p.name} label="Foto de producto" /></div></div>
          <div className="flex flex-[1_1_300px] flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="kicker">{p.brand}</span>
              <CloseButton onClick={closeQuickView} />
            </div>
            <h3 className="display text-h4 text-balance">{p.name}</h3>
            <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} size="md" />
            <p className="text-body text-ash">{p.description}</p>
            {p.shades && (
              <div className="flex flex-wrap gap-1.5">
                {p.shades.map((s) => <span key={s.name} title={s.name} className="h-5 w-5 rounded-full ring-1 ring-inset ring-ink/10" style={{ background: s.hex }} />)}
              </div>
            )}
            <span className="flex items-center gap-1.5 text-cap text-ash"><span className={cn('h-1.5 w-1.5 rounded-full', stock.dot)} />{stock.label}</span>
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button onClick={() => addToCart(p.id)} disabled={!p.stock}>Agregar al carrito</Button>
              <Button variant="secondary" onClick={() => { closeQuickView(); navigate(`/producto/${p.slug}`); }}>Ver detalle completo</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
