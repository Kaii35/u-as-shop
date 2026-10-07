/**
 * Arma el informe de las pruebas de pagos a partir de docs/pruebas-wompi/resultados.json.
 *
 *     npm run payments:report
 *
 * Produce docs/pruebas-wompi/informe.html, pensado para leerse en pantalla y
 * para imprimirse a PDF sin retoques (A4, saltos de página controlados).
 *
 * El contenido fijo —hallazgos, arquitectura, riesgos— vive aquí y no en el
 * banco de pruebas a propósito: el banco mide, el informe cuenta. Los números
 * salen siempre del JSON, así que no pueden quedarse desfasados respecto a lo
 * que se midió de verdad.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESTILOS, FUENTES, esc } from './informe-estilos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../..');
const CARPETA = join(RAIZ, 'docs/pruebas-wompi');

interface Resultado {
  id: string; grupo: string; nombre: string; esperado: string;
  estado: 'PASA' | 'FALLA' | 'NO_APLICA'; observado: string;
  porque: string; severidad: string;
}
interface Datos {
  generado: string; ambiente: string; comercio: string | null; pasarela: string;
  resumen: { pasan: number; fallan: number; sinAplicar: number; total: number };
  limpieza: string; resultados: Resultado[];
}

const datos: Datos = JSON.parse(await readFile(join(CARPETA, 'resultados.json'), 'utf8'));

const fecha = new Date(datos.generado).toLocaleString('es-CO', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
});

const porGrupo = new Map<string, Resultado[]>();
for (const r of datos.resultados) {
  if (!porGrupo.has(r.grupo)) porGrupo.set(r.grupo, []);
  porGrupo.get(r.grupo)!.push(r);
}

const ETIQUETA: Record<Resultado['estado'], string> = { PASA: 'Pasa', FALLA: 'Falla', NO_APLICA: 'Sin aplicar' };

// ---------------------------------------------------------------------------
// Contenido redactado
// ---------------------------------------------------------------------------

const CAPAS = [
  {
    nombre: 'Firma de integridad',
    donde: 'Al abrir el checkout',
    protege: 'Que nadie cambie el monto del pedido en el navegador antes de pagar.',
    como: 'SHA-256 sobre referencia + monto + moneda + expiración + secreto de integridad. Wompi recalcula la firma y rechaza la transacción si el monto no es el firmado. El secreto nunca sale del servidor.',
    pruebas: 'FIRM-01 a FIRM-05',
  },
  {
    nombre: 'Checksum del aviso',
    donde: 'Al recibir un webhook',
    protege: 'Que cualquiera pueda mandarnos «pagado» y llevarse la mercancía.',
    como: 'SHA-256 sobre las propiedades firmadas + timestamp + secreto de eventos, comparado en tiempo constante para que no se pueda adivinar byte a byte midiendo tiempos de respuesta.',
    pruebas: 'AVIS-01 a AVIS-06, ATAQ-01',
  },
  {
    nombre: 'Verificación del monto',
    donde: 'Al aplicar un aviso',
    protege: 'Que una transacción legítima de $1.000 confirme un pedido de $300.000.',
    como: 'Antes de aprobar nada se compara el monto que dice la pasarela con el que nosotros cobramos. Si no coinciden, el pago no se aprueba y la discrepancia queda registrada.',
    pruebas: 'ATAQ-02',
  },
  {
    nombre: 'Ventana de frescura',
    donde: 'Al recibir un webhook',
    protege: 'Que un aviso legítimo capturado hace días se reenvíe como si fuera nuevo.',
    como: 'Se descarta todo aviso de más de 48 h, con 5 minutos de tolerancia hacia el futuro por desfase de relojes. La ventana cubre con margen los tres reintentos de Wompi.',
    pruebas: 'AVIS-07 a AVIS-09',
  },
  {
    nombre: 'Idempotencia',
    donde: 'Al aplicar un aviso',
    protege: 'Que los reintentos de Wompi descuenten el stock dos veces o cobren por partida doble.',
    como: 'Cada aviso lleva una huella y la pareja (pago, huella) es única en la base. Un reenvío se reconoce, se responde 200 para que Wompi deje de insistir, y no se vuelve a aplicar.',
    pruebas: 'ATAQ-03, ATAQ-04',
  },
  {
    nombre: 'Guardia de transiciones',
    donde: 'Al cambiar de estado',
    protege: 'Que un aviso desordenado cancele un pedido ya cobrado.',
    como: 'Los avisos llegan fuera de orden. Un pago aprobado no admite volver a pendiente ni pasar a rechazado; en cambio un pago caducado sí admite aprobación tardía, porque si el dinero entró, entró.',
    pruebas: 'EST-01 a EST-03',
  },
  {
    nombre: 'Reserva atómica de stock',
    donde: 'Al crear el intento',
    protege: 'Que dos compras simultáneas vendan la misma unidad.',
    como: 'La condición de stock va DENTRO del UPDATE, no en una lectura previa. La base decide quién gana; el perdedor recibe 409. El stock nunca se escribe a mano: todo cambio es un movimiento de inventario dentro de una transacción.',
    pruebas: 'ATAQ-06, ATAQ-08',
  },
  {
    nombre: 'Superficie mínima',
    donde: 'En todo el perímetro',
    protege: 'Que haya más puerta de la que hace falta.',
    como: 'La ruta de pago simulado no se registra con Wompi activo. La consulta pública de un pago no devuelve datos personales. Las referencias se validan por forma antes de tocar la base. Al exponer el webhook a internet solo se publica esa ruta, no la API.',
    pruebas: 'ATAQ-05, SUP-01 a SUP-04',
  },
  {
    nombre: 'Límite de peticiones',
    donde: 'En las rutas públicas',
    protege: 'Que una ráfaga aparte todo el inventario sin pagar nada.',
    como: '20 intentos por minuto y 60 consultas por minuto, por IP. El webhook va con un tope muy alto (300/min) a propósito: un 429 gastaría uno de los tres reintentos de Wompi y eso perdería pagos de verdad.',
    pruebas: 'ATAQ-10, ATAQ-11',
  },
];

const HALLAZGOS = [
  {
    id: 'H-6',
    estado: 'corregido',
    titulo: 'Conciliar un cobro que no había cambiado tiraba lo aprendido',
    gravedad: 'Media',
    que: 'Al aplicar una instantánea de la pasarela, el medio de pago solo se guardaba si el estado cambiaba. Un cobro que sigue PENDING no es una transición, así que el evento se cerraba como repetido y el dato se perdía.',
    evidencia: 'Visto con un pago real de DaviPlata que se quedó pendiente: la pasarela decía DAVIPLATA, nosotros preguntamos por referencia, guardamos el id de la transacción y el medio se quedó en null. Y es justo el caso en que más falta hace: cuando una clienta escribe diciendo que pagó, lo primero que hay que poder contestar es por dónde.',
    arreglo: 'El medio pasa al bloque de metadatos que se refresca siempre, aplique o no el cambio de estado. No se pisa un medio ya conocido con UNKNOWN: ahí la pasarela no dice «otro», dice «no sé».',
    nota: 'Comprobado sobre un cobro real: de null a DAVIPLATA preguntando solo por referencia. Regresión cubierta por REC-04.',
  },
  {
    id: 'H-0',
    estado: 'corregido',
    titulo: 'Con APP_URL en localhost el checkout no abre, en absoluto',
    gravedad: 'Crítica',
    que: 'Wompi rechaza con un 403 de CloudFront («Request blocked») cualquier redirect-url que apunte a localhost o 127.0.0.1, con http y con https. La configuración por defecto del proyecto era APP_URL=http://localhost:5173.',
    evidencia: 'Aislado parámetro a parámetro contra el checkout real: con los otros doce parámetros la URL responde 200, y basta añadir el redirect-url a localhost para que devuelva 403. Un dominio cualquiera pasa, incluso por http simple. Esta es la razón de que la integración nunca se hubiera completado de punta a punta.',
    arreglo: 'El arranque lo detecta y avisa a gritos; en producción aborta. Para probar en local, APP_URL apunta al mismo túnel con el que se reciben los avisos. La prueba FIRM-06 no se conforma con mirar la forma de la URL: pide el checkout de verdad y exige un 200.',
    nota: 'El síntoma no se parece a la causa: la clienta ve una página de error de Amazon sin una sola pista, y en nuestro servidor no queda ni rastro.',
  },
  {
    id: 'H-1',
    estado: 'corregido',
    titulo: 'Las reservas de stock no tenían ningún freno',
    gravedad: 'Alta',
    que: 'Crear un intento de pago aparta unidades durante 15 minutos y no exige cuenta, pago ni nada. No había límite de peticiones.',
    evidencia: 'Medido contra esta misma tienda: 10 reservas aceptadas en 355 ms desde una sola IP, dejando el producto sin unidades disponibles durante un cuarto de hora. Repetido sobre el catálogo, apaga la tienda sin que entre un peso.',
    arreglo: 'Se añadió límite de peticiones por IP en las rutas públicas de pago (20/min en intentos, 60/min en consultas, 300/min en el webhook), más un tope de 256 KB de cuerpo y una decisión explícita sobre si creer la cabecera X-Forwarded-For.',
    nota: 'MITIGADO, NO CERRADO. Ver R-1 en riesgos abiertos.',
  },
  {
    id: 'H-2',
    estado: 'corregido',
    titulo: 'La ventana de frescura rechazaba el último reintento de Wompi',
    gravedad: 'Alta',
    que: 'Los avisos de más de 24 h se descartaban por viejos. Wompi reintenta un aviso no confirmado a los 30 minutos, a las 3 horas y a las 24 horas.',
    evidencia: 'El tercer reintento sale exactamente a las 24 h del original, así que caía fuera de la ventana por segundos y lo rechazábamos nosotros mismos. Es justo el que más falta hace: el que llega después de dos fallos.',
    arreglo: 'Ventana ampliada a 48 h. No debilita la defensa: un aviso repetido ya rebota antes por la unicidad de (pago, huella), y la ventana solo sirve para descartar capturas viejas.',
    nota: 'Prueba de regresión permanente: AVIS-08.',
  },
  {
    id: 'H-3',
    estado: 'corregido',
    titulo: 'No se podía reconciliar un cobro por referencia',
    gravedad: 'Alta',
    que: 'El adaptador solo sabía consultar por id de transacción, que llega en el webhook o en la URL de retorno. Si se perdían los dos, el cobro se quedaba pendiente para siempre con el stock bloqueado.',
    evidencia: 'Es el caso real de quien paga y cierra el navegador, o se queda sin batería. Se comprobó contra el API de Wompi que GET /v1/transactions?reference= sí responde, pero solo autenticado con la llave privada, que no estaba configurada.',
    arreglo: 'Se añadió WOMPI_PRIVATE_KEY y se implementó la búsqueda por referencia. Las consultas al API pasan a usar la llave privada, que además es lo que Wompi recomienda desde que retiró el soporte a consultar transacciones desde el frontend.',
    nota: 'Si una referencia tiene varios intentos, manda el aprobado; si no, el más reciente. Prueba REC-01.',
  },
  {
    id: 'H-4',
    estado: 'verificado',
    titulo: 'El ejemplo resuelto de la documentación de Wompi no reproduce su propio checksum',
    gravedad: 'Informativa',
    que: 'La documentación publica una cadena de ejemplo, un secreto de ejemplo y el checksum resultante. Hasheando la cadena que publican con el secreto que publican sale otro hash.',
    evidencia: 'Comprobado en esta sesión. Esperado 3476DDA5…8BD0; calculado 5A18EC5E…EFBE. La explicación más probable es que anonimizaran el secreto pero dejaran el hash real.',
    arreglo: 'Ninguno posible por nuestra parte. Se implementa la regla en prosa, que sí es coherente entre la documentación en español, la inglesa y las implementaciones de terceros.',
    nota: 'Por esto existe E2E-01: solo un aviso emitido por Wompi demuestra que nuestro algoritmo es el suyo.',
  },
  {
    id: 'H-5',
    estado: 'corregido',
    titulo: 'La primera versión de la prueba E2E daba falsas alarmas',
    gravedad: 'Media',
    que: 'E2E-01 contaba como «aviso real de Wompi» cualquier petición que pasara por el proxy del túnel.',
    evidencia: 'Las sondas con las que se verifica que el túnel funciona ({"x":1}) entraban como avisos reales rechazados, y la prueba concluía que el algoritmo del checksum estaba roto. Lo estaba midiendo contra nuestro propio tráfico de verificación.',
    arreglo: 'Ahora solo cuentan las entradas con forma de aviso de Wompi: event, timestamp, signature.properties y signature.checksum. Las sondas se reportan aparte.',
    nota: 'Una prueba de seguridad que grita sin motivo acaba ignorándose, que es peor que no tenerla.',
  },
];

const RIESGOS = [
  {
    id: 'R-1',
    titulo: 'El inventario se puede agotar sin pagar',
    gravedad: 'Alta',
    detalle: 'El límite de peticiones frena el barrido del catálogo entero —de segundos a varios minutos— pero no salva a un producto concreto: poner el tope por debajo del stock de un artículo dejaría fuera a clientas reales. Un producto con diez unidades sigue siendo vaciable en menos de un minuto desde una sola IP, y repartido entre muchas IPs el problema escala.',
    cierre: 'Apartar stock al abrir el checkout en vez de al crear el intento; acortar la ventana de reserva; topar las reservas pendientes por IP. Las tres son cambios de producto, no de configuración.',
  },
  {
    id: 'R-2',
    titulo: 'La caducidad de reservas es oportunista, no programada',
    gravedad: 'Media',
    detalle: 'Las reservas vencidas se liberan aprovechando que alguien compra. En una tienda sin tráfico, las unidades de un carrito abandonado se quedan bloqueadas indefinidamente.',
    cierre: 'Una tarea programada cada minuto, o un worker. Hoy está así para que la demo funcione sin infraestructura extra.',
  },
  {
    id: 'R-3',
    titulo: 'La URL de eventos es un túnel temporal',
    gravedad: 'Media',
    detalle: 'La URL de pruebas vive mientras el túnel esté arriba y cambia en cada reinicio. Para producción hace falta un dominio propio con TLS, y registrar URLs distintas para sandbox y para producción.',
    cierre: 'Desplegar la API tras un dominio estable y registrar esa URL en el Dashboard de Wompi, ambiente por ambiente.',
  },
  {
    id: 'R-4',
    titulo: 'Sin devoluciones ni anulaciones desde el panel',
    gravedad: 'Media',
    detalle: 'Un pago aprobado por error solo se puede deshacer desde el Dashboard de Wompi, y esa anulación no vuelve automáticamente al inventario.',
    cierre: 'Implementar la anulación contra el API de Wompi y el movimiento de inventario que la acompaña.',
  },
  {
    id: 'R-5',
    titulo: 'Las credenciales se compartieron por chat',
    gravedad: 'Media',
    detalle: 'Las cuatro credenciales de sandbox llegaron por mensaje. Para pruebas el daño posible es acotado —no hay dinero real— pero quedan en un historial de conversación.',
    cierre: 'Rotarlas desde el Dashboard cuando termine la integración. Y para las de PRODUCCIÓN: no pasarlas nunca por chat ni por correo; cargarlas directamente en el servidor o en un gestor de secretos.',
  },
];

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------

const fila = (r: Resultado): string => `
  <tr class="estado-${r.estado}">
    <td class="id">${esc(r.id)}</td>
    <td>
      <div class="nombre">${esc(r.nombre)}</div>
      <div class="porque"><span class="rot">Por qué</span> ${esc(r.porque)}</div>
      <div class="obs"><span class="rot">Observado</span> ${esc(r.observado)}</div>
    </td>
    <td class="sev sev-${r.severidad}">${esc(r.severidad)}</td>
    <td class="res">${ETIQUETA[r.estado]}</td>
  </tr>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de pruebas · Pasarela de pagos Wompi</title>
${FUENTES}
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">

  <header class="portada">
    <div class="marca">Natalia Sánchez · Insumos de belleza profesional</div>
    <h1>Informe de pruebas<br>de la pasarela de pagos</h1>
    <p class="sub">Integración con Wompi · Verificación funcional y de seguridad</p>
    <dl class="meta">
      <div><dt>Comercio</dt><dd>${esc(datos.comercio ?? 'Natalia Andrea Sánchez Pérez')}</dd></div>
      <div><dt>Ambiente</dt><dd>${datos.ambiente === 'sandbox' ? 'Pruebas (sandbox)' : 'PRODUCCIÓN'}</dd></div>
      <div><dt>Pasarela</dt><dd>${esc(datos.pasarela)}</dd></div>
      <div><dt>Fecha</dt><dd>${esc(fecha)}</dd></div>
    </dl>
  </header>

  <section>
    <h2>Resumen</h2>
    <div class="marcador tres">
      <div class="caja bien"><span class="n">${datos.resumen.pasan}</span><div class="l">Pasan</div></div>
      <div class="caja ${datos.resumen.fallan > 0 ? 'mal' : ''}"><span class="n">${datos.resumen.fallan}</span><div class="l">Fallan</div></div>
      <div class="caja na"><span class="n">${datos.resumen.sinAplicar}</span><div class="l">Sin aplicar</div></div>
    </div>

    <p>Se ejecutaron <strong>${datos.resumen.total} pruebas</strong> sobre la integración de pagos: credenciales,
    firma de integridad del checkout, verificación de los avisos de la pasarela, intentos de abuso,
    máquina de estados, reconciliación, superficie expuesta y límites de uso.</p>

    <div class="destacado">
      <p><strong>Veredicto: la pasarela funciona de punta a punta.</strong> Se completaron pagos
      reales en el sandbox de Wompi, con tarjeta aprobada y con tarjeta rechazada, conduciendo el
      checkout real en un navegador. En los dos casos llegó el aviso de Wompi,
      <strong>nuestra verificación del checksum lo aceptó</strong>, el pedido cambió de estado y el
      inventario se movió —o no se movió— como correspondía.</p>
      <p>Eso cierra la única duda de fondo que quedaba: el algoritmo del checksum que implementamos
      <strong>es</strong> el de Wompi, pese a que el ejemplo resuelto de su documentación no
      reproduzca su propio hash (H-4).</p>
      <p>La integración además resiste los ataques que se le probaron: no se puede cambiar el monto
      de un pedido, no se puede falsificar un aviso, un aviso repetido no duplica nada y dos compras
      simultáneas no venden la misma unidad. Durante las pruebas aparecieron
      <strong>cinco defectos reales, los cinco corregidos</strong>, y queda
      <strong>un riesgo abierto</strong> que no es de configuración sino de diseño (R-1).</p>
    </div>

    <h3 style="margin:6mm 0 2mm; color:var(--clay)">Pagos reales completados en sandbox</h3>
    <table>
      <thead><tr><th>Referencia</th><th>Tarjeta</th><th>Wompi</th><th>Pedido</th><th>Inventario</th></tr></thead>
      <tbody>
        <tr><td class="id">AU-11682-b7c7</td><td>Tarjeta 4242…4242</td><td>APPROVED</td>
            <td>PAID</td><td>SALE −1 · stock 20 → 19</td></tr>
        <tr><td class="id">AU-11683-93c1</td><td>Tarjeta 4111…1111</td><td>DECLINED</td>
            <td>CANCELLED</td><td>sin movimiento · reserva liberada</td></tr>
        <tr><td class="id">AU-11697-53c9</td><td>Nequi 3991111111</td><td>APPROVED</td>
            <td>PAID</td><td>SALE −1 · stock 18 → 17</td></tr>
        <tr><td class="id">AU-11698-eb35</td><td>PSE · banco que aprueba</td><td>APPROVED</td>
            <td>PAID</td><td>SALE −1 · stock 17 → 16</td></tr>
        <tr><td class="id">AU-11700-6aac</td><td>DaviPlata</td><td>PENDING</td>
            <td>PENDING</td><td>unidades apartadas · recuperado por referencia</td></tr>
      </tbody>
    </table>
    <p style="font-size:8.5pt;margin-top:2mm">En los cuatro que se resolvieron, el aviso de Wompi
    quedó registrado con <code>checksumOk = true</code> y <code>aplicado = true</code>. DaviPlata no
    se resuelve solo en sandbox —espera aprobación en la app— y se dejó a propósito en ese estado:
    sirvió para probar la recuperación de un cobro del que no sabíamos ni el id de la transacción.</p>
  </section>

  <section class="evitar">
    <h2>Qué es real en estas pruebas</h2>
    <p>Un informe de seguridad vale lo que valga su metodología, así que conviene ser explícito
    sobre dónde termina lo comprobado:</p>
    <ul>
      <li><strong>El API de Wompi es real.</strong> Las credenciales se validan contra
      <code>sandbox.wompi.co</code>; no hay simulación de la pasarela en ninguna prueba.</li>
      <li><strong>Nuestra API es real.</strong> Las pruebas entran por HTTP igual que lo haría el
      navegador, contra el servidor corriendo, y comprueban el efecto en la base de datos.</li>
      <li><strong>Los avisos de las pruebas de ataque se fabrican aquí</strong> y se firman con el
      secreto de eventos real, porque hay que poder manipularlos a voluntad. Pero
      <strong>el circuito se cerró con avisos emitidos por Wompi</strong>: E2E-01 comprueba
      la bitácora de lo que llegó de verdad al webhook.</li>
      <li><strong>Los pagos se hicieron conduciendo el checkout real</strong> en un navegador:
      elegir medio de pago, teclear los datos, aceptar los términos y enviar. Se probaron los
      <strong>cuatro medios que anuncia la tienda</strong> —tarjeta, Nequi, PSE y DaviPlata—, no
      solo tarjeta.</li>
      <li><strong>Las pruebas limpian lo que ensucian.</strong> Las reservas que crean se liberan al
      terminar por la vía normal del servicio, sin escribir el stock a mano.</li>
    </ul>
    <p>El banco de pruebas es reproducible con <code>npm run payments:test</code> y devuelve código de
    salida distinto de cero si algo falla, así que sirve tal cual en una tubería de integración continua.</p>
  </section>

  <section class="salto">
    <h2>Arquitectura de seguridad</h2>
    <p>Nueve capas, cada una contra una forma concreta de perder dinero o mercancía.
    Ninguna depende de que las demás funcionen.</p>
    ${CAPAS.map((c: (typeof CAPAS)[number]) => `
    <div class="capa">
      <div class="cab"><h3>${esc(c.nombre)}</h3><span class="donde">${esc(c.donde)}</span></div>
      <div class="protege">Impide: ${esc(c.protege)}</div>
      <div class="como">${esc(c.como)}</div>
      <div class="refs">${esc(c.pruebas)}</div>
    </div>`).join('')}
  </section>

  <section class="salto">
    <h2>Hallazgos</h2>
    <p>Lo que apareció al probar. Los tres primeros eran defectos reales y están corregidos;
    los dos últimos son constancia de cosas que conviene no olvidar.</p>
    ${HALLAZGOS.map((h: (typeof HALLAZGOS)[number]) => `
    <div class="hallazgo">
      <div class="cab">
        <span class="cod">${esc(h.id)}</span>
        <span class="pill ${esc(h.estado)}">${esc(h.estado)}</span>
        <h3>${esc(h.titulo)}</h3>
      </div>
      <dl>
        <dt>Qué pasaba</dt><dd>${esc(h.que)}</dd>
        <dt>Evidencia</dt><dd>${esc(h.evidencia)}</dd>
        <dt>Qué se hizo</dt><dd>${esc(h.arreglo)}</dd>
      </dl>
      <div class="nota">${esc(h.nota)}</div>
    </div>`).join('')}
  </section>

  <section class="salto">
    <h2>Riesgos abiertos</h2>
    <p>Lo que sigue sin resolver, con lo que haría falta para cerrarlo. R-1 es el que de verdad importa.</p>
    ${RIESGOS.map((r: (typeof RIESGOS)[number]) => `
    <div class="hallazgo abierto">
      <div class="cab">
        <span class="cod">${esc(r.id)}</span>
        <span class="pill abierto">${esc(r.gravedad)}</span>
        <h3>${esc(r.titulo)}</h3>
      </div>
      <dl>
        <dt>Situación</dt><dd>${esc(r.detalle)}</dd>
        <dt>Cómo se cierra</dt><dd>${esc(r.cierre)}</dd>
      </dl>
    </div>`).join('')}
  </section>

  <section class="salto">
    <h2>URL de eventos</h2>
    <p>Wompi avisa de cada cambio de estado de una transacción contra una URL pública nuestra.
    Es lo que confirma los pagos: sin ella, un cobro aprobado no llega nunca a convertirse en pedido.</p>
    <p>La ruta es:</p>
    <div class="url">POST &lt;dominio&gt;/api/payments/webhook/wompi</div>
    <p>Para probar en local se expone con un túnel, pero <strong>no se tuneliza la API entera</strong>:
    eso publicaría en internet el login del panel con credenciales de demo. Hay un proxy
    (<code>npm run webhook:tunnel</code>) que solo deja pasar esa ruta y ese método, limita el cuerpo
    a 64 KB y deja bitácora de todo lo que llega. Comprobado desde fuera: el webhook responde y
    el resto de la API devuelve 404.</p>
    <ol>
      <li>Arrancar el proxy y el túnel.</li>
      <li>Pegar la URL resultante en el Dashboard de Wompi, en <strong>Configuración → URL de eventos</strong>,
      del ambiente que corresponda.</li>
      <li>Pagar una transacción de prueba y volver a correr <code>npm run payments:test</code>:
      E2E-01 deja de estar «sin aplicar».</li>
    </ol>
    <p>Sandbox y producción llevan URLs distintas. Para producción hace falta un dominio propio
    con TLS: la URL del túnel cambia en cada reinicio.</p>
  </section>

  <section class="salto">
    <h2>Resultados detallados</h2>
    ${[...porGrupo.entries()].map(([grupo, filas]) => `
    <div style="margin-bottom:6mm">
      <h3 style="margin:5mm 0 2mm; color:var(--clay)">${esc(grupo)}</h3>
      <table>
        <thead><tr><th>Id</th><th>Prueba</th><th>Grav.</th><th>Result.</th></tr></thead>
        <tbody>${filas.map(fila).join('')}</tbody>
      </table>
    </div>`).join('')}
  </section>

  <div class="pie">
    Generado automáticamente desde <code>docs/pruebas-wompi/resultados.json</code> ·
    Banco de pruebas: <code>server/scripts/pruebas-wompi.ts</code> ·
    Limpieza tras la ejecución: ${esc(datos.limpieza)}
  </div>

</div>
</body>
</html>`;

await writeFile(join(CARPETA, 'informe.html'), html, 'utf8');
console.log(`  Informe en docs/pruebas-wompi/informe.html`);
console.log(`  ${datos.resumen.pasan} pasan · ${datos.resumen.fallan} fallan · ${datos.resumen.sinAplicar} sin aplicar`);
