import type { FastifyInstance } from 'fastify';
import { PaymentEventSource } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { gateway, isMockProvider } from '../payments/index.js';
import { verifyEventChecksum } from '../payments/wompi.js';
import {
  applySnapshot,
  createIntent,
  expireStale,
  paymentSnapshotForPublic,
  publicPaymentSelect,
  recordRejectedEvent,
  syncPayment,
} from '../payments/service.js';

/**
 * Rutas públicas de pagos (sección 9.1 del contrato).
 *
 * Públicas de verdad: ni una pide sesión. La del webhook no puede pedirla
 * porque quien la llama es la pasarela, y las otras porque quien las usa es
 * una clienta que todavía no tiene cuenta. Eso obliga a validar con dureza
 * todo lo que entra y a no devolver nada que no haga falta: lo único que hace
 * de llave aquí es la referencia, y las referencias viajan en URLs.
 */

/** Error con código HTTP para el manejador central de `index.ts`. */
function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = status;
  return error;
}

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  throw httpError(400, `${field}${issue?.message ?? 'Datos inválidos.'}`);
}

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

/**
 * Tipos de documento que acepta Wompi. Lista cerrada y no texto libre: va
 * dentro de la petición a la pasarela, y un valor inventado hace fallar el
 * checkout con un error que no explica nada.
 */
const LEGAL_ID_TYPES = ['CC', 'CE', 'NIT', 'PP', 'TI', 'DNI', 'RG', 'OTHER'] as const;

const intentBody = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, 'Falta el producto.'),
        quantity: z
          .number()
          .int('Las unidades no se parten por la mitad.')
          .min(1, 'La cantidad mínima es una unidad.')
          .max(50, 'Máximo 50 unidades por línea. Para más, escríbenos.'),
        variant: z.string().trim().max(160).optional(),
      }),
    )
    .min(1, 'Tu carrito está vacío.')
    .max(50, 'Máximo 50 productos distintos por pedido.'),
  customer: z.object({
    name: z.string().trim().min(3, 'Escribe tu nombre completo.').max(200),
    email: z.string().trim().max(200).email('Ese correo no parece válido.'),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{7,20}$/, 'Ese teléfono no parece válido.'),
    legalIdType: z.enum(LEGAL_ID_TYPES).default('CC'),
    legalId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z-]{5,20}$/, 'Ese número de documento no parece válido.'),
  }),
  shipping: z.object({
    line1: z.string().trim().min(5, 'Escribe la dirección completa.').max(200),
    city: z.string().trim().min(2, 'Falta la ciudad.').max(120),
    region: z.string().trim().min(2, 'Falta el departamento.').max(120),
    // Solo Colombia: es a donde despacha la tienda, y firmar una dirección
    // de otro país haría creer que se puede enviar allá.
    country: z.literal('CO').default('CO'),
  }),
  couponCode: z.string().trim().max(40).optional(),
  shippingMethod: z.enum(['std', 'exp', 'pick']).default('std'),
});

const referenceParam = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^AU-[0-9]+-[0-9a-f]{4}$/, 'Esa referencia no tiene la forma de una nuestra.'),
});

const referenceQuery = z.object({
  transactionId: z.string().trim().min(1).max(120).optional(),
});

const mockBody = z.object({
  outcome: z.enum(['APPROVED', 'DECLINED', 'PENDING'], {
    errorMap: () => ({ message: 'El desenlace simulado solo puede ser APPROVED, DECLINED o PENDING.' }),
  }),
});

// ---------------------------------------------------------------------------
// Utilidades del webhook
// ---------------------------------------------------------------------------

/**
 * Saca la referencia de un aviso SIN confiar en él.
 *
 * Solo sirve para saber a qué cobro adjuntar el registro de un intento
 * fallido. Nada de lo que se lea aquí decide un estado.
 */
function referenceFromBody(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const data = (body as { data?: unknown }).data;
  if (data === null || typeof data !== 'object') return null;
  const transaction = (data as { transaction?: unknown }).transaction;
  if (transaction === null || typeof transaction !== 'object') return null;
  const reference = (transaction as { reference?: unknown }).reference;
  return typeof reference === 'string' && reference.length > 0 ? reference : null;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  /*
   * Este plugin NO declara su propio manejador de errores.
   *
   * Lo tuvo mientras `src/index.ts` registraba las rutas antes de instalar el
   * suyo, que dejaba a cada plugin con el manejador por defecto de Fastify.
   * Ese orden ya está corregido, así que el manejador global cubre también
   * estas rutas y mantener aquí una copia solo crearía dos mapeos de errores
   * que se separan con el tiempo.
   */

  // -------------------------------------------------------------------------
  // POST /api/payments/intent
  // -------------------------------------------------------------------------
  app.post('/api/payments/intent', async (request, reply) => {
    const body = parse(intentBody, request.body);

    /**
     * Caducidad oportunista: se aprovecha que alguien está comprando para
     * soltar las reservas vencidas, y así la unidad que otra clienta dejó a
     * medio pagar vuelve a estar disponible justo antes de contarla.
     *
     * EN PRODUCCIÓN ESTO VA EN UNA TAREA PROGRAMADA (un cron cada minuto o un
     * worker): depender de que alguien compre para liberar stock significa que
     * en una tienda sin tráfico las unidades se quedan bloqueadas. Aquí está
     * así para que la demo funcione sin infraestructura extra.
     */
    try {
      await expireStale();
    } catch (error) {
      // Que falle la limpieza no puede impedir una venta: se registra y sigue.
      request.log.error({ err: error }, 'No se pudieron caducar las reservas vencidas.');
    }

    const intent = await createIntent({
      items: body.items,
      customer: body.customer,
      shipping: body.shipping,
      ...(body.couponCode ? { couponCode: body.couponCode } : {}),
      shippingMethod: body.shippingMethod,
    });

    return reply.code(201).send(intent);
  });

  // -------------------------------------------------------------------------
  // GET /api/payments/:reference
  // -------------------------------------------------------------------------
  app.get('/api/payments/:reference', async (request, reply) => {
    const { reference } = parse(referenceParam, request.params);
    const query = parse(referenceQuery, request.query);

    let payment = await prisma.payment.findUnique({
      where: { reference },
      select: publicPaymentSelect,
    });
    if (!payment) {
      return reply.code(404).send({ error: 'No encontramos ese pago.', code: 'NOT_FOUND' });
    }

    /**
     * Red de seguridad para cuando el webhook se pierde. Wompi añade el id de
     * la transacción a la URL de retorno, así que si la clienta ya volvió y
     * nosotros seguimos viendo "pendiente", se le pregunta a la pasarela antes
     * de contestar en vez de mostrarle un pendiente que ya no es verdad.
     */
    if (payment.status === 'PENDING' && query.transactionId) {
      try {
        await syncPayment(reference, query.transactionId);
        payment = await prisma.payment.findUnique({
          where: { reference },
          select: publicPaymentSelect,
        });
      } catch (error) {
        // Si la pasarela no contesta, se devuelve lo último que sabemos. Un
        // error aquí dejaría a la clienta sin ninguna respuesta.
        request.log.error({ err: error, reference }, 'Falló la consulta a la pasarela.');
      }
    }
    if (!payment) {
      return reply.code(404).send({ error: 'No encontramos ese pago.', code: 'NOT_FOUND' });
    }

    return paymentSnapshotForPublic(payment);
  });

  // -------------------------------------------------------------------------
  // POST /api/payments/webhook/wompi
  // -------------------------------------------------------------------------
  /**
   * Lo llama Wompi, no el navegador. Sin token: lo que autentica el aviso es
   * el checksum, verificado con el secreto de eventos.
   *
   * La regla que manda sobre los códigos de respuesta: Wompi REINTENTA
   * mientras no reciba un 200. Así que un fallo nuestro tiene que salir como
   * 500 —queremos el reintento— y un aviso repetido como 200, para que deje
   * de insistir con algo que ya aplicamos.
   */
  app.post('/api/payments/webhook/wompi', async (request, reply) => {
    const verified = gateway.verifyEvent(request.body);

    if (env.debugPaymentEvents && gateway.id === 'WOMPI') {
      // Solo con WOMPI_DEBUG_EVENTS y nunca en producción: la cadena que se
      // firma lleva el SECRETO DE EVENTOS pegado al final, y dejarla en los
      // logs es publicarlo. Existe para depurar el primer aviso de sandbox,
      // porque el ejemplo resuelto de la documentación de Wompi no reproduce
      // su propio checksum y hay que poder comparar.
      const check = verifyEventChecksum(
        request.body as Parameters<typeof verifyEventChecksum>[0],
        env.wompiEventsSecret,
      );
      request.log.warn({ chain: check.chain, ok: check.ok }, 'Cadena firmada del aviso (depuración).');
    }

    if (!verified.valid) {
      // Se registra igual: un aviso falsificado es justo lo que hay que poder
      // mirar después, y el 401 sin rastro no deja nada que investigar.
      await recordRejectedEvent({
        reference: referenceFromBody(request.body),
        fingerprint: verified.fingerprint,
        reason: verified.reason,
        payload: request.body,
      });
      request.log.warn({ reason: verified.reason }, 'Aviso de pago rechazado.');
      return reply.code(401).send({ error: 'Firma del aviso inválida.' });
    }

    // Si esto lanza, el manejador de `index.ts` responde 500 y Wompi
    // reintenta. Es lo correcto: perder un aviso de pago es peor que
    // procesarlo tarde.
    const outcome = await applySnapshot(
      verified.snapshot,
      PaymentEventSource.WEBHOOK,
      verified.fingerprint,
      { checksumOk: true, payload: request.body },
    );

    if (outcome.kind === 'not-found') {
      // Firma buena, referencia que no es nuestra. Reintentarlo no lo va a
      // arreglar, así que 200 para que deje de insistir, y un aviso al log
      // porque esto solo pasa si dos entornos comparten credenciales.
      request.log.warn({ reference: outcome.reference }, 'Aviso de una referencia desconocida.');
      return reply.code(200).send({ received: true, applied: false });
    }

    return reply.code(200).send({ received: true, applied: outcome.kind === 'applied' });
  });

  // -------------------------------------------------------------------------
  // POST /api/payments/mock/:reference — solo en modo simulado
  // -------------------------------------------------------------------------
  /**
   * El botón que en la demo hace de banco.
   *
   * La ruta NO SE REGISTRA con Wompi activo. No es un detalle de higiene: una
   * ruta pública capaz de marcar pagos como aprobados a voluntad es la forma
   * más directa de vaciar el inventario sin pagar un peso.
   */
  if (isMockProvider()) {
    app.post('/api/payments/mock/:reference', async (request, reply) => {
      const { reference } = parse(referenceParam, request.params);
      const body = parse(mockBody, request.body);

      const payment = await prisma.payment.findUnique({
        where: { reference },
        select: { amountInCents: true },
      });
      if (!payment) {
        return reply.code(404).send({ error: 'No encontramos ese pago.', code: 'NOT_FOUND' });
      }

      // El monto lo pone la BASE, no quien pulsa el botón: el simulador imita
      // al banco, y el banco no decide cuánto vale el pedido. Así la
      // comprobación de importe de `applySnapshot` recorre el mismo camino que
      // con la pasarela real.
      const verified = gateway.verifyEvent({
        reference,
        status: body.outcome,
        amountInCents: payment.amountInCents,
      });
      if (!verified.valid) {
        return reply.code(400).send({ error: verified.reason });
      }

      const outcome = await applySnapshot(
        verified.snapshot,
        PaymentEventSource.WEBHOOK,
        verified.fingerprint,
        { checksumOk: true, payload: request.body },
      );

      const updated = await prisma.payment.findUnique({
        where: { reference },
        select: publicPaymentSelect,
      });
      if (!updated) {
        return reply.code(404).send({ error: 'No encontramos ese pago.', code: 'NOT_FOUND' });
      }

      return {
        ...paymentSnapshotForPublic(updated),
        // Para poder ver en la demo que el segundo aviso idéntico no vuelve a
        // mover nada, que es justo lo que hay que poder comprobar.
        applied: outcome.kind === 'applied',
        duplicate: outcome.kind === 'duplicate',
      };
    });
  }
}
