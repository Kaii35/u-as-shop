import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { CreditCard, Headset, MapPin, MessageCircle, ShieldCheck, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUSINESS, whatsappUrl } from '../data/business';
import { BRAND_LOGOS } from '../data/brandLogos';
import { FREE_SHIPPING_FROM, cn, formatCOP } from '../lib/utils';

/**
 * "Por qué comprar aquí", en cuatro tarjetas que muestran la promesa en vez de
 * ilustrarla con una foto de banco:
 *   - Envíos: el monto del envío gratis en grande y un camión que recorre la ruta.
 *   - Pagos: los medios reales de la pasarela, flotando.
 *   - Original: los logos de las marcas que distribuimos, en carrusel.
 *   - Asesoría: un chat de WhatsApp que se escribe solo al entrar en pantalla.
 *
 * Va sobre `slab`, que es oscura en los dos temas. El acento es `clay-soft` en
 * claro y `clay` en oscuro: en los dos casos es el rosa que se lee sobre slab.
 */

const ACCENT = 'text-clay-soft dark:text-clay';
const ACCENT_BG = 'bg-clay-soft dark:bg-clay';

const PAYMENTS = ['Visa', 'Mastercard', 'PSE', 'Nequi', 'Daviplata', 'American Express', 'Bancolombia'];

const CHAT: Array<{ me: boolean; text: string }> = [
  { me: true, text: '¿Qué base me recomiendas para uñas débiles? 💅' },
  { me: false, text: 'Una rubber: es flexible y refuerza. Te paso las que tenemos ✨' },
  { me: true, text: '¡Perfecto, gracias!' },
];

const tile: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.1 } }),
};

function Tile({ i, className, kicker, icon, title, detail, children, big }: {
  i: number; className?: string; kicker: string; icon: ReactNode; title: string; detail: string; children: ReactNode; big?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      custom={i}
      variants={tile}
      initial={reduce ? 'show' : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className={cn(
        'group relative flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-on-slab/10 bg-on-slab/[0.04] p-5 md:p-6',
        'transition-colors duration-300 hover:border-on-slab/25 hover:bg-on-slab/[0.07]',
        className,
      )}
    >
      {/* Halo de acento que sigue al cursor de forma aproximada: crece al pasar. */}
      <span aria-hidden className={cn('pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl transition-transform duration-700 group-hover:scale-150', ACCENT_BG)} />
      <div className="relative z-10 flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full border border-on-slab/15', ACCENT)}>{icon}</span>
        <span className="text-meta font-semibold uppercase tracking-[.16em] text-on-slab/55">{kicker}</span>
      </div>
      <div className="relative z-10 mt-3 flex flex-col gap-1">
        <h3 className={cn('display leading-tight text-on-slab', big ? 'text-h2 md:text-[3.5rem] md:leading-[1.05]' : 'text-h4 md:text-h3')}>{title}</h3>
        <p className="max-w-[40ch] text-body text-on-slab/60">{detail}</p>
      </div>
      <div className="relative z-10 mt-auto pt-5">{children}</div>
    </motion.article>
  );
}

/** Ruta punteada con un camión que la recorre en bucle. */
function Route() {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-cap text-on-slab/70"><MapPin size={13} /> Caldas</span>
      <div className="relative h-8 flex-1">
        <span aria-hidden className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-on-slab/20" />
        {/* Se mueve con `transform` (barato) y no con `left` (obliga a
            recalcular el diseño en cada fotograma). El carril mide el ancho
            de la pista menos el camión, así 100% lo deja justo al final. */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 right-8"
          initial={{ x: reduce ? '50%' : '0%' }}
          animate={reduce ? { x: '50%' } : { x: ['0%', '100%'] }}
          transition={reduce ? undefined : { duration: 3.2, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse', repeatDelay: 0.6 }}
        >
          <span className={cn('absolute left-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slab shadow-lg', ACCENT_BG)}>
            <Truck size={15} strokeWidth={2} />
          </span>
        </motion.div>
      </div>
      <span className="flex items-center gap-1.5 text-cap text-on-slab/70"><MapPin size={13} /> Toda Colombia</span>
    </div>
  );
}

function PaymentChips() {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-wrap gap-2">
      {PAYMENTS.map((p, k) => (
        <motion.span
          key={p}
          className="rounded-full border border-on-slab/15 bg-on-slab/[0.06] px-3 py-1.5 text-cap font-medium text-on-slab/85"
          animate={reduce ? undefined : { y: [0, -4, 0] }}
          transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: k * 0.25 }}
        >
          {p}
        </motion.span>
      ))}
    </div>
  );
}

/** Carrusel infinito de logos: la lista va duplicada y se desplaza la mitad. */
function LogoMarquee() {
  const reduce = useReducedMotion();
  const row = [...BRAND_LOGOS, ...BRAND_LOGOS];
  return (
    <div className="relative -mx-5 overflow-hidden md:-mx-6 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <motion.div
        className="flex w-max gap-2.5 px-5"
        animate={reduce ? undefined : { x: ['0%', '-50%'] }}
        transition={reduce ? undefined : { duration: 22, ease: 'linear', repeat: Infinity }}
      >
        {row.map((b, k) => (
          // tema-ok: pastilla clara para logos oficiales hechos para fondo claro
          <span key={`${b.slug}-${k}`} className="flex h-14 w-[120px] shrink-0 items-center justify-center rounded-lg bg-white px-3">
            <img src={`/images/brands/${b.file}`} alt="" loading="lazy" className="max-h-9 w-auto max-w-full object-contain" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/** Chat de WhatsApp: las burbujas aparecen en orden cuando la tarjeta entra en pantalla. */
function Chat() {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg bg-on-slab/[0.05] p-3">
        {CHAT.map((m, k) => (
          <motion.span
            key={k}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + k * 0.9, duration: 0.35 }}
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2 text-cap leading-snug',
              m.me ? 'self-end rounded-br-sm bg-on-slab/15 text-on-slab' : cn('self-start rounded-bl-sm text-slab', ACCENT_BG),
            )}
          >
            {m.text}
          </motion.span>
        ))}
      </div>
      <a
        href={whatsappUrl('Hola, quiero asesoría con un producto.')}
        target="_blank"
        rel="noreferrer"
        className={cn('inline-flex h-11 items-center justify-center gap-2 self-start rounded-full px-5 text-body font-semibold text-slab transition-transform duration-300 hover:scale-[1.03]', ACCENT_BG)}
      >
        <MessageCircle size={16} strokeWidth={2} /> Escríbenos · {BUSINESS.whatsapp}
      </a>
    </div>
  );
}

export function PromisesBento() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile
        i={0}
        className="md:col-span-2"
        kicker="Envíos"
        icon={<Truck size={16} strokeWidth={2} />}
        title={`Gratis desde ${formatCOP(FREE_SHIPPING_FROM)}`}
        detail="A toda Colombia. Despachamos en 24 h hábiles y hay express en ciudades principales."
        big
      >
        <Route />
      </Tile>
      <Tile
        i={1}
        kicker="Pagos"
        icon={<CreditCard size={16} strokeWidth={2} />}
        title="Paga como prefieras"
        detail="Pasarela segura de Wompi. Nunca vemos los datos de tu tarjeta."
      >
        <PaymentChips />
      </Tile>
      <Tile
        i={2}
        kicker="Garantía"
        icon={<ShieldCheck size={16} strokeWidth={2} />}
        title="Producto original"
        detail="Marcas reconocidas y garantía legal en cada compra."
      >
        <LogoMarquee />
      </Tile>
      <Tile
        i={3}
        className="md:col-span-2"
        kicker="Asesoría"
        icon={<Headset size={16} strokeWidth={2} />}
        title="Te asesoramos de verdad"
        detail="Por WhatsApp, de lunes a sábado. Te ayudamos a elegir el producto y a usarlo."
      >
        <Chat />
      </Tile>
    </div>
  );
}
