/**
 * Tipos de la API del panel.
 *
 * Son la traducción literal de `docs/api.md`. Viven aquí y no junto a cada
 * página porque varias pantallas comparten las mismas formas: el producto sale
 * en el listado, en la ficha y en el buscador de la venta de mostrador, y tres
 * copias del mismo tipo se desincronizan a la primera de cambio.
 */

export type StockStatus = 'ok' | 'low' | 'out';
export type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN' | 'INITIAL';
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';
export type SalesChannel = 'ONLINE' | 'COUNTER' | 'SOCIAL';
export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
export type PromotionScope = 'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCT';
export type PopupFrequency = 'ONCE' | 'SESSION' | 'DAILY' | 'ALWAYS';
export type PromotionState = 'active' | 'scheduled' | 'expired' | 'inactive' | 'exhausted';
export type UserRole = 'ADMIN' | 'STAFF';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export interface AdminProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  brandId: string;
  brand: { id: string; name: string; slug: string };
  price: number;
  compareAtPrice: number | null;
  cost: number;
  taxRate: number;
  margin: number;
  marginPct: number;
  stock: number;
  reserved: number;
  available: number;
  minStock: number;
  stockStatus: StockStatus;
  active: boolean;
  featured: boolean;
  tags: string[];
  content: string;
  description: string;
  usage: string;
  images: string[];
  shades: Array<{ name: string; hex: string }>;
  sizes: Array<{ label: string; price?: number }>;
  rating: number;
  reviewCount: number;
  unitsSold30d?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListResponse extends Paged<AdminProduct> {
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    brands: Array<{ id: string; name: string; count: number }>;
  };
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  order: number;
  active: boolean;
  productCount: number;
}

export interface AdminBrand {
  id: string;
  slug: string;
  name: string;
  featured: boolean;
  order: number;
  active: boolean;
  productCount: number;
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  stockAfter: number;
  unitCost: number | null;
  reason: string | null;
  productId: string;
  sku: string;
  productName: string;
  userName: string | null;
  orderNumber: string | null;
  createdAt: string;
}

export interface StockAlert {
  productId: string;
  sku: string;
  name: string;
  image: string | null;
  stock: number;
  minStock: number;
  severity: 'out' | 'low';
  dailySales: number;
  /** `null` cuando no se vende nada: no hay ritmo que proyectar. */
  daysLeft: number | null;
  suggestedOrder: number;
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export interface AdminOrder {
  id: string;
  number: string;
  status: OrderStatus;
  channel: SalesChannel;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCity: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  cost: number;
  itemCount: number;
  couponCode: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrder {
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    name: string;
    variant: string | null;
    unitPrice: number;
    unitCost: number;
    quantity: number;
    lineTotal: number;
  }>;
  movements: Movement[];
}

export interface OrderListResponse extends Paged<AdminOrder> {
  totals: { revenue: number; orders: number };
}

// ---------------------------------------------------------------------------
// Promociones
// ---------------------------------------------------------------------------

export interface AdminPromotion {
  id: string;
  name: string;
  code: string | null;
  type: PromotionType;
  scope: PromotionScope;
  targetIds: string[];
  value: number;
  maxDiscount: number | null;
  minPurchase: number;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  priority: number;
  usageLimit: number | null;
  usageCount: number;

  showPopup: boolean;
  popupTitle: string | null;
  popupSubtitle: string | null;
  popupBadge: string | null;
  popupImage: string | null;
  popupCtaLabel: string | null;
  popupCtaUrl: string | null;
  popupFrequency: PopupFrequency;
  popupDelayMs: number;
  popupViews: number;
  popupClicks: number;
  popupDismissed: number;

  /** Calculado por el servidor contra su propio reloj, no contra el navegador. */
  state: PromotionState;
  orders: number;
  revenue: number;
  discountGiven: number;
  ctr: number;
  createdAt: string;
  updatedAt: string;
}

/** Lo poco que la portada necesita saber. No expone la mecánica interna. */
export interface PopupPromotion {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  image: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  code: string | null;
  frequency: PopupFrequency;
  delayMs: number;
  endsAt: string | null;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardRange = '7d' | '30d' | '90d' | '12m';

export interface Kpi {
  value: number;
  previous: number;
  /** `null` si el periodo anterior fue cero: no existe % sobre nada. */
  changePct: number | null;
}

export interface SeriesPoint {
  bucket: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
  margin: number;
}

export interface Dashboard {
  range: DashboardRange;
  from: string;
  to: string;
  granularity: 'day' | 'month';
  kpis: {
    revenue: Kpi;
    orders: Kpi;
    units: Kpi;
    avgTicket: Kpi;
    margin: Kpi;
  };
  series: SeriesPoint[];
  topProducts: Array<{
    id: string;
    sku: string;
    name: string;
    image: string | null;
    units: number;
    revenue: number;
  }>;
  topCategories: Array<{ id: string; name: string; units: number; revenue: number }>;
  channels: Array<{ channel: SalesChannel; orders: number; revenue: number }>;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  stock: {
    products: number;
    unitsInStock: number;
    stockValue: number;
    stockCost: number;
    lowStock: number;
    outOfStock: number;
    deadStock: number;
  };
  alerts: StockAlert[];
  recentOrders: Array<{
    id: string;
    number: string;
    customerName: string;
    total: number;
    status: OrderStatus;
    items: number;
    createdAt: string;
  }>;
  recentMovements: Movement[];
  promotions: Array<{
    id: string;
    name: string;
    active: boolean;
    orders: number;
    revenue: number;
    discount: number;
    popupViews: number;
    popupClicks: number;
    ctr: number;
  }>;
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export interface Setting {
  key: string;
  value: number | string | boolean;
  label: string;
  group: string;
  type?: 'number' | 'text' | 'boolean';
  help?: string;
}

// ---------------------------------------------------------------------------
// Etiquetas en español. En un solo sitio para que el mismo estado no salga
// escrito de dos maneras distintas en dos pantallas.
// ---------------------------------------------------------------------------

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pendiente de pago',
  PAID: 'Pagado',
  PREPARING: 'Preparando',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Anulado',
  REFUNDED: 'Devuelto',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  INITIAL: 'Carga inicial',
};

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  ONLINE: 'Tienda en línea',
  COUNTER: 'Mostrador',
  SOCIAL: 'WhatsApp e Instagram',
};

export const PROMOTION_STATE_LABEL: Record<PromotionState, string> = {
  active: 'Activa',
  scheduled: 'Programada',
  expired: 'Vencida',
  inactive: 'Apagada',
  exhausted: 'Agotada',
};

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  PERCENTAGE: 'Porcentaje',
  FIXED_AMOUNT: 'Monto fijo',
  FREE_SHIPPING: 'Envío gratis',
};

export const POPUP_FREQUENCY_LABEL: Record<PopupFrequency, string> = {
  ONCE: 'Una sola vez por navegador',
  SESSION: 'Una vez por sesión',
  DAILY: 'Una vez al día',
  ALWAYS: 'En cada carga (solo para probar)',
};

export const RANGE_LABEL: Record<DashboardRange, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  '12m': 'Últimos 12 meses',
};
