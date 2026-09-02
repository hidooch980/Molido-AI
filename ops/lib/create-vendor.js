/**
 * ساختِ حسابِ فروشنده — داخلِ کانتینرِ بک‌اند اجرا می‌شود.
 *
 * ⚠️ چرا فایلِ جدا و نه `node -e` از راهِ ssh؟
 *
 *    نسخهٔ اول کلِ این کد را در یک رشته از چهار لایه رد می‌کرد:
 *    اینجا ← ssh ← پوستهٔ راه دور ← node -e.  و شکست — `\$1` در
 *    لایه‌ها گم شد و node خطای نحوی داد.
 *
 *    فایل هیچ لایه‌ای ندارد: همان‌طور که نوشته شده اجرا می‌شود، و
 *    `node -c` می‌تواند از قبل بسنجدش.
 *
 * ورودی:  رمز از stdin، ایمیل از آرگومان.
 * خروجی:  خطِ تأیید — رمز هرگز چاپ نمی‌شود.
 */
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const email = process.argv[2];
if (!email) {
  console.error('  ✗ ایمیل داده نشد');
  process.exit(1);
}

let pw = '';
process.stdin.on('data', (d) => {
  pw += d;
});

process.stdin.on('end', async () => {
  if (!pw) {
    console.error('  ✗ رمز از ورودی نیامد');
    process.exit(1);
  }

  const hash = await bcrypt.hash(pw, 10);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // ⚠️ ایمیلِ موجود **به‌روز** می‌شود، نه دوباره ساخته.
    //
    //    وگرنه کسی که فقط می‌خواهد رمزش را عوض کند، خطای یکتایی
    //    می‌گیرد و فکر می‌کند اسکریپت خراب است.
    await client.query(
      `INSERT INTO "User"
         (id, "firstName", "lastName", email, password, role, "companyId")
       VALUES (gen_random_uuid()::text, 'فروشنده', 'مولیدو', $1, $2, 'SUPER_ADMIN',
               (SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 1))
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = 'SUPER_ADMIN',
             "updatedAt" = now()`,
      [email, hash],
    );

    const check = await client.query(
      'SELECT email, role FROM "User" WHERE email = $1',
      [email],
    );
    console.log(`  ✓ ${check.rows[0].email} — ${check.rows[0].role}`);
  } finally {
    await client.end();
  }
});
