import type { FastifyInstance } from 'fastify';
import { PopupFrequency, PromotionScope, PromotionType, type Promotion } from '@prisma/client';
import { z, type ZodError } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { soldWhere } from '../sales.js';
import { computeDiscount, isLive, promotionState, type PromotionRule } from '../promotions.js';
import { findSetting } from '../settings-defaults.js';

/** Primer problema que encontró zod, con el campo que lo causó. */
const zodMessage = (error: ZodError): string => {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
};

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const optionalText = z.string().trim().max(300).nullable().optional();

/**
 * El cupón se guarda en mayúsculas porque la clienta lo escribe como quiere y
 * `code` es único: sin normalizar, AURELLE20 y aurelle20 serían dos cupones.
 * Cadena vacía quiere decir quitarlo: es lo que manda un formulario limpiado.
 */
const codeSchema = z
  .string()
  .trim()
  .max(40, 'El cupón no puede pasar de 40 caracteres.')
  .transform((v) => (v === '' ? null : v.toUpperCase()))
  .nullable()
  .optional();

const promotionFields = {
  name: z.string().trim().min(2, 'El nombre es obligatorio.').max(120),
  code: codeSchema,
  type: z.nativeEnum(PromotionType),
  scope: z.nativeEnum(PromotionScope),
  targetIds: z.array(z.string().trim().min(1)).max(200),
  value: z.number().int('El valor va en enteros.').min(0).max(100_000_000),
  maxDiscount: z.number().int().min(1, 'El tope tiene que ser de al menos $1.').nullable().optional(),
  minPurchase: z.number().int().min(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean(),
  priority: z.number().int().min(-1000).max(1000),
  usageLimit: z.number().int().min(1, 'El límite de usos tiene que ser al menos 1.').nullable().optional(),

  showPopup: z.boolean(),
  popupTitle: optionalText,
  popupSubtitle: optionalText,
  popupBadge: optionalText,
  popupImage: optionalText,
  popupCtaLabel: optionalText,
  popupCtaUrl: optionalText,
  popupFrequency: z.nativeEnum(PopupFrequency),
  popupDelayMs: z.number().int().min(0).max(120_000),
} as const;

const createSchema = z.object({
  ...promotionFields,
  type: promotionFields.type.default(PromotionType.PERCENTAGE),
  scope: promotionFields.scope.default(PromotionScope.ALL),
  targetIds: promotionFields.targetIds.default([]),
  value: promotionFields.value.default(0),
  minPurchase: promotionFields.minPurchase.default(0),
  startsAt: promotionFields.startsAt.optional(),
  active: promotionFields.active.default(true),
  priority: promotionFields.priority.default(0),
  showPopup: promotionFields.showPopup.default(false),
  popupFrequency: promotionFields.popupFrequency.default(PopupFrequency.SESSION),
  popupDelayMs: promotionFields.popupDelayMs.default(1200),
});

const patchSchema = z.object(promotionFields).partial();

const previewSchema = z.object({
  promotion: z.object({
    type: promotionFields.type.default(PromotionType.PERCENTAGE),
    scope: promotionFields.scope.default(PromotionScope.ALL),
    targetIds: promotionFields.targetIds.default([]),
    value: promotionFields.value.default(0),
    maxDiscount: promotionFields.maxDiscount,
    minPurchase: promotionFields.minPurchase.default(0),
    startsAt: promotionFields.startsAt.optional(),
    endsAt: promotionFields.endsAt,
    // Una regla que se está escribiendo todavía no está publicada; darla por
    // activa es lo único que deja ver el descuento antes de guardarla.
    active: promotionFields.active.default(true),
    usageLimit: promotionFields.usageLimit,
    usageCount: z.number().int().min(0).default(0),
  }),
  subtotal: z.number().int('El subtotal va en pesos enteros.').min(0),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        categoryId: z.string().trim().min(1).default(''),
        brandId: z.string().trim().min(1).default(''),
        price: z.number().int().min(0),
        quantity: z.number().int().min(1),
      }),
    )
    .default([]),
});

const trackSchema = z
  .object({
    event: z.enum(['view', 'click', 'dismiss'], {
      errorMap: () => ({ message: 'El evento tiene que ser view, click o dismiss.' }),
    }),
  })
  // Estricto a propósito: este endpoint es público y es un contador, no una
  // puerta para escribir en la promoción. Cualquier campo de más es un 400.
  .strict('Este endpoint solo acepta el campo event.');

const idParams = z.object({ id: z.string().trim().min(1) });

// ---------------------------------------------------------------------------
// Validación cruzada
// ---------------------------------------------------------------------------

interface RuleShape {
  readonly type: PromotionType;
  readonly scope: PromotionScope;
  readonly targetIds: readonly string[];
  readonly value: number;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly showPopup: boolean;
  readonly popupTitle: string | null;
}

/** Las que arruinan una campaña, que son las que el contrato exige revisar. */
function ruleProblem(r: RuleShape): string | null {
  if (r.type === PromotionType.PERCENTAGE && (r.value < 1 || r.value > 100)) {
    return 'Un descuento porcentual tiene que estar entre 1 y 100.';
  }
  if (r.type === PromotionType.FIXED_AMOUNT && r.value < 1) {
    return 'Un descuento de monto fijo tiene que ser de al menos $1.';
  }
  if (r.endsAt !== null && r.endsAt.getTime() <= r.startsAt.getTime()) {
    return 'La fecha de fin tiene que ser posterior a la de inicio.';
  }
  if (r.scope !== PromotionScope.ALL && r.targetIds.length === 0) {
    return 'Con un alcance distinto de ALL hay que indicar al menos un destino en targetIds.';
  }
  if (r.showPopup && !r.popupTitle) {
    return 'Una promoción que se anuncia necesita popupTitle: un anuncio sin titular no es un anuncio.';
  }
  return null;
}

/**
 * Ids de `targetIds` que no existen.
 *
 * Se comprueba contra la base y no solo que el arreglo traiga algo: una
 * categoría mal pegada deja la promoción publicada y sin descontar nunca, y
 * eso no se nota hasta que alguien reclama.
 */
async function missingTargets(scope: PromotionScope, targetIds: readonly string[]): Promise<string[]> {
  if (scope === PromotionScope.ALL || targetIds.length === 0) return [];
  const ids = [...new Set(targetIds)];

  const found =
    scope === PromotionScope.CATEGORY
      ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true } })
      : scope === PromotionScope.BRAND
        ? await prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true } })
        : await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });

  const existing = new Set(found.map((f) => f.id));
  return ids.filter((id) => !existing.has(id));
}

const targetLabel: Readonly<Record<PromotionScope, string>> = {
  [PromotionScope.ALL]: '',
  [PromotionScope.CATEGORY]: 'categorías',
  [PromotionScope.BRAND]: 'marcas',
  [PromotionScope.PRODUCT]: 'productos',
};

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

interface PromotionStats {
  orders: number;
  revenue: number;
  discountGiven: number;
}

const EMPTY_STATS: PromotionStats = { orders: 0, revenue: 0, discountGiven: 0 };

const serializePromotion = (p: Promotion, stats: PromotionStats = EMPTY_STATS, now = new Date()) => ({
  id: p.id,
  name: p.name,
  code: p.code,
  type: p.type,
  scope: p.scope,
  targetIds: p.targetIds,
  value: p.value,
  maxDiscount: p.maxDiscount,
  minPurchase: p.minPurchase,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  active: p.active,
  priority: p.priority,
  usageLimit: p.usageLimit,
  usageCount: p.usageCount,
  showPopup: p.showPopup,
  popupTitle: p.popupTitle,
  popupSubtitle: p.popupSubtitle,
  popupBadge: p.popupBadge,
  popupImage: p.popupImage,
  popupCtaLabel: p.popupCtaLabel,
  popupCtaUrl: p.popupCtaUrl,
  popupFrequency: p.popupFrequency,
  popupDelayMs: p.popupDelayMs,
  popupViews: p.popupViews,
  popupClicks: p.popupClicks,
  popupDismissed: p.popupDismissed,
  state: promotionState(p, now),
  orders: stats.orders,
  revenue: stats.revenue,
  discountGiven: stats.discountGiven,
  // Sin vistas no hay CTR que calcular; se manda 0 y no null para que el
  // panel pueda ordenar la columna sin casos especiales.
  ctr: p.popupViews > 0 ? Math.round((p.popupClicks / p.popupViews) * 1000) / 10 : 0,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const POPUP_SWITCH = 'promotions.popupEnabled';

/** El interruptor general. Si no hay fila sembrada manda el valor por defecto. */
async function popupEnabled(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: POPUP_SWITCH } });
  if (!row) return findSetting(POPUP_SWITCH)?.value === true;
  return row.value === true;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function promotionRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Públicas
  // -------------------------------------------------------------------------

  app.get('/api/promotions/popup', async () => {
    if (!(await popupEnabled())) return { promotion: null };

    const now = new Date();
    const candidates = await prisma.promotion.findMany({
      where: {
        active: true,
        showPopup: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    // El límite de usos se filtra aquí y no en el `where` porque comparar dos
    // columnas entre sí complica la consulta para ahorrar nada: son pocas
    // filas y la regla ya vive en el motor.
    const promotion = candidates.find((p) => isLive(p, now) && p.popupTitle);
    if (!promotion) return { promotion: null };

    // Solo los campos del contrato. Nada de value, maxDiscount ni targetIds:
    // es un endpoint abierto y la mecánica del descuento no tiene por qué
    // viajar al navegador de cualquiera.
    return {
      promotion: {
        id: promotion.id,
        title: promotion.popupTitle,
        subtitle: promotion.popupSubtitle,
        badge: promotion.popupBadge,
        image: promotion.popupImage,
        ctaLabel: promotion.popupCtaLabel,
        ctaUrl: promotion.popupCtaUrl,
        code: promotion.code,
        frequency: promotion.popupFrequency,
        delayMs: promotion.popupDelayMs,
        endsAt: promotion.endsAt,
      },
    };
  });

  app.post('/api/promotions/:id/track', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: zodMessage(params.error) });

    const body = trackSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: zodMessage(body.error) });

    const column =
      body.data.event === 'view'
        ? 'popupViews'
        : body.data.event === 'click'
          ? 'popupClicks'
          : 'popupDismissed';

    // `increment` y no leer-sumar-escribir: dos visitas simultáneas leerían
    // el mismo número y una de las dos se perdería. Postgres suma solo.
    const updated = await prisma.promotion.updateMany({
      where: { id: params.data.id },
      data: { [column]: { increment: 1 } },
    });
    if (updated.count === 0) {
      return reply.code(404).send({ error: 'Esa promoción no existe.', code: 'NOT_FOUND' });
    }

    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------------

  app.get('/api/admin/promotions', { preHandler: requireAuth }, async (request, reply) => {
    const query = z
      .object({
        status: z.enum(['all', 'active', 'scheduled', 'expired', 'inactive']).default('all'),
      })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: zodMessage(query.error) });

    const now = new Date();
    const promotions = await prisma.promotion.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const grouped = await prisma.order.groupBy({
      by: ['promotionId'],
      where: { promotionId: { not: null }, ...soldWhere },
      _count: { _all: true },
      _sum: { total: true, discount: true },
    });
    const stats = new Map<string, PromotionStats>(
      grouped.map((g) => [
        g.promotionId ?? '',
        {
          orders: g._count._all,
          revenue: g._sum.total ?? 0,
          discountGiven: g._sum.discount ?? 0,
        },
      ]),
    );

    const items = promotions.map((p) => serializePromotion(p, stats.get(p.id) ?? EMPTY_STATS, now));
    // `exhausted` no es un filtro del contrato: una promoción agotada solo
    // sale en `all`, que es donde la dueña la busca para subirle el límite.
    return query.data.status === 'all'
      ? items
      : items.filter((p) => p.state === query.data.status);
  });

  app.post('/api/admin/promotions', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

    const d = parsed.data;
    const startsAt = d.startsAt ?? new Date();
    const endsAt = d.endsAt ?? null;
    const popupTitle = d.popupTitle ?? null;

    const problem = ruleProblem({
      type: d.type,
      scope: d.scope,
      targetIds: d.targetIds,
      value: d.value,
      startsAt,
      endsAt,
      showPopup: d.showPopup,
      popupTitle,
    });
    if (problem) return reply.code(400).send({ error: problem });

    const missing = await missingTargets(d.scope, d.targetIds);
    if (missing.length > 0) {
      return reply.code(400).send({
        error: `Estas ${targetLabel[d.scope]} no existen: ${missing.join(', ')}.`,
      });
    }

    const promotion = await prisma.promotion.create({
      data: {
        name: d.name,
        code: d.code ?? null,
        type: d.type,
        scope: d.scope,
        targetIds: d.targetIds,
        value: d.value,
        maxDiscount: d.maxDiscount ?? null,
        minPurchase: d.minPurchase,
        startsAt,
        endsAt,
        active: d.active,
        priority: d.priority,
        usageLimit: d.usageLimit ?? null,
        showPopup: d.showPopup,
        popupTitle,
        popupSubtitle: d.popupSubtitle ?? null,
        popupBadge: d.popupBadge ?? null,
        popupImage: d.popupImage ?? null,
        popupCtaLabel: d.popupCtaLabel ?? null,
        popupCtaUrl: d.popupCtaUrl ?? null,
        popupFrequency: d.popupFrequency,
        popupDelayMs: d.popupDelayMs,
      },
    });

    return reply.code(201).send(serializePromotion(promotion));
  });

  app.patch('/api/admin/promotions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: zodMessage(params.error) });

    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

    const current = await prisma.promotion.findUnique({ where: { id: params.data.id } });
    if (!current) {
      return reply.code(404).send({ error: 'Esa promoción no existe.', code: 'NOT_FOUND' });
    }

    const d = parsed.data;
    // Se valida la promoción COMO QUEDARÍA, no el parche: cambiar solo el
    // `type` a PERCENTAGE con un `value` de 25000 guardado tiene que fallar.
    const merged = {
      type: d.type ?? current.type,
      scope: d.scope ?? current.scope,
      targetIds: d.targetIds ?? current.targetIds,
      value: d.value ?? current.value,
      startsAt: d.startsAt ?? current.startsAt,
      endsAt: d.endsAt === undefined ? current.endsAt : d.endsAt,
      showPopup: d.showPopup ?? current.showPopup,
      popupTitle: d.popupTitle === undefined ? current.popupTitle : d.popupTitle,
    } satisfies RuleShape;

    const problem = ruleProblem(merged);
    if (problem) return reply.code(400).send({ error: problem });

    const missing = await missingTargets(merged.scope, merged.targetIds);
    if (missing.length > 0) {
      return reply.code(400).send({
        error: `Estas ${targetLabel[merged.scope]} no existen: ${missing.join(', ')}.`,
      });
    }

    const promotion = await prisma.promotion.update({
      where: { id: current.id },
      data: {
        ...(d.name === undefined ? {} : { name: d.name }),
        ...(d.code === undefined ? {} : { code: d.code }),
        ...(d.type === undefined ? {} : { type: d.type }),
        ...(d.scope === undefined ? {} : { scope: d.scope }),
        ...(d.targetIds === undefined ? {} : { targetIds: d.targetIds }),
        ...(d.value === undefined ? {} : { value: d.value }),
        ...(d.maxDiscount === undefined ? {} : { maxDiscount: d.maxDiscount }),
        ...(d.minPurchase === undefined ? {} : { minPurchase: d.minPurchase }),
        ...(d.startsAt === undefined ? {} : { startsAt: d.startsAt }),
        ...(d.endsAt === undefined ? {} : { endsAt: d.endsAt }),
        ...(d.active === undefined ? {} : { active: d.active }),
        ...(d.priority === undefined ? {} : { priority: d.priority }),
        ...(d.usageLimit === undefined ? {} : { usageLimit: d.usageLimit }),
        ...(d.showPopup === undefined ? {} : { showPopup: d.showPopup }),
        ...(d.popupTitle === undefined ? {} : { popupTitle: d.popupTitle }),
        ...(d.popupSubtitle === undefined ? {} : { popupSubtitle: d.popupSubtitle }),
        ...(d.popupBadge === undefined ? {} : { popupBadge: d.popupBadge }),
        ...(d.popupImage === undefined ? {} : { popupImage: d.popupImage }),
        ...(d.popupCtaLabel === undefined ? {} : { popupCtaLabel: d.popupCtaLabel }),
        ...(d.popupCtaUrl === undefined ? {} : { popupCtaUrl: d.popupCtaUrl }),
        ...(d.popupFrequency === undefined ? {} : { popupFrequency: d.popupFrequency }),
        ...(d.popupDelayMs === undefined ? {} : { popupDelayMs: d.popupDelayMs }),
      },
    });

    return serializePromotion(promotion);
  });

  app.delete('/api/admin/promotions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: zodMessage(params.error) });

    const query = z.object({ hard: z.string().optional() }).safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: zodMessage(query.error) });

    const current = await prisma.promotion.findUnique({ where: { id: params.data.id } });
    if (!current) {
      return reply.code(404).send({ error: 'Esa promoción no existe.', code: 'NOT_FOUND' });
    }

    if (query.data.hard === 'true') {
      const orders = await prisma.order.count({ where: { promotionId: current.id } });
      // Borrarla dejaría pedidos históricos sin poder decir qué campaña los
      // trajo, que es justo lo que sirve para saber si la promoción valió.
      if (orders > 0) {
        return reply.code(409).send({
          error: `No se puede borrar: ${orders} pedido(s) la tienen aplicada. Desactívala en su lugar.`,
        });
      }
      await prisma.promotion.delete({ where: { id: current.id } });
      return { id: current.id, deleted: true };
    }

    const promotion = await prisma.promotion.update({
      where: { id: current.id },
      data: { active: false },
    });
    return serializePromotion(promotion);
  });

  app.post('/api/admin/promotions/preview', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = previewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

    const p = parsed.data.promotion;
    // Las reglas a medio escribir no se rechazan con 400: el motor devuelve
    // el porqué en `reason`, que es lo que el panel quiere mostrar mientras
    // la dueña todavía está llenando el formulario.
    const rule: PromotionRule = {
      type: p.type,
      scope: p.scope,
      targetIds: p.targetIds,
      value: p.value,
      maxDiscount: p.maxDiscount ?? null,
      minPurchase: p.minPurchase,
      startsAt: p.startsAt ?? new Date(),
      endsAt: p.endsAt ?? null,
      active: p.active,
      usageLimit: p.usageLimit ?? null,
      usageCount: p.usageCount,
    };

    return computeDiscount(rule, { subtotal: parsed.data.subtotal, items: parsed.data.items });
  });
}
