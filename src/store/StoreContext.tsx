import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { getProduct } from '../data/catalog';
import { COUPONS, computeTotals, usePersistentState, variantLabel, type Totals } from '../lib/utils';
import type { CartLine, ShippingMethod, ToastData, User } from '../types';

interface Store {
  cart: CartLine[];
  favs: string[];
  user: User | null;
  coupon: string | null;
  cartOpen: boolean;
  quickViewId: string | null;
  toast: ToastData | null;
  addToCart: (productId: string, opts?: { shade?: number; size?: number; qty?: number }) => boolean;
  setQty: (index: number, qty: number) => void;
  removeLine: (index: number) => void;
  clearCart: () => void;
  isFav: (id: string) => boolean;
  toggleFav: (id: string) => void;
  applyCoupon: (code: string) => boolean;
  totals: (method?: ShippingMethod) => Totals;
  login: (user: User) => void;
  logout: () => void;
  openCart: () => void;
  closeCart: () => void;
  openQuickView: (id: string) => void;
  closeQuickView: () => void;
  notify: (t: Omit<ToastData, 'id'>) => void;
  dismissToast: () => void;
}

const StoreContext = createContext<Store | null>(null);

const DEMO_CART: CartLine[] = [
  { productId: 'p1', shade: 0, size: 0, qty: 2 },
  { productId: 'p6', shade: 0, size: 0, qty: 1 },
];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = usePersistentState<CartLine[]>('aurelle.cart', DEMO_CART);
  const [favs, setFavs] = usePersistentState<string[]>('aurelle.favs', ['p3', 'p5', 'p12']);
  const [user, setUser] = usePersistentState<User | null>('aurelle.user', null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<number>();

  const notify = useCallback((t: Omit<ToastData, 'id'>) => {
    window.clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const addToCart: Store['addToCart'] = useCallback((productId, { shade = 0, size = 0, qty = 1 } = {}) => {
    const p = getProduct(productId);
    if (!p) return false;
    if (!p.stock) {
      notify({ title: 'Producto agotado', description: 'Guárdalo en favoritos y te avisamos cuando vuelva.' });
      return false;
    }
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === productId && l.shade === shade && l.size === size);
      if (i === -1) return [...c, { productId, shade, size, qty }];
      return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
    });
    setQuickViewId(null);
    const v = variantLabel(p, shade, size);
    notify({ title: 'Agregado al carrito', description: p.name + (v ? ` · ${v}` : ''), action: 'cart' });
    return true;
  }, [notify, setCart]);

  const toggleFav = useCallback((id: string) => {
    const p = getProduct(id);
    const on = favs.includes(id);
    setFavs((f) => (on ? f.filter((x) => x !== id) : [...f, id]));
    notify({ title: on ? 'Eliminado de favoritos' : 'Guardado en favoritos', description: p?.name });
  }, [favs, notify, setFavs]);

  const value = useMemo<Store>(() => ({
    cart, favs, user, coupon, cartOpen, quickViewId, toast,
    addToCart,
    setQty: (index, qty) => setCart((c) => c.map((l, i) => (i === index ? { ...l, qty: Math.max(1, qty) } : l))),
    removeLine: (index) => {
      const p = getProduct(cart[index]?.productId ?? '');
      setCart((c) => c.filter((_, i) => i !== index));
      notify({ title: 'Producto eliminado', description: p?.name });
    },
    clearCart: () => { setCart([]); setCoupon(null); },
    isFav: (id) => favs.includes(id),
    toggleFav,
    applyCoupon: (code) => {
      const c = code.trim().toUpperCase();
      if (COUPONS[c] === undefined) return false;
      setCoupon(c);
      return true;
    },
    totals: (method) => computeTotals(cart, getProduct, coupon ? COUPONS[coupon] : 0, method),
    login: (u) => setUser(u),
    logout: () => { setUser(null); notify({ title: 'Sesión cerrada', description: 'Te esperamos pronto' }); },
    openCart: () => setCartOpen(true),
    closeCart: () => setCartOpen(false),
    openQuickView: (id) => setQuickViewId(id),
    closeQuickView: () => setQuickViewId(null),
    notify,
    dismissToast: () => setToast(null),
  }), [cart, favs, user, coupon, cartOpen, quickViewId, toast, addToCart, toggleFav, notify, setCart, setUser]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>');
  return ctx;
}
