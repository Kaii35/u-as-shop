import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, setToken, setUnauthorizedHandler, getToken } from '../lib/api';
import type { AdminUser } from '../lib/admin-types';

/**
 * Sesión del panel.
 *
 * El token vive en `localStorage` pero NO se confía en él: al arrancar se
 * valida contra `/api/admin/me`. Un token vencido o firmado con otro secreto
 * dejaría el panel pintado como si hubiera sesión y fallando en cada consulta,
 * que es mucho peor que mandar a la pantalla de entrada.
 */
interface AdminAuthValue {
  user: AdminUser | null;
  /** `true` mientras se comprueba el token guardado. */
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Cualquier 401 de cualquier pantalla cierra la sesión. Se registra una vez
  // aquí en vez de repetir el manejo en cada página.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    let alive = true;
    api
      .get<{ user: AdminUser }>('/api/admin/me')
      .then((data) => {
        if (alive) setUser(data.user);
      })
      .catch(() => {
        // Incluye el caso de la API apagada. Sin poder verificar, se trata
        // como sin sesión: es lo seguro.
        if (alive) setToken(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: AdminUser }>('/api/admin/login', {
      email,
      password,
    });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ user, checking, login, logout }),
    [user, checking, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de <AdminAuthProvider>');
  return ctx;
}

/**
 * Envuelve las rutas del panel.
 *
 * Esto es comodidad, no seguridad: quien quiera puede saltárselo desde la
 * consola del navegador. Lo que de verdad protege los datos es que cada ruta
 * de la API exige el token firmado.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, checking } = useAdminAuth();
  const location = useLocation();

  if (checking) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-sand">
        <p className="text-body text-mist">Verificando sesión…</p>
      </div>
    );
  }

  // `state` guarda a dónde iba, para devolverle ahí después de entrar en vez
  // de soltarle siempre en el resumen.
  if (!user) return <Navigate to="/admin/ingresar" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}
