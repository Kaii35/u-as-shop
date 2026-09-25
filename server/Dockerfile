# Imagen de la API. Solo se usa con el perfil `full` del docker-compose:
#
#   docker compose --profile full up -d --build
#
# En el día a día la API se corre con `npm run api`, que recarga al guardar.

FROM node:22-alpine AS build
WORKDIR /app

# Las dependencias se copian antes que el código para que Docker reutilice la
# capa instalada mientras el package.json no cambie. Copiar todo de golpe
# obligaría a reinstalar en cada edición de un archivo .ts.
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# El cliente generado va aparte: `npm ci` lo borra al recrear node_modules,
# así que se copia después de instalar y no antes.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

EXPOSE 4100

# Aplica las migraciones pendientes antes de escuchar. El contenedor puede
# arrancar contra una base recién creada y sin esto respondería 500 en todo.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
