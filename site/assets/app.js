/*
 * سایتِ معرفیِ مولیدو — منطقِ کلاینت.
 *
 * ⚠️ این فایل **هیچ تصمیمی دربارهٔ پول نمی‌گیرد**.
 *
 *    قیمت‌ها را از سرور می‌گیرد و فقط برای نمایش جمع می‌زند؛ مبلغِ
 *    واقعی را سرور دوباره از پایگاه‌داده حساب می‌کند.  اگر کسی این
 *    فایل را در مرورگرش دستکاری کند، تنها چیزی که عوض می‌شود عددی
 *    است که خودش می‌بیند.
 *
 * ⚠️ بدونِ فریم‌ورک و بدونِ درخواستِ بیرونی.
 *
 *    کلِ سایت روی هاستِ اشتراکی می‌نشیند و باید با اینترنتِ کند هم
 *    باز شود.  هر کتابخانه‌ای اینجا یعنی یک درخواستِ بیشتر و یک
 *    نقطهٔ شکستِ بیشتر.
 */

'use strict';

/**
 * نشانیِ API.
 *
 * ⚠️ در `config.js` جداست تا هنگام آپلود روی cPanel بدونِ دست زدن به
 *    این فایل عوض شود.  نبودنش خطای روشن می‌دهد، نه رفتارِ نیمه‌کاره.
 */
var API = (window.MOLIDO_CONFIG && window.MOLIDO_CONFIG.apiBase) || '';

var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** جداکنندهٔ هزارگان + ارقامِ فارسی. */
function money(n) {
  var s = Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return s.replace(/\d/g, function (d) {
    return FA_DIGITS[+d];
  });
}

function el(id) {
  return document.getElementById(id);
}

/* ─────────────────────── پیمایش ─────────────────────── */

function initReveal() {
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    // ⚠️ مرورگرِ قدیمی: همه را نشان بده.  نبودِ انیمیشن اشکال نیست؛
    //    نبودِ محتوا هست.
    for (var i = 0; i < items.length; i++) items[i].classList.add('in');
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  items.forEach(function (n) {
    io.observe(n);
  });
}

/* ─────────────────────── ماژول‌ها ─────────────────────── */

var MODULES = [];

function renderModules(list) {
  var box = el('mods');
  if (!list.length) {
    box.innerHTML =
      '<p class="sub" style="grid-column:1/-1">فهرست ماژول‌ها در دسترس نیست. لطفاً تماس بگیرید.</p>';
    return;
  }

  box.innerHTML = list
    .map(function (m) {
      // ⚠️ `escapeHtml` روی هر مقدارِ سرور — عنوانِ ماژول از پایگاه‌داده
      //    می‌آید و مدیر می‌تواند هرچه بخواهد بنویسد.
      return (
        '<label class="mod" data-slug="' + escapeAttr(m.slug) + '">' +
        '<input type="checkbox" value="' + escapeAttr(m.slug) + '">' +
        '<div class="mod-top">' +
        '<div><h3>' + escapeHtml(m.title) + '</h3></div>' +
        '<span class="check" aria-hidden>✓</span>' +
        '</div>' +
        '<p>' + escapeHtml(m.summary || '') + '</p>' +
        '<div class="price">' + money(m.priceIrr) + ' <small>ریال</small></div>' +
        '</label>'
      );
    })
    .join('');

  box.addEventListener('change', onPick);
  box.addEventListener('change', syncTotal);
}

function onPick(e) {
  var input = e.target;
  if (!input || input.type !== 'checkbox') return;
  // پشتیبانِ مرورگرِ بدونِ `:has`.
  var card = input.closest('.mod');
  if (card) card.classList.toggle('on', input.checked);
}

function picked() {
  var out = [];
  var boxes = document.querySelectorAll('#mods input[type="checkbox"]');
  for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) out.push(boxes[i].value);
  return out;
}

function syncTotal() {
  var chosen = picked();
  var sum = 0;
  for (var i = 0; i < MODULES.length; i++) {
    if (chosen.indexOf(MODULES[i].slug) !== -1) sum += Number(MODULES[i].priceIrr) || 0;
  }
  el('total').textContent = money(sum);
  el('count').textContent = chosen.length ? money(chosen.length) + ' ماژول' : 'چیزی انتخاب نشده';
  el('pay').disabled = chosen.length === 0;
}

/* ─────────────────────── خرید ─────────────────────── */

function say(kind, text) {
  var m = el('msg');
  m.className = 'msg show ' + kind;
  m.textContent = text;
}

async function submitPurchase(e) {
  e.preventDefault();

  var chosen = picked();
  if (!chosen.length) return say('bad', 'حداقل یک ماژول انتخاب کنید.');

  var name = el('name').value.trim();
  var phone = el('phone').value.trim();

  // ⚠️ همان اعتبارسنجیِ سرور، اینجا هم — برای حذفِ یک رفت‌وبرگشت.
  //    ملاک همچنان سرور است؛ این فقط تجربهٔ کاربر را بهتر می‌کند.
  if (!name) return say('bad', 'نام و نام خانوادگی را وارد کنید.');
  if (!/^09\d{9}$/.test(phone)) return say('bad', 'شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.');

  var btn = el('pay');
  btn.disabled = true;
  btn.textContent = 'در حال اتصال به درگاه…';
  say('ok', 'در حال آماده‌سازی پرداخت…');

  try {
    var res = await fetch(API + '/site/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slugs: chosen,
        name: name,
        phone: phone,
        email: el('email').value.trim(),
        company: el('company').value.trim(),
        note: el('note').value.trim(),
      }),
    });

    var data = await res.json().catch(function () {
      return {};
    });

    if (!res.ok || !data.paymentUrl) {
      var reason = data.message || data.error || 'اتصال به درگاه ممکن نشد.';
      if (Array.isArray(reason)) reason = reason.join(' • ');
      say('bad', reason);
      btn.disabled = false;
      btn.textContent = 'پرداخت و خرید';
      return;
    }

    // ⚠️ کدِ رهگیری پیش از رفتن به درگاه ذخیره می‌شود.
    //
    //    اگر کاربر وسطِ پرداخت پنجره را ببندد، هنوز راهی برای پیگیری
    //    دارد.  بدونِ آن، سفارشش وجود دارد ولی خودش نمی‌داند.
    try {
      localStorage.setItem('molido_last_order', data.trackingCode);
    } catch (_) {
      /* حالتِ ناشناس یا ذخیره‌سازیِ بسته — پیگیری از ایمیل ممکن است. */
    }

    window.location.assign(data.paymentUrl);
  } catch (err) {
    say('bad', 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید یا تماس بگیرید.');
    btn.disabled = false;
    btn.textContent = 'پرداخت و خرید';
  }
}

/* ─────────────────────── ابزار ─────────────────────── */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(s) {
  return escapeHtml(s);
}

/* ─────────────────────── راه‌اندازی ─────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  initReveal();

  if (!API) {
    el('mods').innerHTML =
      '<p class="sub" style="grid-column:1/-1">نشانی سرور تنظیم نشده است (assets/config.js).</p>';
    return;
  }

  fetch(API + '/site/modules')
    .then(function (r) {
      return r.ok ? r.json() : [];
    })
    .then(function (list) {
      MODULES = Array.isArray(list) ? list : [];
      renderModules(MODULES);
      syncTotal();
    })
    .catch(function () {
      renderModules([]);
    });

  el('buy').addEventListener('submit', submitPurchase);
});
