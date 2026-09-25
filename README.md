# Aurelle · Professional Beauty

Tienda de insumos de belleza profesional con panel administrativo.

- **Tienda** — React 18 + TypeScript + Vite + Tailwind + React Router.
- **Panel** — inventario, productos, pedidos, promociones y un resumen de ventas.
- **API** — Fastify 5 + Prisma 6 sobre PostgreSQL 17 en Docker.

---

## Arrancar

Hace falta **Node 18+** y **Docker Desktop corriendo**.

```bash
npm install
npm run setup      # base + esquema + datos de ejemplo (tarda ~1 min)
```

Luego, en dos terminales:

```bash
npm run api        # API en http://localhost:4100
npm run dev        # tienda y panel en http://localhost:5173
```

- Tienda: <http://localhost:5173>
- Panel: <http://localhost:5173/admin> · `admin@aurelle.co` / `aurelle-admin`

`npm run setup` levanta Postgres, instala las dependencias del servidor, genera
el cliente de Prisma, aplica las migraciones y siembra los datos. Es idempotente:
correrlo otra vez deja exactamente la misma base.

**Sin la API la tienda igual abre.** Si no responde en un segundo y medio,
arranca con el catálogo de ejemplo de `src/data/catalog.ts`. El panel sí la
necesita, obviamente.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite, tienda y panel |
| `npm run api` | API con recarga al guardar |
| `npm run db:up` / `db:down` | Levanta / apaga Postgres (los datos sobreviven) |
| `npm run db:reset` | Borra la base **y su volumen** |
| `npm run db:studio` | Prisma Studio, para mirar las tablas |
| `npm run api:seed` | Vuelve a sembrar |
| `npm run api:migrate` | Crea una migración tras tocar el esquema |
| `npm run typecheck` / `api:typecheck` | TypeScript del front / del servidor |

### Puertos

Postgres en el **5436** y la API en el **4100**, no en los de siempre, para no
chocar con un Postgres ya instalado ni con otros proyectos. Se cambian en `.env`.

---

## Los datos de ejemplo

El seed inventa **14 meses de historia**: 1.613 pedidos, 3.180 líneas y 3.561
movimientos de inventario, repartidos entre julio de 2025 y septiembre de 2026.
No son filas al azar — tienen tendencia creciente, más ventas viernes y sábado,
y picos en día de la madre, amor y amistad, black friday y diciembre. Sin eso
las tres gráficas del panel saldrían planas y no habría nada que juzgar.

El generador usa una **semilla fija**, así que dos siembras dan exactamente los
mismos números. Los ids del catálogo (`c1`…`c9`, `p1`…`p16`) son los mismos que
traía la tienda estática, para que los carritos guardados en el navegador sigan
apuntando a algo.

Todo es ficticio: marcas inventadas, correos `@example.com`.

---

## Dos reglas que el código da por hechas

**1. El stock nunca se escribe a mano.** Ninguna parte del servidor hace
`update({ stock })`. Toda variación entra como `InventoryMovement` dentro de una
transacción, y el movimiento guarda el stock resultante. Por eso el historial
explica cada unidad, y por eso `PATCH /api/admin/products/:id` **rechaza** un
body con `stock` en vez de aceptarlo en silencio.

La resta al vender es un `UPDATE … WHERE stock >= cantidad`, atómico en
Postgres: dos clientas pueden pedir la última unidad en el mismo milisegundo y
una de las dos recibe un 409, en vez de quedar el stock en negativo.

**2. El dinero son enteros en pesos.** COP no usa centavos, y los flotantes
redondean mal justo en el total que ve la clienta.

---

## Estructura

```
docker-compose.yml        Postgres (y la API, con el perfil `full`)
docs/api.md               CONTRATO de la API. Manda sobre el código.

server/
  prisma/schema.prisma    Catálogo, inventario, pedidos, promociones, panel
  prisma/seed.ts          Los 14 meses de historia
  src/
    index.ts              Arranque, CORS, manejo de errores
    env.ts db.ts auth.ts  Configuración, Prisma, tokens del panel
    inventory.ts          Servicio de stock. Todo cambio pasa por aquí
    promotions.ts         Motor de reglas de descuento (funciones puras)
    sales.ts              Qué cuenta como venta, margen, variación %
    serializers.ts        Formas pública y de panel de un producto
    settings-defaults.ts  Los parámetros que la dueña puede cambiar
    routes/               catalog · auth · dashboard · products · inventory
                          orders · promotions · settings

src/
  App.tsx                 Rutas de la tienda y del panel
  data/catalog.ts         Catálogo de ejemplo + hidratación desde la API
  lib/
    api.ts                Cliente HTTP: token, errores, base de la URL
    admin-types.ts        Los tipos del contrato, en un solo sitio
    useResource.ts        Carga, acciones y `debounce` de las pantallas
    utils.ts              Formato COP, totales, envío, validaciones, hooks
  components/
    admin/Primitives.tsx  Tarjetas, tablas, diálogos, estados del panel
    admin/Charts.tsx      Gráficas en SVG propio
    PromoPopup.tsx        El anuncio de promoción en la portada
    ui/ …                 Botones, campos, overlays de la tienda
  pages/
    Admin/                Login, Resumen, Pedidos, Productos, Inventario,
                          Promociones, Ajustes
    …                     Home, Shop, ProductDetail, Checkout, Cuenta
  store/
    StoreContext.tsx      Carrito, favoritos, sesión de clienta
    AdminAuth.tsx         Sesión del panel
```

---

## De dónde salen los datos de la tienda

La tienda seguía leyendo `src/data/catalog.ts` de forma síncrona desde
diecisiete pantallas. En vez de convertirlas todas a asíncronas, `main.tsx`
pide el catálogo a la API **antes de montar React** y rellena esos mismos
arreglos en el sitio, sin cambiar su identidad. Todas las pantallas siguen
haciendo `import { products }` y ven los datos reales.

Es deliberado, y tiene un límite claro: los cambios del panel se ven al
**recargar** la tienda, no al instante. Para esta demo es el cambio correcto;
una tienda de verdad querría consultas por página con su propia caché.

---

## Seguridad

Lo que protege los datos es que **cada ruta de `/api/admin/` exige un token
firmado**. `RequireAdmin` en el frontend es comodidad: esconde pantallas, no
defiende nada, y cualquiera puede saltárselo desde la consola del navegador.

`JWT_SECRET` tiene que ser un secreto propio de 32+ caracteres en producción o
el servidor se niega a arrancar. `server/.env` no se versiona.

---

## Sistema de diseño

Todo sale de `tailwind.config.ts`: la paleta (neutros cálidos + terracota), una
escala tipográfica de 9 pasos que **termina en 44 px**, espaciado múltiplo de 4.
Ningún componente escribe un hex ni un tamaño de fuente arbitrario.

El panel es más denso que la tienda —son tablas, no escaparate— pero usa los
mismos colores, la misma escala y los mismos radios.

Las gráficas son SVG propio, no una librería. Pintan **una serie a la vez**: el
selector de medida cambia lo que se mira en vez de amontonar cuatro líneas de
escalas distintas en un mismo eje. El periodo anterior va en gris y discontinuo
porque es una referencia, no una segunda serie con identidad propia.
