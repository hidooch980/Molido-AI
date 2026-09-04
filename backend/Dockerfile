FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# `npm ci` نه `npm install`.
#
# بدون فایل قفل، هر بیلد نسخه‌های تازه‌تری از وابستگی‌ها می‌آورد — یعنی
# ایمیجی که امروز سالم است، ماه دیگر با همان کد ممکن است نباشد، و علتش
# هیچ‌جای مخزن ثبت نشده.  `ci` دقیقاً همان چیزی را نصب می‌کند که در
# package-lock.json نوشته شده و اگر نخواند، شکست می‌خورد.
RUN npm ci

COPY . .

RUN npm run build

# وابستگی‌های توسعه (nest-cli، typescript، jest) در زمان اجرا لازم نیستند.
# نگه داشتنشان هم ایمیج را بزرگ می‌کند و هم سطح حملهٔ بی‌دلیل می‌سازد.
#
# `prune` به‌جای نصب دوباره در مرحلهٔ اجرا: bcrypt ماژول بومی است و
# کامپایل دوباره‌اش به python و g++ نیاز دارد که در ایمیج نهایی نیستند.
RUN npm prune --omit=dev

# ---------- Runtime ----------
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/sql ./sql
COPY package*.json ./

# ⚠️ `scripts/` لازم است، وگرنه `npm run seed` در تولید فایل را پیدا
#    نمی‌کند.  خودِ `seed` از `dist` اجرا می‌شود، ولی راه‌اندازش اینجاست.
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p uploads

EXPOSE 3000

# مهاجرت دیتابیس در سرویس جداگانهٔ compose اجرا می‌شود تا اگر روزی چند نمونهٔ
# بک‌اند بالا بیاید، هم‌زمان روی یک schema کار نکنند.
CMD ["node", "dist/main"]
