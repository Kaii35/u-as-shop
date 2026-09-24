export type ProductTag = 'best' | 'new' | 'pro';
export type ShippingMethod = 'std' | 'exp' | 'pick';
export type PaymentMethod = 'card' | 'pse' | 'wallet' | 'cod';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  image?: string;
}

export interface Brand {
  name: string;
  slug: string;
}

export interface Shade {
  name: string;
  hex: string;
}

export interface SizeOption {
  label: string;
  /** Si existe, reemplaza el precio base del producto */
  price?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviewCount: number;
  stock: number;
  content: string;
  ref: string;
  tags: ProductTag[];
  shades?: Shade[];
  sizes?: SizeOption[];
  /** Rutas a imágenes (p. ej. /images/products/p1-a.jpg). La [1] se muestra al hover. */
  images: string[];
  description: string;
  usage: string;
}

export interface CartLine {
  productId: string;
  shade: number;
  size: number;
  qty: number;
}

export interface Review {
  author: string;
  role: string;
  rating: number;
  date: string;
  title: string;
  body: string;
}

export type OrderStatus = 'Confirmado' | 'Preparando' | 'En camino' | 'Entregado';

export interface TrackingStep {
  label: string;
  date: string;
  done: boolean;
}

export interface Order {
  number: string;
  date: string;
  productIds: string[];
  total: number;
  status: OrderStatus;
  tracking: TrackingStep[];
}

export interface User {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface Address {
  label: string;
  line1: string;
  line2: string;
  primary?: boolean;
}

export interface ToastData {
  id: number;
  title: string;
  description?: string;
  action?: 'cart';
}
