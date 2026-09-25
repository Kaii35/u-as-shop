import type { FastifyInstance } from 'fastify';
import { UserRole, type Prisma } from '@prisma/client';
import { z, type ZodError } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, requireAdmin, requireAuth } from '../auth.js';
import { SETTING_DEFAULTS, findSetting } from '../settings-defaults.js';

/** Primer problema que encontró zod, con el campo que lo causó. */
const zodMessage = (error: ZodError): string => {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
};

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const TYPE_NAME = { number: 'un número', text: 'un texto', boolean: 'un sí/no' } as const;

/** Si el valor que llega encaja con el tipo declarado en SETTING_DEFAULTS. */
function typeMatches(type: 'number' | 'text' | 'boolean', value: unknown): boolean {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'text') return typeof value === 'string';
  return typeof value === 'boolean';
}

/**
 * La lista completa, con el valor guardado cuando lo hay.
 *
 * Se parte de SETTING_DEFAULTS y no de la tabla para que un ajuste nuevo del
 * código aparezca en el panel aunque nadie haya sembrado su fila todavía: de
 * lo contrario habría que recordar correr el seed en cada despliegue.
 */
async function listSettings() {
  const rows = await prisma.setting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));

  return SETTING_DEFAULTS.map((def) => ({
    key: def.key,
    value: stored.has(def.key) ? stored.get(def.key) : def.value,
    label: def.label,
    group: def.group,
    // `type` y `help` no los pide el contrato, pero sin ellos el panel no
    // sabe si pintar una casilla o una caja de número. Son campos de más, no
    // campos distintos: nada de lo que el contrato promete cambia.
    type: def.type,
    ...(def.help === undefined ? {} : { help: def.help }),
  }));
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/** Nunca `passwordHash`: no sale de la base ni por error de copiar y pegar. */
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const createUserSchema = z.object({
  email: z.string({ required_error: 'Falta el correo.' }).trim().toLowerCase().email('El correo no es válido.'),
  name: z.string({ required_error: 'Falta el nombre.' }).trim().min(2, 'El nombre es obligatorio.').max(120),
  password: z
    .string({ required_error: 'Falta la contraseña.' })
    .min(8, 'La contraseña necesita al menos 8 caracteres.')
    .max(200),
  role: z.nativeEnum(UserRole).default(UserRole.STAFF),
});

const patchUserSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio.').max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres.').max(200).optional(),
});

const idParams = z.object({ id: z.string().trim().min(1) });

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function settingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/settings', { preHandler: requireAuth }, async () => listSettings());

  app.put('/api/admin/settings', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z
      .record(z.unknown())
      .refine((v) => Object.keys(v).length > 0, 'No mandaste ningún ajuste que cambiar.')
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

    const entries = Object.entries(parsed.data);

    // Se revisa todo antes de escribir nada: guardar la mitad de los ajustes
    // y fallar en el resto deja la tienda en un estado que nadie pidió.
    for (const [key, value] of entries) {
      const def = findSetting(key);
      if (!def) {
        return reply.code(400).send({
          error: `El ajuste «${key}» no existe. Revisa el nombre: solo se aceptan los que ya están definidos.`,
        });
      }
      if (!typeMatches(def.type, value)) {
        return reply
          .code(400)
          .send({ error: `El ajuste «${def.label}» espera ${TYPE_NAME[def.type]}.` });
      }
    }

    await prisma.$transaction(
      entries.map(([key, value]) => {
        const def = findSetting(key);
        return prisma.setting.upsert({
          where: { key },
          // `label` y `group` se toman siempre del código: la tabla guarda el
          // valor, no cómo se llama el ajuste.
          update: { value: value as Prisma.InputJsonValue, label: def?.label, group: def?.group },
          create: {
            key,
            value: value as Prisma.InputJsonValue,
            label: def?.label ?? key,
            group: def?.group ?? 'general',
          },
        });
      }),
    );

    return listSettings();
  });

  // ---- Usuarios: requireAuth primero, requireAdmin después. Al revés
  // leería un request.admin que nadie llenó y dejaría pasar a cualquiera. ----

  app.get(
    '/api/admin/users',
    { preHandler: [requireAuth, requireAdmin] },
    async () =>
      prisma.user.findMany({ select: userSelect, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
  );

  app.post(
    '/api/admin/users',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

      const { email, name, password, role } = parsed.data;
      const user = await prisma.user.create({
        data: { email, name, role, passwordHash: await hashPassword(password) },
        select: userSelect,
      });

      return reply.code(201).send(user);
    },
  );

  app.patch(
    '/api/admin/users/:id',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: zodMessage(params.error) });

      const parsed = patchUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

      const session = request.admin;
      if (!session) return reply.code(401).send({ error: 'Falta el token de sesión.' });

      const d = parsed.data;

      // Quitarse el rol o desactivarse es la forma más rápida de quedarse
      // fuera del panel sin nadie dentro que pueda volver a abrir la puerta.
      if (session.sub === params.data.id) {
        if (d.role !== undefined && d.role !== UserRole.ADMIN) {
          return reply.code(400).send({ error: 'No puedes quitarte a ti mismo el rol de administrador.' });
        }
        if (d.active === false) {
          return reply.code(400).send({ error: 'No puedes desactivar tu propia cuenta.' });
        }
      }

      const current = await prisma.user.findUnique({ where: { id: params.data.id } });
      if (!current) {
        return reply.code(404).send({ error: 'Ese usuario no existe.', code: 'NOT_FOUND' });
      }

      const user = await prisma.user.update({
        where: { id: current.id },
        data: {
          ...(d.name === undefined ? {} : { name: d.name }),
          ...(d.role === undefined ? {} : { role: d.role }),
          ...(d.active === undefined ? {} : { active: d.active }),
          ...(d.password === undefined ? {} : { passwordHash: await hashPassword(d.password) }),
        },
        select: userSelect,
      });

      return user;
    },
  );
}
