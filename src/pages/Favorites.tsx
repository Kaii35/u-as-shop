import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { getProduct } from '../data/catalog';
import { useStore } from '../store/StoreContext';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';

export default function Favorites() {
  const { favs, addToCart } = useStore();
  const items = favs.map((id) => getProduct(id)).filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <div className="container-x pb-[clamp(64px,7vw,110px)] pt-[clamp(24px,3vw,48px)]">
      <header className="mb-[clamp(24px,3vw,40px)] flex flex-wrap items-end justify-between gap-5 border-b border-line pb-[clamp(24px,3vw,36px)]">
        <div className="flex flex-col gap-3">
          <span className="kicker">{items.length} {items.length === 1 ? 'producto guardado' : 'productos guardados'}</span>
          <h1 className="display text-h3">Tus <em className="text-clay">favoritos</em></h1>
        </div>
        {items.length > 0 && <Button onClick={() => items.filter((p) => p.stock).forEach((p) => addToCart(p.id))}>Agregar todo al carrito</Button>}
      </header>

      {items.length ? (
        <ProductGrid products={items} />
      ) : (
        <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-sand text-clay"><Heart size={28} strokeWidth={1.2} /></span>
          <h2 className="display text-h4">Tu lista está esperando</h2>
          <p className="max-w-[380px] text-mist">Toca el corazón en cualquier producto para guardarlo y comprarlo cuando quieras.</p>
          <Link to="/tienda"><Button>Descubrir productos</Button></Link>
        </div>
      )}
    </div>
  );
}
