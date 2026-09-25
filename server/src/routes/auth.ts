import type { FastifyInstance } from 'fastify';
import { z, type ZodError } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, requireAuth, signToken, verifyPassword } from '../auth.js';

/** Primer problema que encontró zod, con el campo que lo causó. */
const zodMessage = (error: ZodError): string => {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
};

const loginSchema = z.object({
  email: z.string({ required_error: 'Falta el correo.' }).trim().toLowerCase().email('El correo no es válido.'),
  password: z.string({ required_error: 'Falta la contraseña.' }).min(1, 'Falta la contraseña.'),
});

/**
 * Mismo texto exista o no el correo.
 *
 * Dos mensajes distintos convierten el login en un buscador de clientes: con
 * una lista de correos cualquiera averigua cuáles tienen cuenta en el panel.
 */
const BAD_CREDENTIALS = 'Correo o contraseña incorrectos.';

/**
 * Hash señuelo para comparar cuando el correo no existe.
 *
 * Sin esto la respuesta vuelve al instante para un correo desconocido y tras
 * los ~80 ms de bcrypt para uno real, y esa diferencia sola ya delata cuáles
 * existen. Se calcula una vez y en diferido para no pagarlo al arrancar.
 */
let decoy: Promise<string> | null = null;
const decoyHash = (): Promise<string> => (decoy ??= hashPassword('contrasena-senuelo-aurelle'));

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: zodMessage(parsed.error) });

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      await verifyPassword(password, await decoyHash());
      return reply.code(401).send({ error: BAD_CREDENTIALS });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: BAD_CREDENTIALS });
    }
    // Se avisa solo después de acertar la contraseña: hasta ahí, quien
    // pregunta no aprende nada que no supiera ya.
    if (!user.active) {
      return reply
        .code(403)
        .send({ error: 'Tu cuenta está desactivada. Pídele a un administrador que la reactive.' });
    }

    // Sella la entrada para que el listado de usuarios pueda decir quién
    // sigue usando el panel y quién no vuelve desde hace meses.
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

  app.get('/api/admin/me', { preHandler: requireAuth }, async (request, reply) => {
    const session = request.admin;
    if (!session) return reply.code(401).send({ error: 'Falta el token de sesión.' });

    // Lo que trae el token, sin ir a la base: el panel solo necesita saber
    // quién es y qué puede, y eso ya viene firmado.
    return {
      user: { id: session.sub, email: session.email, name: session.name, role: session.role },
    };
  });
}
