# ☕ ماژول کافه رستوران

مدیریت کامل کافه، رستوران، فست‌فود و قهوه‌خانه.

## مدل‌های دیتابیس

| مدل | شرح |
|-----|------|
| `RestaurantArea` | سالن (طبقه، فضای باز، سیگاری) |
| `RestaurantTable` | میز — شماره، ظرفیت، وضعیت، QR |
| `MenuCategory` | دسته‌بندی منو (چندزبانه) |
| `MenuItem` | آیتم منو — قیمت، بهای تمام‌شده، ایستگاه، زمان آماده‌سازی |
| `MenuRecipe` | رسپی: مواد اولیه هر آیتم + درصد ضایعات |
| `RestaurantOrder` | سفارش سالن / بیرون‌بر / دلیوری |
| `RestaurantOrderItem` | قلم سفارش با وضعیت مستقل (KDS) |
| `TableReservation` | رزرو میز با کنترل تداخل |
| `RestaurantShift` | شیفت — صندوق ابتدا/انتها، فروش، انعام |

## جریان کار

```
ثبت سفارش  →  ارسال به آشپزخانه  →  آماده  →  سرو  →  تسویه
   OPEN          IN_KITCHEN         READY    SERVED   PAID
```

هنگام تسویه، اگر `warehouseId` ارسال شود مواد اولیه طبق رسپی
(با احتساب درصد ضایعات) از انبار کسر می‌شود.

## نقاط پایانی (API)

| متد | مسیر | شرح |
|-----|------|------|
| GET | `/restaurant/stats` | آمار امروز |
| GET | `/restaurant/reports/top-items` | پرفروش‌ترین آیتم‌ها |
| GET | `/restaurant/tables` | نقشه سالن |
| GET | `/restaurant/menu` | منوی گروه‌بندی‌شده |
| POST | `/restaurant/menu-items` | افزودن آیتم منو |
| PATCH | `/restaurant/menu-items/:id/toggle` | موجود / تمام‌شده |
| POST | `/restaurant/menu-items/:id/recipe` | ثبت رسپی |
| POST | `/restaurant/orders` | ثبت سفارش |
| POST | `/restaurant/orders/:id/items` | افزودن قلم |
| POST | `/restaurant/orders/:id/send-to-kitchen` | ارسال به آشپزخانه |
| POST | `/restaurant/orders/:id/settle` | تسویه |
| GET | `/restaurant/orders/:id/receipt` | رسید چاپی HTML |
| GET | `/restaurant/kitchen` | صفحه آشپزخانه (KDS) |
| PATCH | `/restaurant/kitchen/items/:itemId` | تغییر وضعیت قلم |
| GET/POST | `/restaurant/reservations` | رزرو میز |
| POST | `/restaurant/shifts/open` \| `/:id/close` | شیفت |

## نمونه ثبت سفارش

```json
POST /restaurant/orders
{
  "type": "DINE_IN",
  "tableId": "clx...",
  "guestCount": 3,
  "servicePercent": 10,
  "taxPercent": 9,
  "items": [
    { "menuItemId": "clx...", "qty": 2, "note": "بدون پیاز" },
    { "menuItemId": "clx...", "qty": 1 }
  ]
}
```

## رویدادهای n8n

- `restaurant.order_created`
- `restaurant.sent_to_kitchen`
- `restaurant.order_settled`

## ایستگاه‌های آشپزخانه

`KITCHEN` • `GRILL` • `COLD` • `BAR` • `COFFEE` • `DESSERT`

هر آیتم منو به یک ایستگاه متصل است و در KDS همان ایستگاه نمایش داده می‌شود.
