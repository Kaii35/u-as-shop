# Publicar el panel (/admin) en producción

Hoy `https://www.nstiendadeuñas.com` es la tienda estática en Vercel: catálogo
empaquetado y compras por WhatsApp. Para que `/admin` funcione en producción
(crear y editar productos con fotos, precios y promociones, y que la tienda lo
muestre en vivo) hace falta publicar la **API** (`server/`) con su **Postgres**
y un **disco** para las fotos, y recompilar la tienda apuntando a esa API.

El sitio de Vercel sigue igual hasta el último paso: se puede montar todo antes
sin que nadie lo note.

---

## 1. La API

`server/Dockerfile` ya está listo: compila, aplica las migraciones al arrancar
(`prisma migrate deploy`) y escucha en `PORT`. Cualquier servicio que corra un
Dockerfile sirve (Railway, Render, Fly, un VPS). Lo que necesita:

- **Directorio raíz del servicio:** `server/`
- **Postgres 15+** (el del mismo proveedor vale).
- **Un volumen persistente** montado, por ejemplo, en `/data`. Ahí viven las
  fotos que se suben desde el panel; sin volumen se pierden en cada despliegue.

### Variables de entorno

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | la cadena de conexión del Postgres |
| `JWT_SECRET` | 32+ caracteres al azar (`openssl rand -hex 32`). Sin esto la API no arranca en producción |
| `CORS_ORIGIN` | `https://www.xn--nstiendadeuas-skb.com,https://xn--nstiendadeuas-skb.com` |
| `UPLOADS_DIR` | `/data/uploads` (dentro del volumen) |
| `APP_URL` | `https://www.xn--nstiendadeuas-skb.com` |
| `TRUST_PROXY` | `true` (va detrás del proxy del proveedor; lo usa el límite de peticiones) |

`PORT` lo pone el proveedor. No hace falta nada de Wompi: el carrito está
apagado (`VITE_FEATURE_CART`), las compras van por WhatsApp.

**Nunca** correr `npm run seed` contra producción: inventa 14 meses de pedidos,
clientas y promociones de ejemplo, y crea la cuenta `admin@nataliasanchez.co` /
`natalia-admin`.

### Dominio de la API

Recomendado un subdominio propio, por ejemplo
`api.nstiendadeuñas.com` (en DNS: `api.xn--nstiendadeuas-skb.com`, un CNAME al
host que dé el proveedor). Comprobar:

```bash
curl https://api.xn--nstiendadeuas-skb.com/api/catalog | head -c 200
```

## 2. Cargar la base (una vez)

Con las migraciones ya aplicadas (lo hace el contenedor al arrancar), desde
cualquier máquina con el repo:

```bash
cd server
npm ci
DATABASE_URL="<la de producción>" \
ADMIN_EMAIL="correo-de-natalia@..." \
ADMIN_PASSWORD="<12+ caracteres>" \
npm run prod:init
```

`prod:init` (`server/prisma/produccion.ts`) carga solo lo real: la cuenta de
administración con ese correo y contraseña, los ajustes por defecto y los 161
productos de `catalogo-real.json` con sus precios. Nada de datos de ejemplo.
Se puede repetir: no borra ni cambia lo que ya exista (tampoco la contraseña).

Las fotos del catálogo (`/images/products/catalogo/...`) siguen saliendo de
Vercel; solo las que se suban desde el panel viven en el volumen de la API.

## 3. La tienda en Vercel

En el proyecto de Vercel → Settings → Environment Variables (Production):

| Variable | Valor |
|---|---|
| `VITE_CATALOG_SOURCE` | `api` |
| `VITE_FEATURE_ADMIN` | `true` |
| `VITE_API_URL` | `https://api.xn--nstiendadeuas-skb.com` |

Se leen **al compilar**: después de guardarlas hay que hacer **Redeploy**.
`VITE_FEATURE_CART` y `VITE_FEATURE_AUTH` se quedan apagados.

Si la API se cae, la tienda no se rompe: arranca con el catálogo real
empaquetado (nunca con el de ejemplo) y se pone al día sola cuando la API
vuelve.

## 4. Comprobar

1. `https://www.nstiendadeuñas.com/admin` → pide correo y contraseña → entra
   con los de `prod:init` y muestra solo **Productos** y **Promociones**.
2. Cambiar el precio de un producto → en la tienda (otra pestaña) cambia sin
   recargar, a lo sumo en 20 s.
3. Crear un producto con foto → sale en la tienda con su foto.
4. Crear una promoción tipo **Franja** → aparece arriba de todas las páginas.
5. Reiniciar la API → las fotos subidas siguen ahí (si no, falta el volumen).

## Notas

- El panel completo (pedidos, pagos, inventario, ajustes) sigue escondido:
  `VITE_FEATURE_ADMIN_FULL` apagado.
- Cada cambio de esquema trae su migración en `server/prisma/migrations/`; el
  contenedor las aplica solo al arrancar.
- Contraseña olvidada: hoy no hay "recuperar contraseña". Se puede crear otra
  cuenta con `prod:init` usando otro `ADMIN_EMAIL`.
