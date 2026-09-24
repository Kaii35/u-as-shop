import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Facebook, Instagram, Music2, Youtube } from 'lucide-react';
import { categories } from '../data/catalog';
import { isEmail } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { NAV_ITEMS } from './Header';
import { Logo } from './ui/Primitives';

const PAYMENTS = ['VISA', 'Mastercard', 'AMEX', 'PSE', 'Nequi', 'Daviplata', 'Contra entrega'];
const SOCIAL = [
  { label: 'Instagram', Icon: Instagram },
  { label: 'TikTok', Icon: Music2 },
  { label: 'Facebook', Icon: Facebook },
  { label: 'YouTube', Icon: Youtube },
];

export function Footer() {
  const { notify } = useStore();
  const [email, setEmail] = useState('');
  const subscribe = () => {
    if (!isEmail(email)) return notify({ title: 'Correo no válido', description: 'Revisa tu dirección de correo' });
    setEmail('');
    notify({ title: 'Suscripción confirmada', description: 'Revisa tu correo: te enviamos tu código' });
  };
  const col = 'flex flex-col gap-3 text-[14.5px] font-light';
  const head = 'mb-1.5 text-[11px] font-medium uppercase tracking-[.2em] text-blush';

  return (
    <footer className="container-x bg-ink pb-8 pt-[clamp(56px,6vw,96px)] text-ivory">
      <div className="grid gap-[clamp(32px,4vw,56px)] sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex max-w-[380px] flex-col gap-[18px]">
          <Logo size="lg" light />
          <p className="text-[15px] font-light leading-relaxed">
            Insumos profesionales para uñas, pestañas, piel y cuidado personal, seleccionados para quienes hacen de la belleza su oficio.
          </p>
          <div className="flex gap-1.5 rounded-full border border-ivory/25 p-[5px]">
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && subscribe()} placeholder="Tu correo" aria-label="Correo para el newsletter" className="h-[42px] min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-ivory/60" />
            <button onClick={subscribe} aria-label="Suscribirme" className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-blush text-wine"><ArrowRight size={16} strokeWidth={1.5} /></button>
          </div>
          <div className="flex gap-2">
            {SOCIAL.map(({ label, Icon }) => (
              <a key={label} href="#" aria-label={label} className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-ivory/25 transition-colors hover:bg-ivory hover:text-ink">
                <Icon size={16} strokeWidth={1.5} />
              </a>
            ))}
          </div>
        </div>
        <div className={col}>
          <span className={head}>Tienda</span>
          {NAV_ITEMS.map((n) => <Link key={n.label} to={n.to} className="hover:text-blush">{n.label}</Link>)}
          <Link to="/cuenta" className="hover:text-blush">Mi cuenta</Link>
        </div>
        <div className={col}>
          <span className={head}>Categorías</span>
          {categories.map((c) => <Link key={c.id} to={`/tienda?cat=${c.slug}`} className="hover:text-blush">{c.name}</Link>)}
        </div>
        <div className={col}>
          <span className={head}>Atención al cliente</span>
          <a href="#">WhatsApp +57 310 000 0000</a>
          <a href="mailto:hola@aurelle.co">hola@aurelle.co</a>
          <a href="#">Envíos y entregas</a>
          <a href="#">Cambios y devoluciones</a>
          <a href="#">Preguntas frecuentes</a>
          <span className="text-[13px] text-blush">Lunes a sábado · 8:00 a. m. – 7:00 p. m.</span>
        </div>
      </div>
      <div className="mt-[clamp(40px,5vw,72px)] flex flex-wrap items-center justify-between gap-5 border-t border-ivory/15 pt-6">
        <div className="flex flex-wrap gap-1.5">
          {PAYMENTS.map((p) => <span key={p} className="rounded-md border border-ivory/25 px-3 py-[7px] text-[11px] font-semibold tracking-[.08em]">{p}</span>)}
        </div>
        <div className="flex flex-wrap gap-5 text-[13px] font-light">
          <a href="#">Política de privacidad</a>
          <a href="#">Términos y condiciones</a>
          <span className="text-blush">© {new Date().getFullYear()} Aurelle Professional Beauty</span>
        </div>
      </div>
      <div className="h-[72px] md:hidden" />
    </footer>
  );
}
