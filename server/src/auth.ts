import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './env.js';

/**
 * Sesiones del panel.
 *
 * El token lleva `audience` aunque hoy solo exista un tipo de sesión. Es
 * barato ahora y evita el agujero clásico de mañana: en cuanto la tienda
 * emita tokens de cliente firmados con el mismo secreto, sin audiencia
 * cualquiera que se registre pasaría por `requireAuth` y entraría al panel.
 */
const AUDIENCE = 'aurelle:admin';

/** Lo que viaja dentro del token. Nunca la contraseña, obviamente. */
export interface AdminSession {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'ADMIN' | 'STAFF';
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminSession;
  }
}

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, 10);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const signToken = (session: AdminSession): string =>
  jwt.sign(session, env.jwtSecret, { expiresIn: '12h', audience: AUDIENCE });

function readToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * preHandler que exige sesión válida del panel.
 *
 * Esto sí es autenticación real: el token va firmado con el secreto del
 * servidor y no se puede fabricar desde la consola del navegador.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = readToken(request);
  if (!token) {
    await reply.code(401).send({ error: 'Falta el token de sesión.' });
    return;
  }

  try {
    request.admin = jwt.verify(token, env.jwtSecret, { audience: AUDIENCE }) as AdminSession;
  } catch {
    await reply.code(401).send({ error: 'Tu sesión expiró. Vuelve a entrar.' });
  }
}

/**
 * Exige rol ADMIN. Va DESPUÉS de `requireAuth` en el mismo array de
 * preHandler, nunca en su lugar: por sí solo leería un `request.admin` que
 * nadie ha rellenado y dejaría pasar a cualquiera.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.admin?.role !== 'ADMIN') {
    await reply.code(403).send({ error: 'Necesitas permisos de administrador.' });
  }
}
