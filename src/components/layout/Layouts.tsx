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
      <header className="container-x flex items-center justify-between border-b border-ink/10 py-[18px]">
        <Link to="/" aria-label="Volver a la tienda"><Logo size="sm" /></Link>
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.16em] text-muted">
          <Lock size={16} strokeWidth={1.5} /> Pago 100% seguro
        </span>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
