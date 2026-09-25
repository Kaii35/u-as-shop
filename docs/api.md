# API de Aurelle — contrato

Este documento manda. El servidor y el panel se escribieron en paralelo contra
él, así que si el código y este archivo no coinciden, uno de los dos está mal y
hay que decidir cuál.

- Base en desarrollo: `http://localhost:4100`
- Todo JSON, UTF-8.
- **El dinero son enteros en pesos.** Nunca decimales: COP no usa centavos y
  los flotantes redondean mal justo en el total que ve la clienta.
- Las fechas viajan como ISO-8601 en UTC (`2026-09-24T14:32:00.000Z`).

## Autenticación

Todo lo que cuelga de `/api/admin/` exige la cabecera:

```
Authorization: Bearer <token>
```

El token dura 12 h y lleva `audience: "aurelle:admin"`. Las rutas marcadas
**(ADMIN)** exigen además `role === 'ADMIN'`; las demás las puede usar `STAFF`.

## Errores

Siempre `{ "error": "texto para mostrarle a la persona", "code"?: "SLUG" }`.

| Código HTTP | `code` | Cuándo |
|---|---|---|
| 400 | — | Validación de zod falló |
| 401 | — | Sin token, token vencido o inválido |
| 403 | — | Hace falta rol ADMIN |
| 404 | `NOT_FOUND` | El registro no existe |
| 409 | `INSUFFICIENT_STOCK` | Se pidió descontar más de lo que hay |
| 409 | `DUPLICATE` | Choque de único (SKU, slug, cupón) |
| 500 | — | Cualquier otra cosa. El detalle solo va al log |

---

# 1. Públicas (las consume la tienda)

### `GET /health`
`{ status: 'ok', time }`. Hace un `SELECT 1` de verdad.

### `GET /api/catalog`

Todo el catálogo activo de una sola vez. La tienda lo pide una vez al arrancar.

```jsonc
{
  "categories": [
    { "id": "c1", "slug": "unas-y-manicura", "name": "…", "description": "…", "image": "/images/categories/c1.jpg" }
  ],
  "brands": [{ "slug": "velours-pro", "name": "Velours Pro" }],
  "products": [
    {
      "id": "p1",
      "slug": "esmalte-semipermanente-rose-silk",
      "name": "Esmalte semipermanente Rosé Silk",
      "brand": "Velours Pro",          // el NOMBRE, no el id: es lo que pinta la ficha
      "categoryId": "c1",
      "price": 32900,
      "oldPrice": 39900,               // ausente si no hay precio tachado
      "rating": 4.9,
      "reviewCount": 312,
      "stock": 24,
      "content": "15 ml",
      "ref": "VP-1037",                // el SKU
      "tags": ["best", "pro"],
      "shades": [{ "name": "Rosé Silk", "hex": "#D9A5AE" }],
      "sizes": [{ "label": "15 g", "price": 32900 }],
      "images": ["/images/products/p1-a.svg", "/images/products/p1-b.svg"],
      "description": "…",
      "usage": "…"
    }
  ]
}
```

Es **exactamente** `Category`, `Brand` y `Product` de `src/types.ts`. Si el
esquema cambia, la serialización tiene que seguir devolviendo esta forma: la
tienda entera depende de ella.

> Los ids sembrados son los mismos que traía el catálogo estático (`c1`…`c9`,
> `p1`…`p16`) a propósito. Así los carritos y favoritos ya guardados en el
> `localStorage` de quien abra la demo siguen apuntando a algo. Los productos
> que se creen desde el panel sí llevan cuid.

### `GET /api/promotions/popup`

La promoción que debe anunciarse en la portada, o `null`. El servidor ya filtra
por `active`, `showPopup`, ventana de fechas y `usageLimit`; si hay varias
candidatas gana la de mayor `priority` y, a igualdad, la más reciente.

```jsonc
{
  "promotion": {
    "id": "…",
    "title": "20 % en esmaltes semipermanentes",
    "subtitle": "Solo esta semana, en toda la categoría.",
    "badge": "Semana Aurelle",
    "image": "/images/editorial/promo.jpg",
    "ctaLabel": "Ver la colección",
    "ctaUrl": "/tienda?categoria=esmaltes-semipermanentes",
    "code": "AURELLE20",        // null si se aplica sola
    "frequency": "SESSION",     // ONCE | SESSION | DAILY | ALWAYS
    "delayMs": 1200,
    "endsAt": "2026-10-01T05:00:00.000Z"  // null si no vence
  }
}
```

`frequency` la respeta el **cliente**, no el servidor: el navegador recuerda en
`localStorage` qué promoción ya vio y cuándo. El servidor no sabe quién es
quien, y ponerle una cookie a cada visitante para esto no vale la pena.

### `POST /api/promotions/:id/track`

`{ "event": "view" | "click" | "dismiss" }` → `204`. Incrementa el contador
correspondiente. No exige sesión (lo llama la portada) y no acepta nada más:
es un contador, no una vía para escribir en la promoción.

---

# 2. Panel · sesión

### `POST /api/admin/login`
`{ email, password }` → `{ token, user: { id, email, name, role } }`
Credenciales malas → `401` con el mismo texto exista o no el correo.

### `GET /api/admin/me`
`{ user }` con lo que trae el token.

---

# 3. Panel · dashboard

### `GET /api/admin/dashboard?range=7d|30d|90d|12m`

Todo lo que pinta la portada del panel, en una sola llamada. `range` por
defecto `30d`.

```jsonc
{
  "range": "30d",
  "from": "2026-08-25T05:00:00.000Z",
  "to":   "2026-09-24T04:59:59.999Z",
  "granularity": "day",        // "day" en 7d/30d/90d, "month" en 12m

  // Cada KPI trae el periodo anterior de la MISMA duración, para que el panel
  // pueda decir "vs. los 30 días anteriores" sin recalcular nada.
  "kpis": {
    "revenue":  { "value": 12480000, "previous": 10310000, "changePct": 21.0 },
    "orders":   { "value": 86,  "previous": 74,  "changePct": 16.2 },
    "units":    { "value": 214, "previous": 190, "changePct": 12.6 },
    "avgTicket":{ "value": 145116, "previous": 139324, "changePct": 4.2 },
    "margin":   { "value": 4980000, "previous": 4120000, "changePct": 20.9 }
  },

  // Serie completa y CONTINUA: los días sin ventas vienen en cero, no faltan.
  // Si faltaran, la gráfica dibujaría una línea recta por encima del hueco y
  // mentiría sobre lo que pasó ese día.
  "series": [
    { "bucket": "2026-08-25", "label": "25 ago", "revenue": 410000, "orders": 3, "units": 7, "margin": 165000 }
  ],

  "topProducts":   [{ "id": "p1", "sku": "VP-1037", "name": "…", "image": "…", "units": 48, "revenue": 1579200 }],
  "topCategories": [{ "id": "c2", "name": "…", "units": 96, "revenue": 3120000 }],
  "channels":      [{ "channel": "ONLINE", "orders": 61, "revenue": 8900000 }],
  "ordersByStatus":{ "PENDING": 4, "PAID": 12, "PREPARING": 3, "SHIPPED": 6, "DELIVERED": 61, "CANCELLED": 2, "REFUNDED": 1 },

  "stock": {
    "products": 16,           // activos
    "unitsInStock": 266,
    "stockValue": 18420000,   // a precio de venta
    "stockCost": 9930000,     // a costo: es lo que hay inmovilizado
    "lowStock": 3,
    "outOfStock": 1,
    "deadStock": 2            // activos sin una sola venta en 60 días
  },

  "alerts": [
    {
      "productId": "p7", "sku": "OL-1259", "name": "…", "image": "…",
      "stock": 0, "minStock": 4,
      "severity": "out",          // "out" = agotado, "low" = por debajo del mínimo
      "dailySales": 1.4,          // promedio de los últimos 30 días
      "daysLeft": 0,              // null si no se vende nada (no hay ritmo que proyectar)
      "suggestedOrder": 42        // cuánto pedir para cubrir 30 días
    }
  ],

  "recentOrders":    [{ "id": "…", "number": "AU-10482", "customerName": "…", "total": 187600, "status": "PAID", "items": 3, "createdAt": "…" }],
  "recentMovements": [{ "id": "…", "type": "SALE", "quantity": -2, "stockAfter": 22, "reason": null, "sku": "…", "productName": "…", "userName": null, "createdAt": "…" }],
  "promotions":      [{ "id": "…", "name": "…", "active": true, "orders": 18, "revenue": 2310000, "discount": 410000, "popupViews": 940, "popupClicks": 121, "ctr": 12.9 }]
}
```

Reglas de cálculo, iguales en todo el panel:

- **Una venta cuenta** cuando el pedido está en `PAID`, `PREPARING`, `SHIPPED`
  o `DELIVERED`. `PENDING` todavía no se pagó, y `CANCELLED`/`REFUNDED` no se
  cobraron: meterlos infla los ingresos con plata que nunca entró.
- **Ingreso** = `Order.total` (ya lleva descuento y envío aplicados).
- **Margen** = `total - shipping - cost`. El envío se descuenta porque no es
  venta de mercancía: se cobra y se paga.
- **`changePct`** = `(valor − anterior) / anterior × 100`, redondeado a un
  decimal. Si el anterior es 0, viene `null` — no `100`, que sería inventarse
  un crecimiento sobre nada.
- `daysLeft` = `floor(stock / dailySales)`, y `null` cuando `dailySales === 0`.

---

# 4. Panel · productos

### `GET /api/admin/products`

Query: `search`, `category` (id), `brand` (id), `stock` (`all|low|out|ok`),
`status` (`all|active|inactive`), `sort` (`name|price|stock|created|sales`),
`dir` (`asc|desc`), `page` (≥1), `limit` (1–200, por defecto 25).

`search` busca en nombre, SKU y slug, sin distinguir mayúsculas ni tildes.

```jsonc
{
  "items": [ /* ProductoAdmin, ver abajo */ ],
  "page": 1, "limit": 25, "total": 16, "totalPages": 1,
  "facets": {
    "categories": [{ "id": "c1", "name": "…", "count": 2 }],
    "brands":     [{ "id": "…", "name": "…", "count": 3 }]
  }
}
```

**ProductoAdmin** — más ancho que el público, con lo que solo ve la dueña:

```jsonc
{
  "id": "p1", "sku": "VP-1037", "slug": "…", "name": "…",
  "categoryId": "c1", "category": { "id": "c1", "name": "…" },
  "brandId": "…",     "brand":    { "id": "…", "name": "Velours Pro" },
  "price": 32900, "compareAtPrice": 39900, "cost": 14200, "taxRate": 0.19,
  "margin": 18700,          // price − cost
  "marginPct": 56.8,        // margin / price × 100, un decimal
  "stock": 24, "reserved": 0, "available": 24, "minStock": 6,
  "stockStatus": "ok",      // "ok" | "low" | "out"
  "active": true, "featured": true,
  "tags": ["best", "pro"],
  "content": "15 ml", "description": "…", "usage": "…",
  "images": ["…"], "shades": [...], "sizes": [...],
  "rating": 4.9, "reviewCount": 312,
  "unitsSold30d": 48,       // solo en el listado, para ordenar por ventas
  "createdAt": "…", "updatedAt": "…"
}
```

### `GET /api/admin/products/:id`
El mismo objeto más `movements` (los 20 últimos) y `sales` (unidades e ingreso
de los últimos 90 días).

### `POST /api/admin/products`

```jsonc
{
  "sku": "VP-1099",              // requerido, único
  "name": "…",                   // requerido, 3–200
  "slug": "…",                   // opcional: se deriva del nombre y el SKU desempata
  "categoryId": "c1",            // requerido
  "brandId": "…",                // requerido
  "price": 32900,                // requerido, entero ≥ 1
  "compareAtPrice": 39900,       // opcional, debe ser > price
  "cost": 14200,                 // opcional, por defecto 0
  "taxRate": 0.19,               // opcional
  "initialStock": 24,            // opcional, por defecto 0
  "unitCost": 14200,             // costo de esa primera entrada
  "minStock": 6, "active": true, "featured": false,
  "tags": ["new"], "content": "15 ml", "description": "…", "usage": "…",
  "images": ["/images/products/…"],
  "shades": [{ "name": "…", "hex": "#D9A5AE" }],
  "sizes":  [{ "label": "15 g", "price": 32900 }]
}
```

→ `201` con el ProductoAdmin.

**El `initialStock` no se escribe en la columna.** El producto nace en cero y
las unidades entran como movimiento `INITIAL` en la misma transacción, para que
la regla de oro del inventario se cumpla también el primer día.

### `PATCH /api/admin/products/:id`
Los mismos campos, todos opcionales. **`stock` no se acepta aquí**: se cambia
por `/api/admin/inventory/…`. Si llega, se responde `400` diciéndolo — fallar
es mejor que aceptarlo en silencio y romper el cuadre del historial.

### `DELETE /api/admin/products/:id`
Desactiva (`active = false`). Con `?hard=true` borra de verdad, y solo si el
producto nunca se vendió; si tiene ventas responde `409`, porque borrarlo
dejaría pedidos históricos apuntando al vacío.

### Categorías y marcas
- `GET /api/admin/categories` → `[{ id, slug, name, description, image, order, active, productCount }]`
- `POST /api/admin/categories` · `PATCH /api/admin/categories/:id`
- `GET /api/admin/brands` → `[{ id, slug, name, featured, order, active, productCount }]`
- `POST /api/admin/brands` · `PATCH /api/admin/brands/:id`

Ni una ni otra se pueden borrar si tienen productos: `409`.

---

# 5. Panel · inventario

### `GET /api/admin/inventory/movements`
Query: `productId`, `type`, `from`, `to`, `page`, `limit`. Orden descendente
por fecha.

```jsonc
{
  "items": [{
    "id": "…", "type": "PURCHASE", "quantity": 24, "stockAfter": 48,
    "unitCost": 14200, "reason": "Pedido a proveedor #4471",
    "productId": "p1", "sku": "VP-1037", "productName": "…",
    "userName": "Catalina", "orderNumber": null,
    "createdAt": "…"
  }],
  "page": 1, "limit": 50, "total": 412, "totalPages": 9
}
```

### `POST /api/admin/inventory/movements`

```jsonc
{ "productId": "p1", "type": "PURCHASE", "quantity": 24, "unitCost": 14200, "reason": "…" }
```

`type` ∈ `PURCHASE | RETURN | ADJUSTMENT`. `SALE` e `INITIAL` **no** se aceptan
por aquí: los crea el sistema y dejarlos a mano rompería el cuadre con los
pedidos. En `ADJUSTMENT` la cantidad puede ser negativa (avería, pérdida); en
las otras dos tiene que ser positiva. Nunca cero.

→ `{ movement, product }` con el stock ya actualizado.

### `POST /api/admin/inventory/count`
`{ productId, newStock, reason }` — conteo físico. Deja el stock en ese valor
exacto y registra **la diferencia** como `ADJUSTMENT`. Si no cambia nada, no
crea movimiento.

### `POST /api/admin/inventory/bulk`
`{ reason, items: [{ productId, newStock }] }` — varios conteos de una vez, en
una sola transacción: o entran todos o no entra ninguno.
→ `{ updated: n, skipped: n }` (`skipped` son los que ya estaban en ese valor).

### `GET /api/admin/inventory/alerts`
`{ items: [alerta] }` con la misma forma que `alerts` del dashboard, pero
todas, sin recortar. Query `severity=all|low|out`.

---

# 6. Panel · pedidos

### `GET /api/admin/orders`
Query: `status`, `search` (número, nombre o correo), `from`, `to`, `channel`,
`page`, `limit`.

```jsonc
{
  "items": [{
    "id": "…", "number": "AU-10482", "status": "PAID", "channel": "ONLINE",
    "customerName": "…", "customerEmail": "…", "customerCity": "Medellín",
    "subtotal": 187600, "discount": 0, "shipping": 0, "total": 187600, "cost": 84300,
    "itemCount": 3, "couponCode": null, "createdAt": "…"
  }],
  "page": 1, "limit": 25, "total": 312, "totalPages": 13,
  "totals": { "revenue": 42800000, "orders": 312 }   // del filtro completo, no de la página
}
```

### `GET /api/admin/orders/:id`
Lo anterior más `items[]` y `movements[]`.

### `PATCH /api/admin/orders/:id`
`{ "status": "SHIPPED", "notes": "…" }`

Transiciones permitidas y su efecto en el stock:

| De | A | Stock |
|---|---|---|
| `PENDING` | `PAID` | **descuenta** (movimiento `SALE`) |
| `PENDING` | `CANCELLED` | nada: nunca se descontó |
| `PAID` | `PREPARING`, `DELIVERED` | nada |
| `PREPARING` | `SHIPPED`, `DELIVERED` | nada |
| `SHIPPED` | `DELIVERED` | nada |
| `PAID`/`PREPARING` | `CANCELLED` | **devuelve** (`RETURN`) |
| `SHIPPED`/`DELIVERED` | `REFUNDED` | **devuelve** (`RETURN`) |

Cualquier otra → `400`, nombrando los destinos válidos desde donde está.

El salto directo a `DELIVERED` desde `PAID` o `PREPARING` existe porque una
tienda de barrio entrega en mano el mismo día: obligarla a pulsar alistar y
despachar solo para cerrar la venta le haría registrar dos estados que nunca
ocurrieron. **Hacia atrás no hay saltos**, y eso sí es deliberado: un pedido
`DELIVERED` no vuelve a `PENDING`, porque reabrirlo borraría lo que de verdad
pasó. Si hiciera falta, se crea uno nuevo.

### `POST /api/admin/orders`
Venta de mostrador. `{ customerName, customerEmail?, customerPhone?, customerCity?, channel, items: [{ productId, quantity, unitPrice? }], discount?, shipping?, couponCode?, notes? }`.
Nace en `PAID` y descuenta stock en el acto. Si algo no alcanza → `409`
`INSUFFICIENT_STOCK` y **no se crea nada**: la transacción entera se deshace.

---

# 7. Panel · promociones

### `GET /api/admin/promotions`
Query `status=all|active|scheduled|expired|inactive`.
Devuelve `[{ …promoción, state, orders, revenue, discountGiven, ctr }]` donde
`state` ∈ `active | scheduled | expired | inactive | exhausted`, calculado
contra la hora del servidor.

### `POST /api/admin/promotions` · `PATCH /api/admin/promotions/:id`

```jsonc
{
  "name": "Semana Aurelle",          // requerido
  "code": "AURELLE20",               // opcional, único, se guarda en mayúsculas
  "type": "PERCENTAGE",              // PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING
  "scope": "CATEGORY",               // ALL | CATEGORY | BRAND | PRODUCT
  "targetIds": ["c2"],               // requerido salvo scope ALL
  "value": 20,                       // % si PERCENTAGE, pesos si FIXED_AMOUNT
  "maxDiscount": 60000,              // tope en pesos, opcional
  "minPurchase": 0,
  "startsAt": "2026-09-24T05:00:00.000Z",
  "endsAt": null,
  "active": true, "priority": 10, "usageLimit": null,

  "showPopup": true,
  "popupTitle": "20 % en esmaltes semipermanentes",
  "popupSubtitle": "Solo esta semana, en toda la categoría.",
  "popupBadge": "Semana Aurelle",
  "popupImage": "/images/editorial/promo.jpg",
  "popupCtaLabel": "Ver la colección",
  "popupCtaUrl": "/tienda?categoria=esmaltes-semipermanentes",
  "popupFrequency": "SESSION",
  "popupDelayMs": 1200
}
```

Validaciones que el servidor **sí** hace, porque son las que arruinan una
campaña:

- `PERCENTAGE` → `value` entre 1 y 100.
- `FIXED_AMOUNT` → `value` ≥ 1.
- `endsAt`, si viene, tiene que ser posterior a `startsAt`.
- `scope ≠ ALL` → `targetIds` no puede ir vacío, y los ids tienen que existir.
- `showPopup: true` → `popupTitle` es obligatorio. Un anuncio sin titular no
  es un anuncio.

### `DELETE /api/admin/promotions/:id`
Desactiva. Con `?hard=true` borra, y solo si no tiene pedidos asociados.

### `POST /api/admin/promotions/preview`
`{ promotion: {…la regla…}, subtotal, items: [{ productId, categoryId, brandId, price, quantity }] }`
→ `{ discount, freeShipping, applies, reason }`.
Sirve para que el panel muestre «sobre un carrito de $180.000 descontaría
$36.000» **antes** de publicar, que es cuando todavía se puede corregir.

---

# 8. Panel · ajustes y usuarios

### `GET /api/admin/settings` → `[{ key, value, label, group }]`
### `PUT /api/admin/settings` → `{ "shipping.freeFrom": 250000, "shipping.fee": 14900 }`
Solo se aceptan claves ya existentes: un `PUT` con una clave desconocida
responde `400` en vez de crear basura que nadie lee.

### `GET /api/admin/users` **(ADMIN)** → `[{ id, email, name, role, active, lastLoginAt, createdAt }]`
### `POST /api/admin/users` **(ADMIN)** → `{ email, name, password, role }`
### `PATCH /api/admin/users/:id` **(ADMIN)** → `{ name?, role?, active?, password? }`

Un ADMIN no puede quitarse a sí mismo el rol ni desactivarse: `400`. Es la
forma más fácil de quedarse fuera del panel sin manera de volver a entrar.
