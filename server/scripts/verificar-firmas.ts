/**
 * Comprobación de las firmas de Wompi.
 *
 *     npm run payments:check
 *
 * No es una suite de pruebas: es la red mínima sobre las dos funciones cuyo
 * fallo no se ve hasta que alguien pierde dinero. Una firma de integridad mal
 * construida hace que Wompi rechace todos los cobros; un checksum mal
 * verificado deja pasar a cualquiera que sepa la URL del webhook y marque
 * pedidos como pagados.
 *
 * Corre sin credenciales ni base de datos.
 */
import { createHash } from 'node:crypto';
import {
  EVENT_MAX_AGE_SECONDS,
  eventIsFresh,
  expirationTime,
  integritySignature,
  mapStatus,
  verifyEventChecksum,
} from '../src/payments/wompi.js';

const sha256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex');

let fallos = 0;
function check(nombre: string, condicion: boolean, detalle?: string): void {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

console.log('\nFirma de integridad del checkout');
console.log('  SHA256(referencia + monto + moneda + [expiracion] + secreto)\n');

{
  const args = {
    reference: 'AU-11614-a7f3',
    amountInCents: 18_760_000,
    currency: 'COP',
    integritySecret: 'test_integrity_SECRETO',
  };

  check(
    'sin expiracion concatena en el orden documentado',
    integritySignature(args) ===
      sha256('AU-11614-a7f318760000COPtest_integrity_SECRETO'),
  );

  const expira = '2026-09-25T14:05:00.000Z';
  check(
    'con expiracion la intercala ANTES del secreto',
    integritySignature({ ...args, expirationTime: expira }) ===
      sha256(`AU-11614-a7f318760000COP${expira}test_integrity_SECRETO`),
  );

  check(
    'mandar expiracion cambia la firma',
    integritySignature(args) !== integritySignature({ ...args, expirationTime: expira }),
    'Si coincidieran, firmar y no enviar la expiracion pasaria desapercibido.',
  );

  check(
    'un peso de diferencia cambia la firma',
    integritySignature(args) !==
      integritySignature({ ...args, amountInCents: args.amountInCents + 100 }),
  );

  check(
    'la expiracion sale en ISO-8601 UTC con milisegundos',
    expirationTime(new Date(Date.UTC(2026, 8, 25, 14, 5, 0))) === '2026-09-25T14:05:00.000Z',
  );
}

console.log('\nChecksum de los webhooks');
console.log('  SHA256(valores de signature.properties + timestamp + secreto_de_eventos)\n');

const SECRETO = 'test_events_SECRETO';

/** Arma un aviso con el checksum correcto, como lo mandaria Wompi. */
function firmarAviso(tx: { id: string; status: string; amount_in_cents: number }, timestamp: number) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const cadena = `${tx.id}${tx.status}${tx.amount_in_cents}${timestamp}${SECRETO}`;
  return {
    event: 'transaction.updated',
    data: { transaction: tx },
    signature: { properties, checksum: sha256(cadena) },
    timestamp,
  };
}

{
  const ahora = Math.floor(Date.now() / 1000);
  const tx = { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4_490_000 };
  const aviso = firmarAviso(tx, ahora);

  check('acepta un aviso bien firmado', verifyEventChecksum(aviso, SECRETO).ok);

  check(
    'rechaza si cambian el monto',
    !verifyEventChecksum(
      { ...aviso, data: { transaction: { ...tx, amount_in_cents: 100 } } },
      SECRETO,
    ).ok,
    'Es el ataque obvio: aprobar un pedido caro pagando poco.',
  );

  check(
    'rechaza si cambian el estado',
    !verifyEventChecksum({ ...aviso, data: { transaction: { ...tx, status: 'DECLINED' } } }, SECRETO)
      .ok,
  );

  check('rechaza con otro secreto', !verifyEventChecksum(aviso, 'otro_secreto').ok);

  check(
    'rechaza si mueven el timestamp',
    !verifyEventChecksum({ ...aviso, timestamp: ahora + 1 }, SECRETO).ok,
  );

  check(
    'rechaza un aviso sin firma',
    !verifyEventChecksum({ ...aviso, signature: undefined }, SECRETO).ok,
  );

  check(
    'rechaza si falta una propiedad firmada',
    !verifyEventChecksum(
      {
        ...aviso,
        signature: {
          properties: ['transaction.id', 'transaction.no_existe'],
          checksum: aviso.signature.checksum,
        },
      },
      SECRETO,
    ).ok,
    'Sin esto, una propiedad ausente se concatenaria como "undefined".',
  );

  // Las propiedades se resuelven por su ruta, no por nombres fijos: el dia que
  // Wompi anada una a la firma, esto la incluye sin tocar nada.
  const conMoneda = {
    ...aviso,
    data: { transaction: { ...tx, currency: 'COP' } },
    signature: {
      properties: [
        'transaction.id',
        'transaction.status',
        'transaction.amount_in_cents',
        'transaction.currency',
      ],
      checksum: sha256(`${tx.id}${tx.status}${tx.amount_in_cents}COP${ahora}${SECRETO}`),
    },
  };
  check('sigue las rutas de properties, sean las que sean', verifyEventChecksum(conMoneda, SECRETO).ok);
}

console.log('\nVentana de frescura (anti-reenvio)\n');
{
  const ahora = Date.now();
  check('acepta un aviso recien emitido', eventIsFresh(Math.floor(ahora / 1000), ahora));
  check(
    'acepta uno de hace una hora (Wompi reintenta durante horas)',
    eventIsFresh(Math.floor(ahora / 1000) - 3600, ahora),
  );
  check(
    'rechaza uno mas viejo que la ventana',
    !eventIsFresh(Math.floor(ahora / 1000) - EVENT_MAX_AGE_SECONDS - 60, ahora),
    'Un aviso legitimo capturado y reenviado llevaria una firma valida.',
  );
  check(
    'tolera un reloj adelantado unos minutos',
    eventIsFresh(Math.floor(ahora / 1000) + 60, ahora),
  );
}

console.log('\nTraduccion de estados\n');
{
  check('APPROVED', mapStatus('APPROVED') === 'APPROVED');
  check('DECLINED y REJECTED caen en rechazado', mapStatus('REJECTED') === 'DECLINED');
  check('FAILED cae en error', mapStatus('FAILED') === 'ERROR');
  check('PROCESSING sigue pendiente', mapStatus('PROCESSING') === 'PENDING');
  check(
    'un estado desconocido queda PENDIENTE, no en error',
    mapStatus('ALGO_NUEVO_DE_WOMPI') === 'PENDING',
    'Ante la duda se vuelve a preguntar; darlo por fallido soltaria stock de algo quiza pagado.',
  );
}

// ---------------------------------------------------------------------------

console.log('\nNota sobre la documentacion de Wompi\n');
{
  const cadena =
    '1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';
  const publicado = '3476DDA50F64CD7CBD160689640506FEBEA93239BC524FC0469B2C68A3CC8BD0'.toLowerCase();
  const calculado = sha256(cadena);

  console.log('  El ejemplo resuelto de la documentacion NO reproduce su propio checksum:');
  console.log(`    publicado por Wompi : ${publicado}`);
  console.log(`    SHA256 de su cadena : ${calculado}`);
  console.log('  Se comprobaron ademas otras ocho concatenaciones plausibles y ninguna coincide,');
  console.log('  asi que lo mas probable es que anonimizaran el secreto y dejaran el hash real.');
  console.log('  La regla en prosa si concuerda entre la doc en espanol, la inglesa y terceros,');
  console.log('  y es la implementada. VERIFICA el primer webhook real de sandbox antes de');
  console.log('  confiar: WOMPI_DEBUG_EVENTS=true registra la cadena calculada para comparar.');

  check(
    'la discrepancia sigue ahi (si esto falla, Wompi corrigio su doc: revisa la formula)',
    calculado !== publicado,
  );
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} comprobacion(es) fallaron.`}\n`);
process.exit(fallos === 0 ? 0 : 1);
