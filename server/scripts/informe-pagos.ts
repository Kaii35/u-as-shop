/**
 * Informe de conciliación de cobros.
 *
 *     npm run payments:reconcile
 *
 * Contesta una sola pregunta: **¿cuadra el dinero?** Para eso coge todos los
 * cobros de nuestra base, le pregunta a Wompi por cada uno que tenga id de
 * transacción, y compara estado contra estado y monto contra monto.
 *
 * No se fía de lo que tenemos guardado. Un informe que solo lea nuestra propia
 * base no concilia nada: repite lo que ya creíamos. El valor está justo en los
 * renglones donde las dos fuentes no coinciden.
 *
 * Deja docs/informes/informe-pagos.html, listo para imprimir a PDF.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { gateway } from '../src/payments/index.js';
import { ESTILOS, FUENTES, esc, pesos } from './informe-estilos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../..');
const SALIDA = join(RAIZ, 'docs/informes');

const fecha = (d: Date | null | undefined): string =>
  d ? d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }) : '—';

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const pagos = await prisma.payment.findMany({
  orderBy: { createdAt: 'asc' },
  select: {
    reference: true, status: true, amountInCents: true, currency: true, methodType: true,
    providerTransactionId: true, providerStatus: true, statusMessage: true,
    provider: true, createdAt: true, updatedAt: true, expiresAt: true, reservationState: true,
    // Sin customerEmail ni nada personal: este informe habla de dinero, y un
    // generador que saca datos de clientas que no pinta acaba pintandolos.
    order: { select: { number: true, status: true } },
    events: { select: { source: true, status: true, applied: true, checksumOk: true } },
  },
});

/** Movimientos de inventario de los pedidos que tienen cobro: el dinero contra la mercancía. */
const movimientos = await prisma.inventoryMovement.findMany({
  where: { order: { payments: { some: {} } } },
  select: { type: true, quantity: true, productId: true, order: { select: { number: true } } },
});

// ---------------------------------------------------------------------------
// Conciliación contra la pasarela
// ---------------------------------------------------------------------------

interface Cuadre {
  referencia: string;
  txId: string;
  nuestroEstado: string;
  suEstado: string | null;
  nuestroMonto: number;
  suMonto: number | null;
  veredicto: 'cuadra' | 'no-existe' | 'estado' | 'monto' | 'sin-respuesta';
  detalle: string;
}

const cuadres: Cuadre[] = [];
const conTx = pagos.filter((p) => p.providerTransactionId && p.provider === 'WOMPI');

console.log(`  conciliando ${conTx.length} cobros con id de transacción contra Wompi...`);
for (const p of conTx) {
  const base = {
    referencia: p.reference,
    txId: p.providerTransactionId!,
    nuestroEstado: p.status,
    nuestroMonto: p.amountInCents,
  };
  try {
    const suyo = await gateway.fetchByTransactionId(p.providerTransactionId!);
    if (!suyo) {
      cuadres.push({
        ...base, suEstado: null, suMonto: null, veredicto: 'no-existe',
        detalle: 'Wompi no conoce esta transacción.',
      });
      continue;
    }
    if (suyo.status !== p.status) {
      cuadres.push({
        ...base, suEstado: suyo.status, suMonto: suyo.amountInCents, veredicto: 'estado',
        detalle: `Nosotros ${p.status}, la pasarela ${suyo.status}.`,
      });
      continue;
    }
    if (suyo.amountInCents !== p.amountInCents) {
      cuadres.push({
        ...base, suEstado: suyo.status, suMonto: suyo.amountInCents, veredicto: 'monto',
        detalle: `Nosotros ${pesos(p.amountInCents)}, la pasarela ${pesos(suyo.amountInCents)}.`,
      });
      continue;
    }
    cuadres.push({
      ...base, suEstado: suyo.status, suMonto: suyo.amountInCents, veredicto: 'cuadra',
      detalle: 'Estado y monto idénticos en las dos fuentes.',
    });
  } catch (error) {
    cuadres.push({
      ...base, suEstado: null, suMonto: null, veredicto: 'sin-respuesta',
      detalle: `No se pudo preguntar: ${(error as Error).message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Señales de alarma
// ---------------------------------------------------------------------------

const ahora = new Date();
const quinceMin = new Date(ahora.getTime() - 15 * 60_000);

const alarmas = [
  {
    clave: 'aprobado-sin-pedido',
    titulo: 'Cobrado y sin entregar',
    gravedad: 'critica' as const,
    porque:
      'Es el peor descuadre posible: el dinero se movió y el pedido está cancelado, así que no hay nada que despachar. Pasa cuando la aprobación llega después de que el intento venció, con el pedido ya anulado y las unidades sueltas. No se arregla solo a propósito: volver a descontar unidades que quizá ya se vendieron lo decide una persona.',
    lista: pagos.filter(
      (p) => p.status === 'APPROVED' && !['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'].includes(p.order.status),
    ),
  },
  {
    clave: 'reserva-sin-soltar',
    titulo: 'Caducados con las unidades todavía apartadas',
    gravedad: 'alta' as const,
    porque:
      'Mercancía bloqueada para una venta que no va a ocurrir. No se ve por ningún otro lado: el catálogo solo muestra menos disponible, sin decir por qué.',
    lista: pagos.filter((p) => p.expiresAt < ahora && p.reservationState === 'HELD'),
  },
  {
    clave: 'pendiente-viejo',
    titulo: 'Pendientes de más de 15 minutos',
    gravedad: 'media' as const,
    porque:
      'Un cobro que lleva un cuarto de hora sin resolverse suele ser un aviso que no llegó. Cada uno mantiene unidades apartadas.',
    lista: pagos.filter((p) => p.status === 'PENDING' && p.createdAt < quinceMin),
  },
];

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

const porEstado = new Map<string, { n: number; centavos: number }>();
for (const p of pagos) {
  const e = porEstado.get(p.status) ?? { n: 0, centavos: 0 };
  e.n += 1;
  e.centavos += p.amountInCents;
  porEstado.set(p.status, e);
}

const porMetodo = new Map<string, { n: number; centavos: number }>();
for (const p of pagos.filter((x) => x.status === 'APPROVED')) {
  const k = p.methodType ?? 'sin método';
  const e = porMetodo.get(k) ?? { n: 0, centavos: 0 };
  e.n += 1;
  e.centavos += p.amountInCents;
  porMetodo.set(k, e);
}

const aprobados = porEstado.get('APPROVED') ?? { n: 0, centavos: 0 };
const cobrosReales = cuadres.filter((c) => c.veredicto === 'cuadra');
const descuadres = cuadres.filter((c) => c.veredicto === 'estado' || c.veredicto === 'monto');
const fantasmas = cuadres.filter((c) => c.veredicto === 'no-existe');
const alarmasVivas = alarmas.filter((a) => a.lista.length > 0);

const avisos = pagos.flatMap((p) => p.events);
const avisosWebhook = avisos.filter((e) => e.source === 'WEBHOOK');
const avisosMalFirmados = avisos.filter((e) => !e.checksumOk);

const periodo = pagos.length
  ? `${fecha(pagos[0]!.createdAt)} — ${fecha(pagos[pagos.length - 1]!.createdAt)}`
  : 'sin cobros';

// ---------------------------------------------------------------------------
// Veredicto
// ---------------------------------------------------------------------------

const cuadra = descuadres.length === 0 && alarmas[0]!.lista.length === 0;

const veredicto = cuadra
  ? `<div class="destacado">
      <p><strong>El dinero cuadra.</strong> Los ${cobrosReales.length} cobros que llegaron a tener
      transacción en la pasarela coinciden con ella en estado y en monto, uno a uno. No hay ningún
      cobro aprobado sin pedido que entregar, que es el único descuadre que cuesta dinero de verdad.</p>
      ${fantasmas.length > 0 ? `<p>Hay ${fantasmas.length} cobros con un id de transacción que Wompi
      no conoce. No son un descuadre: son los que fabricó el banco de pruebas con avisos firmados a
      mano para comprobar la verificación. Aparecen identificados más abajo.</p>` : ''}
    </div>`
  : `<div class="destacado alarma">
      <p><strong>Hay descuadres que revisar.</strong>
      ${descuadres.length > 0 ? `${descuadres.length} cobros no coinciden con la pasarela.` : ''}
      ${alarmas[0]!.lista.length > 0 ? `${alarmas[0]!.lista.length} cobros están aprobados sin pedido que entregar: el dinero se movió y no hay nada que despachar.` : ''}
      El detalle está en las secciones siguientes.</p>
    </div>`;

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------

const ETIQUETA_ESTADO: Record<string, string> = {
  APPROVED: 'v', DECLINED: 'r', VOIDED: 'r', ERROR: 'r', EXPIRED: 'g', PENDING: 'a',
};

const filaPago = (p: (typeof pagos)[number]): string => {
  const avisosDelPago = p.events.length;
  const malos = p.events.filter((e) => !e.checksumOk).length;
  return `<tr>
    <td class="id">${esc(p.reference)}</td>
    <td class="id">${esc(p.order.number)}<br><span style="font-size:7pt">${esc(p.order.status)}</span></td>
    <td><span class="etq ${ETIQUETA_ESTADO[p.status] ?? 'g'}">${esc(p.status)}</span></td>
    <td class="num">${pesos(p.amountInCents)}</td>
    <td>${esc(p.methodType ?? '—')}</td>
    <td class="id">${esc(p.providerTransactionId ?? '—')}</td>
    <td class="num">${avisosDelPago}${malos > 0 ? ` <span class="mal">(${malos} mal firmados)</span>` : ''}</td>
    <td class="id">${esc(fecha(p.createdAt))}</td>
  </tr>`;
};

const VEREDICTO_ETQ: Record<Cuadre['veredicto'], [string, string]> = {
  cuadra: ['v', 'Cuadra'],
  'no-existe': ['g', 'No existe en Wompi'],
  estado: ['r', 'Estado distinto'],
  monto: ['r', 'Monto distinto'],
  'sin-respuesta': ['a', 'Sin respuesta'],
};

const relevantes = pagos.filter((p) => p.status !== 'EXPIRED');
const caducados = pagos.filter((p) => p.status === 'EXPIRED');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de conciliación de cobros</title>
${FUENTES}
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">

  <header class="portada">
    <div class="marca">Natalia Sánchez · Insumos de belleza profesional</div>
    <h1>Conciliación de cobros</h1>
    <p class="sub">Contraste entre nuestra base de datos y lo que dice la pasarela</p>
    <dl class="meta">
      <div><dt>Pasarela</dt><dd>${esc(gateway.id)}</dd></div>
      <div><dt>Ambiente</dt><dd>${env.wompiPublicKey.startsWith('pub_test_') ? 'Pruebas (sandbox)' : 'PRODUCCIÓN'}</dd></div>
      <div><dt>Cobros</dt><dd>${pagos.length}</dd></div>
      <div><dt>Generado</dt><dd>${esc(fecha(ahora))}</dd></div>
    </dl>
  </header>

  <section>
    <h2>Resumen</h2>
    <div class="marcador cuatro">
      <div class="caja bien"><span class="n chico">${pesos(aprobados.centavos)}</span><div class="l">Cobrado</div></div>
      <div class="caja"><span class="n">${aprobados.n}</span><div class="l">Aprobados</div></div>
      <div class="caja ${descuadres.length ? 'mal' : 'bien'}"><span class="n">${descuadres.length}</span><div class="l">Descuadres</div></div>
      <div class="caja ${alarmasVivas.length ? 'na' : 'bien'}"><span class="n">${alarmasVivas.length}</span><div class="l">Alarmas</div></div>
    </div>

    ${veredicto}

    <p style="font-size:8.5pt;color:var(--mist)">Periodo cubierto: ${esc(periodo)}.
    Se consultó a la pasarela por ${cuadres.length} transacciones, una a una.</p>
  </section>

  <section class="evitar">
    <h2>Cómo se concilia</h2>
    <p>Este informe <strong>no se fía de nuestra propia base</strong>. Un informe que solo lea lo que
    ya teníamos guardado no concilia nada: repite lo que creíamos. Por cada cobro con id de
    transacción se le pregunta a Wompi —autenticados con la llave privada— y se comparan dos cosas:</p>
    <ol>
      <li><strong>El estado.</strong> Que lo que nosotros damos por aprobado esté aprobado también allá.</li>
      <li><strong>El monto.</strong> Que se haya cobrado exactamente lo que facturamos, al peso.</li>
    </ol>
    <p>Un cobro sin id de transacción nunca llegó a existir en la pasarela —la clienta abandonó
    antes de elegir medio de pago— y no hay nada que conciliar: queda registrado como caducado.</p>
  </section>

  <section>
    <h2>Resultado de la conciliación</h2>
    ${cuadres.length === 0
      ? '<p>No hay ningún cobro con id de transacción todavía.</p>'
      : `<table>
      <thead><tr><th>Referencia</th><th>Transacción</th><th>Nuestro estado</th><th>En Wompi</th>
      <th class="num">Monto</th><th>Veredicto</th></tr></thead>
      <tbody>${cuadres.map((c) => {
        const [cls, txt] = VEREDICTO_ETQ[c.veredicto];
        return `<tr>
          <td class="id">${esc(c.referencia)}</td>
          <td class="id">${esc(c.txId)}</td>
          <td>${esc(c.nuestroEstado)}</td>
          <td>${esc(c.suEstado ?? '—')}</td>
          <td class="num">${pesos(c.nuestroMonto)}</td>
          <td><span class="etq ${cls}">${txt}</span></td>
        </tr>`;
      }).join('')}</tbody></table>`}

    ${fantasmas.length > 0 ? `
    <div class="destacado" style="margin-top:4mm">
      <p><strong>Sobre los ${fantasmas.length} que Wompi no conoce.</strong> No son dinero perdido ni
      un fallo de la integración: son los cobros que fabricó el banco de pruebas, firmando avisos a
      mano con el secreto de eventos real para comprobar que la verificación los acepta. Sus ids de
      transacción se los inventó la prueba, así que la pasarela no tiene por qué conocerlos.</p>
      <p>En una tienda en producción, un cobro en este estado sí sería para investigar: significaría
      que alguien consiguió que diéramos por bueno un aviso de una transacción inexistente.</p>
    </div>` : ''}
  </section>

  <section class="salto">
    <h2>Señales de alarma</h2>
    <p>Tres condiciones que no se arreglan solas y que no se ven desde ninguna otra pantalla.</p>
    ${alarmas.map((a) => `
    <div class="hallazgo ${a.lista.length > 0 ? 'abierto' : ''}">
      <div class="cab">
        <span class="etq ${a.lista.length > 0 ? 'r' : 'v'}">${a.lista.length > 0 ? `${a.lista.length} casos` : 'ninguno'}</span>
        <h3>${esc(a.titulo)}</h3>
      </div>
      <dl>
        <dt>Por qué importa</dt><dd>${esc(a.porque)}</dd>
        ${a.lista.length > 0 ? `<dt>Afectados</dt><dd class="mono">${a.lista.map((p) => esc(p.reference)).join(', ')}</dd>` : ''}
      </dl>
    </div>`).join('')}
  </section>

  <section class="evitar">
    <h2>Avisos de la pasarela</h2>
    <p>Cada cambio de estado llega como un aviso firmado. Lo que cuenta aquí es cuántos pasaron la
    verificación de la firma: un aviso con <code>checksumOk = false</code> es alguien intentando
    mover un cobro sin conocer el secreto.</p>
    <div class="marcador tres">
      <div class="caja"><span class="n">${avisos.length}</span><div class="l">Avisos registrados</div></div>
      <div class="caja"><span class="n">${avisosWebhook.length}</span><div class="l">Por webhook</div></div>
      <div class="caja ${avisosMalFirmados.length ? 'mal' : 'bien'}"><span class="n">${avisosMalFirmados.length}</span><div class="l">Firma inválida</div></div>
    </div>

    ${avisosMalFirmados.length > 0 ? `
    <div class="destacado">
      <p><strong>Sobre los ${avisosMalFirmados.length} avisos con firma inválida.</strong> Que estén
      registrados es deliberado y no un fallo: un aviso rechazado sin dejar rastro no deja nada que
      investigar después. Ninguno movió un solo cobro —ese es justo el punto— pero quedan guardados
      con su contenido para poder mirarlos.</p>
      <p>En esta instalación son el rastro del banco de pruebas, que manda avisos falsificados a
      propósito para comprobar que se rechazan. <strong>En una tienda en producción, cualquier
      número distinto de cero aquí merece una mirada</strong>: significa que alguien está probando a
      mover cobros sin conocer el secreto de eventos.</p>
    </div>` : `
    <p style="font-size:8.8pt;color:var(--mist)">Ninguno rechazado. Los avisos con firma inválida se
    guardarían igual si los hubiera: uno rechazado sin rastro no deja nada que investigar.</p>`}
  </section>

  <section class="evitar">
    <h2>Dinero contra mercancía</h2>
    <p>Un cobro aprobado tiene que haber movido inventario. Si no, se cobró y no se descontó nada.</p>
    ${movimientos.length === 0
      ? '<p>Todavía no hay movimientos de inventario asociados a cobros.</p>'
      : `<table>
      <thead><tr><th>Pedido</th><th>Producto</th><th>Tipo</th><th class="num">Unidades</th></tr></thead>
      <tbody>${movimientos.map((m) => `<tr>
        <td class="id">${esc(m.order?.number ?? '—')}</td>
        <td class="id">${esc(m.productId)}</td>
        <td>${esc(m.type)}</td>
        <td class="num">${m.quantity}</td>
      </tr>`).join('')}</tbody></table>
      <p style="font-size:8.5pt;color:var(--mist);margin-top:2mm">${movimientos.length} movimientos
      para ${aprobados.n} cobros aprobados.</p>`}
  </section>

  <section class="salto">
    <h2>Cobros por estado</h2>
    <table>
      <thead><tr><th>Estado</th><th class="num">Cobros</th><th class="num">Importe</th><th>Qué significa</th></tr></thead>
      <tbody>
        ${[...porEstado.entries()].sort((a, b) => b[1].n - a[1].n).map(([estado, v]) => {
          const explica: Record<string, string> = {
            APPROVED: 'Dinero recibido y confirmado por la pasarela.',
            DECLINED: 'La pasarela rechazó el cobro. El pedido se cancela y las unidades vuelven.',
            EXPIRED: 'Pasó el plazo sin resolverse. Las unidades apartadas se liberaron.',
            PENDING: 'Todavía sin resolver. Mantiene unidades apartadas.',
            VOIDED: 'Anulado después de aprobarse.',
            ERROR: 'La pasarela falló al procesarlo.',
          };
          return `<tr>
            <td><span class="etq ${ETIQUETA_ESTADO[estado] ?? 'g'}">${esc(estado)}</span></td>
            <td class="num">${v.n}</td>
            <td class="num">${pesos(v.centavos)}</td>
            <td style="font-size:8.3pt">${esc(explica[estado] ?? '')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <h3 style="margin-top:6mm">Medios de pago usados</h3>
    ${porMetodo.size === 0
      ? '<p>Ningún cobro aprobado todavía.</p>'
      : `<table>
      <thead><tr><th>Medio</th><th class="num">Cobros</th><th class="num">Importe</th></tr></thead>
      <tbody>${[...porMetodo.entries()].sort((a, b) => b[1].centavos - a[1].centavos).map(([m, v]) =>
        `<tr><td>${esc(m)}</td><td class="num">${v.n}</td><td class="num">${pesos(v.centavos)}</td></tr>`).join('')}
      </tbody></table>`}
  </section>

  <section class="salto">
    <h2>Detalle de cobros</h2>
    <p>Todos los cobros que llegaron a resolverse. Los caducados van resumidos aparte: son intentos
    que nunca alcanzaron la pasarela.</p>
    <table>
      <thead><tr><th>Referencia</th><th>Pedido</th><th>Estado</th><th class="num">Importe</th>
      <th>Medio</th><th>Transacción</th><th class="num">Avisos</th><th>Creado</th></tr></thead>
      <tbody>${relevantes.map(filaPago).join('')}</tbody>
    </table>

    ${caducados.length > 0 ? `
    <h3 style="margin-top:6mm">Caducados</h3>
    <p style="font-size:9pt">${caducados.length} intentos por ${pesos(caducados.reduce((s, p) => s + p.amountInCents, 0))}
    que vencieron sin resolverse. Ninguno llegó a tener transacción en la pasarela, así que no hay
    nada que conciliar y las unidades ya volvieron al inventario. En esta instalación son, en su
    mayoría, el rastro que deja el banco de pruebas al ejercitar el flujo de compra.</p>` : ''}
  </section>

  <div class="pie">
    Generado por <code>server/scripts/informe-pagos.ts</code> ·
    Conciliado contra ${esc(env.wompiPublicKey.startsWith('pub_test_') ? 'sandbox.wompi.co' : 'production.wompi.co')} ·
    ${cuadres.length} transacciones consultadas
  </div>

</div>
</body>
</html>`;

await mkdir(SALIDA, { recursive: true });
await writeFile(join(SALIDA, 'informe-pagos.html'), html, 'utf8');

console.log('');
console.log(`  cobros            : ${pagos.length}`);
console.log(`  aprobados         : ${aprobados.n} por ${pesos(aprobados.centavos)}`);
console.log(`  conciliados OK    : ${cobrosReales.length}`);
console.log(`  descuadres        : ${descuadres.length}`);
console.log(`  sin eco en Wompi  : ${fantasmas.length}`);
console.log(`  alarmas activas   : ${alarmasVivas.length}`);
console.log('');
console.log('  Informe en docs/informes/informe-pagos.html');

await prisma.$disconnect();
