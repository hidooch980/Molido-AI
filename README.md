<div align="center">

# MOLIDO AI

**FROM ZERO. FOR THE FUTURE.**

*NO TOKEN BEFORE REAL VALUE.*

![Node](https://img.shields.io/badge/Node-22-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

MOLIDO AI is an AI-first platform built in the honest order: real products, real
users, real revenue. It runs entirely on open-source software, on your own
machine, with no paid service and no credit card.

There is no token, no coin, no wallet and no chain in this codebase — not
stubbed, not reserved, not disabled-but-present. See
[`docs/product/mvp.md`](./docs/product/mvp.md) for the full scope statement.

## Quick start

```bash
pnpm install
pnpm infra:up                          # PostgreSQL 16 + Redis 7 (Docker)

cp .env.example .env
# Set JWT_ACCESS_SECRET — it has no default, and the API will not start without it:
#   openssl rand -hex 32

pnpm build                             # workspace packages, then the apps
pnpm db:deploy                         # apply migrations
pnpm db:seed                           # roles, permissions, agent registry

pnpm dev                               # API :4000 · web :3000
```

Verify:

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","service":"molido-api"}
```

Open <http://localhost:3000> for the status board.

### Creating the Founder account

The seed creates **no users**. There are no demo accounts and no sample data,
because zero is the true starting number. Create the Founder deliberately, from
real credentials:

```bash
FOUNDER_EMAIL=you@example.com FOUNDER_PASSWORD='a long passphrase' pnpm db:seed
```

An existing password is never overwritten by a re-run.

### Enabling AI at zero cost

No AI provider is configured by default, and the platform says so plainly rather
than pretending. To enable one for free, install [Ollama](https://ollama.com),
pull a model, and set:

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.1
AI_BASE_URL=http://127.0.0.1:11434
```

A hosted provider can be swapped in later by changing `AI_PROVIDER` — no
application code changes, because nothing above `@molido/ai-core` knows which
vendor is in use.

## Layout

```
apps/
  web/            Next.js — public status board and goal input
  api/            NestJS on Fastify — /api/v1
packages/
  types/          Shared vocabulary. No runtime dependencies.
  security/       Password hashing, opaque tokens, redaction
  config/         Zod-validated environment → typed AppConfig
  logger/         Structured logging, redaction built in
  database/       Prisma schema, client, migrations, seed
  ai-core/        AIProvider interface and its adapters
workers/          AI task worker (not yet built)
infrastructure/   Docker compose for local data stores
docs/             Architecture, security, API, product
```

> The `backend/`, `web/`, `legacy/` and `n8n-workflows/` directories at the
> repository root belong to an earlier Molido product. They are outside this
> workspace and untouched by the MVP build.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run API and web together |
| `pnpm build` | Build packages, then apps, in dependency order |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | TypeScript, strict, no emit |
| `pnpm test` | Every suite |
| `pnpm infra:up` / `infra:down` | Start / stop PostgreSQL and Redis |
| `pnpm infra:reset` | Stop and destroy the volumes |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Database |

Data stores bind to `127.0.0.1` on ports **5433** and **6380**, offset so this
stack coexists with the legacy services in the root `docker-compose.yml`.

## Security posture

Implemented: scrypt password hashing, opaque refresh tokens hashed at rest with
rotation and family-wide reuse detection, permission-based authorisation
enforced server-side, structured audit and security events, two-tier rate
limiting, redacting logger, helmet, an explicit CORS allow-list, and validation
that rejects unknown properties rather than ignoring them.

Not claimed: that any of this makes the system unhackable. No software honestly
is. Known gaps — no email verification, no MFA, no breached-password check, no
external audit — are listed in
[`docs/security/security-model.md`](./docs/security/security-model.md), and the
threats they leave open are in
[`docs/security/threat-model.md`](./docs/security/threat-model.md).

## Documentation

[`docs/`](./docs/README.md) — architecture, security model, threat model, API
reference, and the MVP scope statement.

## Roadmap

```
Real product → Real users → Real revenue → Network → Testnet
    → Security audit → Mainnet → Native coin
```

Each arrow is a gate, not a schedule. The MVP is the first box.

---

<div align="center">

**MOLIDO AI** · FROM ZERO. FOR THE FUTURE.

</div>

---

# Legacy: Molido AI (business management suite)

> The documentation below describes the earlier Molido product that lives in
> `backend/`, `web/` and `legacy/`. It is retained unchanged and is unrelated to
> the MVP monorepo documented above.

<div align="center">

# 🧠 Molido AI

**سامانه مدیریت هوشمند کسب‌وکار، فروشگاه و شهرداری**

چندزبانه (فارسی / English / العربية) • مجهز به هوش مصنوعی • اتوماسیون n8n

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## ✨ امکانات

| دسته | شرح |
|------|------|
| 🔐 احراز هویت | JWT + Refresh Token، ۹ نقش کاربری، Helmet، Rate-Limit |
| 🏪 فروشگاهی | کالا، دسته‌بندی، مشتری، تأمین‌کننده، انبار و موجودی |
| ☕ کافه رستوران | سالن و میز، منو و رسپی، سفارش سالن/بیرون‌بر/دلیوری، آشپزخانه (KDS)، رزرو میز، شیفت و انعام |
| 💰 مالی | فروش اقساطی، خرید، پرداخت، هزینه، صندوق، حسابداری، چک |
| 🏦 کارت‌خوان | POS ثابت و سیار — ۲۸ بانک + ۱۲ شرکت PSP |
| 🏛️ خزانه‌داری | حساب‌های بانکی/نقدی/تنخواه، واریز و برداشت، انتقال بین حساب‌ها |
| 📝 قراردادها | ثبت قرارداد (خرید/فروش/خدمات/عمرانی/اجاره)، اقساط، هشدار انقضا |
| 👥 حقوق و دستمزد | پرونده کارمندان، فیش حقوقی، اضافه‌کاری، بیمه و مالیات |
| 🏗️ دفتر فنی | پروانه ساختمانی، بازرسی، تخلفات |
| 🚒 آتش‌نشانی | ایستگاه، پرسنل، خودرو، حادثه، بازرسی ایمنی |
| 🏛️ شهرداری | سامانه ۱۳۷، عوارض و فیش‌ها |
| 📊 گزارش | داشبورد، خروجی CSV، فاکتور چاپی |
| 🤖 هوش مصنوعی | ۴ تحلیل + گزارش مدیریتی GPT (چندزبانه) |
| 🌐 چندزبانه | پیام‌های API و داشبورد به فارسی، انگلیسی و عربی |
| ⚡ اتوماسیون | ۱۴ رویداد به n8n + ورکفلوهای آماده Telegram/Email |
| 📨 پیامک | اتصال کاوه‌نگار |
| 📎 فایل | آپلود مدارک و پیوست‌ها |

**۸۹ مدل دیتابیس • ۵۸ ماژول بک‌اند • Swagger کامل**

---

## 🚀 راه‌اندازی سریع (Docker)

```bash
# 1. تنظیمات
cp .env.example .env
# مقادیر JWT_SECRET و رمزها را در .env تنظیم کنید (openssl rand -hex 32)

# 2. اجرا
docker compose up -d

# 3. داده اولیه (فقط بار اول)
docker compose exec backend npx prisma db seed
```

| سرویس | آدرس |
|--------|------|
| 🔧 بک‌اند API | http://localhost:3000 |
| 📖 Swagger | http://localhost:3000/api-docs |
| 🖥️ داشبورد وب | http://localhost:3001 |
| 🏛️ خزانه‌داری | حساب‌های بانکی/نقدی، واریز/برداشت، انتقال وجه |
| 📝 قراردادها | انواع قرارداد، اقساط، چرخه وضعیت |
| 👥 حقوق و دستمزد | پرونده کارمند، فیش حقوقی، بیمه و مالیات |
| 💰 بودجه‌ریزی | بودجه سالانه واحدها، کنترل سقف هزینه |
| 🏗️ اموال ثابت | پلاک‌گذاری اموال، استهلاک، انبارگردانی |
| 📋 مناقصه/مزایده | ثبت مناقصات، پاکت‌های پیشنهادی، اعلام برنده |
| ⏰ حضور و غیاب | ورود/خروج، اضافه‌کاری، مرخصی با گردش‌کار تأیید |
| ⭐ ارزیابی عملکرد | دوره‌های ارزیابی، امتیاز، پیشنهاد پاداش |
| 🏙️ پروژه عمرانی | فازبندی، پیشرفت فیزیکی/ریالی، پیمانکار |
| 🚗 ناوگان و موتوری | سوخت، سرویس دوره‌ای، بیمه، معاینه فنی |
| 🌿 فضای سبز/پسماند | مناطق، برنامه زمان‌بندی، لاگ کار روزانه |
| 📬 دبیرخانه | نامه وارده/صادره، اندیکاتور، ارجاع، بایگانی |
| 💎 CRM/باشگاه مشتریان | امتیاز وفاداری، سطح‌بندی، کوپن تخفیف |
| 🛒 سفارش آنلاین | ثبت سفارش، پیش‌فاکتور، پیگیری وضعیت |
| ✅ گردش‌کار تأیید | زنجیره چندمرحله‌ای، اعلان، n8n |
| 🌐 شهر الکترونیک | درخواست خدمات شهروندی، کد رهگیری، اعلانات شهری |
| ⚰️ آرامستان | قطعه/قبر، متوفیان، مجوز دفن |
| 🚕 تاکسیرانی | پروانه تاکسی، رانندگان، تخلفات |
| 🏪 اصناف/پروانه کسب | صدور پروانه، بازرسی صنفی، عوارض کسب |
| 🏢 اموال شهرداری | اجاره‌نامه، سررسید، درآمد |
| 📐 ممیزی نوسازی | پرونده ممیزی، عوارض نوسازی سالانه |
| 🚨 مدیریت بحران | ستاد حوادث، تیم واکنش، اقدامات |
| 🅿️ پارکینگ | ظرفیت، تعرفه، ورود/خروج خودرو |
| 💡 روشنایی معابر | چراغ‌ها، گزارش خرابی، اطلاعات انرژی |
| 🏛️ جلسات شورا | دستور جلسه، مصوبات، پیگیری اجرا |
| 🎫 هلپ‌دسک | تیکت IT/تدارکات، SLA، ارجاع |
| 📚 آموزش کارکنان | دوره‌ها، ثبت‌نام، گواهینامه، ساعت آموزشی |
| 📁 مدیریت اسناد | پوشه درختی، نسخه‌بندی، تگ‌بندی |
| 📅 نوبت‌دهی | نوبت آنلاین برای واحدهای مختلف |
| 📊 نظرسنجی | سؤالات، پاسخ‌ها، تحلیل مشارکت شهروندی |
| ☕ کافه رستوران | نقشه سالن، منوی چندزبانه، کسر خودکار مواد اولیه از انبار، صفحه آشپزخانه، رسید چاپی |
| 🤖 n8n | http://localhost:5678 |

**ورود آزمایشی:** `admin@molido.ai` / `admin123`

## 🛠️ راه‌اندازی دستی (بدون Docker)

<details>
<summary>مشاهده مراحل</summary>

**پیش‌نیاز:** Node.js 20+ و PostgreSQL 16

```bash
# بک‌اند
cd backend
cp .env.example .env   # DATABASE_URL و JWT_SECRET را تنظیم کنید
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev      # → http://localhost:3000

# داشبورد وب (ترمینال جدید)
cd web
npm install
npm run dev            # → http://localhost:3001
```

</details>

## 🌐 چندزبانه (i18n)

زبان هر درخواست API با یکی از این روش‌ها انتخاب می‌شود (اولویت به ترتیب):

```
GET /products?lang=en          ← پارامتر کوئری
x-lang: ar                     ← هدر اختصاصی
Accept-Language: en-US         ← هدر استاندارد
```

داشبورد وب هم سوئیچر زبان با تغییر خودکار RTL/LTR دارد.

## ⚡ اتوماسیون n8n

رویدادهای سیستم (فروش، چک برگشتی، شکایت ۱۳۷، موجودی کم و...) به صورت خودکار به n8n ارسال می‌شوند. ورکفلوهای آماده در پوشه [`n8n-workflows/`](n8n-workflows/) قرار دارند — کافی است در n8n آن‌ها را Import کنید.

## 📁 ساختار پروژه

```
├── backend/          # NestJS + Prisma — ۵۸ ماژول، ۸۹ مدل
│   ├── src/
│   ├── prisma/
│   └── API.md        # مستندات کامل API
├── web/              # داشبورد Next.js 15 — چندزبانه + طراحی مدرن
├── n8n-workflows/    # ورکفلوهای آماده اتوماسیون
├── legacy/           # مستندات و طرح‌های اولیه (مرجع تاریخی)
└── docker-compose.yml
```

## 🧪 تست و کیفیت کد

```bash
cd backend
npm test        # تست‌های Jest
npm run lint    # ESLint
npm run format  # Prettier
```

## 📄 لایسنس

[MIT](LICENSE) © 2026 Abdolnaser Mollazehi
