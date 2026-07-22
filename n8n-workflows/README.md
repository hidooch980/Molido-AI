# n8n Workflows — Molido AI

فایل‌های این پوشه ورکفلو‌های آماده برای import در n8n هستند.

## آدرس‌ها (پس از `docker compose up`)

| سرویس | آدرس |
|---------|------|
| بک‌اند Molido | http://localhost:3000 |
| Swagger API Docs | http://localhost:3000/api-docs |
| داشبورد وب | http://localhost:3001 |
| پانل n8n | http://localhost:5678 |
| PostgreSQL | localhost:5432 |

## ورود n8n
- آدرس: http://localhost:5678
- نام کاربری: `admin`
- رمز: `admin123`

## رویدادهای ارسالی از Molido به n8n

وب‌هوک بک‌اند: `http://n8n:5678/webhook/molido`

رویدادههای پشتیبانی‌شده:

| event | توضیح |
|-------|---------|
| `sale.created` | ثبت فاکتور فروش |
| `sale.cancelled` | لغو فاکتور |
| `purchase.created` | ثبت خرید |
| `payment.created` | دریافت پرداخت |
| `expense.created` | ثبت هزینه |
| `inventory.low_stock` | موجودی رو به اتمام |
| `complaint.created` | پیام جدید سامانه 137 |
| `complaint.resolved` | رفع پیام |
| `cheque.bounced` | برگشت چک |
| `installment.overdue` | قسط معوق |
| `municipal_bill.created` | صدور فیش عوارض |
| `fire.incident_created` | حادثه آتش‌سوزی |
| `pos.status_changed` | تغییر وضعیت کارت‌خوان |
| `user.registered` | ثبت کاربر جدید |

ساختار payload:
```json
{
  "event": "sale.created",
  "timestamp": "2026-07-21T10:00:00.000Z",
  "companyId": "clxxxxxx",
  "data": { ... }
}
```
هدر امنیتی: `x-molido-secret: molido_n8n_secret`

## دریافت درخواست از n8n به Molido

نقطه پایانی: `POST http://backend:3000/n8n/incoming`
هدر: `x-molido-secret: molido_n8n_secret`
هلت‌چک: `GET http://backend:3000/n8n/health`

## import ورکفلوها

1. وارد http://localhost:5678 شوید
2. منوی **Workflows** → **Import from file**
3. فایل‌های `.json` این پوشه را انتخاب کنید
4. متغیر `MOLIDO_API_URL` = `http://backend:3000` را بررسی کنید
