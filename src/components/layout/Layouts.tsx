import { Link, Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AnnouncementBar, Header } from '../Header';
import { Footer } from '../Footer';
import { Logo } from '../ui/Primitives';

export function StoreLayout() {
  return (
    <div className="min-h-screen">
      <AnnouncementBar />
      <Header />
      <main><Outlet /></main>
      <Footer />
    </div>
  );
}

export function CheckoutLayout() {
  return (
    <div className="min-h-screen">
      <header className="container-x flex items-center justify-between border-b border-line py-3">
        <Link to="/" aria-label="Volver a la tienda"><Logo size="sm" /></Link>
        <span className="flex items-center gap-1.5 text-cap text-mist">
          <Lock size={14} strokeWidth={2} /> Pago 100% seguro
        </span>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
