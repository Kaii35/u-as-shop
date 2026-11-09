import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext';
import { ThemeProvider } from './store/ThemeContext';
import { AdminAuthProvider, RequireAdmin } from './store/AdminAuth';
import { StoreLayout, CheckoutLayout, AuthShell } from './components/layout/Layouts';
import { ScrollManager } from './components/layout/ScrollManager';
import { CartDrawer } from './components/CartDrawer';
import { QuickView } from './components/QuickView';
import { PromoPopup } from './components/PromoPopup';
import { ToastViewport } from './components/ui/Toast';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import PaymentResult from './pages/PaymentResult';
import MockCheckout from './pages/MockCheckout';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import Favorites from './pages/Favorites';
import Legal from './pages/Legal';
import { features, usesApi } from './config/features';
/**
 * El panel se carga aparte y solo al entrar en /admin.
 *
 * Son unas seis mil lineas de tablas, formularios y graficas que a una clienta
 * de la tienda no le sirven de nada: importarlas de forma normal las metia en
 * el mismo archivo que la portada y se las hacia descargar a todo el mundo.
 */
const AdminLayout = lazy(() => import('./pages/Admin/AdminLayout'));
const AdminLogin = lazy(() => import('./pages/Admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/Admin/AdminOrders'));
const AdminPayments = lazy(() => import('./pages/Admin/AdminPayments'));
const AdminProducts = lazy(() => import('./pages/Admin/AdminProducts'));
const AdminInventory = lazy(() => import('./pages/Admin/AdminInventory'));
const AdminPromotions = lazy(() => import('./pages/Admin/AdminPromotions'));
const AdminSettings = lazy(() => import('./pages/Admin/AdminSettings'));

const ToProducts = () => <Navigate to="/admin/productos" replace />;

/** Lo que se ve mientras baja ese trozo. Suele durar un parpadeo. */
function AdminLoading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-sand">
      <p className="text-body text-mist">Cargando el panel…</p>
    </div>
  );
}

/**
 * La tienda y el panel comparten aplicación pero no contexto.
 *
 * `StoreProvider` (carrito, favoritos) envuelve solo la tienda, y
 * `AdminAuthProvider` solo el panel: mezclarlos haría que cada pantalla del
 * panel arrastrara el carrito de una clienta que no existe, y que la tienda
 * cargara la sesión de administración de quien no la tiene.
 */
export default function App() {
  return (
    /* El tema envuelve a los dos: es de la persona, no de la seccion, y asi no
       se reinicia al pasar de la tienda al panel, que son arboles distintos. */
    <ThemeProvider>
      <ScrollManager />
      <Routes>
        {/* Con el panel apagado (no hay API en este despliegue), cualquier
            /admin vuelve a la portada en vez de mostrar un login que no
            puede funcionar. */}
        {features.admin ? (
          <>
            <Route
              path="/admin/ingresar"
              element={
                <Suspense fallback={<AdminLoading />}>
                  <AdminAuthProvider>
                    <AdminLogin />
                  </AdminAuthProvider>
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <Suspense fallback={<AdminLoading />}>
                  <AdminAuthProvider>
                    <RequireAdmin>
                      <AdminLayout />
                    </RequireAdmin>
                  </AdminAuthProvider>
                </Suspense>
              }
            >
              {/* Con el panel reducido, resumen, pedidos, pagos, inventario y
                  ajustes siguen aquí pero mandan a Productos: el código no se
                  toca, solo deja de verse (ver `features.adminFull`). */}
              <Route index element={features.adminFull ? <AdminDashboard /> : <ToProducts />} />
              <Route path="pedidos" element={features.adminFull ? <AdminOrders /> : <ToProducts />} />
              <Route path="pagos" element={features.adminFull ? <AdminPayments /> : <ToProducts />} />
              <Route path="productos" element={<AdminProducts />} />
              <Route path="inventario" element={features.adminFull ? <AdminInventory /> : <ToProducts />} />
              <Route path="promociones" element={<AdminPromotions />} />
              <Route path="ajustes" element={features.adminFull ? <AdminSettings /> : <ToProducts />} />
            </Route>
          </>
        ) : (
          <Route path="/admin/*" element={<Navigate to="/" replace />} />
        )}

        <Route path="*" element={<Storefront />} />
      </Routes>
    </ThemeProvider>
  );
}

function Storefront() {
  return (
    <StoreProvider>
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<Home />} />
          <Route path="tienda" element={<Shop />} />
          <Route path="producto/:slug" element={<ProductPage />} />
          <Route path="favoritos" element={<Favorites />} />
          {features.auth && <Route path="cuenta" element={<Account />} />}
          <Route path="legal" element={<Navigate to="/legal/terminos" replace />} />
          <Route path="legal/:slug" element={<Legal />} />
        </Route>
        {/* Rutas apagadas en este lanzamiento: sin su <Route>, caen en el
            comodín del final y vuelven a la portada. */}
        {features.auth && (
          <Route element={<AuthShell />}>
            <Route path="ingresar" element={<Login />} />
            <Route path="registro" element={<Register />} />
          </Route>
        )}
        {features.cart && (
          <Route path="checkout" element={<CheckoutLayout />}>
            <Route index element={<Checkout />} />
          </Route>
        )}
        {/* El pago sigue siendo checkout: mismo marco minimo, sin header ni
            footer que distraigan de lo unico que importa en esas pantallas. */}
        {features.cart && (
          <Route path="pago" element={<CheckoutLayout />}>
            <Route path="respuesta" element={<PaymentResult />} />
            <Route path="simulado" element={<MockCheckout />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {features.cart && <CartDrawer />}
      <QuickView />
      {/* Las promociones salen de la API: sin ella no hay nada que anunciar. */}
      {usesApi && <PromoPopup />}
      <ToastViewport />
    </StoreProvider>
  );
}
