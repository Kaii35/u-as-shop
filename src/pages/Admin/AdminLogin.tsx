import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../../store/AdminAuth';
import { useAction } from '../../lib/useResource';
import { isEmail } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormError } from '../../components/admin/Primitives';
import { AuthLayout } from '../AuthLayout';

/**
 * Entrada al panel.
 *
 * Reusa el `AuthLayout` de la tienda a propósito: es la misma casa y la misma
 * persona la que entra por las dos puertas. Lo único que cambia es el discurso
 * —aquí no se compra, se administra— y que no hay registro ni Google: las
 * cuentas del panel las crea otra administradora desde Ajustes.
 */

/** Sembradas por el `seed` del servidor. Solo se enseñan en desarrollo. */
const DEMO_EMAIL = 'admin@aurelle.co';
const DEMO_PASSWORD = 'aurelle-admin';

export default function AdminLogin() {
  const { user, checking, login } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [invalid, setInvalid] = useState<{ email?: string; password?: string }>({});

  // `useAction` nunca lanza: deja el texto del servidor en `error` para
  // pintarlo junto al botón. Un 401 aquí no es una excepción, es una respuesta.
  const { run, pending, error, clearError } = useAction(async (mail: string, pass: string) => {
    await login(mail, pass);
    return true;
  });

  // A dónde iba antes de que `RequireAdmin` la mandara aquí.
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  if (checking) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-sand">
        <p className="text-body text-mist">Verificando sesión…</p>
      </div>
    );
  }

  if (user) return <Navigate to="/admin" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();

    // Validación mínima en el cliente: solo lo que evita un viaje al servidor
    // que ya sabemos que va a fallar. Lo demás lo decide la API.
    const next: typeof invalid = {};
    if (!isEmail(email)) next.email = 'Escribe un correo válido';
    if (!password) next.password = 'Escribe tu contraseña';
    setInvalid(next);
    if (Object.keys(next).length > 0) return;

    const ok = await run(email.trim(), password);
    if (ok) navigate(from, { replace: true });
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-sand p-0 md:p-4">
      <AuthLayout
        reverse
        aside={
          <div className="text-white">
            <p className="display text-h5 leading-snug text-balance">
              Todo lo que cambies aquí se ve en la tienda al instante.
            </p>
            <span className="mt-1.5 block text-meta font-semibold uppercase tracking-[.12em] text-white/60">
              Panel de administración
            </span>
          </div>
        }
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <div className="mb-1 flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="display text-h4 leading-none tracking-[-.03em] text-ink">Aurelle</span>
              <span className="label-xs">Panel</span>
            </div>
            <h1 className="display mt-2 text-h3 text-ink">Entra al panel</h1>
            <p className="text-body text-ash">
              Desde aquí manejas pedidos, inventario, precios y promociones.
            </p>
          </div>

          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="tu@aurelle.co"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setInvalid({});
              clearError();
            }}
            error={invalid.email}
          />

          <Input
            label="Contraseña"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setInvalid({});
              clearError();
            }}
            error={invalid.password}
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-mist transition-colors hover:text-ink"
              >
                {show ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
              </button>
            }
          />

          {/* El error de credenciales vive junto al formulario, no en un aviso
              flotante: es aquí donde hay que corregir, y un toast se va solo. */}
          <FormError message={error} />

          <Button type="submit" size="lg" loading={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>

          <p className="flex items-start gap-1.5 text-cap text-mist">
            <ShieldCheck size={13} strokeWidth={2} className="mt-px shrink-0" />
            La sesión dura 12 horas. Después hay que volver a entrar.
          </p>

          {import.meta.env.DEV && (
            <div className="mt-1 rounded border border-line bg-sand px-3 py-2.5">
              <p className="label-xs">Solo en desarrollo</p>
              <p className="tnum mt-1 text-cap text-ash">
                {DEMO_EMAIL} · {DEMO_PASSWORD}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmail(DEMO_EMAIL);
                  setPassword(DEMO_PASSWORD);
                  setInvalid({});
                  clearError();
                }}
                className="mt-1.5 cursor-pointer text-cap font-medium text-clay underline underline-offset-4"
              >
                Rellenar con estas credenciales
              </button>
            </div>
          )}
        </form>
      </AuthLayout>
    </div>
  );
}
