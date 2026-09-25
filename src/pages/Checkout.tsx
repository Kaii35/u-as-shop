import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Lock, RefreshCw } from 'lucide-react';
import { departments, getProduct } from '../data/catalog';
import { cn, digits, formatCOP, isEmail, variantLabel, SHIPPING_COST, FREE_SHIPPING_FROM, type Totals } from '../lib/utils';
import { ApiError } from '../lib/api';
import { createPaymentIntent, rememberPaymentReference, type PaymentIntentResponse } from '../lib/payments';
import { useStore } from '../store/StoreContext';
import { CheckoutSummary } from '../components/CheckoutSummary';
import { Button } from '../components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '../components/ui/Input';
import type { ShippingMethod } from '../types';

interface Form {
  name: string; email: string; phone: string; docType: string; doc: string;
  dept: string; city: string; address: string; notes: string;
  ship: ShippingMethod;
  terms: boolean;
}
type Errors = Partial<Record<keyof Form, string>>;

const STEPS = ['Contacto', 'Entrega', 'Envío', 'Pago', 'Confirmación'];
const NEXT_LABEL = ['Continuar a entrega', 'Continuar a envío', 'Continuar a pago', 'Revisar pedido'];

/**
 * Medios disponibles, solo informativos: con un checkout alojado la clienta
 * elige y paga en la pasarela. Pedirle aquí el número de tarjeta sería teatro
 * —no viajaría a ninguna parte— y nos dejaría datos de tarjeta en las manos.
 */
const PAY_METHODS = [
  'Tarjeta de crédito o débito · Visa, Mastercard, American Express, Diners',
  'PSE · débito desde tu cuenta bancaria',
  'Nequi o Daviplata · apruebas desde tu celular',
  'Bancolombia · botón de transferencia',
];

const SHIP_LABEL: Record<ShippingMethod, string> = { std: 'Estándar', exp: 'Express', pick: 'Recoger en showroom' };

function validate(step: number, f: Form): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (f.name.trim().length < 3) e.name = 'Escribe tu nombre completo';
    if (!isEmail(f.email)) e.email = 'Correo no válido';
    if (digits(f.phone).length !== 10) e.phone = 'Celular de 10 dígitos';
    if (digits(f.doc).length < 6) e.doc = 'Número de documento no válido';
  }
  if (step === 2) {
    if (!f.dept) e.dept = 'Selecciona un departamento';
    if (f.city.trim().length < 3) e.city = 'Escribe la ciudad o municipio';
    if (f.address.trim().length < 6) e.address = 'Escribe la dirección completa';
  }
  if (step === 5 && !f.terms) e.terms = 'Debes aceptar los términos para continuar';
  return e;
}

/**
 * Salida hacia la pasarela.
 *
 * Se redirige la pestaña entera, nunca un iframe: las pasarelas lo bloquean
 * con cabeceras y, sobre todo, un iframe esconde la barra de direcciones, que
 * es justo donde la clienta comprueba que está pagando en un sitio legítimo.
 */
const goToGateway = (checkoutUrl: string) => window.location.assign(checkoutUrl);

export default function Checkout() {
  const { cart, user, coupon, totals } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [placing, setPlacing] = useState(false);
  /** Mensaje junto al botón. `retry` solo cuando reintentar puede servir de algo. */
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null);
  /** Intento ya creado cuyo total no coincide con el que habíamos pintado. */
  const [repriced, setRepriced] = useState<PaymentIntentResponse | null>(null);
  const [f, setF] = useState<Form>({
    name: user ? `${user.firstName} ${user.lastName}` : '', email: user?.email ?? '', phone: user?.phone ?? '',
    docType: 'CC', doc: '', dept: '', city: '', address: '', notes: '', ship: 'std',
    terms: false,
  });
  const t = totals(f.ship);

  /**
   * El total de esta pantalla es informativo: el que se cobra es el que
   * recalcula el servidor al abrir el intento, con sus precios y su stock.
   * Si difieren, manda el del servidor y es el que se pinta.
   */
  const shown: Totals = repriced
    ? { ...t, ...repriced.totals, net: repriced.totals.subtotal - repriced.totals.discount }
    : t;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const bind = (k: keyof Form) => ({ value: f[k] as string, onChange: (e: { target: { value: string } }) => set(k, e.target.value as never), error: errors[k] });

  const next = () => {
    const e = validate(step, f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const place = async () => {
    const e = validate(5, f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setFailure(null);
    setPlacing(true);
    try {
      const intent = await createPaymentIntent({
        items: cart.map((l) => {
          const p = getProduct(l.productId);
          const variant = p ? variantLabel(p, l.shade, l.size) : '';
          return { productId: l.productId, quantity: l.qty, ...(variant ? { variant } : {}) };
        }),
        customer: {
          name: f.name.trim(),
          email: f.email.trim(),
          phone: digits(f.phone),
          legalIdType: f.docType,
          legalId: digits(f.doc),
        },
        shipping: { line1: f.address.trim(), city: f.city.trim(), region: f.dept, country: 'CO' },
        ...(coupon ? { couponCode: coupon } : {}),
        shippingMethod: f.ship,
      });

      // Antes de irse: si vuelve sin nada en la URL, esto es lo único que
      // permite recuperar el hilo del cobro.
      rememberPaymentReference(intent.reference);

      // El carrito NO se vacía aquí. Se vacía cuando el pago se confirme
      // aprobado: si el banco rechaza y la clienta vuelve, tiene que
      // encontrar su carrito intacto para reintentar.

      if (intent.totals.total !== t.total) {
        // Nadie sale hacia la pasarela con un precio distinto del que aceptó.
        setRepriced(intent);
        setPlacing(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      goToGateway(intent.checkoutUrl);
    } catch (err) {
      setPlacing(false);
      if (err instanceof ApiError) {
        // El 409 dice qué referencia se quedó sin unidades: se muestra tal
        // cual, porque el servidor sabe qué falta y nosotros no.
        setFailure({ message: err.message, retry: err.status === 0 || err.status >= 500 });
        return;
      }
      setFailure({ message: 'No pudimos iniciar el pago. Revisa tu conexión e inténtalo de nuevo.', retry: true });
    }
  };

  if (!cart.length) {
    return (
      <div className="flex flex-col items-center gap-4 px-5 py-24 text-center">
        <h1 className="display text-h4">Tu carrito está vacío</h1>
        <Link to="/tienda"><Button>Explorar productos</Button></Link>
      </div>
    );
  }

  return (
    <div className="container-x mx-auto max-w-[1320px] pb-[clamp(64px,7vw,110px)] pt-[clamp(24px,3vw,48px)]">
      <div className="grid items-start gap-[clamp(28px,4vw,64px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="order-1 lg:order-2"><CheckoutSummary totals={shown} /></div>

        <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
          <ol className="flex items-center overflow-x-auto pb-1" aria-label="Pasos del checkout">
            {STEPS.map((label, i) => {
              const n = i + 1; const done = n < step; const on = n === step;
              return (
                <li key={label} className={cn('flex items-center', n < STEPS.length && 'flex-1')}>
                  <button type="button" onClick={() => done && setStep(n)} disabled={!done} aria-current={on ? 'step' : undefined} className="flex shrink-0 items-center gap-2.5 disabled:cursor-default">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-full border text-cap font-medium transition-colors',
                      on ? 'border-clay bg-clay text-white' : done ? 'border-ink bg-ink text-white' : 'border-line text-mist')}>
                      {done ? <Check size={14} strokeWidth={2} /> : n}
                    </span>
                    <span className={cn('text-cap', on ? 'text-ink' : 'text-mist', !on && 'max-sm:hidden')}>{label}</span>
                  </button>
                  {n < STEPS.length && <span className={cn('mx-3 h-px min-w-6 flex-1', done ? 'bg-ink' : 'bg-ink/15')} />}
                </li>
              );
            })}
          </ol>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="flex flex-col gap-5">
              {step === 1 && (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <StepTitle>Información de contacto</StepTitle>
                    {!user && <Link to="/ingresar" className="text-body text-clay underline">¿Ya tienes cuenta? Inicia sesión</Link>}
                  </div>
                  <Input label="Nombre completo" placeholder="Nombre y apellidos" autoComplete="name" {...bind('name')} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Correo electrónico" type="email" placeholder="tu@correo.com" autoComplete="email" {...bind('email')} />
                    <Input label="Celular" type="tel" placeholder="300 000 0000" autoComplete="tel" {...bind('phone')} />
                  </div>
                  <div className="grid grid-cols-[minmax(120px,160px)_minmax(0,1fr)] gap-4">
                    <Select label="Documento" value={f.docType} onChange={(e) => set('docType', e.target.value)}>
                      {/* Los valores son los que acepta la pasarela; `PP` es pasaporte. */}
                      <option value="CC">C.C.</option><option value="CE">C.E.</option><option value="NIT">NIT</option><option value="PP">Pasaporte</option>
                    </Select>
                    <Input label="Número" placeholder="Para la factura electrónica" inputMode="numeric" {...bind('doc')} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepTitle>Dirección de entrega</StepTitle>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Departamento" {...bind('dept')}>
                      <option value="">Selecciona</option>
                      {departments.map((d) => <option key={d}>{d}</option>)}
                    </Select>
                    <Input label="Ciudad o municipio" placeholder="Ej. Medellín" autoComplete="address-level2" {...bind('city')} />
                  </div>
                  <Input label="Dirección" placeholder="Calle 10 # 43A-20, apto 502" autoComplete="street-address" {...bind('address')} />
                  <Textarea label="Indicaciones para la entrega" hint="Opcional · barrio, torre, horario" rows={3} {...bind('notes')} />
                </>
              )}

              {step === 3 && (
                <>
                  <StepTitle>Método de envío</StepTitle>
                  {([
                    ['std', SHIP_LABEL.std, '3 a 5 días hábiles · Servientrega', t.net >= FREE_SHIPPING_FROM ? 'Gratis' : formatCOP(SHIPPING_COST.std)],
                    ['exp', SHIP_LABEL.exp, '24 a 48 horas en ciudades principales', formatCOP(SHIPPING_COST.exp)],
                    ['pick', SHIP_LABEL.pick, 'Bogotá · Usaquén, disponible en 2 horas', 'Gratis'],
                  ] as Array<[ShippingMethod, string, string, string]>).map(([id, label, desc, price]) => (
                    <OptionCard key={id} selected={f.ship === id} onSelect={() => set('ship', id)} label={label} desc={desc} aside={price} />
                  ))}
                </>
              )}

              {step === 4 && (
                <>
                  <StepTitle>Cómo vas a pagar</StepTitle>
                  <p className="text-body leading-relaxed text-ash">
                    Al confirmar te llevamos a la pasarela de pagos, donde eliges el medio y autorizas el cobro.
                    Verás la dirección del sitio en la barra de tu navegador y volverás aquí con el resultado.
                  </p>
                  <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-6">
                    <span className="label-xs">Medios disponibles</span>
                    <ul className="flex flex-col gap-2">
                      {PAY_METHODS.map((m) => (
                        <li key={m} className="flex items-start gap-2.5 text-body text-ash">
                          <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-clay" />
                          {m}
                        </li>
                      ))}
                    </ul>
                    <span className="flex items-center gap-2 text-cap text-mist">
                      <Lock size={16} strokeWidth={1.5} /> Nunca vemos ni guardamos los datos de tu tarjeta.
                    </span>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <StepTitle>Revisa y confirma</StepTitle>
                  <dl className="flex flex-col border-t border-line">
                    <ReviewRow label="Contacto" value={`${f.name} · ${f.email} · ${f.phone}`} onEdit={() => setStep(1)} />
                    <ReviewRow label="Entrega" value={`${f.address}, ${f.city} · ${f.dept}`} onEdit={() => setStep(2)} />
                    <ReviewRow label="Envío" value={`${SHIP_LABEL[f.ship]} · ${shown.shipping ? formatCOP(shown.shipping) : 'Gratis'}`} onEdit={() => setStep(3)} />
                    <ReviewRow label="Pago" value="Eliges el medio en la pasarela segura" onEdit={() => setStep(4)} />
                  </dl>
                  <Checkbox checked={f.terms} onChange={(v) => set('terms', v)}>
                    Acepto los términos y condiciones, la política de privacidad y el tratamiento de mis datos personales.
                  </Checkbox>
                  {errors.terms && <span role="alert" className="text-cap text-danger">{errors.terms}</span>}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {repriced && (
            <p role="status" className="flex items-start gap-2.5 rounded border border-line bg-sand p-4 text-body text-ash">
              <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-clay" />
              <span>Actualizamos el precio de tu pedido: el total ahora es <strong className="tnum font-semibold text-ink">{formatCOP(repriced.totals.total)}</strong>. Revísalo y continúa cuando quieras.</span>
            </p>
          )}

          {failure && (
            <p role="alert" className="flex items-start gap-2.5 rounded border border-danger/40 bg-white p-4 text-body text-danger">
              <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" />
              <span>{failure.message}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {step > 1 ? (
              <Button variant="ghost" className="px-0" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} strokeWidth={1.5} /> Volver</Button>
            ) : (
              <Button variant="ghost" className="px-0" onClick={() => navigate('/tienda')}><ArrowLeft size={16} strokeWidth={1.5} /> Seguir comprando</Button>
            )}
            {step < 5 ? (
              <Button size="lg" className="min-w-[240px]" onClick={next}>{NEXT_LABEL[step - 1]} <ArrowRight size={16} strokeWidth={1.5} /></Button>
            ) : repriced ? (
              // El intento ya está creado: se reutiliza su checkoutUrl en vez de abrir otro.
              <Button size="lg" className="min-w-[260px]" onClick={() => goToGateway(repriced.checkoutUrl)}>
                Ir a pagar · {formatCOP(repriced.totals.total)} <ArrowRight size={16} strokeWidth={1.5} />
              </Button>
            ) : (
              <Button size="lg" className="min-w-[260px]" loading={placing} onClick={() => void place()}>
                {placing ? 'Abriendo el pago…' : failure?.retry ? <><RefreshCw size={16} strokeWidth={1.5} /> Reintentar</> : `Ir a pagar · ${formatCOP(t.total)}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ children }: { children: ReactNode }) {
  return <h2 className="display text-h4 leading-[1.05]">{children}</h2>;
}

function OptionCard({ selected, onSelect, label, desc, aside }: { selected: boolean; onSelect: () => void; label: string; desc: string; aside?: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={cn('flex items-center gap-4 rounded-lg border p-5 text-left transition-colors', selected ? 'border-clay bg-white' : 'border-line hover:border-ink/40')}>
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-clay' : 'border-line')}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-clay" />}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-body font-medium">{label}</span>
        <span className="text-cap text-mist">{desc}</span>
      </span>
      {aside && <span className="text-body font-medium text-clay">{aside}</span>}
    </button>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-[18px]">
      <div className="flex flex-col gap-1">
        <dt className="label-xs">{label}</dt>
        <dd className="text-body">{value}</dd>
      </div>
      <button onClick={onEdit} className="text-body text-clay underline">Editar</button>
    </div>
  );
}
