FROM mcr.microsoft.com/playwright:v1.65.1-noble AS builder

WORKDIR /app
RUN npm install -g pnpm@10.12.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile
COPY backend backend
COPY frontend frontend
RUN pnpm nx run backend:build
ARG NEXT_PUBLIC_API_BASE_URL=https://api.badges.ashen-hermit.space
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN pnpm nx run frontend:build

FROM mcr.microsoft.com/playwright:v1.65.1-noble AS backend-prod

WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/node_modules /app/backend/node_modules
COPY --from=builder /app/backend/dist /app/backend/dist
COPY --from=builder /app/backend/assets /app/backend/assets
COPY --from=builder /app/backend/package.json /app/backend/package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:20-alpine AS frontend-prod
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "frontend/server.js"]

FROM caddy:2-alpine AS caddy-prod

COPY Caddyfile.template /etc/caddy/Caddyfile.template
COPY caddy-entrypoint.sh /usr/local/bin/caddy-entrypoint.sh
ENTRYPOINT ["sh", "/usr/local/bin/caddy-entrypoint.sh"]
EXPOSE 80
