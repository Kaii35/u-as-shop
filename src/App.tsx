import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext';
import { StoreLayout, CheckoutLayout } from './components/layout/Layouts';
import { ScrollManager } from './components/layout/ScrollManager';
import { CartDrawer } from './components/CartDrawer';
import { QuickView } from './components/QuickView';
import { ToastViewport } from './components/ui/Toast';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import Favorites from './pages/Favorites';

export default function App() {
  return (
    <StoreProvider>
      <ScrollManager />
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<Home />} />
          <Route path="tienda" element={<Shop />} />
          <Route path="producto/:slug" element={<ProductPage />} />
          <Route path="favoritos" element={<Favorites />} />
          <Route path="cuenta" element={<Account />} />
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
      <ToastViewport />
    </StoreProvider>
  );
}
