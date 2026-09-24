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
        <div className="rounded-[20px] bg-wine/95 px-7 py-[26px] text-ivory">
          <p className="mb-3 font-display text-[clamp(22px,2vw,28px)] italic leading-tight">“Cada set que entrego empieza con un buen producto.”</p>
          <span className="text-[11px] font-medium uppercase tracking-[.2em] text-blush">Comunidad Aurelle Pro</span>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <span className="eyebrow">Mi cuenta</span>
        <h1 className="h-display text-[clamp(40px,4.4vw,60px)] tracking-[-.03em]">Bienvenida <em className="text-wine">de nuevo</em></h1>
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
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="flex h-10 w-10 items-center justify-center text-muted">
              {show ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
            </button>
          }
        />
        <div className="-mt-1.5 flex items-center justify-between gap-3">
          <Checkbox checked={remember} onChange={setRemember}>Recordarme</Checkbox>
          <button type="button" onClick={forgot} className="text-sm text-wine underline">¿Olvidaste tu contraseña?</button>
        </div>
        {sent && <div role="status" className="flex items-center gap-2.5 rounded-xl bg-nude px-4 py-3.5 text-sm text-wine"><Mail size={16} strokeWidth={1.5} /> Te enviamos un enlace para restablecer tu contraseña.</div>}
        <Button type="submit" size="lg" loading={loading}>{loading ? 'Iniciando sesión…' : 'Iniciar sesión'}</Button>
        <p className="text-center text-[14.5px]">¿Aún no tienes cuenta? <Link to="/registro" className="font-medium text-wine underline">Crear cuenta</Link></p>
      </form>
    </AuthLayout>
  );
}
