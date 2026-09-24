# Aurelle · Professional Beauty

Tienda premium de insumos de belleza profesional. React 18 + TypeScript + Vite + Tailwind CSS + Lucide + Framer Motion + React Router.

## Empezar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de producción
```

Requiere Node 18+.

## Estructura

```
src/
  App.tsx                 Rutas
  types.ts                Tipos de dominio (Product, CartLine, Order…)
  data/catalog.ts         Datos de demo: categorías, marcas, productos, pedidos, media
  lib/utils.ts            Formato COP, totales, envío, validaciones, hooks
  store/StoreContext.tsx  Carrito, favoritos, sesión, toasts, drawer y quick view
  components/
    ui/                   Button, Input/Select/Textarea/Checkbox, Badge, RatingStars,
                          PriceDisplay, QuantitySelector, Img, Modal, Sheet, Reveal, Toast
    Header.tsx            Header sticky, menú móvil, barra inferior móvil
    SearchBar.tsx         Búsqueda con panel de sugerencias (inline y overlay móvil)
    Footer.tsx
    ProductCard.tsx       ProductCard (grid / lista) + ProductGrid
    CategoryCard.tsx
    ProductFilters.tsx
    ProductGallery.tsx    Galería con zoom al hover y modal
    CartDrawer.tsx        Drawer lateral + CouponField
    CheckoutSummary.tsx
    QuickView.tsx
    layout/               StoreLayout, CheckoutLayout, ScrollManager
  pages/                  Home, Shop, ProductDetail, Checkout, Login, Register, Account, Favorites
```

## Rutas

| Ruta | Página |
| --- | --- |
| `/` | Landing |
| `/tienda?cat=&marca=&q=&oferta=1` | Catálogo (filtros en la URL, combinables con comas) |
| `/producto/:slug` | Detalle |
| `/checkout` | Checkout en 5 pasos |
| `/ingresar`, `/registro` | Autenticación |
| `/cuenta?tab=pedidos` | Panel de usuario (protegido) |
| `/favoritos` | Lista de deseos |

## Imágenes

Dos tipos, a propósito:

| Carpeta | Qué es | Se usa en |
| --- | --- | --- |
| `public/images/editorial/` | Fotografía real (licencia Unsplash: uso comercial libre, sin atribución obligatoria) | objeto `media` |
| `public/images/categories/` | Fotografía real, una por categoría | propiedad `image` de la categoría |
| `public/images/products/` | Packshots vectoriales generados en la paleta de la marca, `pN-a.svg` + `pN-b.svg` (la `-b` es la vista al hover) | `images` de cada producto |

Los productos siguen siendo ilustraciones porque el stock libre no tiene packshots de
insumos profesionales (builder gel, polygel, torno, lash lift, foils cromados): una foto
aproximada mostraría el producto equivocado. Al ser todos iguales, la grilla se ve
consistente. Sustitúyelos por tus fotos de producto cuando las tengas.

**Proporciones.** Cada recorte está hecho a la medida de su contenedor, no a un 4:5
genérico: la grilla de categorías es un bento con tarjetas apaisadas de distinta relación
(6×2, 3×1, 6×1, 4×2, 4×1) y el hero es apaisado con el sujeto desplazado a la derecha,
porque su mitad izquierda queda bajo el degradado y el titular. Si cambias una imagen,
respeta la proporción de la que reemplazas o el `object-cover` volverá a recortar de más.

Para regenerar los packshots de producto: `node scripts/generate-placeholders.mjs public/images`.

## Siguiente paso: conectar backend

- **Catálogo**: reemplaza `data/catalog.ts` por llamadas a tu API/CMS (Shopify Storefront, Medusa, WooCommerce, Strapi…). Los componentes solo dependen de `types.ts`.
- **Auth**: `login()` en `StoreContext` es un mock. Sustitúyelo por tu proveedor (Supabase, Firebase, Auth0) incluido Google OAuth.
- **Pagos**: el punto de integración está en `pages/Checkout.tsx → place()`. Pasarelas habituales en Colombia: Wompi, PayU, Mercado Pago, ePayco (tarjeta, PSE, Nequi, Daviplata).
- **Persistencia**: carrito, favoritos y sesión se guardan en `localStorage` (`aurelle.*`).

## Tokens de diseño

Definidos en `tailwind.config.ts`:

- Colores: `blush #E8C8CF`, `nude #F5E7E8`, `ivory #FAF7F2`, `wine #572B3A` / `wine-dark #3F1E2A`, `ink #242124`, `muted #6E6368`
- Tipografía: `font-display` Bodoni Moda · `font-sans` Jost
- Utilidades propias en `index.css`: `.eyebrow`, `.label-xs`, `.h-display`, `.container-x`, `.link-underline`

Cupón de demo: **PRO10** (10%). Envío gratis desde $250.000.
