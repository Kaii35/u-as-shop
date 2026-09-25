import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext';
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
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import Favorites from './pages/Favorites';
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
const AdminProducts = lazy(() => import('./pages/Admin/AdminProducts'));
const AdminInventory = lazy(() => import('./pages/Admin/AdminInventory'));
const AdminPromotions = lazy(() => import('./pages/Admin/AdminPromotions'));
const AdminSettings = lazy(() => import('./pages/Admin/AdminSettings'));

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
    <>
      <ScrollManager />
      <Routes>
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
          <Route index element={<AdminDashboard />} />
          <Route path="pedidos" element={<AdminOrders />} />
          <Route path="productos" element={<AdminProducts />} />
          <Route path="inventario" element={<AdminInventory />} />
          <Route path="promociones" element={<AdminPromotions />} />
          <Route path="ajustes" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<Storefront />} />
      </Routes>
    </>
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
          <Route path="cuenta" element={<Account />} />
        </Route>
        <Route element={<AuthShell />}>
          <Route path="ingresar" element={<Login />} />
          <Route path="registro" element={<Register />} />
        </Route>
        <Route path="checkout" element={<CheckoutLayout />}>
          <Route index element={<Checkout />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CartDrawer />
      <QuickView />
      <PromoPopup />
      <ToastViewport />
    </StoreProvider>
  );
}
