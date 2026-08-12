FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# ---------- Runtime ----------
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/sql ./sql
COPY package*.json ./

RUN mkdir -p uploads

EXPOSE 3000

# مهاجرت دیتابیس در سرویس جداگانهٔ compose اجرا می‌شود تا اگر روزی چند نمونهٔ
# بک‌اند بالا بیاید، هم‌زمان روی یک schema کار نکنند.
CMD ["node", "dist/main"]
