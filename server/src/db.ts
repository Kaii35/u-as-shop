import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Cliente único de Prisma.
 *
 * El cache en `globalThis` es por `tsx watch`: cada recarga volvería a
 * instanciar el cliente y a abrir un pool nuevo, hasta agotar las conexiones
 * de Postgres y dejar la API muerta sin un error claro.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: env.isProduction ? ['error'] : ['warn', 'error'] });

if (!env.isProduction) globalForPrisma.prisma = prisma;
