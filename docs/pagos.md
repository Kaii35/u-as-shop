# Pagos — arquitectura

Cómo cobra Aurelle, por qué está hecho así y qué hay que hacer para ponerlo en
producción.

El contrato de los endpoints está en **`docs/api.md`, sección 9**. Aquí va el
porqué; allá van las formas exactas que viajan por el cable. Si los dos se
contradicen, manda `docs/api.md`.

Archivos que componen esto:

```
server/src/payments/types.ts    El puerto de dominio. No menciona a Wompi
server/src/payments/wompi.ts    Adaptador de Wompi: firmas, webhooks, estados
server/src/payments/mock.ts     Pasarela simulada
server/src/payments/index.ts    Elige la pasarela al arrancar
server/src/reservations.ts      Reserva de unidades mientras se cobra
server/src/inventory.ts         Servicio de stock (decrementStock)
server/prisma/schema.prisma     Modelos Payment y PaymentEvent
server/src/env.ts               Variables de entorno
```

---

## 1. Qué integración se eligió

**Checkout Web de Wompi.** La clienta sale de la tienda, paga en una página de
Wompi y vuelve a un URL nuestro. La alternativa era la API directa: pedir el
número de tarjeta en nuestro propio formulario y tokenizarlo contra Wompi.

Se descartó por dos razones concretas:

1. **PCI-DSS.** Con la API directa el número de tarjeta pasa por nuestro
   frontend, y en ese momento el negocio entra en el alcance de PCI-DSS. Eso es
   auditoría, cuestionarios de cumplimiento y responsabilidad legal sobre datos
   de tarjeta. Con el checkout alojado ningún dato de tarjeta nos toca nunca.
2. **Medios de pago.** Con la API directa cada medio se implementa a mano:
   tarjeta, Nequi, PSE, Bancolombia Transfer, Bancolombia Collect, Daviplata,
   cada uno con su propio flujo y sus propios estados. Con el checkout alojado
   salen todos y Wompi los mantiene.

**Qué se pierde:** control sobre la apariencia del pago. La clienta ve una
página de Wompi, no una nuestra. Se puede poner el logo del comercio y poco
más. A cambio, la clienta ve en la barra de direcciones un dominio de Wompi,
que es donde comprueba que está pagando en un sitio legítimo — por eso el
checkout se abre **redirigiendo**, nunca en un iframe.

El adaptador no llama a la API para crear el checkout. El Checkout Web se abre
por GET con los datos en la query (`openCheckout` en `server/src/payments/wompi.ts`
arma la URL sobre `https://checkout.wompi.co/p/`). La transacción de Wompi
**nace cuando la clienta elige medio de pago**, no antes. Por eso
`CheckoutSession.providerTransactionId` es opcional y con Wompi viene vacío, y
por eso **la clave de reconciliación es nuestra referencia**, no el id de Wompi.

### El puerto

`server/src/payments/types.ts` define `PaymentGateway`, y ni una línea de ese
archivo menciona a Wompi. Un adaptador implementa cuatro métodos:

| Método | Qué hace |
|---|---|
| `openCheckout(request)` | Devuelve `checkoutUrl` a donde mandar a la clienta |
| `fetchByTransactionId(id)` | Pregunta por una transacción. Es el plan B cuando el webhook no llega |
| `fetchByReference(ref)` | Buscar por referencia. `null` si la pasarela no lo permite |
| `verifyEvent(body)` | Verifica la firma de un aviso entrante y lo traduce al dominio |

Cambiar de pasarela, o soportar dos a la vez, es escribir otro adaptador. No se
tocan pedidos ni inventario.

---

## 2. El reparto de llaves

Wompi entrega cuatro credenciales y cada una tiene un sitio. Confundirlas es la
forma más rápida de regalar la tienda.

| Llave | Prefijo | Dónde vive | Para qué | Si se filtra |
|---|---|---|---|---|
| Pública | `pub_test_` / `pub_prod_` | Navegador y servidor | Abrir el checkout, consultar transacciones | Poco: es de lectura y va en la URL del checkout de todas formas |
| Privada | `prv_…` | **Solo servidor** | Crear transacciones por API. **Aquí no se usa** | Grave: permite mover dinero en nombre del comercio. Rotar de inmediato |
| Secreto de integridad | — | **Solo servidor** | Firmar el monto para que no lo puedan cambiar | Grave: cualquiera puede firmar un checkout de $1.000 para un pedido de $300.000 |
| Secreto de eventos | — | **Solo servidor** | Verificar que un webhook lo mandó Wompi | Crítico: permite fabricar avisos de "pago aprobado" y sacar mercancía sin pagarla |

El código solo usa tres: `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET` y
`WOMPI_EVENTS_SECRET`. La llave privada **no aparece en el repositorio**, porque
con Checkout Web no hace falta: el checkout se abre por URL firmada y las
consultas de transacción van autenticadas con la llave pública
(`Authorization: Bearer <publicKey>` en `getTransaction`, en
`server/src/payments/wompi.ts`).

### Nada que empiece por `VITE_` es secreto

Esto no es una recomendación. Vite sustituye cada `import.meta.env.VITE_X` por
su valor **literal** al construir el bundle. El resultado es un `.js` servido
públicamente que contiene el secreto en texto plano. Cualquiera que abra las
herramientas de desarrollo, pestaña Sources, y busque la cadena, la encuentra.
No hay minificación ni ofuscación que lo evite.

Regla: **si tiene que ser secreto, no puede llamarse `VITE_…`.** Los tres
secretos de arriba viven en `server/.env`, que no se versiona, y se leen desde
`server/src/env.ts`. El frontend nunca los ve porque nunca los necesita: quien
firma es el servidor.

---

## 3. Los dos flujos

### 3.1 El feliz

```
CLIENTA            TIENDA (React)        API AURELLE              WOMPI
   |                    |                      |                     |
   |-- "Pagar" -------->|                      |                     |
   |                    |-- POST /api/payments/intent -->|           |
   |                    |                      |                     |
   |                    |          [ transacción de base de datos ]   |
   |                    |          1. recalcula el total desde SU base
   |                    |          2. crea Order en PENDING
   |                    |          3. holdStock(): reserved += cantidad
   |                    |          4. crea Payment en PENDING,
   |                    |             reservationState = HELD
   |                    |          5. gateway.openCheckout() → firma
   |                    |             de integridad + URL
   |                    |                      |                     |
   |                    |<-- 201 { reference, checkoutUrl, … } ------|
   |<-- redirección ----|                      |                     |
   |                    |                      |                     |
   |----------------- paga en checkout.wompi.co ------------------->|
   |                    |                      |                     |
   |                    |                      |<-- POST /api/payments/webhook/wompi
   |                    |                      |    (transaction.updated, APPROVED)
   |                    |                      |                     |
   |                    |        1. verifyEvent(): checksum + frescura
   |                    |        2. PaymentEvent con la fingerprint  |
   |                    |        3. canTransition(PENDING, APPROVED) → sí
   |                    |        4. Payment → APPROVED, approvedAt   |
   |                    |        5. consumeReservation():            |
   |                    |           reserved -= cant. y decrementStock(SALE)
   |                    |        6. reservationState = CONSUMED      |
   |                    |        7. Order → PAID                     |
   |                    |                      |-- 200 ------------->|
   |                    |                      |                     |
   |<-- vuelve a APP_URL con ?id=<transactionId> --------------------|
   |                    |-- GET /api/payments/:reference ----------->|
   |                    |<-- { status: APPROVED, orderStatus: PAID } |
   |<-- "Pago aprobado" |                      |                     |
```

Los pasos 1 a 5 del intento van **en una sola transacción de base de datos**. Si
`holdStock` lanza `InsufficientStockError`, no queda ni pedido ni cobro ni
reserva a medias: la respuesta es `409 INSUFFICIENT_STOCK` y no se creó nada.

Lo mismo con los pasos 2 a 7 del webhook: o se aplica todo, o no se aplica nada.
Descontar stock sin marcar el pedido como pagado, o al revés, deja la tienda
mintiendo.

### 3.2 El que de verdad importa: el webhook no llega

Los webhooks se pierden. Se cae el servidor cinco minutos, hay un despliegue en
curso, el proxy devuelve 502, el DNS parpadea. Wompi reintenta, pero no
inmediatamente y no para siempre. Si el webhook fuera la única vía, una clienta
que ya pagó vería "pendiente" durante minutos u horas.

Por eso hay dos vías, y hacen falta las dos:

- **El webhook es la vía principal.** Es la única que funciona cuando la clienta
  cierra la pestaña, paga por PSE desde el celular y no vuelve nunca, o paga con
  un medio asíncrono que se resuelve media hora después. Nadie está mirando.
- **La consulta al volver es la red.** Solo funciona si la clienta vuelve, pero
  cuando vuelve es instantánea, y es justo el momento en que hay alguien
  esperando una respuesta.

```
CLIENTA                    API AURELLE                     WOMPI
   |                            |                             |
   |------- paga ---------------------------------------------->|
   |                            |         X  webhook perdido    |
   |                            |            (nunca llega)      |
   |                            |                             |
   |<-- vuelve a APP_URL con ?id=1234-1610641025-49201 --------|
   |                            |                             |
   |-- GET /api/payments/:reference?transactionId=1234-… ----->|
   |                            |                             |
   |          ¿Payment sigue en PENDING y viene transactionId? |
   |                            |-- GET /v1/transactions/{id} ->|
   |                            |<-- { status: "APPROVED" } ----|
   |                            |                             |
   |          PaymentEvent(source = POLL), misma fingerprint,  |
   |          misma guarda canTransition, mismo consumo de     |
   |          reserva. El camino de aplicación es UNO SOLO.    |
   |                            |                             |
   |<-- { status: APPROVED, orderStatus: PAID } ---------------|
```

Detalles que importan:

- La consulta a la pasarela **solo se dispara si el cobro sigue pendiente** y si
  llega un `transactionId`. Si ya está resuelto, se responde lo que hay en la
  base sin molestar a Wompi.
- El `transactionId` lo añade Wompi a la URL de retorno como `id`. El frontend lo
  reenvía como `?transactionId=`. No se confía en él para nada más que para
  preguntar: el estado lo dicta la respuesta de Wompi, no el parámetro.
- `fetchByReference` del adaptador de Wompi **siempre devuelve `null`**: Wompi no
  expone una búsqueda pública por referencia. Si no hay `transactionId` y el
  webhook no llegó, no hay forma automática de preguntar. Queda la tercera vía:
  `POST /api/admin/payments/:id/sync` desde el panel, que necesita un
  `providerTransactionId` ya conocido.
- Si el webhook llega **después** de que la consulta ya aplicó el resultado, no
  pasa nada: la fingerprint es distinta (fuente distinta, momento distinto) pero
  `canTransition(APPROVED, APPROVED)` devuelve `false` y el evento se registra
  con `applied = false`.

`GET /api/admin/payments/health` existe para vigilar esto: devuelve
`pendingOlderThan15m` y `expiredNotReleased`. Los dos delatan que algo se quedó
a medias.

---

## 4. La reserva de stock

Es la parte menos obvia del diseño y está en `server/src/reservations.ts`.

### El problema

Entre que la clienta abre el checkout y su banco aprueba pueden pasar minutos.
Con PSE o Bancolombia Transfer, más. En ese hueco, sin apartar nada, otra
clienta compra la última unidad. Acabamos con un pago aprobado de algo que ya no
existe: hay que devolver el dinero, dar explicaciones y perder la venta y la
clienta.

Descontar el stock al abrir el checkout tampoco sirve. La mayoría de los
checkouts abiertos no terminan en venta, y el historial de inventario acabaría
lleno de movimientos de ventas que nunca ocurrieron.

### La solución

`Product` tiene dos columnas, no una:

```
stock     unidades que hay FÍSICAMENTE en la bodega
reserved  unidades ya comprometidas con un cobro sin resolver
vendible  stock − reserved
```

`stock` **no baja al reservar**. Baja cuando el pago se aprueba, y ahí sí deja su
movimiento `SALE` en `InventoryMovement`. Así el historial sigue contando solo
ventas de verdad, y una reserva abandonada no ensucia nada.

Las tres operaciones:

| Función | Qué hace | Cuándo |
|---|---|---|
| `holdStock` | `reserved += cantidad` | Al crear el intento |
| `releaseStock` | `reserved -= cantidad`, sin tocar `stock` | Rechazo, anulación, error, expiración |
| `consumeReservation` | Suelta la reserva **y** llama a `decrementStock` con tipo `SALE` | Pago aprobado |

`consumeReservation` hace las dos cosas juntas y en la misma transacción. Soltar
la reserva sin descontar dejaría el producto a la venta cuando ya se vendió;
descontar sin soltar lo contaría dos veces y lo escondería del catálogo
teniéndolo.

El descuento pasa por `decrementStock` de `server/src/inventory.ts`, el mismo
servicio que usa el resto del sistema. Se respeta la regla del README: el stock
nunca se escribe a mano, toda variación entra como movimiento.

### Por qué la condición va dentro del UPDATE

```sql
UPDATE products
   SET reserved = reserved + $cantidad
 WHERE id = $productId
   AND stock - reserved >= $cantidad
```

Leer primero y escribir después deja una rendija entre las dos consultas. Dos
compras simultáneas de la última unidad leen ambas "queda 1", ambas deciden que
alcanza, y ambas escriben. Resultado: `reserved` mayor que `stock` y dos cobros
aprobados sobre una sola unidad.

Dentro del `UPDATE`, Postgres lo resuelve de forma atómica: la segunda sentencia
no afecta ninguna fila. `holdStock` mira el número de filas afectadas y, si es
cero, lee el producto solo para poder decir en el error cuántas quedaban y lanza
`InsufficientStockError`. La API lo traduce a `409 INSUFFICIENT_STOCK`.

Es la misma técnica que ya usa `decrementStock` con `stock >= cantidad`. La
diferencia es contra qué se compara.

`releaseStock` usa `GREATEST(0, reserved - $cantidad)`. Es una red, no un
adorno: si por un fallo el contador quedara descuadrado, restar a ciegas lo
dejaría negativo, y entonces `stock − reserved` daría **más** de lo que hay, que
es justo el error que toda esta mecánica existe para evitar.

### Los carritos abandonados

Wompi no avisa cuando alguien abre el checkout y cierra la pestaña. Sin hacer
nada, esas unidades se quedan apartadas para siempre y la tienda va perdiendo
inventario vendible sin que nadie compre.

Por eso existe el estado `EXPIRED` en `PaymentStatus`, que es **nuestro** y no de
Wompi. Cada `Payment` tiene `expiresAt`, calculado con `RESERVATION_MINUTES`
(quince por defecto). Cuando pasa esa hora y el cobro sigue pendiente, se marca
`EXPIRED`, se llama a `releaseStock` y `reservationState` pasa a `RELEASED`.

La misma fecha viaja firmada dentro de la firma de integridad y como
`expiration-time` en la URL del checkout, así que Wompi también deja de aceptar
el pago cuando vence. Eso reduce —no elimina— la ventana en la que alguien podría
pagar un intento que nosotros ya liberamos.

`reservationState` (`HELD` → `CONSUMED` | `RELEASED`) es lo que hace **idempotente**
soltar la reserva. Sin ese sello, dos avisos del mismo rechazo devolverían las
unidades dos veces y el stock quedaría inflado.

**Cuidado:** hoy el barrido de vencidos **no es una tarea programada**. Se dispara
de forma oportunista, cuando algo del sistema pasa por ahí. Ver la sección 9.

### Una consecuencia deliberada

El catálogo público sigue mostrando `stock`, no `stock − reserved`. A la clienta
le importa que haya, no cuántas unidades están en el carrito de otra persona a
medio pagar. El precio de esa decisión es que, en el caso raro de que todas las
unidades estén reservadas, la clienta llega hasta el intento de pago y recibe un
`409` en vez de ver el producto agotado antes. `availableStock` existe para
cuando se quiera cambiar de criterio: devuelve `stock − reserved` por producto.

---

## 5. Idempotencia y desorden

Los webhooks de una pasarela llegan **repetidos** y **fuera de orden**. No es un
caso raro: es el funcionamiento normal.

- Repetidos, porque Wompi reintenta mientras no reciba un `200`. Si nuestra
  respuesta se pierde en el camino de vuelta, el aviso llega otra vez aunque ya
  se haya aplicado.
- Fuera de orden, porque son peticiones HTTP independientes. El `PENDING` que
  Wompi envió primero puede entregarse después del `APPROVED` que envió
  segundos más tarde.

Dos defensas, independientes entre sí.

### La huella única por evento

`PaymentEvent` tiene `@@unique([paymentId, fingerprint])`. La huella se calcula
en `verifyEvent` como un SHA-256 recortado a 32 caracteres de:

```
id de transacción | estado | monto en centavos | timestamp
```

El mismo aviso reenviado produce exactamente la misma huella, el índice único
rechaza la inserción y el segundo aviso se descarta sin volver a mover stock. La
respuesta sigue siendo `200`: para Wompi, aplicado y ya aplicado son lo mismo.

La huella se calcula **antes** de verificar la firma, a propósito. Así los
intentos con firma inválida también se registran —con `checksumOk = false`— y
tampoco se duplican. Un aviso falsificado es justo lo que hay que poder mirar
después.

### La guarda `canTransition`

Está en `server/src/payments/types.ts`:

```
current === next          → false   (nada que aplicar)
current === 'PENDING'     → true    (desde pendiente se va a cualquier desenlace)
current === 'APPROVED'    → next === 'VOIDED'
resto                     → false
```

El caso concreto que justifica esto: **recibir el `PENDING` después del
`APPROVED`**. Sin la guarda, ese aviso retrasado devolvería a pendiente un pedido
ya cobrado, le soltaría el stock reservado —que ya estaba `CONSUMED`— y dejaría a
la clienta pagando algo que la tienda cree que nadie compró. Con la guarda, el
evento se registra con `applied = false` y una nota, y no cambia nada.

Un cobro aprobado solo puede pasar a `VOIDED`. Nunca "des-aprobarse" a
`DECLINED`. Y desde un estado final no se resucita: si la clienta reintenta, se
crea **otro** `Payment` con otra referencia. Por eso `Order` tiene `payments[]` y
no un solo pago: el primer intento rechazado deja su rastro y se puede explicar
por qué falló.

### Y una tercera, discreta

`mapStatus` traduce los estados de Wompi a los nuestros. Wompi documenta
`APPROVED`, `DECLINED`, `VOIDED`, `ERROR` y `PENDING`, pero su API ha devuelto
además `PROCESSING`, `FAILED` y `REJECTED` según el medio de pago. **Lo
desconocido cae en `PENDING`, no en `ERROR`**, a propósito: ante la duda un cobro
se deja abierto para volver a preguntar, nunca se da por fallido. Darlo por
fallido soltaría el stock de algo que quizá sí se pagó.

---

## 6. Las dos firmas

Son dos cosas distintas, con dos secretos distintos, que protegen dos cosas
distintas. Confundirlas es un error frecuente.

### 6.1 Firma de integridad — protege el monto

```
SHA256( referencia + monto_en_centavos + moneda + [expiración] + secreto_de_integridad )
```

Sin separadores, hexadecimal en minúsculas. En
`server/src/payments/wompi.ts`, función `integritySignature`. Viaja en la URL del
checkout como `signature:integrity`.

Es lo único que impide que alguien abra las herramientas de desarrollo, edite el
monto de la URL del checkout y **pague $1.000 un pedido de $300.000**. Wompi
recalcula esta firma con el mismo secreto y rechaza la transacción si el monto no
es el que se firmó.

La expiración entra en la cadena **solo si se manda el parámetro**, y ahí es fácil
equivocarse: firmarla y no enviarla, o al revés, da una firma inválida y Wompi
responde con un error que no explica por qué. Aquí siempre se manda, y el texto
firmado y el enviado salen de la misma llamada a `expirationTime`, que es
`toISOString()` aislado en una función precisamente para que sean el mismo byte a
byte.

Esta firma protege el monto **en el camino de ida**. No protege nada más. En
particular, no dice nada sobre si el pago ocurrió.

### 6.2 Firma de eventos — autentica el webhook

```
SHA256( valores de signature.properties, en orden + timestamp + secreto_de_eventos )
```

Sin separadores, con el `timestamp` como entero. En
`server/src/payments/wompi.ts`, función `verifyEventChecksum`.

`signature.properties` es un arreglo de rutas con puntos dentro de `data`
(`"transaction.id"`, `"transaction.status"`, `"transaction.amount_in_cents"`…).
Se resuelven **dinámicamente** en vez de leer campos fijos, porque es lo que dice
el contrato y porque el día que Wompi añada una propiedad a la firma, esto la
incluye sin tocar nada.

**Esto es lo único que autentica el webhook.** La ruta no tiene token, no puede
tenerlo, y es pública en internet. Sin esta verificación, cualquiera que sepa la
URL puede mandar un JSON diciendo "transacción aprobada" y sacar mercancía de la
bodega sin pagar. Firma mala → `401`, y el intento se registra igual.

Dos detalles que no son adorno:

- **Comparación en tiempo constante** (`timingSafeEqual`). Con `===`, el tiempo de
  comparación depende de cuántos caracteres coinciden, y eso deja adivinar un
  checksum válido byte a byte. Es un ataque remoto, lento y real.
- **Ventana de frescura** (`eventIsFresh`, `EVENT_MAX_AGE_SECONDS` = 24 h). Un
  aviso legítimo de hace tres días, reenviado por alguien que lo capturó,
  llevaría una firma perfectamente válida. El timestamp es lo único que permite
  descartarlo. La ventana es holgada porque Wompi reintenta durante horas, y
  tolera 300 segundos de reloj adelantado del lado de Wompi.

Solo se acepta el evento `transaction.updated`. Cualquier otro se rechaza con su
razón.

### 6.3 Advertencia comprobada sobre la documentación de Wompi

**El ejemplo resuelto que publica la documentación de Wompi no reproduce su
propio checksum.** Se verificó: la cadena que imprimen, hasheada con el secreto
que imprimen, da un hash distinto del que muestran como resultado.

La **regla en prosa** sí es coherente entre la documentación en español, la
inglesa y las implementaciones de terceros, y es la que está implementada en
`verifyEventChecksum`. Pero no hay un vector de prueba fiable contra el cual
validar sin recibir un evento real.

Consecuencia práctica, y no es opcional:

1. **Verifica el primer webhook real en sandbox** antes de confiar en esto.
2. Si rebota con `401`, enciende `WOMPI_DEBUG_EVENTS=true`. Registra la cadena
   exacta que se calculó, para poder compararla con lo que se esperaba.
3. **Apágalo después.** Esa cadena lleva el secreto de eventos dentro y acabaría
   en los logs. `server/src/env.ts` se niega a encenderlo en producción
   (`debugPaymentEvents` exige `!isProduction`), pero eso es una red, no una
   excusa para dejarlo puesto.

---

## 7. El modo simulado

`PAYMENT_PROVIDER=mock` activa `createMockGateway` (`server/src/payments/mock.ts`).
Es el valor por defecto.

### Por qué existe

Abrir una cuenta de comercio en Wompi y que la aprueben **tarda días**. Sin el
modo simulado, nadie podría clonar el repositorio, correr `npm run setup` y ver
funcionar la mitad más delicada del sistema.

No es un atajo para no escribir la pasarela de verdad. Recorre exactamente el
mismo camino —intento, reserva de stock, redirección, aviso, reconciliación— con
las mismas estructuras y por el mismo código de aplicación. Probar aquí prueba el
flujo real. Lo único falso es **quién decide el desenlace**: en vez de un banco,
decide quien pulsa el botón.

### Cómo se comporta

- `openCheckout` manda a `<APP_URL>/pago/simulado?ref=…&monto=…&volver=…` en vez
  de a un dominio externo. La referencia y el monto van en la URL solo para
  poder pintarlos; quien manda sobre el monto sigue siendo la base de datos.
- `POST /api/payments/mock/:reference` con `{ "outcome": "APPROVED" | "DECLINED" | "PENDING" }`
  es el botón que hace de banco.
- `verifyEvent` no comprueba ninguna firma —no hay secreto compartido con nadie—
  pero pasa por la misma puerta y devuelve la misma forma, para que el servicio
  no tenga un camino especial para el modo demo.
- `fetchByTransactionId` y `fetchByReference` devuelven `null`. La pasarela
  simulada no guarda estado propio: la verdad está en nuestra tabla `payments`.
  Consecuencia: `POST /api/admin/payments/:id/sync` no hace nada útil en modo
  simulado, y es correcto — no hay a quién preguntarle.
- Los ids de transacción simulados tienen la misma pinta que los de Wompi
  (`1234-1610641025-49201`) para que nada del resto del sistema pueda depender
  sin querer del formato.

### La garantía

Una ruta capaz de marcar pagos como aprobados a voluntad, expuesta en
producción, es la tienda regalada.

`server/src/payments/index.ts` elige la pasarela **una sola vez al arrancar** y
exporta `isMockProvider()`. Las rutas del simulador —la pantalla de checkout
falsa y `POST /api/payments/mock/:reference`— **solo se registran cuando
`isMockProvider()` es verdadero**. Con `PAYMENT_PROVIDER=wompi` esas rutas no
existen en el enrutador: no hay 403 que saltarse ni condición que engañar en
tiempo de ejecución, simplemente devuelven `404` porque nunca se declararon.

Además, `assertPaymentsReady` hace ruido en el arranque:

- Modo simulado → avisa en el log que no se cobra de verdad.
- Wompi mal configurado **en producción** → lanza y el servidor **no arranca**.
  Arrancar con Wompi mal configurado es peor que no arrancar: la tienda
  parecería sana y fallaría al cobrar, que es el único momento en que no puede
  fallar.
- Wompi mal configurado en desarrollo → avisa y sigue, para no bloquear a quien
  esté trabajando en otra cosa.

---

## 8. Variables de entorno

Todas en `server/.env` (copia de `server/.env.example`). Se leen en
`server/src/env.ts`. Ese archivo no se versiona.

| Variable | Obligatoria | Qué hace | De dónde sale |
|---|---|---|---|
| `PAYMENT_PROVIDER` | No (`mock`) | `mock` o `wompi`. Cualquier otro valor cae en `mock` | Decisión propia |
| `WOMPI_PUBLIC_KEY` | Con `wompi` | Llave pública. Su prefijo (`pub_test_` / `pub_prod_`) decide si se usa sandbox o producción | Panel de comercios de Wompi → Desarrolladores → Llaves de API |
| `WOMPI_INTEGRITY_SECRET` | Con `wompi` | Secreto con el que se firma el monto del checkout | Misma pantalla que la llave pública |
| `WOMPI_EVENTS_SECRET` | Con `wompi` | Secreto con el que se verifica el checksum de los webhooks | Misma pantalla que la llave pública |
| `WOMPI_API_URL` | No | Fuerza la URL de la API. Por defecto se deduce del prefijo de la llave: `https://sandbox.wompi.co/v1` o `https://production.wompi.co/v1` | Solo para casos raros |
| `WOMPI_DEBUG_EVENTS` | No (`false`) | `true` registra la cadena firmada al verificar un webhook. Para depurar el primer evento. Se ignora en producción | Decisión propia |
| `APP_URL` | No (`http://localhost:5173`) | Base pública del sitio. De aquí sale la URL de retorno del pago y, en modo simulado, la del checkout falso | El dominio real de la tienda |
| `RESERVATION_MINUTES` | No (`15`) | Minutos que se apartan las unidades mientras se paga. Corto castiga a quien pague por transferencia; largo bloquea mercancía por carritos abandonados | Decisión propia |

Sandbox lleva prefijos `_test_`; producción, `_prod_`. Son cuentas y secretos
distintos: cambiar de una a otra es cambiar las tres credenciales, no solo la
llave pública.

Relacionadas, de otras secciones pero necesarias para que esto funcione:

| Variable | Por qué importa aquí |
|---|---|
| `CORS_ORIGIN` | El frontend que llama a `/api/payments/intent` tiene que estar en la lista |
| `DATABASE_URL` | Todo el flujo depende de transacciones de Postgres |

---

## 9. Salir a producción

Lista de verificación. No es opcional ninguna.

- [ ] **Rotar las credenciales de sandbox.** Las de `_test_` no sirven en
      producción y, si estuvieron en un `.env` compartido, hay que asumir que se
      conocen. Pedir las de `_prod_` en el panel de Wompi y ponerlas solo en el
      entorno del servidor.
- [ ] **Configurar la URL del webhook en el panel de comercios de Wompi**, para
      el ambiente de producción:
      `https://<tu-dominio>/api/payments/webhook/wompi`. Si esto no se hace, el
      webhook nunca llega y todo el cobro depende de que la clienta vuelva.
- [ ] **`PAYMENT_PROVIDER=wompi`.** El valor por defecto es `mock`. Un despliegue
      que se olvide de esto no cobra nada y da todo por aprobado desde una ruta
      que, con `wompi`, ni existiría.
- [ ] **`APP_URL` con el dominio real**, con `https://` y sin barra final. De ahí
      sale la URL de retorno; si queda en `localhost`, la clienta vuelve a ningún
      lado.
- [ ] **HTTPS en todo.** La URL de retorno, la del webhook y la del panel. Wompi
      no entrega webhooks a `http://`, y la referencia viaja en una URL.
- [ ] **Verificar el primer evento real en sandbox** antes de abrir al público,
      por lo de la sección 6.3. Confirmar que el `POST` al webhook devuelve `200`
      y que el `Payment` pasó a `APPROVED` con `reservationState = CONSUMED`.
- [ ] **Apagar `WOMPI_DEBUG_EVENTS`.** La cadena que registra contiene el secreto
      de eventos.
- [ ] **Programar el barrido de cobros vencidos.** Hoy se dispara de forma
      oportunista, no con un cron. Con poco tráfico, un pago abandonado puede
      quedarse en `HELD` mucho más de `RESERVATION_MINUTES` porque nadie pasa por
      ahí a mirarlo. Hasta que exista la tarea programada, vigilar
      `expiredNotReleased` en `GET /api/admin/payments/health`.
- [ ] **Probar los rechazos, no solo los aprobados.** Una tarjeta declinada, un
      checkout abandonado hasta que expire, un webhook duplicado y un webhook con
      firma inválida. Comprobar en cada caso que `reserved` vuelve a su sitio y
      que `stock` no se movió. El camino feliz casi siempre funciona; los otros
      son los que dejan inventario fantasma.
- [ ] **Revisar `CORS_ORIGIN`** para que incluya el dominio real y no siga
      apuntando a `localhost`.
- [ ] **Comprobar `GET /api/admin/payments/health`** después del despliegue:
      `configured: true` y `problems: []`.

---

## 10. Lo que no está hecho

Sin adornos. Quien mantenga esto va a tropezar con estas cosas.

1. **No hay reembolsos ni anulaciones desde el panel.** Wompi los soporta por
   API, pero aquí no hay ruta ni botón. Un reembolso hoy se hace en el panel de
   Wompi, a mano, y el estado del `Payment` en Aurelle **no se entera**: hay que
   ajustarlo aparte. `VOIDED` existe en el modelo y `canTransition` lo permite
   desde `APPROVED`, pero nada lo dispara desde nuestro lado.
2. **No hay correos de confirmación.** Ni de pedido recibido, ni de pago
   aprobado, ni de pago rechazado. El mensaje de `APPROVED` en
   `server/src/payments/types.ts` dice literalmente "Te enviamos la confirmación
   por correo", y **eso hoy es mentira**. O se implementa el envío o se cambia el
   texto antes de salir a producción.
3. **El barrido de expiraciones no es una tarea programada.** Es lo que más
   probablemente muerda primero. Ver la sección 9.
4. **No hay reintento con espera creciente si Wompi no responde.** Las consultas
   a la API tienen un `AbortSignal.timeout(15_000)` y si fallan, fallan. Al abrir
   el checkout no se llama a la API —el Checkout Web se arma por URL— así que ahí
   el riesgo es menor, pero `fetchByTransactionId` sí puede fallar en un momento
   inoportuno y no reintenta.
5. **No hay conciliación contable contra los reportes de Wompi.** Nadie compara
   lo que dice nuestra tabla `payments` con lo que Wompi liquidó. Si un cobro se
   pierde entre los dos sistemas, no hay nada que lo detecte.
6. **Un pago que se aprueba después de expirar queda atascado.** Si un cobro pasó
   a `EXPIRED` y luego llega un `APPROVED` tardío, `canTransition('EXPIRED',
   'APPROVED')` devuelve `false`: el evento se registra pero no se aplica, la
   clienta pagó y el pedido queda sin marcar como pagado. La `expiration-time`
   firmada que se manda a Wompi hace esto poco probable, y la decisión es
   deliberada —es preferible a resucitar un pedido cuyo stock ya se liberó y
   quizá se vendió— pero **hay que revisarlo a mano** cuando pase. Se ve en
   `GET /api/admin/payments/:id`, en los eventos con `applied = false`.
7. **Un webhook cuya referencia no corresponde a ningún `Payment` no se puede
   registrar.** `PaymentEvent` cuelga de `Payment` por clave foránea. Un aviso
   sobre una referencia desconocida —o falsificada con una referencia inventada—
   no tiene dónde guardarse y solo queda en el log del servidor.
8. **El catálogo público no descuenta las reservas.** Ver el final de la sección
   4. Es deliberado, pero significa que en un producto con muy poco stock la
   clienta puede llegar hasta el pago y recibir un `409`.
9. **Un solo intento activo por pedido no está forzado.** El modelo permite
   varios `Payment` por `Order`, que es lo que se quiere para los reintentos,
   pero nada impide abrir dos checkouts simultáneos del mismo pedido y reservar
   el stock dos veces.
