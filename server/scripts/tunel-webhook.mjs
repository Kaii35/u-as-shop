/**
 * Expone SOLO el webhook de Wompi, para poder probar avisos reales en local.
 *
 *     node server/scripts/tunel-webhook.mjs        (escucha en el 4199)
 *     cloudflared tunnel --url http://localhost:4199
 *
 * y la URL que imprime cloudflared, con /api/payments/webhook/wompi al final,
 * es la que se pega en el Dashboard de Wompi como URL de Eventos.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe en vez de tunelizar la API directamente
 * ---------------------------------------------------------------------------
 * Un túnel sobre el 4100 publica en internet la API ENTERA: el login del panel,
 * el inventario, los pedidos y las promociones, con las credenciales de demo
 * puestas. La URL es aleatoria, pero «difícil de adivinar» no es un control de
 * acceso, y esas URLs se filtran solas —acaban en logs, en el historial, en el
 * portapapeles—. Wompi solo necesita llegar a UNA ruta, así que solo se publica
 * esa; cualquier otra cosa recibe 404 y no llega al servidor real.
 *
 * Es una herramienta de desarrollo. En producción la API va detrás de su propio
 * dominio con TLS y esto no pinta nada.
 */
import { createServer, request as httpRequest } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = Number(process.env.TUNNEL_PORT ?? 4199);
const DESTINO_HOST = '127.0.0.1';
const DESTINO_PUERTO = Number(process.env.API_PORT ?? 4100);
const RUTA = '/api/payments/webhook/wompi';

/**
 * Tope de cuerpo. Un aviso de Wompi son unos pocos kilobytes; 64 KB deja
 * margen de sobra y corta en seco el envío de un cuerpo gigante para tumbar
 * el proceso, que es lo más fácil de intentar contra un endpoint público.
 */
const MAX_BYTES = 64 * 1024;

const aqui = dirname(fileURLToPath(import.meta.url));
const BITACORA = resolve(aqui, '../../docs/pruebas-wompi/avisos-recibidos.jsonl');

/** Deja constancia de todo lo que llega, válido o no. Es la prueba del envío. */
async function anotar(registro) {
  try {
    await mkdir(dirname(BITACORA), { recursive: true });
    await appendFile(BITACORA, JSON.stringify(registro) + '\n', 'utf8');
  } catch (error) {
    console.error('  no se pudo escribir la bitácora:', error.message);
  }
}

const servidor = createServer((entrada, salida) => {
  const momento = new Date().toISOString();
  // Solo el origen remoto y el user-agent. Nada de volcar todas las cabeceras:
  // en un endpoint público pueden traer cookies o tokens de un tercero.
  const origen = entrada.socket.remoteAddress ?? '?';
  const agente = entrada.headers['user-agent'] ?? '';

  if (entrada.method !== 'POST' || (entrada.url ?? '').split('?')[0] !== RUTA) {
    console.log(`  ${momento}  ${entrada.method} ${entrada.url}  → 404 (fuera de la ruta)`);
    void anotar({ momento, resultado: 'fuera-de-ruta', metodo: entrada.method, url: entrada.url, origen });
    salida.writeHead(404, { 'content-type': 'application/json' });
    salida.end('{"error":"no encontrado"}');
    return;
  }

  const trozos = [];
  let total = 0;
  let cortado = false;

  entrada.on('data', (trozo) => {
    total += trozo.length;
    if (total > MAX_BYTES) {
      cortado = true;
      entrada.destroy();
      return;
    }
    trozos.push(trozo);
  });

  entrada.on('close', () => {
    if (!cortado) return;
    console.log(`  ${momento}  cuerpo de más de ${MAX_BYTES} bytes → cortado`);
    void anotar({ momento, resultado: 'cuerpo-demasiado-grande', origen });
    if (!salida.headersSent) {
      salida.writeHead(413, { 'content-type': 'application/json' });
      salida.end('{"error":"cuerpo demasiado grande"}');
    }
  });

  entrada.on('end', () => {
    if (cortado) return;
    const cuerpo = Buffer.concat(trozos);

    const reenvio = httpRequest(
      {
        host: DESTINO_HOST,
        port: DESTINO_PUERTO,
        path: RUTA,
        method: 'POST',
        headers: {
          'content-type': entrada.headers['content-type'] ?? 'application/json',
          'content-length': cuerpo.length,
        },
      },
      (respuesta) => {
        const partes = [];
        respuesta.on('data', (t) => partes.push(t));
        respuesta.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8');
          console.log(`  ${momento}  aviso recibido (${cuerpo.length} B) → la API respondió ${respuesta.statusCode}`);
          void anotar({
            momento,
            resultado: 'reenviado',
            origen,
            agente,
            bytes: cuerpo.length,
            estadoApi: respuesta.statusCode,
            respuestaApi: texto.slice(0, 500),
            // El aviso completo: es lo que permite comprobar después, con calma,
            // que el checksum calculado coincide con el que mandó Wompi.
            aviso: (() => {
              try { return JSON.parse(cuerpo.toString('utf8')); } catch { return cuerpo.toString('utf8').slice(0, 2000); }
            })(),
          });
          salida.writeHead(respuesta.statusCode ?? 502, { 'content-type': 'application/json' });
          salida.end(texto);
        });
      },
    );

    reenvio.on('error', (error) => {
      console.error(`  ${momento}  no se pudo hablar con la API: ${error.message}`);
      void anotar({ momento, resultado: 'api-caida', origen, detalle: error.message });
      // 502 y no 200: Wompi tiene que reintentar, no dar el aviso por entregado.
      salida.writeHead(502, { 'content-type': 'application/json' });
      salida.end('{"error":"la API no responde"}');
    });

    reenvio.end(cuerpo);
  });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log('');
  console.log(`  Proxy del webhook escuchando en http://localhost:${PUERTO}`);
  console.log(`  Única ruta abierta:  POST ${RUTA}`);
  console.log(`  Reenvía a:           http://${DESTINO_HOST}:${DESTINO_PUERTO}${RUTA}`);
  console.log(`  Bitácora:            ${BITACORA}`);
  console.log('');
  console.log(`  Ahora:  cloudflared tunnel --url http://localhost:${PUERTO}`);
  console.log('');
});
