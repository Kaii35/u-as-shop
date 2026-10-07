/**
 * Banco de pruebas de la pasarela de pagos.
 *
 *     npm run payments:test            (con la API corriendo en el 4100)
 *
 * Qué prueba y qué no:
 *
 *  - Habla con el API REAL de Wompi (sandbox) usando las credenciales del
 *    .env. No hay mocks de Wompi en ningún lado.
 *  - Habla con NUESTRA API real por HTTP, como lo haría el navegador.
 *  - Los avisos de webhook se fabrican aquí y se firman con el secreto de
 *    eventos REAL. Eso prueba nuestra verificación de punta a punta, pero NO
 *    prueba que el algoritmo coincida con el de Wompi: para eso hace falta un
 *    aviso emitido por ellos, que exige una URL pública (ver docs/pagos.md).
 *    La prueba E2E-01 marca ese hueco explícitamente.
 *
 * Deja el resultado en docs/pruebas-wompi/resultados.json, que es lo que
 * alimenta el informe.
 */
import { createHash, randomUUID } from 'node:crypto';
import { PaymentEventSource } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { gateway } from '../src/payments/index.js';
import {
  EVENT_MAX_AGE_SECONDS,
  eventIsFresh,
  integritySignature,
  mapStatus,
  verifyEventChecksum,
} from '../src/payments/wompi.js';
import { canTransition, toCents } from '../src/payments/types.js';
import { applySnapshot, expireStale } from '../src/payments/service.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../..');
const SALIDA = join(RAIZ, 'docs/pruebas-wompi');
const API = process.env.TEST_API_URL ?? 'http://localhost:4100';

const sha256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// Andamiaje
// ---------------------------------------------------------------------------

interface Resultado {
  id: string;
  grupo: string;
  nombre: string;
  /** Qué se esperaba. Se redacta antes de correr, no después de ver qué salió. */
  esperado: string;
  estado: 'PASA' | 'FALLA' | 'NO_APLICA';
  observado: string;
  /** Por qué esta prueba existe. Sin esto un informe es una lista de ticks. */
  porque: string;
  severidad: 'critica' | 'alta' | 'media' | 'info';
}

const resultados: Resultado[] = [];
const referenciasCreadas: string[] = [];

async function prueba(
  id: string,
  grupo: string,
  nombre: string,
  severidad: Resultado['severidad'],
  porque: string,
  esperado: string,
  fn: () => Promise<string> | string,
): Promise<void> {
  try {
    const observado = await fn();
    resultados.push({ id, grupo, nombre, esperado, estado: 'PASA', observado, porque, severidad });
    console.log(`  [PASA]  ${id}  ${nombre}`);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    const noAplica = mensaje.startsWith('NO_APLICA:');
    resultados.push({
      id,
      grupo,
      nombre,
      esperado,
      estado: noAplica ? 'NO_APLICA' : 'FALLA',
      observado: noAplica ? mensaje.slice('NO_APLICA:'.length).trim() : mensaje,
      porque,
      severidad,
    });
    console.log(`  [${noAplica ? 'N/A ' : 'FALLA'}]  ${id}  ${nombre}`);
    if (!noAplica) console.log(`          ${mensaje}`);
  }
}

/** Afirma, y si no se cumple cuenta qué se vio en vez de solo "falló". */
function exigir(condicion: boolean, queSeVio: string): void {
  if (!condicion) throw new Error(queSeVio);
}

const noAplica = (motivo: string): never => {
  throw new Error(`NO_APLICA: ${motivo}`);
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

interface RespuestaHttp {
  estado: number;
  cuerpo: unknown;
  texto: string;
}

async function pedir(ruta: string, opciones: RequestInit = {}): Promise<RespuestaHttp> {
  const respuesta = await fetch(API + ruta, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...(opciones.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = null;
  }
  return { estado: respuesta.status, cuerpo, texto };
}

const CLIENTA = {
  name: 'Prueba Integracion Wompi',
  email: 'pruebas@nataliasanchez.co',
  phone: '3001234567',
  legalId: '1036604105',
  legalIdType: 'CC' as const,
};
const ENVIO = { line1: 'Calle 10 # 20-30', city: 'Medellin', region: 'Antioquia', country: 'CO' as const };

async function crearIntento(
  items: { productId: string; quantity: number }[],
): Promise<RespuestaHttp> {
  const respuesta = await pedir('/api/payments/intent', {
    method: 'POST',
    body: JSON.stringify({ items, customer: CLIENTA, shipping: ENVIO, shippingMethod: 'std' }),
  });
  const referencia = (respuesta.cuerpo as { reference?: string } | null)?.reference;
  if (referencia) referenciasCreadas.push(referencia);
  return respuesta;
}

/**
 * Fabrica un aviso idéntico en forma a los de Wompi y lo firma con el secreto
 * de eventos real. `romper` permite alterarlo DESPUÉS de firmarlo, que es
 * exactamente lo que haría quien intente colarnos un pago.
 */
function avisoFirmado(args: {
  transactionId: string;
  reference: string;
  status: string;
  amountInCents: number;
  timestamp?: number;
  secreto?: string;
  evento?: string;
}): Record<string, unknown> {
  const timestamp = args.timestamp ?? Math.floor(Date.now() / 1000);
  const secreto = args.secreto ?? env.wompiEventsSecret;
  const propiedades = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const cadena =
    args.transactionId + args.status + String(args.amountInCents) + String(timestamp) + secreto;

  return {
    event: args.evento ?? 'transaction.updated',
    data: {
      transaction: {
        id: args.transactionId,
        reference: args.reference,
        status: args.status,
        amount_in_cents: args.amountInCents,
        currency: 'COP',
        payment_method_type: 'CARD',
        status_message: null,
      },
    },
    signature: { properties: propiedades, checksum: sha256(cadena) },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
    environment: 'test',
  };
}

// ---------------------------------------------------------------------------
// A · Credenciales y entorno
// ---------------------------------------------------------------------------

async function grupoCredenciales(): Promise<void> {
  const G = 'A · Credenciales y entorno';

  await prueba(
    'CRED-01', G, 'La llave pública es válida en el API de Wompi', 'critica',
    'Una llave mal copiada no falla al arrancar: falla en el primer cobro real, delante de una clienta.',
    'Wompi responde 200 y devuelve los datos del comercio.',
    async () => {
      const r = await fetch(`https://sandbox.wompi.co/v1/merchants/${env.wompiPublicKey}`, {
        signal: AbortSignal.timeout(20_000),
      });
      exigir(r.ok, `Wompi respondió ${r.status}.`);
      const cuerpo = (await r.json()) as { data?: { name?: string; active?: boolean } };
      exigir(cuerpo.data?.active === true, 'El comercio no figura como activo.');
      return `Comercio «${cuerpo.data?.name}», activo.`;
    },
  );

  await prueba(
    'CRED-02', G, 'La llave privada autentica contra el API', 'critica',
    'Sin ella no se puede reconciliar un cobro por referencia, que es la única salida cuando se pierde el aviso y la clienta no vuelve.',
    'GET /v1/transactions?reference=… responde 200.',
    async () => {
      const r = await fetch('https://sandbox.wompi.co/v1/transactions?reference=NS-SONDEO-NOEXISTE', {
        headers: { Authorization: `Bearer ${env.wompiPrivateKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      exigir(r.status === 200, `Respondió ${r.status}.`);
      return 'Autenticada: 200 y lista vacía para una referencia inexistente.';
    },
  );

  await prueba(
    'CRED-03', G, 'Las cuatro credenciales son del mismo ambiente', 'critica',
    'Mezclar sandbox y producción hace que el checkout cobre de mentira mientras el servidor consulta la cuenta real: los pedidos salen aprobados sin que entre dinero.',
    'Las cuatro llevan el mismo prefijo de ambiente y la pasarela arranca sin quejas.',
    () => {
      const pub = env.wompiPublicKey.startsWith('pub_test_');
      const prv = env.wompiPrivateKey.startsWith('prv_test_');
      const inte = env.wompiIntegritySecret.startsWith('test_integrity_');
      const even = env.wompiEventsSecret.startsWith('test_events_');
      exigir(pub === prv && prv === inte && inte === even, 'Hay credenciales de ambientes distintos.');
      exigir(gateway.configured, `La pasarela se queja: ${gateway.problems.join(' ')}`);
      return `Las cuatro son de ${pub ? 'PRUEBAS (sandbox)' : 'PRODUCCIÓN'}. Pasarela configurada sin problemas.`;
    },
  );

  await prueba(
    'CRED-04', G, 'Ningún secreto llega al navegador', 'critica',
    'Un secreto en el bundle es público: cualquiera lo lee desde las herramientas del navegador, y con el de integridad se pueden firmar cobros por el monto que se quiera.',
    'Ni la llave privada ni los dos secretos aparecen en dist/ ni en src/ del frontend.',
    async () => {
      const secretos = [env.wompiPrivateKey, env.wompiIntegritySecret, env.wompiEventsSecret].filter(Boolean);
      exigir(secretos.length === 3, 'Faltan credenciales que comprobar.');

      const revisados: string[] = [];
      async function barrer(carpeta: string): Promise<void> {
        let entradas;
        try {
          entradas = await readdir(carpeta, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entrada of entradas) {
          const ruta = join(carpeta, entrada.name);
          if (entrada.isDirectory()) {
            await barrer(ruta);
          } else if (/\.(js|mjs|css|html|map|ts|tsx)$/.test(entrada.name)) {
            const texto = await readFile(ruta, 'utf8');
            revisados.push(ruta);
            for (const secreto of secretos) {
              exigir(!texto.includes(secreto), `Hay un secreto dentro de ${ruta}.`);
            }
          }
        }
      }
      await barrer(join(RAIZ, 'dist'));
      await barrer(join(RAIZ, 'src'));
      exigir(revisados.length > 0, 'No se revisó ningún archivo: ¿falta compilar el frontend?');
      return `${revisados.length} archivos de dist/ y src/ revisados, ningún secreto dentro.`;
    },
  );

  await prueba(
    'CRED-05', G, 'Los secretos no están versionados', 'critica',
    'Un secreto en el historial de git sigue ahí aunque se borre del archivo, y viaja a cualquiera que clone el repositorio.',
    'server/.env está ignorado y ningún secreto aparece en el historial.',
    () => {
      const ignorado = execFileSync('git', ['check-ignore', 'server/.env'], {
        cwd: RAIZ, encoding: 'utf8',
      }).trim();
      exigir(ignorado.length > 0, 'server/.env NO está ignorado por git.');

      const seguidos = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' });
      exigir(!seguidos.split('\n').includes('server/.env'), 'server/.env está versionado.');

      // El historial completo, no solo el árbol de trabajo.
      for (const secreto of [env.wompiPrivateKey, env.wompiIntegritySecret, env.wompiEventsSecret]) {
        let encontrado = '';
        try {
          encontrado = execFileSync('git', ['grep', '-I', '--fixed-strings', secreto, '--', '.'], {
            cwd: RAIZ, encoding: 'utf8',
          });
        } catch {
          // git grep sale con 1 cuando no encuentra nada: eso es lo que queremos.
        }
        exigir(encontrado.trim().length === 0, `Un secreto aparece en archivos versionados:\n${encontrado}`);
      }
      return 'server/.env ignorado y fuera del índice; ningún secreto en los archivos versionados.';
    },
  );

  await prueba(
    'CRED-06', G, 'El servidor se niega a arrancar con llaves de prueba en producción', 'critica',
    'Es el error silencioso más caro: la tienda vende con normalidad y no entra un peso. Nadie se entera hasta cuadrar caja.',
    'La comprobación de arranque detecta la combinación y la rechaza.',
    async () => {
      const fuente = await readFile(join(RAIZ, 'server/src/payments/index.ts'), 'utf8');
      exigir(
        fuente.includes('env.isProduction') && fuente.includes("startsWith('pub_test_')"),
        'No existe la comprobación de llaves de prueba en producción.',
      );
      exigir(fuente.includes('throw new Error'), 'La comprobación avisa pero no aborta.');
      return 'assertPaymentsReady() aborta el arranque si NODE_ENV=production con llaves pub_test_.';
    },
  );
}

// ---------------------------------------------------------------------------
// B · Firma de integridad
// ---------------------------------------------------------------------------

async function grupoIntegridad(): Promise<void> {
  const G = 'B · Firma de integridad del checkout';
  const secreto = env.wompiIntegritySecret;

  await prueba(
    'FIRM-01', G, 'La firma que viaja al checkout es reproducible', 'critica',
    'Es lo único que impide que alguien edite el monto en el navegador y pague $1.000 un pedido de $300.000.',
    'Recalculada por fuera del código del servidor, la firma coincide byte a byte.',
    async () => {
      const r = await crearIntento([{ productId: 'p1', quantity: 2 }]);
      exigir(r.estado === 201, `El intento devolvió ${r.estado}: ${r.texto.slice(0, 200)}`);
      const cuerpo = r.cuerpo as { checkoutUrl: string; reference: string; amountInCents: number };
      const url = new URL(cuerpo.checkoutUrl);
      exigir(url.host === 'checkout.wompi.co', `El checkout apunta a ${url.host}.`);

      const q = url.searchParams;
      const propia = sha256(
        `${q.get('reference')}${q.get('amount-in-cents')}${q.get('currency')}${q.get('expiration-time')}${secreto}`,
      );
      exigir(
        propia === q.get('signature:integrity'),
        `La firma no coincide.\n  en la URL: ${q.get('signature:integrity')}\n  recalculada: ${propia}`,
      );
      return `Referencia ${cuerpo.reference}, ${cuerpo.amountInCents} centavos. Firma recalculada idéntica.`;
    },
  );

  await prueba(
    'FIRM-06', G, 'La URL de retorno no apunta a localhost', 'critica',
    'Wompi rechaza con un 403 de CloudFront cualquier redirect-url que apunte a localhost o 127.0.0.1, con http y con https. Con APP_URL en localhost el checkout NO ABRE, y la clienta ve una página de error de Amazon sin ninguna pista.',
    'La URL de retorno que viaja al checkout usa un dominio público, y el checkout responde 200.',
    async () => {
      const r = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      exigir(r.estado === 201, `El intento devolvió ${r.estado}.`);
      const url = new URL((r.cuerpo as { checkoutUrl: string }).checkoutUrl);
      const retorno = url.searchParams.get('redirect-url') ?? '';
      exigir(
        !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(retorno),
        `La URL de retorno es ${retorno}: Wompi la rechazará con 403 y el checkout no abrirá.`,
      );

      // Y se comprueba de verdad, no solo la forma.
      const checkout = await fetch(url.toString(), {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36' },
        signal: AbortSignal.timeout(20_000),
      });
      exigir(checkout.status === 200, `El checkout real respondió ${checkout.status}.`);
      return `Retorno a ${new URL(retorno).host}; el checkout de Wompi responde 200 con la URL completa.`;
    },
  );

  await prueba(
    'FIRM-02', G, 'Cambiar el monto invalida la firma', 'critica',
    'Es el ataque concreto: rebajar amount-in-cents en la URL antes de pagar.',
    'La firma del monto rebajado es distinta de la original.',
    () => {
      const base = { reference: 'AU-1-aaaa', currency: 'COP', integritySecret: secreto, expirationTime: '2026-10-07T00:00:00.000Z' };
      const real = integritySignature({ ...base, amountInCents: 30_000_000 });
      const manipulada = integritySignature({ ...base, amountInCents: 100_000 });
      exigir(real !== manipulada, 'Dos montos distintos dieron la MISMA firma.');
      return `$300.000 → ${real.slice(0, 16)}…  ·  $1.000 → ${manipulada.slice(0, 16)}…  (Wompi rechaza la segunda)`;
    },
  );

  await prueba(
    'FIRM-03', G, 'Cambiar la referencia invalida la firma', 'alta',
    'Reapuntar un pago barato a la referencia de un pedido caro es la otra mitad del mismo ataque.',
    'Dos referencias distintas dan firmas distintas.',
    () => {
      const base = { amountInCents: 8_070_000, currency: 'COP', integritySecret: secreto };
      exigir(
        integritySignature({ ...base, reference: 'AU-1-aaaa' }) !==
          integritySignature({ ...base, reference: 'AU-2-bbbb' }),
        'Dos referencias distintas dieron la misma firma.',
      );
      return 'Referencias distintas producen firmas distintas.';
    },
  );

  await prueba(
    'FIRM-04', G, 'La expiración entra en la cadena solo si se envía', 'media',
    'Firmarla sin mandarla (o al revés) da una firma inválida y Wompi devuelve un error que no dice por qué. Es la trampa clásica de esta integración.',
    'Con y sin expiración salen firmas distintas, y la que usa el servidor es la que sí la incluye.',
    () => {
      const base = { reference: 'AU-1-aaaa', amountInCents: 8_070_000, currency: 'COP', integritySecret: secreto };
      const sin = integritySignature(base);
      const con = integritySignature({ ...base, expirationTime: '2026-10-07T00:00:00.000Z' });
      exigir(sin !== con, 'Incluir la expiración no cambió la firma: no se está usando.');
      return 'Las dos variantes difieren; el checkout manda expiration-time y firma con ella.';
    },
  );

  await prueba(
    'FIRM-05', G, 'Sin el secreto no se puede falsificar una firma', 'critica',
    'Si la firma se pudiera reproducir sin el secreto, no protegería nada.',
    'La misma cadena firmada con otro secreto da un hash distinto.',
    () => {
      const base = { reference: 'AU-1-aaaa', amountInCents: 8_070_000, currency: 'COP' };
      exigir(
        integritySignature({ ...base, integritySecret: secreto }) !==
          integritySignature({ ...base, integritySecret: 'test_integrity_elQueAdivineAlguien' }),
        'Un secreto equivocado produjo la misma firma.',
      );
      return 'Secreto distinto, firma distinta.';
    },
  );
}

// ---------------------------------------------------------------------------
// C · Verificación de avisos (webhook)
// ---------------------------------------------------------------------------

async function grupoAvisos(): Promise<void> {
  const G = 'C · Verificación de avisos de la pasarela';

  await prueba(
    'AVIS-01', G, 'Un aviso bien firmado se acepta', 'critica',
    'Es la base: si no se aceptara un aviso legítimo, ningún pago se confirmaría nunca.',
    'verifyEventChecksum devuelve ok con el secreto de eventos real.',
    () => {
      const aviso = avisoFirmado({ transactionId: '01-1700000000-00001', reference: 'AU-1-aaaa', status: 'APPROVED', amountInCents: 8_070_000 });
      const r = verifyEventChecksum(aviso as never, env.wompiEventsSecret);
      exigir(r.ok, `Rechazado: ${r.reason}`);
      return 'Aceptado.';
    },
  );

  await prueba(
    'AVIS-02', G, 'Un checksum alterado en un carácter se rechaza', 'critica',
    'Si una firma casi correcta pasara, la firma no serviría de nada.',
    'Cambiar un dígito del checksum lo invalida.',
    () => {
      const aviso = avisoFirmado({ transactionId: '01-1700000000-00002', reference: 'AU-1-aaaa', status: 'APPROVED', amountInCents: 8_070_000 }) as { signature: { checksum: string } };
      const original = aviso.signature.checksum;
      aviso.signature.checksum = (original[0] === 'a' ? 'b' : 'a') + original.slice(1);
      const r = verifyEventChecksum(aviso as never, env.wompiEventsSecret);
      exigir(!r.ok, 'Se aceptó un checksum alterado.');
      return `Rechazado: ${r.reason}`;
    },
  );

  await prueba(
    'AVIS-03', G, 'Un aviso firmado con otro secreto se rechaza', 'critica',
    'Es lo que mandaría quien conozca el formato pero no el secreto, que es todo el mundo: el formato está documentado.',
    'Firmado con un secreto inventado, se rechaza.',
    () => {
      const aviso = avisoFirmado({ transactionId: '01-1700000000-00003', reference: 'AU-1-aaaa', status: 'APPROVED', amountInCents: 8_070_000, secreto: 'test_events_secretoDeUnAtacante00000' });
      const r = verifyEventChecksum(aviso as never, env.wompiEventsSecret);
      exigir(!r.ok, 'Se aceptó un aviso firmado con otro secreto.');
      return `Rechazado: ${r.reason}`;
    },
  );

  await prueba(
    'AVIS-04', G, 'Un aviso sin firma se rechaza', 'critica',
    'Lo más simple que puede intentar alguien: mandar el JSON sin la sección de firma.',
    'Sin signature.properties o sin checksum, se rechaza.',
    () => {
      const sinNada = verifyEventChecksum({ data: {}, timestamp: Math.floor(Date.now() / 1000) } as never, env.wompiEventsSecret);
      exigir(!sinNada.ok, 'Se aceptó un aviso sin firma.');
      const sinChecksum = verifyEventChecksum({ data: {}, timestamp: 1, signature: { properties: ['transaction.id'] } } as never, env.wompiEventsSecret);
      exigir(!sinChecksum.ok, 'Se aceptó un aviso sin checksum.');
      return `Rechazado en los dos casos: ${sinNada.reason}`;
    },
  );

  await prueba(
    'AVIS-05', G, 'Una propiedad firmada que no viene se rechaza', 'alta',
    'Si una propiedad ausente se tratara como cadena vacía, se podría recortar la parte firmada hasta dejarla trivial.',
    'Declarar una propiedad en properties y omitirla de data invalida el aviso.',
    () => {
      const aviso = avisoFirmado({ transactionId: '01-1700000000-00004', reference: 'AU-1-aaaa', status: 'APPROVED', amountInCents: 8_070_000 }) as { signature: { properties: string[] } };
      aviso.signature.properties = [...aviso.signature.properties, 'transaction.campo_que_no_existe'];
      const r = verifyEventChecksum(aviso as never, env.wompiEventsSecret);
      exigir(!r.ok, 'Se aceptó un aviso con una propiedad firmada ausente.');
      return `Rechazado: ${r.reason}`;
    },
  );

  await prueba(
    'AVIS-06', G, 'La comparación de firmas es en tiempo constante', 'media',
    'Con === el tiempo de respuesta depende de cuántos caracteres aciertan, y eso deja adivinar un checksum válido byte a byte desde fuera.',
    'El código usa timingSafeEqual y no comparación directa.',
    async () => {
      const fuente = await readFile(join(RAIZ, 'server/src/payments/wompi.ts'), 'utf8');
      exigir(fuente.includes('timingSafeEqual'), 'No se usa timingSafeEqual.');
      exigir(
        /return timingSafeEqual\(bufA, bufB\)/.test(fuente),
        'timingSafeEqual se importa pero no se usa para comparar los hashes.',
      );
      return 'safeEqualHex() compara con crypto.timingSafeEqual.';
    },
  );

  await prueba(
    'AVIS-07', G, 'Un aviso viejo se descarta', 'alta',
    'Un aviso legítimo capturado hace días lleva una firma perfectamente válida para siempre. El timestamp es lo único que permite descartarlo.',
    'Un aviso de hace más de 48 h se considera no fresco.',
    () => {
      const viejo = Math.floor(Date.now() / 1000) - (EVENT_MAX_AGE_SECONDS + 600);
      exigir(!eventIsFresh(viejo), 'Un aviso caducado se consideró fresco.');
      return `Descartado por antigüedad (ventana de ${EVENT_MAX_AGE_SECONDS / 3600} h).`;
    },
  );

  await prueba(
    'AVIS-08', G, 'El último reintento de Wompi (24 h) sigue siendo válido', 'alta',
    'Wompi reintenta a los 30 min, 3 h y 24 h. Con la ventana en 24 h justas rechazábamos nosotros mismos el último reintento, que es precisamente el que llega tras dos fallos.',
    'Un aviso de hace 24 h y un minuto se sigue aceptando.',
    () => {
      const reintento = Math.floor(Date.now() / 1000) - (24 * 3600 + 60);
      exigir(eventIsFresh(reintento), 'Se rechazó el reintento de las 24 h.');
      return `Aceptado: la ventana es de ${EVENT_MAX_AGE_SECONDS / 3600} h, con margen sobre el último reintento.`;
    },
  );

  await prueba(
    'AVIS-09', G, 'Un aviso con fecha futura se descarta', 'media',
    'Un timestamp adelantado dejaría un aviso reutilizable durante días.',
    'Más de 5 minutos en el futuro, se rechaza; dentro de ese margen se tolera por desfase de reloj.',
    () => {
      exigir(!eventIsFresh(Math.floor(Date.now() / 1000) + 3600), 'Se aceptó un aviso con una hora de adelanto.');
      exigir(eventIsFresh(Math.floor(Date.now() / 1000) + 60), 'Se rechazó un minuto de desfase, que es normal entre relojes.');
      return 'Una hora de adelanto se rechaza; un minuto se tolera.';
    },
  );

  await prueba(
    'AVIS-10', G, 'Un tipo de evento no soportado se rechaza', 'media',
    'Solo transaction.updated mueve dinero. Procesar a ciegas cualquier evento futuro de Wompi es aceptar un contrato que todavía no se ha leído.',
    'Un evento distinto no se aplica.',
    () => {
      const aviso = avisoFirmado({ transactionId: '01-1700000000-00005', reference: 'AU-1-aaaa', status: 'APPROVED', amountInCents: 8_070_000, evento: 'nequi_token.updated' });
      const r = gateway.verifyEvent(aviso);
      exigir(!r.valid, 'Se aceptó un evento no soportado.');
      return `Rechazado: ${r.valid ? '' : r.reason}`;
    },
  );
}

// ---------------------------------------------------------------------------
// D · Ataques contra el cobro
// ---------------------------------------------------------------------------

async function grupoAtaques(): Promise<void> {
  const G = 'D · Intentos de abuso';

  await prueba(
    'ATAQ-01', G, 'Un aviso sin firma válida no mueve el pago', 'critica',
    'Es el ataque que vacía el inventario: mandar «APROBADO» al webhook y recoger la mercancía sin pagar.',
    'La API responde 401 y el pago sigue pendiente.',
    async () => {
      const intento = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      const referencia = (intento.cuerpo as { reference: string }).reference;

      const falso = {
        event: 'transaction.updated',
        data: { transaction: { id: '01-falso-' + randomUUID().slice(0, 8), reference: referencia, status: 'APPROVED', amount_in_cents: 100, currency: 'COP' } },
        signature: { properties: ['transaction.id'], checksum: 'f'.repeat(64) },
        timestamp: Math.floor(Date.now() / 1000),
      };
      const r = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify(falso) });
      exigir(r.estado === 401, `El webhook respondió ${r.estado} en vez de 401.`);

      const despues = await prisma.payment.findUnique({ where: { reference: referencia }, select: { status: true } });
      exigir(despues?.status === 'PENDING', `El pago quedó en ${despues?.status} tras el aviso falso.`);
      return `401 y el pago ${referencia} sigue PENDING.`;
    },
  );

  await prueba(
    'ATAQ-02', G, 'Un aviso bien firmado pero con otro monto no aprueba el pedido', 'critica',
    'Protege del caso en que alguien logre pagar 1.000 pesos una transacción asociada a un pedido de 300.000. La firma sería válida; el monto no.',
    'El pago no queda aprobado y se registra la discrepancia.',
    async () => {
      const intento = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      const cuerpo = intento.cuerpo as { reference: string; amountInCents: number };

      const aviso = avisoFirmado({
        transactionId: '01-' + Date.now() + '-mn01',
        reference: cuerpo.reference,
        status: 'APPROVED',
        amountInCents: 100, // un peso
      });
      const r = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify(aviso) });

      const despues = await prisma.payment.findUnique({
        where: { reference: cuerpo.reference },
        select: { status: true, order: { select: { status: true } } },
      });
      exigir(
        despues?.status !== 'APPROVED',
        `El pago quedó APPROVED con 100 centavos cuando se cobraban ${cuerpo.amountInCents}.`,
      );
      return `La API respondió ${r.estado} y el pago quedó en ${despues?.status}, no APPROVED (se cobraban ${cuerpo.amountInCents} centavos y el aviso traía 100).`;
    },
  );

  await prueba(
    'ATAQ-03', G, 'Reenviar el mismo aviso no duplica nada', 'alta',
    'Wompi reintenta hasta tres veces. Sin idempotencia, un pedido podría descontar stock dos veces o aparecer pagado por partida doble.',
    'El segundo envío responde 200 pero no aplica cambios.',
    async () => {
      const intento = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      const cuerpo = intento.cuerpo as { reference: string; amountInCents: number };
      const aviso = avisoFirmado({
        transactionId: '01-' + Date.now() + '-idem',
        reference: cuerpo.reference,
        status: 'APPROVED',
        amountInCents: cuerpo.amountInCents,
      });

      const primera = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify(aviso) });
      const segunda = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify(aviso) });
      exigir(primera.estado === 200, `El primer aviso respondió ${primera.estado}.`);
      exigir(segunda.estado === 200, `El reenvío respondió ${segunda.estado} (Wompi seguiría reintentando).`);

      const pago = await prisma.payment.findUnique({
        where: { reference: cuerpo.reference },
        select: { id: true, orderId: true },
      });
      exigir(pago !== null, 'Desapareció el pago de la prueba.');

      const guardados = await prisma.paymentEvent.count({ where: { paymentId: pago!.id } });
      const aplicados = await prisma.paymentEvent.count({ where: { paymentId: pago!.id, applied: true } });
      const movimientos = await prisma.inventoryMovement.count({ where: { orderId: pago!.orderId } });

      // Lo que cuenta no es cuántos avisos se guardaron —guardarlos todos es
      // deseable, es la pista de auditoría— sino cuántos se APLICARON.
      exigir(aplicados <= 1, `Se aplicaron ${aplicados} veces el mismo aviso.`);
      exigir(movimientos <= 1, `El pedido acumuló ${movimientos} movimientos de inventario por un solo pago.`);
      return `Reenvío aceptado con 200. Avisos guardados: ${guardados}; aplicados: ${aplicados}; movimientos de inventario del pedido: ${movimientos}.`;
    },
  );

  await prueba(
    'ATAQ-04', G, 'Un aviso de una referencia desconocida no revienta ni reintenta', 'media',
    'Pasa de verdad cuando dos entornos comparten credenciales. Un 500 haría que Wompi reintentara 24 h contra algo que nunca va a existir.',
    'Responde 200 con applied:false.',
    async () => {
      const aviso = avisoFirmado({ transactionId: '01-' + Date.now() + '-desc', reference: 'AU-999999-ffff', status: 'APPROVED', amountInCents: 1000 });
      const r = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify(aviso) });
      exigir(r.estado === 200, `Respondió ${r.estado}.`);
      const cuerpo = r.cuerpo as { applied?: boolean };
      exigir(cuerpo?.applied === false, `applied vino como ${cuerpo?.applied}.`);
      return '200 con applied:false: Wompi deja de insistir y queda registrado.';
    },
  );

  await prueba(
    'ATAQ-05', G, 'La ruta del pago simulado no existe con Wompi activo', 'critica',
    'Es una ruta pública capaz de marcar pagos como aprobados a voluntad. Con la pasarela real encendida sería la forma más directa de vaciar el inventario sin pagar.',
    'POST /api/payments/mock/:ref responde 404.',
    async () => {
      const r = await pedir('/api/payments/mock/AU-1-aaaa', { method: 'POST', body: JSON.stringify({ outcome: 'APPROVED' }) });
      exigir(r.estado === 404, `La ruta respondió ${r.estado}: sigue registrada.`);
      return '404: la ruta no se registra cuando el proveedor es WOMPI.';
    },
  );

  await prueba(
    'ATAQ-06', G, 'No se puede pedir más de lo que hay', 'alta',
    'Vender lo que no existe obliga a devolver el dinero y deja mal a la tienda.',
    'Un intento por encima del stock disponible se rechaza con 409.',
    async () => {
      const producto = await prisma.product.findUnique({ where: { id: 'p3' }, select: { stock: true, reserved: true } });
      exigir(producto !== null, 'No existe el producto de prueba p3.');
      const r = await crearIntento([{ productId: 'p3', quantity: (producto?.stock ?? 0) + 25 }]);
      exigir(r.estado === 409 || r.estado === 400, `Respondió ${r.estado} en vez de 409.`);
      return `Rechazado con ${r.estado}: «${(r.cuerpo as { error?: string })?.error ?? ''}»`;
    },
  );

  await prueba(
    'ATAQ-07', G, 'Cantidades absurdas se rechazan en la puerta', 'media',
    'Una cantidad negativa o cero puede dar totales negativos; una enorme, desbordes.',
    'Cero, negativo y fraccionario devuelven 400.',
    async () => {
      const casos = [0, -5, 1.5];
      const estados: number[] = [];
      for (const quantity of casos) {
        const r = await pedir('/api/payments/intent', {
          method: 'POST',
          body: JSON.stringify({ items: [{ productId: 'p1', quantity }], customer: CLIENTA, shipping: ENVIO, shippingMethod: 'std' }),
        });
        estados.push(r.estado);
        exigir(r.estado === 400, `quantity=${quantity} devolvió ${r.estado} en vez de 400.`);
      }
      return `0, -5 y 1.5 devolvieron ${estados.join(', ')}.`;
    },
  );

  await prueba(
    'ATAQ-08', G, 'Dos compras simultáneas no venden la misma unidad', 'critica',
    'Sin una guardia atómica, dos peticiones que leen el stock a la vez pasan las dos la comprobación y se vende dos veces lo mismo.',
    'Lanzadas a la vez por el último par de unidades, solo prospera la que cabe.',
    async () => {
      const producto = await prisma.product.findFirst({
        where: { stock: { gt: 0, lt: 12 } },
        select: { id: true, stock: true, reserved: true },
      });
      if (!producto) return noAplica('No hay ningún producto con stock bajo para forzar la carrera.');

      const disponible = producto.stock - producto.reserved;
      if (disponible < 1) return noAplica(`El producto ${producto.id} no tiene unidades libres.`);

      // Las dos piden TODO lo disponible: solo una puede ganar.
      const [a, b] = await Promise.all([
        crearIntento([{ productId: producto.id, quantity: disponible }]),
        crearIntento([{ productId: producto.id, quantity: disponible }]),
      ]);
      const exitos = [a, b].filter((r) => r.estado === 201).length;
      exigir(exitos === 1, `Prosperaron ${exitos} de 2 intentos por las mismas ${disponible} unidades.`);

      const despues = await prisma.product.findUnique({ where: { id: producto.id }, select: { stock: true, reserved: true } });
      exigir(
        (despues?.reserved ?? 0) <= (despues?.stock ?? 0),
        `Quedó reservado (${despues?.reserved}) por encima del stock (${despues?.stock}).`,
      );
      return `Dos peticiones simultáneas por ${disponible} unidades de ${producto.id}: 1 aceptada, 1 rechazada. Reservado ${despues?.reserved} de ${despues?.stock}.`;
    },
  );

  await prueba(
    'ATAQ-09', G, 'El webhook solo acepta POST', 'info',
    'Un GET al webhook es la sonda más común de un escáner automático.',
    'GET responde 404.',
    async () => {
      const r = await pedir('/api/payments/webhook/wompi');
      exigir(r.estado === 404, `GET devolvió ${r.estado}.`);
      return 'GET al webhook devuelve 404.';
    },
  );
}

// ---------------------------------------------------------------------------
// E · Estados y reconciliación
// ---------------------------------------------------------------------------

async function grupoEstados(): Promise<void> {
  const G = 'E · Estados y reconciliación';

  await prueba(
    'EST-01', G, 'Los estados de Wompi se traducen sin perder ninguno', 'alta',
    'Wompi ha devuelto estados que no documenta (PROCESSING, FAILED, REJECTED). Tratar lo desconocido como error soltaría el stock de algo que quizá sí se pagó.',
    'Los conocidos se traducen y lo desconocido cae en PENDING, nunca en ERROR.',
    () => {
      const esperados: Record<string, string> = {
        APPROVED: 'APPROVED', DECLINED: 'DECLINED', REJECTED: 'DECLINED', VOIDED: 'VOIDED',
        ERROR: 'ERROR', FAILED: 'ERROR', PENDING: 'PENDING', PROCESSING: 'PENDING',
      };
      for (const [entra, sale] of Object.entries(esperados)) {
        exigir(mapStatus(entra) === sale, `${entra} se tradujo a ${mapStatus(entra)} y no a ${sale}.`);
      }
      exigir(mapStatus('UN_ESTADO_NUEVO') === 'PENDING', 'Un estado desconocido no cayó en PENDING.');
      return `${Object.keys(esperados).length} estados traducidos; lo desconocido queda PENDING.`;
    },
  );

  await prueba(
    'EST-02', G, 'Un pago aprobado no se puede volver a mover', 'critica',
    'Los avisos llegan desordenados. Un DECLINED viejo que aterrice después del APPROVED bueno cancelaría un pedido ya cobrado.',
    'APPROVED→DECLINED se bloquea; PENDING→APPROVED se permite.',
    () => {
      exigir(canTransition('PENDING', 'APPROVED'), 'No se permite aprobar un pago pendiente.');
      exigir(!canTransition('APPROVED', 'DECLINED'), 'Se permite rechazar un pago ya aprobado.');
      exigir(!canTransition('APPROVED', 'PENDING'), 'Se permite devolver a pendiente un pago aprobado.');
      return 'PENDING→APPROVED sí; APPROVED→DECLINED y APPROVED→PENDING no.';
    },
  );

  await prueba(
    'EST-03', G, 'Un pago caducado todavía puede aprobarse', 'alta',
    'Si el dinero entró tarde, entró. Dar por perdido un cobro que la pasarela sí capturó es quedarse con el dinero y sin el pedido.',
    'EXPIRED→APPROVED se permite.',
    () => {
      exigir(canTransition('EXPIRED', 'APPROVED'), 'Un pago caducado no admite aprobación tardía.');
      return 'EXPIRED→APPROVED permitido: una aprobación tardía se registra en vez de perderse.';
    },
  );

  await prueba(
    'REC-01', G, 'Se puede reconciliar por referencia contra el API real', 'alta',
    'Es la única salida cuando se pierde el aviso Y la clienta nunca vuelve: sin esto el cobro queda «pendiente» para siempre con el stock bloqueado.',
    'fetchByReference llama al API real y devuelve null si no existe, sin lanzar.',
    async () => {
      const r = await gateway.fetchByReference('AU-000000-noexiste');
      exigir(r === null, `Devolvió algo para una referencia inexistente: ${JSON.stringify(r)}`);
      return 'GET /v1/transactions?reference=… autenticado con la llave privada; referencia inexistente → null.';
    },
  );

  await prueba(
    'REC-04', G, 'Conciliar un cobro que no cambió igual guarda lo que se aprendió', 'media',
    'El momento en que más falta hace saber el medio de pago es justo aquel en que el estado NO cambió: un cobro pendiente que seguimos sin resolver. Antes se tiraba ese dato, porque PENDING→PENDING no es una transición y el evento se cerraba como repetido. Visto con un pago real de DaviPlata: la pasarela decía DAVIPLATA y nosotros guardábamos null.',
    'Tras aplicar una instantánea con el mismo estado pero con medio de pago, el cobro queda con el medio guardado.',
    async () => {
      const intento = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      exigir(intento.estado === 201, `El intento devolvió ${intento.estado}.`);
      const cuerpo = intento.cuerpo as { reference: string; amountInCents: number };

      const antes = await prisma.payment.findUnique({
        where: { reference: cuerpo.reference }, select: { status: true, methodType: true },
      });
      exigir(antes?.status === 'PENDING', `El cobro nació en ${antes?.status}.`);
      exigir(antes?.methodType === null, `Ya traía medio de pago: ${antes?.methodType}.`);

      // Misma situación: sigue PENDING, pero ahora sabemos por dónde paga.
      await applySnapshot(
        {
          status: 'PENDING',
          providerTransactionId: '01-' + Date.now() + '-met',
          reference: cuerpo.reference,
          amountInCents: cuerpo.amountInCents,
          methodType: 'NEQUI',
          providerStatus: 'PENDING',
          raw: { prueba: 'REC-04' },
        },
        PaymentEventSource.POLL,
        'rec04-' + randomUUID().slice(0, 12),
        {},
      );

      const despues = await prisma.payment.findUnique({
        where: { reference: cuerpo.reference }, select: { status: true, methodType: true },
      });
      exigir(
        despues?.methodType === 'NEQUI',
        `El medio quedó en ${despues?.methodType} en vez de NEQUI: se perdió el dato.`,
      );
      exigir(despues?.status === 'PENDING', `El estado cambió a ${despues?.status}, y no debía.`);
      return 'Estado intacto en PENDING y medio de pago guardado como NEQUI.';
    },
  );

  await prueba(
    'REC-02', G, 'Consultar una transacción que no existe no rompe nada', 'media',
    'Un 404 de la pasarela tratado como excepción dejaría a la clienta sin respuesta en la pantalla de resultado.',
    'fetchByTransactionId devuelve null ante un id inventado.',
    async () => {
      const r = await gateway.fetchByTransactionId('00-0000000000-00000');
      exigir(r === null, `Devolvió ${JSON.stringify(r)} en vez de null.`);
      return 'Id inexistente → null, sin excepción.';
    },
  );

  await prueba(
    'REC-03', G, 'El dinero se maneja en enteros', 'alta',
    'El peso colombiano no tiene centavos y los flotantes arrastran error: 0.1+0.2 no es 0.3. Un céntimo de desfase hace que Wompi rechace la firma.',
    'toCents siempre da enteros exactos.',
    () => {
      for (const pesos of [32900, 219900, 1, 999999, 80700]) {
        const centavos = toCents(pesos);
        exigir(Number.isInteger(centavos), `${pesos} pesos dio ${centavos}, que no es entero.`);
        exigir(centavos === pesos * 100, `${pesos} pesos dio ${centavos} y no ${pesos * 100}.`);
      }
      return 'Cinco montos convertidos a centavos sin pérdida.';
    },
  );
}

// ---------------------------------------------------------------------------
// F · Superficie expuesta
// ---------------------------------------------------------------------------

async function grupoSuperficie(): Promise<void> {
  const G = 'F · Superficie expuesta';

  await prueba(
    'SUP-01', G, 'La consulta pública de un pago no filtra datos de la clienta', 'alta',
    'La referencia viaja en URLs y acaba en historiales y registros. Quien la tenga no debe poder sacar de ahí el correo, el teléfono o la dirección.',
    'La respuesta no contiene datos personales.',
    async () => {
      const intento = await crearIntento([{ productId: 'p1', quantity: 1 }]);
      const referencia = (intento.cuerpo as { reference: string }).reference;
      const r = await pedir(`/api/payments/${referencia}`);
      exigir(r.estado === 200, `Respondió ${r.estado}.`);

      const texto = r.texto.toLowerCase();
      for (const dato of [CLIENTA.email.toLowerCase(), CLIENTA.phone, CLIENTA.legalId, ENVIO.line1.toLowerCase()]) {
        exigir(!texto.includes(dato), `La respuesta pública incluye «${dato}».`);
      }
      return `Devuelve estado y totales. Sin correo, teléfono, documento ni dirección. Campos: ${Object.keys((r.cuerpo as object) ?? {}).join(', ')}`;
    },
  );

  await prueba(
    'SUP-02', G, 'Una referencia con forma inválida se rechaza sin tocar la base', 'media',
    'El parámetro entra directo en una consulta. Validar la forma antes corta de raíz cualquier intento de inyección o de sondeo.',
    'Referencias con comillas, rutas o SQL devuelven 400.',
    async () => {
      const sondas = ["AU-1-aaaa' OR '1'='1", '../../etc/passwd', 'AU-1-aaaa; DROP TABLE payments;--', '<script>alert(1)</script>'];
      for (const sonda of sondas) {
        const r = await pedir(`/api/payments/${encodeURIComponent(sonda)}`);
        exigir(r.estado === 400 || r.estado === 404, `«${sonda}» devolvió ${r.estado}.`);
      }
      return `${sondas.length} sondas (SQL, recorrido de rutas, script) rechazadas por el validador de forma.`;
    },
  );

  await prueba(
    'SUP-03', G, 'Los secretos no salen en los mensajes de error', 'alta',
    'Un mensaje de error que arrastre la cadena firmada publica el secreto de eventos a cualquiera que provoque el error.',
    'Un aviso malformado devuelve un error genérico sin secretos.',
    async () => {
      const r = await pedir('/api/payments/webhook/wompi', { method: 'POST', body: JSON.stringify({ basura: true }) });
      for (const secreto of [env.wompiEventsSecret, env.wompiIntegritySecret, env.wompiPrivateKey]) {
        exigir(!r.texto.includes(secreto), 'Un secreto apareció en la respuesta de error.');
      }
      return `Respondió ${r.estado} con «${((r.cuerpo as { error?: string })?.error ?? r.texto).slice(0, 80)}», sin secretos.`;
    },
  );

  await prueba(
    'SUP-04', G, 'El proxy del túnel solo deja pasar la ruta del webhook', 'alta',
    'Tunelizar la API entera publicaría en internet el login del panel con credenciales de demo. Wompi solo necesita una ruta.',
    'El script solo reenvía POST a la ruta del webhook y responde 404 a todo lo demás.',
    async () => {
      const fuente = await readFile(join(RAIZ, 'server/scripts/tunel-webhook.mjs'), 'utf8');
      exigir(fuente.includes("RUTA = '/api/payments/webhook/wompi'"), 'El proxy no fija la ruta.');
      exigir(/entrada\.method !== 'POST'/.test(fuente), 'El proxy no filtra por método.');
      exigir(fuente.includes('MAX_BYTES'), 'El proxy no limita el tamaño del cuerpo.');
      return 'Filtra por método y ruta, limita el cuerpo y deja bitácora de lo recibido.';
    },
  );
}


// ---------------------------------------------------------------------------
// H · Límites de uso
//
// Van al FINAL porque agotan deliberadamente la cuota por minuto de la
// creación de intentos. Puestas en medio dejaban sin intento a las pruebas
// siguientes, que fallaban por falta de cuota y no por un defecto.
// ---------------------------------------------------------------------------

async function grupoLimites(): Promise<void> {
  const G = 'H · Límites de uso';
  await prueba(
    'ATAQ-10', G, 'Hay límite de peticiones en la creación de intentos', 'alta',
    'Crear un intento aparta stock sin pedir cuenta ni pago. Sin freno, un bucle desde una IP deja el catálogo sin unidades disponibles: medido antes del arreglo, 10 reservas en 355 ms.',
    'Una ráfaga acaba recibiendo 429 en vez de seguir aceptando indefinidamente.',
    async () => {
      // Va al final del grupo a propósito: consume la cuota del minuto.
      let limitadas = 0;
      let aceptadas = 0;
      for (let i = 0; i < 40; i++) {
        const r = await pedir('/api/payments/intent', {
          method: 'POST',
          body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], customer: CLIENTA, shipping: ENVIO, shippingMethod: 'std' }),
        });
        if (r.estado === 429) limitadas++;
        if (r.estado === 201) {
          aceptadas++;
          const ref = (r.cuerpo as { reference?: string })?.reference;
          if (ref) referenciasCreadas.push(ref);
        }
      }
      exigir(limitadas > 0, `40 peticiones seguidas y ninguna fue limitada (${aceptadas} aceptadas).`);
      return `De 40 peticiones seguidas, ${aceptadas} pasaron y ${limitadas} recibieron 429.`;
    },
  );

  await prueba(
    'ATAQ-11', G, 'RIESGO ABIERTO: el inventario se puede agotar sin pagar', 'alta',
    'Un intento de pago aparta stock durante 15 minutos sin cuenta ni cobro. El límite de peticiones frena el barrido del catálogo, pero no puede ponerse por debajo del stock de un producto sin dejar fuera a clientas reales.',
    'Esta prueba DOCUMENTA el riesgo residual; no afirma que esté resuelto.',
    async () => {
      const producto = await prisma.product.findFirst({
        where: { stock: { gt: 0 } },
        orderBy: { stock: 'asc' },
        select: { id: true, stock: true, reserved: true },
      });
      exigir(producto !== null, 'No hay productos con stock.');
      const libre = (producto?.stock ?? 0) - (producto?.reserved ?? 0);
      // Con el tope en 20/min, cualquier producto por debajo de 20 unidades
      // sigue siendo vaciable dentro del mismo minuto desde una sola IP.
      const vaciableEnUnMinuto = libre > 0 && libre <= 20;
      return (
        `Producto más expuesto: ${producto?.id} con ${libre} unidades libres. ` +
        (vaciableEnUnMinuto
          ? 'Sigue siendo vaciable dentro del mismo minuto desde una sola IP: el límite (20/min) está por encima de su stock. Mitigado parcialmente, NO cerrado.'
          : 'Por encima del límite por minuto, así que haría falta más de un minuto por producto.') +
        ' Cierre pendiente: apartar stock al abrir el checkout, acortar la ventana de reserva y topar reservas pendientes por IP.'
      );
    },
  );

}

// ---------------------------------------------------------------------------
// G · Lo que NO se pudo probar
// ---------------------------------------------------------------------------

async function grupoPendiente(): Promise<void> {
  const G = 'G · Pendiente de un aviso real';

  await prueba(
    'E2E-01', G, 'Un aviso emitido por Wompi pasa nuestra verificación', 'critica',
    'Todo lo anterior prueba que verificamos BIEN el algoritmo que implementamos. Que ese algoritmo sea el de Wompi solo lo demuestra un aviso suyo, y hay un motivo concreto para dudar: el ejemplo resuelto de su documentación NO reproduce su propio checksum (comprobado: la cadena que publican, hasheada con el secreto que publican, da otro hash).',
    'Un aviso real de sandbox llega al webhook y se acepta.',
    async () => {
      const bitacora = join(SALIDA, 'avisos-recibidos.jsonl');
      let contenido = '';
      try {
        contenido = await readFile(bitacora, 'utf8');
      } catch {
        return noAplica('Todavía no ha llegado ningún aviso real: falta registrar la URL de eventos en el Dashboard de Wompi y pagar una transacción de prueba.');
      }
      const lineas = contenido.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
      /*
         Solo cuenta lo que TIENE FORMA de aviso de Wompi.

         Antes contaba cualquier cosa reenviada por el proxy, y las sondas con
         las que se comprueba el túnel ({"x":1}) entraban como avisos reales:
         la prueba daba por roto el algoritmo del checksum por culpa de nuestro
         propio tráfico de verificación. Una prueba de seguridad que grita sin
         motivo acaba ignorándose, que es peor que no tenerla.
      */
      const pareceDeWompi = (l: Record<string, unknown>): boolean => {
        const aviso = l.aviso as { event?: unknown; signature?: { checksum?: unknown; properties?: unknown }; timestamp?: unknown } | undefined;
        return (
          l.resultado === 'reenviado' &&
          typeof aviso?.event === 'string' &&
          typeof aviso?.timestamp === 'number' &&
          typeof aviso?.signature?.checksum === 'string' &&
          Array.isArray(aviso?.signature?.properties)
        );
      };
      const reenviados = lineas.filter(pareceDeWompi);
      if (reenviados.length === 0) {
        const sondas = lineas.filter((l) => l.resultado === 'reenviado').length;
        return noAplica(
          `Todavía no ha llegado ningún aviso real de Wompi. La bitácora tiene ${lineas.length} entradas ` +
            `(${sondas} son sondas de verificación del túnel, sin forma de aviso). ` +
            'Falta registrar la URL de eventos en el Dashboard y pagar una transacción de prueba.',
        );
      }
      const aceptados = reenviados.filter((l) => l.estadoApi === 200);
      exigir(
        aceptados.length > 0,
        `Llegaron ${reenviados.length} avisos reales y NINGUNO fue aceptado. El algoritmo del checksum no coincide con el de Wompi.`,
      );
      return `${aceptados.length} de ${reenviados.length} avisos reales de Wompi aceptados con 200.`;
    },
  );
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

/**
 * Suelta las reservas que crearon las pruebas.
 *
 * No toca el stock a mano: adelanta la caducidad de los cobros de prueba y deja
 * que el servicio los expire por su camino normal, que es el que devuelve las
 * unidades registrando el movimiento de inventario. Escribir el stock
 * directamente aquí rompería la regla que sostiene todo el inventario.
 */
async function limpiar(): Promise<string> {
  if (referenciasCreadas.length === 0) return 'No había nada que soltar.';
  await prisma.payment.updateMany({
    where: { reference: { in: referenciasCreadas }, status: 'PENDING' },
    data: { expiresAt: new Date(Date.now() - 3600_000) },
  });
  const informe = await expireStale(referenciasCreadas.length + 10);
  return `${referenciasCreadas.length} cobros de prueba caducados; ${JSON.stringify(informe)}`;
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('  Banco de pruebas de pagos · Wompi');
  console.log(`  API local:  ${API}`);
  console.log(`  Pasarela:   ${gateway.id}  (${gateway.configured ? 'configurada' : 'CON PROBLEMAS'})`);
  console.log(`  Ambiente:   ${env.wompiPublicKey.startsWith('pub_test_') ? 'sandbox' : 'PRODUCCIÓN'}`);
  console.log('');

  const salud = await pedir('/health');
  if (salud.estado !== 200) {
    console.error(`  La API no responde en ${API}. Arráncala con "npm run api" y repite.`);
    process.exit(1);
  }

  await grupoCredenciales();
  await grupoIntegridad();
  await grupoAvisos();
  await grupoAtaques();
  await grupoEstados();
  await grupoSuperficie();
  await grupoLimites();
  await grupoPendiente();

  const limpieza = await limpiar();

  const pasan = resultados.filter((r) => r.estado === 'PASA').length;
  const fallan = resultados.filter((r) => r.estado === 'FALLA');
  const na = resultados.filter((r) => r.estado === 'NO_APLICA').length;

  console.log('');
  console.log(`  ${pasan} pasan · ${fallan.length} fallan · ${na} sin aplicar`);
  if (fallan.length > 0) {
    console.log('');
    for (const f of fallan) console.log(`  FALLA ${f.id} (${f.severidad}): ${f.nombre}`);
  }
  console.log(`  Limpieza: ${limpieza}`);

  await mkdir(SALIDA, { recursive: true });
  await writeFile(
    join(SALIDA, 'resultados.json'),
    JSON.stringify(
      {
        generado: new Date().toISOString(),
        ambiente: env.wompiPublicKey.startsWith('pub_test_') ? 'sandbox' : 'produccion',
        comercio: null,
        pasarela: gateway.id,
        resumen: { pasan, fallan: fallan.length, sinAplicar: na, total: resultados.length },
        limpieza,
        resultados,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`  Resultados en docs/pruebas-wompi/resultados.json`);
  console.log('');

  await prisma.$disconnect();
  // Falla el proceso si falla una prueba: así esto sirve en una tubería de CI.
  process.exit(fallan.length > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
