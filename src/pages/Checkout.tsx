import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { banks, departments } from '../data/catalog';
import { cn, digits, formatCOP, isEmail, SHIPPING_COST, FREE_SHIPPING_FROM } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { CheckoutSummary } from '../components/CheckoutSummary';
import { Button } from '../components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '../components/ui/Input';
import type { PaymentMethod, ShippingMethod } from '../types';

interface Form {
  name: string; email: string; phone: string; docType: string; doc: string;
  dept: string; city: string; address: string; notes: string;
  ship: ShippingMethod; pay: PaymentMethod;
  cardNumber: string; cardName: string; cardExp: string; cardCvc: string; bank: string; wallet: string;
  terms: boolean;
}
type Errors = Partial<Record<keyof Form, string>>;

const STEPS = ['Contacto', 'Entrega', 'Envío', 'Pago', 'Confirmación'];
const NEXT_LABEL = ['Continuar a entrega', 'Continuar a envío', 'Continuar a pago', 'Revisar pedido'];

const PAY_OPTIONS: Array<{ id: PaymentMethod; label: string; desc: string }> = [
  { id: 'card', label: 'Tarjeta crédito o débito', desc: 'Visa, Mastercard, American Express, Diners' },
  { id: 'pse', label: 'PSE', desc: 'Débito desde tu cuenta bancaria' },
  { id: 'wallet', label: 'Nequi o Daviplata', desc: 'Aprueba el pago desde tu celular' },
  { id: 'cod', label: 'Pago contra entrega', desc: 'Efectivo al recibir · disponible en ciudades principales' },
];

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
  if (step === 4) {
    if (f.pay === 'card') {
      if (digits(f.cardNumber).length < 15) e.cardNumber = 'Número de tarjeta incompleto';
      if (f.cardName.trim().length < 3) e.cardName = 'Nombre como aparece en la tarjeta';
      if (!/^\d{2}\s?\/\s?\d{2}$/.test(f.cardExp)) e.cardExp = 'Formato MM/AA';
      if (digits(f.cardCvc).length < 3) e.cardCvc = 'CVC';
    }
    if (f.pay === 'pse' && !f.bank) e.bank = 'Selecciona tu banco';
    if (f.pay === 'wallet' && digits(f.wallet).length !== 10) e.wallet = 'Número de 10 dígitos';
  }
  if (step === 5 && !f.terms) e.terms = 'Debes aceptar los términos para continuar';
  return e;
}

export default function Checkout() {
  const { cart, user, totals, clearCart } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ number: string; total: number; name: string } | null>(null);
  const [f, setF] = useState<Form>({
    name: user ? `${user.firstName} ${user.lastName}` : '', email: user?.email ?? '', phone: user?.phone ?? '',
    docType: 'CC', doc: '', dept: '', city: '', address: '', notes: '', ship: 'std', pay: 'card',
    cardNumber: '', cardName: '', cardExp: '', cardCvc: '', bank: '', wallet: '', terms: false,
  });
  const t = totals(f.ship);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const bind = (k: keyof Form) => ({ value: f[k] as string, onChange: (e: { target: { value: string } }) => set(k, e.target.value as never), error: errors[k] });

  const next = () => {
    const e = validate(step, f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const place = () => {
    const e = validate(5, f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setPlacing(true);
    // Aquí se integraría la pasarela de pago (Wompi, PayU, Mercado Pago, ePayco…)
    window.setTimeout(() => {
      setPlaced({ number: `AU-${10500 + Math.floor(Math.random() * 400)}`, total: t.total, name: f.name.split(' ')[0] });
      clearCart();
      setPlacing(false);
      window.scrollTo({ top: 0 });
    }, 1400);
  };

  if (placed) {
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="container-x flex flex-col items-center gap-5 py-[clamp(40px,8vw,120px)] text-center">
        <span className="flex h-[92px] w-[92px] items-center justify-center rounded-full bg-wine text-ivory"><Check size={30} strokeWidth={1.2} /></span>
        <span className="text-[11px] font-medium uppercase tracking-[.24em] text-wine">Pedido {placed.number}</span>
        <h1 className="h-display text-[clamp(40px,5vw,72px)] tracking-[-.03em]">Gracias, <em className="text-wine">{placed.name}.</em></h1>
        <p className="max-w-[480px] text-[17px] font-light leading-relaxed">Recibimos tu pedido por {formatCOP(placed.total)}. Te enviamos la confirmación por correo y te avisaremos cuando salga hacia tu dirección.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2.5">
          <Button onClick={() => navigate(user ? '/cuenta' : '/ingresar')}>Ver mis pedidos</Button>
          <Button variant="secondary" onClick={() => navigate('/tienda')}>Seguir comprando</Button>
        </div>
      </motion.div>
    );
  }

  if (!cart.length) {
    return (
      <div className="flex flex-col items-center gap-4 px-5 py-24 text-center">
        <h1 className="font-display text-[40px]">Tu carrito está vacío</h1>
        <Link to="/tienda"><Button>Explorar productos</Button></Link>
      </div>
    );
  }

  return (
    <div className="container-x mx-auto max-w-[1320px] pb-[clamp(64px,7vw,110px)] pt-[clamp(24px,3vw,48px)]">
      <div className="grid items-start gap-[clamp(28px,4vw,64px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="order-1 lg:order-2"><CheckoutSummary totals={t} /></div>

        <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
          <ol className="flex items-center overflow-x-auto pb-1" aria-label="Pasos del checkout">
            {STEPS.map((label, i) => {
              const n = i + 1; const done = n < step; const on = n === step;
              return (
                <li key={label} className={cn('flex items-center', n < STEPS.length && 'flex-1')}>
                  <button type="button" onClick={() => done && setStep(n)} disabled={!done} aria-current={on ? 'step' : undefined} className="flex shrink-0 items-center gap-2.5 disabled:cursor-default">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-medium transition-colors',
                      on ? 'border-wine bg-wine text-ivory' : done ? 'border-ink bg-ink text-ivory' : 'border-ink/25 text-muted')}>
                      {done ? <Check size={14} strokeWidth={2} /> : n}
                    </span>
                    <span className={cn('text-[13.5px]', on ? 'text-ink' : 'text-muted', !on && 'max-sm:hidden')}>{label}</span>
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
                    {!user && <Link to="/ingresar" className="text-sm text-wine underline">¿Ya tienes cuenta? Inicia sesión</Link>}
                  </div>
                  <Input label="Nombre completo" placeholder="Nombre y apellidos" autoComplete="name" {...bind('name')} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Correo electrónico" type="email" placeholder="tu@correo.com" autoComplete="email" {...bind('email')} />
                    <Input label="Celular" type="tel" placeholder="300 000 0000" autoComplete="tel" {...bind('phone')} />
                  </div>
                  <div className="grid grid-cols-[minmax(120px,160px)_minmax(0,1fr)] gap-4">
                    <Select label="Documento" value={f.docType} onChange={(e) => set('docType', e.target.value)}>
                      <option value="CC">C.C.</option><option value="CE">C.E.</option><option value="NIT">NIT</option><option value="PA">Pasaporte</option>
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
                    ['std', 'Estándar', '3 a 5 días hábiles · Servientrega', t.net >= FREE_SHIPPING_FROM ? 'Gratis' : formatCOP(SHIPPING_COST.std)],
                    ['exp', 'Express', '24 a 48 horas en ciudades principales', formatCOP(SHIPPING_COST.exp)],
                    ['pick', 'Recoger en showroom', 'Bogotá · Usaquén, disponible en 2 horas', 'Gratis'],
                  ] as Array<[ShippingMethod, string, string, string]>).map(([id, label, desc, price]) => (
                    <OptionCard key={id} selected={f.ship === id} onSelect={() => set('ship', id)} label={label} desc={desc} aside={price} />
                  ))}
                </>
              )}

              {step === 4 && (
                <>
                  <StepTitle>Método de pago</StepTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PAY_OPTIONS.map((o) => <OptionCard key={o.id} selected={f.pay === o.id} onSelect={() => { set('pay', o.id); setErrors({}); }} label={o.label} desc={o.desc} />)}
                  </div>
                  <div className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-white p-6">
                    {f.pay === 'card' && (
                      <>
                        <Input label="Número de tarjeta" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" {...bind('cardNumber')} />
                        <Input label="Nombre en la tarjeta" autoComplete="cc-name" {...bind('cardName')} />
                        <div className="grid grid-cols-2 gap-4">
                          <Input label="Vencimiento" placeholder="MM/AA" autoComplete="cc-exp" {...bind('cardExp')} />
                          <Input label="CVC" inputMode="numeric" autoComplete="cc-csc" placeholder="123" {...bind('cardCvc')} />
                        </div>
                      </>
                    )}
                    {f.pay === 'pse' && (
                      <>
                        <Select label="Banco" {...bind('bank')}>
                          <option value="">Selecciona tu banco</option>
                          {banks.map((b) => <option key={b}>{b}</option>)}
                        </Select>
                        <p className="text-sm text-muted">Al confirmar te redirigiremos a PSE para autorizar el débito.</p>
                      </>
                    )}
                    {f.pay === 'wallet' && (
                      <>
                        <Input label="Número Nequi o Daviplata" type="tel" placeholder="300 000 0000" {...bind('wallet')} />
                        <p className="text-sm text-muted">Recibirás una notificación en tu app para aprobar el pago.</p>
                      </>
                    )}
                    {f.pay === 'cod' && <p className="text-[14.5px] leading-relaxed">Paga en efectivo al recibir tu pedido. Disponible en Bogotá, Medellín, Cali, Barranquilla, Bucaramanga y Pereira.</p>}
                    <span className="flex items-center gap-2 text-[12.5px] text-muted"><Lock size={16} strokeWidth={1.5} /> Tus datos se procesan de forma cifrada. No almacenamos tu tarjeta.</span>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <StepTitle>Revisa y confirma</StepTitle>
                  <dl className="flex flex-col border-t border-ink/10">
                    <ReviewRow label="Contacto" value={`${f.name} · ${f.email} · ${f.phone}`} onEdit={() => setStep(1)} />
                    <ReviewRow label="Entrega" value={`${f.address}, ${f.city} · ${f.dept}`} onEdit={() => setStep(2)} />
                    <ReviewRow label="Envío" value={{ std: 'Estándar', exp: 'Express', pick: 'Recoger en showroom' }[f.ship] + ` · ${t.shipping ? formatCOP(t.shipping) : 'Gratis'}`} onEdit={() => setStep(3)} />
                    <ReviewRow label="Pago" value={PAY_OPTIONS.find((o) => o.id === f.pay)!.label} onEdit={() => setStep(4)} />
                  </dl>
                  <Checkbox checked={f.terms} onChange={(v) => set('terms', v)}>
                    Acepto los términos y condiciones, la política de privacidad y el tratamiento de mis datos personales.
                  </Checkbox>
                  {errors.terms && <span role="alert" className="text-[12.5px] text-danger">{errors.terms}</span>}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {step > 1 ? (
              <Button variant="ghost" className="px-0" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} strokeWidth={1.5} /> Volver</Button>
            ) : (
              <Button variant="ghost" className="px-0" onClick={() => navigate('/tienda')}><ArrowLeft size={16} strokeWidth={1.5} /> Seguir comprando</Button>
            )}
            {step < 5 ? (
              <Button size="lg" className="min-w-[240px]" onClick={next}>{NEXT_LABEL[step - 1]} <ArrowRight size={16} strokeWidth={1.5} /></Button>
            ) : (
              <Button size="lg" className="min-w-[260px]" loading={placing} onClick={place}>
                {placing ? 'Procesando pago…' : `Confirmar pedido · ${formatCOP(t.total)}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[clamp(30px,3vw,40px)] leading-[1.05]">{children}</h2>;
}

function OptionCard({ selected, onSelect, label, desc, aside }: { selected: boolean; onSelect: () => void; label: string; desc: string; aside?: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={cn('flex items-center gap-4 rounded-2xl border p-5 text-left transition-colors', selected ? 'border-wine bg-white' : 'border-ink/15 hover:border-ink/40')}>
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-wine' : 'border-ink/30')}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-wine" />}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-[15.5px] font-medium">{label}</span>
        <span className="text-[13.5px] text-muted">{desc}</span>
      </span>
      {aside && <span className="text-[15px] font-medium text-wine">{aside}</span>}
    </button>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink/10 py-[18px]">
      <div className="flex flex-col gap-1">
        <dt className="label-xs">{label}</dt>
        <dd className="text-[15px]">{value}</dd>
      </div>
      <button onClick={onEdit} className="text-sm text-wine underline">Editar</button>
    </div>
  );
}
