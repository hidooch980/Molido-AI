# اتصال مرکز تلفن (SIP)

مریم می‌تواند از داخل سامانه به بنکدار زنگ بزند. برای این کار به یک
مرکز تلفن **استریسک** نیاز است — ایزابل و FreePBX هر دو استریسک‌اند و
همین راه برای هر دو کار می‌کند.

بدون مرکز، همه‌چیز کار می‌کند: اپراتور خودش شماره می‌گیرد، قیمت‌ها را
می‌شنود و در همان فرم ثبت می‌کند. دکمهٔ تماس فقط وقتی نشان داده می‌شود
که مرکز پیکربندی شده باشد.

## ۱) ARI را در استریسک روشن کنید

در `/etc/asterisk/ari.conf`:

```ini
[general]
enabled = yes
pretty = yes

[molido]
type = user
read_only = no
password = یک-رمز-قوی
```

و در `/etc/asterisk/http.conf`:

```ini
[general]
enabled = yes
bindaddr = 127.0.0.1   ; اگر مرکز و سامانه روی یک ماشین‌اند
bindport = 8088
```

> ⚠️ `bindaddr` را روی `0.0.0.0` نگذارید مگر آنکه مجبور باشید. رابط ARI
> اجازهٔ برقراری تماس می‌دهد؛ باز کردنش روی اینترنت یعنی هر کسی که رمز
> را حدس بزند می‌تواند از خط شما زنگ بزند. اگر سامانه روی ماشین دیگری
> است، از شبکهٔ خصوصی یا تونل استفاده کنید، نه از آی‌پی عمومی.

سپس:

```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "module reload http"
```

## ۲) در `.env` سامانه

```ini
ARI_URL=http://127.0.0.1:8088
ARI_USER=molido
ARI_PASSWORD=همان-رمز-قوی
ARI_CONTEXT=from-internal
ARI_CALLER_ID=Molido
```

`ARI_CONTEXT` همان context شماره‌گیری خروجی مرکز است. در FreePBX و
ایزابل معمولاً `from-internal` است.

## ۳) بررسی

```bash
curl -s http://localhost:3000/telephony/status -H "Authorization: Bearer TOKEN"
```

باید `{"configured": true, ...}` بدهد.

سپس در صفحهٔ «مریم — منشی خرید»، بنکدار را انتخاب کنید، داخلی خودتان را
بنویسید و «زنگ بزن» را بزنید.

## ۴) ترانک SIP — تا تماس واقعاً بیرون برود

سه بخشِ بالا سامانه را به **مرکز** وصل می‌کنند.  ولی مرکز به‌تنهایی
نمی‌تواند به بیرون زنگ بزند؛ برای آن یک **ترانک SIP** از اپراتور لازم
است.  بدون ترانک، تماسِ داخلی برقرار می‌شود و شمارهٔ بنکدار
`ALL CIRCUITS ARE BUSY` می‌گیرد.

### چه چیزی از اپراتور بگیرید

نامِ کاربری و رمزِ SIP، نشانیِ سرور (و درگاهش، معمولاً ۵۰۶۰)، و اینکه
احرازش **register** است یا بر پایهٔ **IP**.  این تفاوت مهم است: در حالت
IP، اپراتور آی‌پیِ ثابتِ شما را می‌شناسد و رمزی رد و بدل نمی‌شود.

### پیکربندی در `pjsip.conf`

```ini
[molido-trunk]
type = registration
outbound_auth = molido-auth
server_uri = sip:sip.OPERATOR.example
client_uri = sip:USERNAME@sip.OPERATOR.example
retry_interval = 60

[molido-auth]
type = auth
auth_type = userpass
username = USERNAME
password = PASSWORD

[molido-endpoint]
type = endpoint
context = from-trunk
disallow = all
; ⚠️ ترتیب کُدِک عمدی است: alaw برای خطوط ایران، بعد ulaw.
;    g729 را اگر اپراتور می‌خواهد اضافه کنید — پروانه لازم دارد.
allow = alaw,ulaw
outbound_auth = molido-auth
aors = molido-aor
from_user = USERNAME

[molido-aor]
type = aor
contact = sip:sip.OPERATOR.example
qualify_frequency = 60

[molido-identify]
type = identify
endpoint = molido-endpoint
match = sip.OPERATOR.example
```

سپس:

```bash
asterisk -rx "pjsip reload"
asterisk -rx "pjsip show registrations"
```

باید وضعیت `Registered` باشد.  اگر `Rejected` است، نام کاربری یا رمز
غلط است؛ اگر `Trying` می‌ماند، بستهٔ SIP اصلاً به اپراتور نمی‌رسد —
دیوارِ آتش یا NAT.

### مسیرِ خروجی در `extensions.conf`

⚠️ **این بخش با کدِ سامانه گره خورده است.**

`telephony.service.ts` تماس را این‌طور می‌سازد: کانالِ
`Local/<داخلیِ اپراتور>@<ARI_CONTEXT>` را برمی‌دارد و بعد شمارهٔ بنکدار
را در **همان context** شماره‌گیری می‌کند.  یعنی `ARI_CONTEXT` باید هم
داخلی‌ها را بشناسد و هم مسیرِ خروجی را:

```ini
[from-internal]
; داخلی‌ها — در FreePBX و ایزابل از قبل هست
include => internal-extensions

; خروجی: هر شمارهٔ ۱۰ تا ۱۳ رقمی از ترانک برود
exten => _X.,1,NoOp(Molido → ${MOLIDO_SUPPLIER})
 same => n,Set(CALLERID(num)=${CALLERID(num)})
 same => n,Dial(PJSIP/${EXTEN}@molido-endpoint,45)
 same => n,Hangup()
```

> ⚠️ الگوی `_X.` هر رشتهٔ رقمی را می‌گیرد.  اگر مرکزتان داخلی‌های
> کوتاه دارد (مثلاً ۱۰۱)، آن‌ها هم در این الگو می‌افتند و به ترانک
> فرستاده می‌شوند.  در آن صورت الگو را دقیق‌تر کنید — مثلاً
> `_0[1-9]XXXXXXXX` برای شماره‌های ثابت و `_09XXXXXXXXX` برای همراه.

متغیرهای `MOLIDO_SUPPLIER` و `MOLIDO_INQUIRY` را خودِ سامانه ست می‌کند،
پس در CDR می‌بینید کدام تماس مالِ کدام استعلام بود.

### وقتی مرکز پشتِ NAT است

اگر سرورِ استریسک آی‌پیِ عمومی ندارد، در `pjsip.conf` بخشِ `[global]` یا
همان endpoint:

```ini
external_media_address = آی‌پی-عمومی-شما
external_signaling_address = آی‌پی-عمومی-شما
local_net = 192.168.0.0/16
```

بدون این‌ها تماس برقرار می‌شود ولی **صدا یک‌طرفه** است — کلاسیک‌ترین
نشانهٔ NATِ پیکربندی‌نشده.

### آزمودن بدونِ درگیر کردنِ سامانه

```bash
asterisk -rx "channel originate PJSIP/09120000000@molido-endpoint application Playback hello-world"
```

اگر این کار کرد، ترانک سالم است و هر مشکلی که بماند سمتِ ARI است، نه
ترانک.  این جداسازی وقتِ زیادی صرفه‌جویی می‌کند.

## چطور کار می‌کند

مرکز **اول به داخلیِ خودِ شما** زنگ می‌زند و وقتی برداشتید، شمارهٔ
بنکدار را می‌گیرد.

ترتیبش عمدی است: اگر اول به بنکدار زنگ بزند و شما پشت خط نباشید، او
گوشی را برمی‌دارد و کسی آن‌طرف نیست — که هم بی‌ادبی است هم اعتبار
فروشگاه را خرج می‌کند.

## نکتهٔ امنیتی

نقطهٔ پایانی شماره‌گیری **شمارهٔ تلفن نمی‌گیرد**؛ `supplierId` می‌گیرد و
شماره را از رکورد تأمین‌کننده می‌خواند.

اگر شماره را از بدنهٔ درخواست می‌گرفت، هر کاربرِ واردشده می‌توانست
سامانه را به یک شماره‌گیرِ انبوه بدل کند و تماس‌ها از خطِ خودِ فروشگاه
بیرون برود. محدود کردن به تأمین‌کنندگانِ ثبت‌شده این را از ریشه می‌بندد،
و آزمون `purchasing.sh` همین را می‌سنجد: فرستادن `phone` در بدنه ۴۰۰
می‌گیرد.

## آنچه هنوز نیست

**ضبط و رونویسی خودکار تماس.** الان متن مکالمه از میکروفنِ مرورگر
گرفته می‌شود — اپراتور بلندگو را روشن می‌کند یا خودش تکرار می‌کند.

ضبط سمتِ مرکز و رونویسی خودکارش کار دیگری است: به فضای ذخیره‌سازی،
یک موتور گفتار فارسی، و تصمیم دربارهٔ رضایت طرف مقابل نیاز دارد.
ضبط مکالمهٔ تلفنی بدون اطلاع طرف مقابل، در بسیاری جاها مسئلهٔ حقوقی
دارد و تصمیمش با صاحب کسب‌وکار است، نه با سامانه.
