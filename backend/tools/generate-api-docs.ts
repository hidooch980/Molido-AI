/**
 * ساخت `API.md` از خودِ برنامهٔ در حال اجرا.
 *
 * ## چرا ساخته می‌شود و نوشته نمی‌شود
 *
 * `API.md` دست‌نویس بود و کهنه شد: چهار ماژول کامل — voice، purchasing،
 * quick-keys، ration — در آن نبودند، و هیچ‌چیز هم این را نمی‌گفت.
 *
 * سند دست‌نویسِ API همیشه کهنه می‌شود.  نه چون کسی تنبل است، بلکه چون
 * هیچ چیزی به‌روز نبودنش را **نمی‌شکند**.  تنها سندی که کهنه نمی‌شود،
 * سندی است که از منبع ساخته شود و اختلافش با منبع، آزمون را بشکند.
 *
 * اجرا:
 *   npx tsx tools/generate-api-docs.ts           # نوشتن API.md
 *   npx tsx tools/generate-api-docs.ts --check    # فقط بررسی اختلاف
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

type Operation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
};

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;
const OUT = join(__dirname, '..', 'API.md');

/**
 * برچسبِ گروه‌بندی.
 *
 * Swagger برچسب را از نام کنترلر می‌سازد؛ همان تقسیم‌بندی‌ای که در کد
 * هست، پس گروه‌بندیِ سند هم خودبه‌خود با کد یکی می‌ماند.
 */
function groupOf(operation: Operation, path: string): string {
  const tag = operation.tags?.[0];
  if (tag) return tag;
  const first = path.split('/').filter(Boolean)[0];
  return first ? first : 'root';
}

/** توضیح کوتاه — اگر نبود، شناسهٔ عملیات خواناتر از هیچ است. */
function describe(operation: Operation): string {
  const text = operation.summary ?? operation.description ?? '';
  if (text.trim()) return text.trim().replace(/\s+/g, ' ');

  const id = operation.operationId ?? '';
  const method = id.includes('_') ? id.split('_')[1] : id;
  return method ? `\`${method}\`` : '—';
}

function render(spec: Spec): string {
  const groups = new Map<string, Array<{ method: string; path: string; note: string }>>();
  let count = 0;

  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = operations[method];
      if (!operation) continue;

      const group = groupOf(operation, path);
      const list = groups.get(group) ?? [];
      list.push({ method: method.toUpperCase(), path, note: describe(operation) });
      groups.set(group, list);
      count += 1;
    }
  }

  const lines: string[] = [
    '# مستندات API',
    '',
    '> ⚠️ این فایل **ساخته می‌شود**، دستی ویرایش نکنید.',
    '>',
    '> `npx tsx tools/generate-api-docs.ts`',
    '>',
    '> نسخهٔ زندهٔ تعاملی: `http://localhost:3000/api-docs`',
    '',
    `**${count} عملیات در ${groups.size} گروه**`,
    '',
    'همهٔ مسیرها جز `/auth/login` و `/shop/*` توکن می‌خواهند:',
    '`Authorization: Bearer <token>`',
    '',
  ];

  for (const group of [...groups.keys()].sort()) {
    const rows = groups.get(group)!;
    // مرتب‌سازی پایدار: خروجی نباید بین دو اجرا فرق کند، وگرنه
    // بررسیِ اختلاف بی‌جهت شکست می‌خورد.
    rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

    lines.push(`## ${group}`, '', '| متد | مسیر | شرح |', '|---|---|---|');
    for (const row of rows) {
      lines.push(`| ${row.method} | \`${row.path}\` | ${row.note} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}`;
}

async function main(): Promise<void> {
  const url = process.env.MOLIDO_API ?? 'http://localhost:3000';
  const check = process.argv.includes('--check');

  let spec: Spec;
  try {
    const response = await fetch(`${url}/api-docs-json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    spec = (await response.json()) as Spec;
  } catch (error) {
    console.error(
      `❌ spec خوانده نشد از ${url}/api-docs-json — بک‌اند باید بالا باشد (${
        error instanceof Error ? error.message : error
      })`,
    );
    process.exitCode = 1;
    return;
  }

  const markdown = render(spec);

  if (check) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current.trim() === markdown.trim()) {
      console.log('✅ API.md با برنامه هم‌گام است');
      return;
    }
    console.error('❌ API.md با برنامه هم‌گام نیست.');
    console.error('   ساختِ دوباره:  npx tsx tools/generate-api-docs.ts');
    process.exitCode = 1;
    return;
  }

  writeFileSync(OUT, markdown, 'utf8');
  console.log(`✅ API.md ساخته شد — ${markdown.split('\n').length} خط`);
}

void main();
