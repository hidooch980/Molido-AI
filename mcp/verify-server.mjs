/**
 * آزمون سرتاسری سرور MCP.
 *
 * سرور را واقعاً بالا می‌آورد، پیام‌های JSON-RPC می‌فرستد، و جواب را
 * می‌سنجد.  آزمونِ خالصِ `tools.spec.mjs` تعریف ابزارها را می‌سنجد؛
 * این یکی می‌سنجد که سیم‌کشی هم کار می‌کند.
 *
 * چرا لازم است: تعریف درست + سیم‌کشی غلط = سروری که راه می‌افتد و
 * هیچ ابزاری نشان نمی‌دهد، بی‌آنکه خطایی بدهد.
 *
 * اجرا: node mcp/verify-server.mjs        (بدون سرور مولیدو هم کار می‌کند)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${g} want=${w})`);
  }
}

/** یک گفت‌وگوی کوتاه با سرور، روی stdio. */
function talk(messages, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(here, 'server.mjs')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // ورود عمداً تنظیم نشده: این آزمون پروتکل را می‌سنجد نه داده را،
        // و نباید به بالا بودن سرور مولیدو وابسته باشد.
        MOLIDO_EMAIL: '',
        MOLIDO_PASSWORD: '',
      },
    });

    const replies = [];
    let buffer = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('سرور در زمان مقرر جواب نداد'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          replies.push(JSON.parse(line));
        } catch {
          // خطوطی که JSON نیستند، پیام پروتکل نیستند.
        }
        if (replies.length === messages.filter((m) => m.id !== undefined).length) {
          clearTimeout(timer);
          child.kill();
          resolve(replies);
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
  });
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'verify', version: '1.0.0' },
  },
};

const READY = { jsonrpc: '2.0', method: 'notifications/initialized' };

console.log('--- دست‌دادن اولیه ---');
const [init] = await talk([INIT]);
chk('پاسخ initialize می‌آید', init?.id, 1);
chk('نام سرور', init?.result?.serverInfo?.name, 'molido');
chk('قابلیت ابزار اعلام می‌شود', Boolean(init?.result?.capabilities?.tools), true);

console.log('--- فهرست ابزارها ---');
const listed = await talk([
  INIT,
  READY,
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
]);
const tools = listed.find((r) => r.id === 2)?.result?.tools ?? [];
chk('ده ابزار اعلام می‌شود', tools.length, 10);
chk(
  'همه شمای ورودی دارند',
  tools.every((t) => t.inputSchema?.type === 'object'),
  true,
);
// اگر این نشانه نباشد، کلاینت برای هر گزارشِ خواندنی هم اجازه می‌پرسد.
chk(
  'همه فقط خواندنی علامت خورده‌اند',
  tools.every((t) => t.annotations?.readOnlyHint === true),
  true,
);
chk(
  'ابزار نمای کلی هست',
  tools.some((t) => t.name === 'dashboard'),
  true,
);

console.log('--- فراخوانی ابزار بدون ورود ---');
const called = await talk([
  INIT,
  READY,
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dashboard', arguments: {} } },
]);
const result = called.find((r) => r.id === 3)?.result;
// خطا باید به‌صورت نتیجه برگردد نه استثنا، تا مدل بتواند علتش را
// به کاربر بگوید — «tool failed» به کسی نمی‌گوید رمز تنظیم نشده.
chk('خطا به‌صورت نتیجه برمی‌گردد', result?.isError, true);
chk(
  'پیام، علت را می‌گوید',
  /MOLIDO_EMAIL/.test(result?.content?.[0]?.text ?? ''),
  true,
);

console.log('--- ابزار ناشناخته ---');
const unknown = await talk([
  INIT,
  READY,
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such', arguments: {} } },
]);
const unknownResult = unknown.find((r) => r.id === 4)?.result;
chk('ابزار ناشناخته، خطای گویا', unknownResult?.isError, true);

console.log('');
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
