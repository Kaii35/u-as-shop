import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
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

/**
 * Contenedor de autenticacion: sin barra de anuncio, sin header, sin footer y
 * sin la barra inferior de movil. Solo el logo, que hace de vuelta atras.
 *
 * Usa 100dvh en vez de 100vh para que en moviles la barra del navegador no
 * empuje el contenido fuera de la pantalla, y overflow-hidden para que la
 * pagina no scrollee: si algun formulario no cupiera, scrollea su columna.
 */
export function AuthShell() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-white p-3 md:p-4">
      <header className="shrink-0 pb-3">
        <Link to="/" aria-label="Volver a la tienda" className="inline-flex items-center gap-2 text-mist transition-colors hover:text-ink">
          <ArrowLeft size={16} strokeWidth={2} />
          <Logo size="sm" />
        </Link>
      </header>
      <main className="min-h-0 flex-1"><Outlet /></main>
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
