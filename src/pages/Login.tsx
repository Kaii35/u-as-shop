import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { media } from '../data/catalog';
import { isEmail } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { Button } from '../components/ui/Button';
import { Checkbox, Input } from '../components/ui/Input';
import { AuthLayout, Divider, GoogleButton } from './AuthLayout';

export default function Login() {
  const { login, notify } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/cuenta';
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; pass?: string }>({});

  const finish = (mail: string) => {
    // Reemplaza por tu API de autenticación
    login({ firstName: 'Valentina', lastName: 'Ríos', email: mail, phone: '3104821177' });
    notify({ title: 'Bienvenida de nuevo', description: 'Sesión iniciada correctamente' });
    navigate(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err: typeof errors = {};
    if (!isEmail(email)) err.email = 'Escribe un correo válido';
    if (pass.length < 6) err.pass = 'La contraseña debe tener al menos 6 caracteres';
    setErrors(err);
    if (Object.keys(err).length) return;
    setLoading(true);
    window.setTimeout(() => { setLoading(false); finish(email); }, 1200);
  };

  const forgot = () => {
    if (!isEmail(email)) return setErrors({ email: 'Escribe tu correo para enviarte el enlace' });
    setSent(true);
  };

  return (
    <AuthLayout
      image={media.login}
      aside={
        <div className="text-white">
          <p className="display text-h5 leading-snug text-balance">“Cada set que entrego empieza con un buen producto.”</p>
          <span className="mt-1.5 block text-meta font-semibold uppercase tracking-[.12em] text-white/60">Comunidad Aurelle Pro</span>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="mb-1 flex flex-col gap-1">
          <h1 className="display text-h3">Bienvenida de nuevo</h1>
          <p className="text-body text-ash">Entra con tu cuenta para ver tus pedidos y favoritos.</p>
        </div>
        <GoogleButton loading={loading} onClick={() => { setLoading(true); window.setTimeout(() => { setLoading(false); finish('valentina.rios@gmail.com'); }, 1000); }}>Continuar con Google</GoogleButton>
        <Divider>o con tu correo</Divider>
        <Input label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} error={errors.email} />
        <Input
          label="Contraseña"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setErrors({}); }}
          error={errors.pass}
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-mist transition-colors hover:text-ink">
              {show ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
            </button>
          }
        />
        <div className="flex items-center justify-between gap-3">
          <Checkbox checked={remember} onChange={setRemember}>Recordarme</Checkbox>
          <button type="button" onClick={forgot} className="cursor-pointer text-cap text-clay underline underline-offset-4">¿Olvidaste tu contraseña?</button>
        </div>
        {sent && <div role="status" className="flex items-center gap-2 rounded bg-sand px-3 py-2.5 text-cap text-clay"><Mail size={14} strokeWidth={2} /> Te enviamos un enlace para restablecer tu contraseña.</div>}
        <Button type="submit" size="lg" loading={loading}>{loading ? 'Iniciando sesión…' : 'Iniciar sesión'}</Button>
        <p className="text-center text-cap text-mist">¿Aún no tienes cuenta? <Link to="/registro" className="font-medium text-clay underline underline-offset-4">Crear cuenta</Link></p>
      </form>
    </AuthLayout>
  );
}
