import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff } from 'lucide-react';
import { media } from '../data/catalog';
import { cn, isEmail } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { Button } from '../components/ui/Button';
import { Checkbox, Input } from '../components/ui/Input';
import { AuthLayout, Divider, GoogleButton } from './AuthLayout';

type Field = 'first' | 'last' | 'email' | 'phone' | 'pass' | 'pass2';
const STRENGTH = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
const STRENGTH_COLOR = ['bg-danger', 'bg-warn', 'bg-[#8C9A5B]', 'bg-ok'];

export default function Register() {
  const { login, notify } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState<Record<Field, string>>({ first: '', last: '', email: '', phone: '', pass: '', pass2: '' });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | 'terms', string>>>({});

  const score = Number(f.pass.length >= 8) + Number(/[A-Z]/.test(f.pass)) + Number(/\d/.test(f.pass)) + Number(/[^A-Za-z0-9]/.test(f.pass));
  const bind = (k: Field) => ({ value: f[k], onChange: (e: { target: { value: string } }) => { setF((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); }, error: errors[k] });

  const done = (first: string, last: string, email: string, phone?: string) => {
    login({ firstName: first, lastName: last, email, phone });
    notify({ title: 'Cuenta creada', description: `Bienvenida a Aurelle, ${first}` });
    navigate('/cuenta');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err: typeof errors = {};
    if (!f.first.trim()) err.first = 'Requerido';
    if (!f.last.trim()) err.last = 'Requerido';
    if (!isEmail(f.email)) err.email = 'Escribe un correo válido';
    if (score < 3) err.pass = 'Usa 8+ caracteres con mayúscula y número';
    if (!f.pass2 || f.pass2 !== f.pass) err.pass2 = 'Las contraseñas no coinciden';
    if (!terms) err.terms = 'Acepta los términos para crear tu cuenta';
    setErrors(err);
    if (Object.keys(err).length) return;
    setLoading(true);
    window.setTimeout(() => { setLoading(false); done(f.first, f.last, f.email, f.phone || undefined); }, 1300);
  };

  const eye = (
    <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="flex h-10 w-10 items-center justify-center text-mist">
      {show ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
    </button>
  );

  return (
    <AuthLayout
      reverse
      image={media.register}
      aside={
        <div className="flex flex-col gap-3 rounded-lg bg-white/95 px-7 py-[26px]">
          <span className="text-meta font-medium uppercase tracking-[.2em] text-clay">Beneficios de tu cuenta</span>
          {['10% en tu primera compra', 'Seguimiento de pedidos en tiempo real', 'Favoritos y direcciones guardadas'].map((b) => (
            <span key={b} className="flex items-center gap-2.5 text-body"><Check size={16} strokeWidth={1.5} className="text-clay" />{b}</span>
          ))}
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <span className="kicker">Nueva cuenta</span>
        <h1 className="display text-h3">Únete a <em className="text-clay">Aurelle</em></h1>
        <GoogleButton loading={loading} onClick={() => done('Valentina', 'Ríos', 'valentina.rios@gmail.com')}>Registrarme con Google</GoogleButton>
        <Divider>o con tu correo</Divider>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" autoComplete="given-name" {...bind('first')} />
          <Input label="Apellido" autoComplete="family-name" {...bind('last')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@correo.com" {...bind('email')} />
          <Input label="Teléfono" hint="Opcional" type="tel" autoComplete="tel" placeholder="300 000 0000" {...bind('phone')} />
        </div>
        <div className="flex flex-col gap-2">
          <Input label="Contraseña" type={show ? 'text' : 'password'} autoComplete="new-password" trailing={eye} {...bind('pass')} />
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <span key={i} className={cn('h-[3px] flex-1 rounded-full transition-colors', i < score ? STRENGTH_COLOR[score - 1] : 'bg-ink/10')} />)}
          </div>
          <span className="text-cap text-mist">{f.pass ? STRENGTH[score] : 'Mínimo 8 caracteres, una mayúscula y un número'}</span>
        </div>
        <Input label="Confirmar contraseña" type={show ? 'text' : 'password'} autoComplete="new-password" {...bind('pass2')} />
        <div className="flex flex-col gap-1.5">
          <Checkbox checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, terms: undefined })); }}>
            Acepto los términos y condiciones y la política de tratamiento de datos.
          </Checkbox>
          {errors.terms && <span role="alert" className="text-cap text-danger">{errors.terms}</span>}
        </div>
        <Button type="submit" size="lg" loading={loading}>{loading ? 'Creando tu cuenta…' : 'Crear cuenta'}</Button>
        <p className="text-center text-body">¿Ya tienes cuenta? <Link to="/ingresar" className="font-medium text-clay underline">Iniciar sesión</Link></p>
      </form>
    </AuthLayout>
  );
}
