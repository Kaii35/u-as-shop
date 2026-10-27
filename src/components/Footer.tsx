import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Facebook, Instagram, Music2, Youtube } from 'lucide-react';
import { categories } from '../data/catalog';
import { BUSINESS, fullAddress, whatsappUrl } from '../data/business';
import { isEmail } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { NAV_ITEMS } from './Header';
import { Logo } from './ui/Primitives';

const PAYMENTS = ['VISA', 'Mastercard', 'AMEX', 'PSE', 'Nequi', 'Daviplata'];
const SOCIAL = [
  { label: 'Instagram', Icon: Instagram },
  { label: 'TikTok', Icon: Music2 },
  { label: 'Facebook', Icon: Facebook },
  { label: 'YouTube', Icon: Youtube },
];
const HELP: Array<[string, string]> = [
  [`WhatsApp ${BUSINESS.whatsapp}`, whatsappUrl()],
  [BUSINESS.email, `mailto:${BUSINESS.email}`],
  ['Envíos y entregas', '/legal/envios'],
  ['Cambios, devoluciones y garantías', '/legal/cambios'],
];

export function Footer() {
  const { notify } = useStore();
  const [email, setEmail] = useState('');
  const subscribe = () => {
    if (!isEmail(email)) return notify({ title: 'Correo no válido', description: 'Revisa tu dirección de correo' });
    setEmail('');
    notify({ title: 'Suscripción confirmada', description: 'Revisa tu correo: te enviamos tu código' });
  };
  const col = 'flex flex-col gap-2 text-body';
  // Todo el pie va sobre `bg-slab`, la losa de contraste, que es oscura en los
  // dos temas: su texto es `on-slab`, ni blanco fijo ni `on-ink`.
  const head = 'text-meta font-semibold uppercase tracking-[.1em] text-on-slab/45';
  const link = 'text-on-slab/70 transition-colors hover:text-on-slab';

  return (
    <footer className="bg-slab text-on-slab">
      <div className="container-x grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="flex max-w-[340px] flex-col gap-3">
          <Logo light variante="apilado" size="sm" />
          <p className="text-body text-on-slab/70">
            Insumos profesionales para uñas, pestañas y cuidado personal. Envíos a toda Colombia.
          </p>
          <div className="flex gap-1.5 pt-1">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && subscribe()}
              placeholder="Tu correo"
              aria-label="Correo para el newsletter"
              className="h-10 min-w-0 flex-1 rounded border border-on-slab/20 bg-transparent px-3 text-body outline-none transition-colors placeholder:text-on-slab/40 focus:border-on-slab/50"
            />
            <button onClick={subscribe} aria-label="Suscribirme" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded bg-clay text-on-accent transition-colors hover:bg-clay-dark">
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="flex gap-1.5 pt-1">
            {SOCIAL.map(({ label, Icon }) => (
              <a key={label} href="#" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded border border-on-slab/20 text-on-slab/70 transition-colors hover:border-on-slab hover:text-on-slab">
                <Icon size={15} strokeWidth={2} />
              </a>
            ))}
          </div>
        </div>
        <div className={col}>
          <span className={head}>Comprar</span>
          {NAV_ITEMS.map((n) => <Link key={n.label} to={n.to} className={link}>{n.label}</Link>)}
        </div>
        <div className={col}>
          <span className={head}>Categorías</span>
          {categories.slice(0, 6).map((c) => <Link key={c.id} to={`/tienda?cat=${c.slug}`} className={link}>{c.name}</Link>)}
          <Link to="/tienda" className="text-clay-soft transition-colors hover:text-on-slab dark:text-clay">Ver todas</Link>
        </div>
        <div className={col}>
          <span className={head}>Ayuda</span>
          {HELP.map(([label, href]) =>
            href.startsWith('/')
              ? <Link key={label} to={href} className={link}>{label}</Link>
              : <a key={label} href={href} className={link} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{label}</a>,
          )}
          <span className="pt-1 text-meta text-on-slab/45">{BUSINESS.hours}</span>
          <span className="text-meta text-on-slab/45">{fullAddress}</span>
        </div>
      </div>

      <div className="container-x flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-on-slab/10 py-5">
        <div className="flex flex-wrap gap-1">
          {PAYMENTS.map((p) => (
            <span key={p} className="rounded-xs border border-on-slab/20 px-2 py-1 text-meta font-semibold text-on-slab/60">{p}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-meta text-on-slab/45">
          <Link to="/legal/terminos" className="transition-colors hover:text-on-slab">Términos</Link>
          <Link to="/legal/privacidad" className="transition-colors hover:text-on-slab">Privacidad</Link>
          <Link to="/legal/cookies" className="transition-colors hover:text-on-slab">Cookies</Link>
          <span>© {new Date().getFullYear()} {BUSINESS.name} · NIT {BUSINESS.nit}</span>
        </div>
      </div>
      {/* Deja sitio para la barra inferior fija de móvil. */}
      <div className="h-14 md:hidden" />
    </footer>
  );
}
