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

---

## Opción gratis: Vercel + Neon + Blob

Mientras no haya presupuesto para el VPS, la API puede vivir gratis en Vercel:
la base en **Neon** (Postgres gratis) y las fotos en **Vercel Blob**. El camino
de Docker/VPS de arriba sigue funcionando igual; el día que se pase a Hostinger
solo hay que seguir las secciones 1 a 4 y cambiar `VITE_API_URL`.

### Cómo queda

- **Dos proyectos de Vercel sobre el mismo repo.** El de siempre (la tienda,
  raíz del repo) no cambia. Uno nuevo para la API, con *Root Directory* =
  `server`. Vercel reconoce Fastify solo y publica `server/src/index.ts` como
  una función. La configuración está en `server/vercel.json`.
- **Fotos:** si existe `BLOB_READ_WRITE_TOKEN`, el panel las sube a Vercel Blob
  y en la base queda su URL pública (`https://….blob.vercel-storage.com/…`).
  Sin esa variable se guardan en disco, como en el VPS
  (`server/src/storage.ts`). Las fotos del catálogo siguen saliendo de la
  tienda.
- **Migraciones:** se aplican solas al compilar, **solo** en el despliegue de
  producción (`server/scripts/vercel-build.mjs`), por la conexión directa de
  Neon (`DATABASE_URL_UNPOOLED`), no por la del pooler. Si una migración falla,
  falla el despliegue y sigue en línea la versión anterior. Los despliegues de
  prueba (preview) no migran. Para hacerlo a mano: `SKIP_MIGRATIONS=true` en
  Vercel y `npx prisma migrate deploy` con la URL directa.
- **El catálogo público se cachea 10 s en el CDN de Vercel**
  (`CDN-Cache-Control`; el navegador no lo lee). Cada pestaña abierta de la
  tienda lo pide cada 20 s; así la función y la base se usan pocas veces por
  minuto, haya una visita o cien. Un cambio del panel se ve en una pestaña ya
  abierta en unos 30 s (a lo sumo un minuto); el panel mismo no usa esta
  caché y muestra el cambio al instante.

### Pasos en el panel de Vercel (una sola vez)

**A. Crear el proyecto de la API**

1. Vercel → **Add New… → Project** → importar el mismo repositorio de GitHub.
2. En **Root Directory** pulsar **Edit** y elegir `server`. *Framework Preset*
   debe decir **Fastify** (lo toma de `server/vercel.json`).
3. Abrir **Environment Variables** y añadir (entorno *Production*; marcar
   también *Preview* si se quieren despliegues de prueba):

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | 64 caracteres al azar. Generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y no guardarlo en ningún otro sitio |
   | `CORS_ORIGIN` | `https://www.xn--nstiendadeuas-skb.com,https://xn--nstiendadeuas-skb.com` |
   | `APP_URL` | `https://www.xn--nstiendadeuas-skb.com` |
   | `TRUST_PROXY` | `true` (Vercel va delante; lo usa el límite de peticiones) |

   No hacen falta `PORT` ni `UPLOADS_DIR`, ni nada de Wompi.
4. **Deploy.** Este primer despliegue **falla** con "Falta DATABASE_URL": es lo
   esperado, todavía no hay base. Seguir.

**B. Crear la base (Neon)**

5. En el proyecto de la API → pestaña **Storage** → **Create Database** →
   **Neon** (Marketplace) → plan **Free** → región la más cercana
   (*Washington, D.C. / us-east-1* es la usual para Colombia) → **Create**.
6. Al terminar ofrece conectarla al proyecto: **Connect** al proyecto de la
   API, con *Production* y *Preview* marcados. Esto crea solas, entre otras,
   `DATABASE_URL` (con pooler) y `DATABASE_URL_UNPOOLED` (directa).
   Comprobar en **Settings → Environment Variables** que están las dos. Si la
   integración les puso otro prefijo, crear a mano `DATABASE_URL` (la de
   pooler) y `DIRECT_URL` (la directa) con esos valores.

**C. Crear el almacén de fotos (Blob)**

7. Misma pestaña **Storage** → **Create Database** → **Blob** → nombre, por
   ejemplo, `fotos-panel` → acceso **Public** → **Create** → **Connect** al
   proyecto de la API. Esto crea `BLOB_READ_WRITE_TOKEN`.

**D. Publicar la API**

8. **Deployments** → el último → menú **⋯** → **Redeploy**. Ahora compila,
   aplica las migraciones en Neon y queda en línea.
9. Anotar la dirección del proyecto (por ejemplo
   `https://natalia-api.vercel.app`) y comprobar:
   `https://natalia-api.vercel.app/health` → `{"status":"ok",…}`.
   Opcional: en **Settings → Domains** añadir `api.nstiendadeuñas.com` (si el
   dominio está en Vercel se configura solo; si no, el registro CNAME `api`
   que indique Vercel en esa misma pantalla).

**E. Cargar la base (una vez, desde un computador con el repo)**

10. En Vercel → proyecto de la API → **Settings → Environment Variables** →
    `DATABASE_URL_UNPOOLED` → mostrar y copiar el valor (también sale en
    **Storage** → la base Neon → *Quickstart / .env.local*). No pegarlo en
    ningún archivo del repo.
11. En PowerShell, desde la carpeta del repo:

    ```powershell
    cd server
    npm ci
    npx prisma generate
    $env:DATABASE_URL = "<el valor copiado>"
    $env:ADMIN_EMAIL = "<correo de Natalia>"
    $env:ADMIN_PASSWORD = "<contraseña de 12+ caracteres>"
    npm run prod:init
    Remove-Item Env:DATABASE_URL, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
    ```

    Debe terminar con "Listo. Entra al panel en /admin con ese correo." Nunca
    `npm run seed` aquí (ver sección 1).

**F. Apuntar la tienda a la API**

12. Proyecto de la **tienda** → **Settings → Environment Variables**
    (*Production*):

    | Variable | Valor |
    |---|---|
    | `VITE_CATALOG_SOURCE` | `api` |
    | `VITE_FEATURE_ADMIN` | `true` |
    | `VITE_API_URL` | la dirección del paso 9, sin `/` al final |

13. **Deployments → ⋯ → Redeploy** del último despliegue de la tienda.
14. Comprobar como en la sección 4: entrar a `/admin`, cambiar un precio,
    crear un producto con foto, crear una Franja.

Para volver atrás en cualquier momento: borrar las tres variables `VITE_*` de
la tienda y hacer Redeploy. Vuelve a ser la tienda estática de hoy.

### Límites y riesgos del plan gratis

- **Vercel Hobby es para uso no comercial.** Una tienda que vende es uso
  comercial según sus condiciones: Vercel puede pedir pasar a Pro (USD 20 al
  mes) o pausar el proyecto. Es la razón de fondo para pasar al VPS en cuanto
  se pueda. Ya aplica hoy a la tienda estática.
- **Arranque en frío.** Si nadie usa la API un rato, la primera petición tarda
  1–3 s (arranca la función) y Neon puede sumar ~1 s si la base estaba
  dormida (se duerme a los 5 min sin uso). La tienda no se rompe: muestra el
  catálogo empaquetado y se pone al día al llegar la respuesta. En el panel se
  nota como una primera carga lenta.
- **Cuotas gratis** (revisarlas en **Usage** de Vercel y en el panel de Neon;
  cambian con el tiempo): Neon da 0.5 GB de base y un cupo mensual de horas de
  cómputo; Blob da del orden de 1 GB guardado y unos GB de descarga al mes;
  las funciones tienen su cupo de invocaciones y de CPU. Con 161 productos y
  fotos de ~200–400 KB sobra para empezar. Si una cuota se agota, la API deja
  de responder y la tienda sigue con el catálogo empaquetado.
- **Límite de peticiones:** vive en la memoria de cada instancia de la
  función, no compartido. Sigue frenando la prueba masiva de contraseñas en
  el login, pero es menos estricto que en un VPS de una sola máquina.
- **Fotos de más de 4.5 MB:** Vercel corta el cuerpo de las peticiones en
  4.5 MB. No pasa en la práctica porque el panel achica cada foto a 1600 px
  antes de subirla.
- **Fotos huérfanas:** borrar un producto no borra su foto de Blob (tampoco
  del disco en el VPS). Ocupa poco, pero cuenta para la cuota.
- **Pasar al VPS después:** copiar la base de Neon (`pg_dump`/`pg_restore`) y
  seguir las secciones 1–4. Las fotos ya subidas siguen siendo URLs de Blob y
  seguirán funcionando mientras el almacén exista; si se quiere cortar con
  Vercel del todo, hay que descargarlas y cambiar sus URLs en la base.
