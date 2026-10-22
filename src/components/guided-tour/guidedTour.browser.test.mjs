/**
 * Etkileşimli kılavuz — gerçek tarayıcı regresyon testi (Playwright + Vite dev sunucusu).
 * Çalıştır (proje kökünden):
 *   node src/components/guided-tour/guidedTour.browser.test.mjs [--engine=chromium|webkit] [--only=senaryo]
 *
 * Backend gerekmez: tüm /api/ istekleri bellekte yanıtlanır, yazmalar hiçbir yere kaydedilmez.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const { createServer } = await import("vite");
const pw = await import("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "1"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const ENGINE = args.engine === "webkit" ? "webkit" : "chromium";
const ONLY = args.only ?? "";
const SHOT_DIR = path.join(os.tmpdir(), "guided-tour-shots", ENGINE);
mkdirSync(SHOT_DIR, { recursive: true });

const TEST_ME = {
  id: 1,
  email: "kilavuz-test@local",
  name: "Kılavuz Test",
  role: "user",
  tenantId: 1,
  licenseActive: true,
  licenseAccessCode: null,
  licenseStatus: "active",
  licenseType: "professional",
  subscriptionType: "yearly",
  subscriptionEndsAt: null,
};

function fakeJwt(payload) {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.test`;
}

function sessionScript() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const token = fakeJwt({ userId: 1, id: 1, email: TEST_ME.email, role: "user", tenantId: 1, exp });
  const user = { id: 1, email: TEST_ME.email, name: TEST_ME.name, role: "user", tenantId: 1 };
  const license = { v: 1, userId: 1, allowed: true, isAdmin: false, code: null, licenseType: "professional", subscriptionType: "yearly", expiresAt: null, updatedAt: Date.now() };
  return `(() => {
    if (sessionStorage.getItem("__tour_test_seeded")) return;
    sessionStorage.setItem("__tour_test_seeded", "1");
    localStorage.clear();
    localStorage.setItem("access_token", ${JSON.stringify(token)});
    localStorage.setItem("refresh_token", "test");
    localStorage.setItem("token_expiry", String(Date.now() + 24 * 3600 * 1000));
    localStorage.setItem("current_user", ${JSON.stringify(JSON.stringify(user))});
    localStorage.setItem("tenant_id", "1");
    localStorage.setItem("user_id", "1");
    localStorage.setItem("email", ${JSON.stringify(TEST_ME.email)});
    localStorage.setItem("v35_session", "1");
    localStorage.setItem("v35_license_access_v1", ${JSON.stringify(JSON.stringify(license))});
    localStorage.setItem("bh.guidedTour.autoWelcomeSeen.v1", "true");
  })();`;
}

function handleApi(route, request) {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/auth/me")) return route.fulfill({ json: TEST_ME });
  if (request.method() !== "GET") return route.fulfill({ json: { id: 99999, success: true } });
  const listy = /(saved-cases|sets|list|notification|records|folders|cases|templates|exclusion|backups|tickets)/i.test(url.pathname);
  return route.fulfill({ json: listy ? [] : {} });
}

const results = [];
function check(ok, scenario, message, detail) {
  results.push({ ok: Boolean(ok), scenario, message, ...(detail === undefined ? {} : { detail }) });
  const mark = ok ? "✔" : "✘";
  console.log(`  ${mark} ${message}${!ok && detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}

/* ───────────── tarayıcı içi ölçüm ───────────── */

const BUBBLE = '[data-guided-tour-bubble], [class*="_bubble_"]';

function measureInPage(bubbleSel) {
  const bubble = document.querySelector(bubbleSel);
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const hitOk = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top));
  };
  const progress = bubble ? (bubble.textContent.match(/(\d+)\s*\/\s*(\d+)/) ?? [])[0] ?? null : null;
  const buttons = bubble && visible(bubble)
    ? [...bubble.querySelectorAll("button")].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled, hit: hitOk(b) }))
    : [];
  const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter((d) => !(bubble && bubble.contains(d)) && visible(d) && !d.closest("[data-guided-tour-root]"));
  const modal = modals[modals.length - 1] ?? null;
  let modalOnTop = null;
  let modalButtons = [];
  if (modal) {
    const r = modal.getBoundingClientRect();
    const pts = [[0.5, 0.15], [0.5, 0.5], [0.85, 0.85], [0.15, 0.85]];
    modalOnTop = pts.every(([fx, fy]) => {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      return !!el && modal.contains(el);
    });
    modalButtons = [...modal.querySelectorAll("button")]
      .filter((b) => visible(b))
      .map((b) => ({ text: b.textContent.trim(), hit: hitOk(b) }));
  }
  return {
    bubbleVisible: visible(bubble),
    progress,
    title: bubble?.querySelector("h3")?.textContent ?? null,
    bodyText: bubble?.textContent ?? "",
    buttons,
    modalOpen: !!modal,
    modalTitle: modal?.querySelector("h2, h3")?.textContent?.trim() ?? null,
    modalOnTop,
    modalButtons,
  };
}

const measure = (page) => page.evaluate(measureInPage, BUBBLE);

async function waitFor(page, predicate, timeout = 4000) {
  const t0 = Date.now();
  let last = await measure(page);
  while (Date.now() - t0 < timeout) {
    if (predicate(last)) return last;
    await page.waitForTimeout(120);
    last = await measure(page);
  }
  return predicate(last) ? last : null;
}

async function startTour(page, base, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 60000 });
  const btn = page.getByRole("button", { name: /Etkileşimli kılavuzu başlat/ }).first();
  await btn.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(600);
  await btn.click();
  return waitFor(page, (s) => s.bubbleVisible && !!s.progress, 5000);
}

async function clickBubble(page, text) {
  const b = page.locator(`:is(${BUBBLE}) button`).filter({ hasText: text }).first();
  if ((await b.count()) === 0) return false;
  return b
    .click({ timeout: 2500 })
    .then(() => true)
    .catch((e) => {
      console.log(`    (balon düğmesi '${text}' tıklanamadı: ${String(e?.message ?? e).split("\n").slice(0, 6).join(" | ")})`);
      return false;
    });
}

/** Etkin hedefteki boş alanları gerçek klavye olaylarıyla doldurur. */
async function fillTarget(page, scopeSel = '[data-tour-active="true"]') {
  const handles = await page.$$(`${scopeSel} input:not([readonly]):not([type=hidden]):not([type=checkbox]):not([type=radio])`);
  const dateCount = await page.$$eval(`${scopeSel} input[type="date"]`, (els) => els.length);
  let dateNo = 0;
  let timeNo = 0;
  let money = false;
  for (const h of handles) {
    const info = await h.evaluate((el) => ({ type: el.type, attrType: el.getAttribute("type"), value: el.value, inputMode: el.inputMode, w: el.getBoundingClientRect().width, disabled: el.disabled }));
    if (!info.w || info.disabled || info.value) continue;
    try {
      if (info.attrType === "date") {
        const iso = dateCount >= 3 ? ["2010-01-01", "2015-03-01", "2024-06-30", "2024-12-31"] : ["2015-03-01", "2024-06-30", "2016-01-01", "2023-12-31"];
        const v = iso[Math.min(dateNo, iso.length - 1)];
        dateNo += 1;
        if (info.type !== "date") {
          await h.click();
          await page.keyboard.type(v, { delay: 15 });
        } else {
          const [y, m, d] = v.split("-");
          await h.click({ position: { x: 12, y: 10 } });
          await page.keyboard.type(`${d}${m}${y}`, { delay: 25 });
          if (!(await h.evaluate((el) => el.value))) {
            await h.click({ position: { x: 12, y: 10 } });
            await page.keyboard.type(`${m}${d}${y}`, { delay: 25 });
          }
        }
      } else if (info.attrType === "time") {
        const vals = info.type === "time" ? ["0800", "1900", "1200", "1300"] : ["08:00", "19:00", "12:00", "13:00"];
        await h.click({ position: { x: 10, y: 10 } });
        await page.keyboard.type(vals[Math.min(timeNo, vals.length - 1)], { delay: 25 });
        timeNo += 1;
      } else if (info.type === "number") {
        await h.click();
        await page.keyboard.type("5", { delay: 25 });
      } else if (!money && (info.inputMode === "decimal" || info.type === "text" || info.type === "")) {
        money = true;
        await h.click();
        await page.keyboard.type("30000", { delay: 25 });
      }
    } catch {
      /* alan doldurulamadıysa adım sonucu raporlar */
    }
  }
}

function modeOf(s) {
  const t = s.buttons.map((b) => b.text);
  if (t.includes("Kılavuzu tamamla")) return "finish";
  if (t.includes("İleri")) return "manual";
  if (t.length >= 3 && !t.includes("İleri") && !t.includes("Atla")) return "optional";
  return "auto";
}

/** Adımı kullanıcı gibi ilerletir; ilerlediyse yeni durumu döndürür. */
async function advanceStep(page, s) {
  const mode = modeOf(s);
  const before = s.progress;
  const moved = (x) => !x.bubbleVisible || x.progress !== before;
  if (mode === "auto" || mode === "manual") {
    await fillTarget(page);
    let next = await waitFor(page, moved, mode === "auto" ? 3500 : 1500);
    if (!next && mode === "manual") {
      await clickBubble(page, "İleri");
      next = await waitFor(page, moved, 1500);
    }
    if (!next && mode === "auto") {
      await page.mouse.click(5, (page.viewportSize()?.height ?? 700) - 5);
      next = await waitFor(page, moved, 2000);
    }
    return next;
  }
  if (mode === "optional") {
    const labels = s.buttons.map((b) => b.text);
    const primary = labels[labels.length - 1];
    const skip = labels.length >= 4 ? labels[labels.length - 2] : null;
    let next = null;
    if (skip) {
      await clickBubble(page, skip);
      next = await waitFor(page, moved, 1500);
    }
    if (!next) {
      await clickBubble(page, primary);
      next = await waitFor(page, moved, 1500);
    }
    if (!next) {
      await fillTarget(page);
      await clickBubble(page, primary);
      next = await waitFor(page, moved, 2000);
    }
    return next;
  }
  return null;
}

/** Adım değiştikten sonra kaydırma/yerleşim otursun; kullanıcının gördüğü son durumu ölç. */
async function settled(page, s) {
  if (!s || !s.bubbleVisible) return s;
  await page.waitForTimeout(700);
  return measure(page);
}

/* ───────────── senaryolar ───────────── */

async function kidemToEkstra(page, base, route = "/kidem-tazminati/30isci") {
  const s0 = await startTour(page, base, route);
  if (!s0) return null;
  let s = s0;
  for (let i = 0; i < 4 && s && s.progress && !/^3 \//.test(s.progress); i += 1) {
    s = await advanceStep(page, s);
  }
  return s;
}

async function modalLayering(page, scenario, openBtnLocator, expectProgress) {
  await openBtnLocator.click({ timeout: 3000 });
  const opened = await waitFor(page, (x) => x.modalOpen, 2500);
  check(!!opened, scenario, "modal açıldı");
  if (!opened) return;
  const paused = await waitFor(page, (x) => x.modalOpen && !x.bubbleVisible, 1500);
  check(!!paused, scenario, "modal açıkken kılavuz duraklıyor (balon gizli)", opened);
  const m = await measure(page);
  check(m.modalOnTop === true, scenario, "modal en üst katmanda (tıklamalar modala gidiyor)", m);
  check(m.modalButtons.length > 0 && m.modalButtons.every((b) => b.hit), scenario, "modal düğmeleri tıklanabilir", m.modalButtons);
  await page.screenshot({ path: path.join(SHOT_DIR, `${scenario}-modal.png`) });

  await page.keyboard.press("Escape");
  const afterEsc = await waitFor(page, (x) => !x.modalOpen && x.bubbleVisible, 2500);
  check(!!afterEsc, scenario, "Escape yalnızca modalı kapatıyor; kılavuz açık kalıyor", await measure(page));
  check(afterEsc?.progress === expectProgress, scenario, `kılavuz kaldığı adımdan (${expectProgress}) devam ediyor`, afterEsc?.progress);
}

async function scenarioKidemModals(ctx, base) {
  const sc = "kidem-modallar";
  const page = await ctx.newPage();
  try {
    const s = await kidemToEkstra(page, base);
    check(s?.progress === "3 / 4", sc, "Kıdem kılavuzu 3/4 Ek ödemeler adımına ulaştı", s?.progress);
    if (s?.progress !== "3 / 4") return;
    const eklenti = page.locator('[data-tour="kidem-ekstra"] button').filter({ hasText: /^Eklenti/ }).first();
    await modalLayering(page, sc, eklenti, "3 / 4");

    await eklenti.click({ timeout: 3000 });
    await waitFor(page, (x) => x.modalOpen, 2000);
    const cancel = page.locator('[role="dialog"][aria-modal="true"] button').filter({ hasText: /^(İptal|Kapat|Vazgeç)$/ }).first();
    const closed = await cancel.click({ timeout: 2500 }).then(() => true).catch(() => false);
    const resumed = await waitFor(page, (x) => !x.modalOpen && x.bubbleVisible && x.progress === "3 / 4", 2500);
    check(closed && !!resumed, sc, "modal kendi İptal düğmesiyle kapanınca kılavuz 3/4'ten devam ediyor");

    await clickBubble(page, "Ek ödemem yok");
    const fin = await waitFor(page, (x) => x.progress === "4 / 4", 2500);
    check(!!fin, sc, "4/4 Önizle ve kaydet adımına geçildi", fin?.progress);
    if (!fin) return;
    const kaydet = page.locator('[data-tour="kidem-kaydet-actions"] button').filter({ hasText: /^Kaydet$/ }).first();
    await modalLayering(page, `${sc}-kaydet`, kaydet, "4 / 4");
  } finally {
    await page.close();
  }
}

async function scenarioIhbarModal(ctx, base) {
  const sc = "ihbar-eklenti";
  const page = await ctx.newPage();
  try {
    let s = await startTour(page, base, "/ihbar-tazminati/30isci");
    for (let i = 0; i < 4 && s && !/^3 \//.test(s.progress ?? ""); i += 1) s = await advanceStep(page, s);
    check(s?.progress === "3 / 4", sc, "İhbar kılavuzu 3/4 adımına ulaştı", s?.progress);
    if (s?.progress !== "3 / 4") return;
    const eklenti = page.locator('[data-tour-active="true"] button').filter({ hasText: /Eklenti/ }).first();
    await modalLayering(page, sc, eklenti, "3 / 4");

    const fieldValues = () =>
      page.$$eval('[data-tour-active="true"] input', (els) => els.map((el) => el.value)).catch(() => null);
    const before = await fieldValues();
    await eklenti.click({ timeout: 3000 });
    const opened = await waitFor(page, (x) => x.modalOpen, 2500);
    const monthInput = page.locator('[role="dialog"][aria-modal="true"] input').first();
    const typed = !!opened && (await monthInput.fill("1000", { timeout: 2500 }).then(() => true).catch(() => false));
    check(typed, sc, "Eklenti modalında ay alanına yazıldı");
    await page.keyboard.press("Escape");
    const resumed = await waitFor(page, (x) => !x.modalOpen && x.bubbleVisible && x.progress === "3 / 4", 2500);
    check(!!resumed, sc, "odak modal alanındayken Escape yalnızca modalı kapatıyor; kılavuz 3/4'te", await measure(page));
    const after = await fieldValues();
    check(JSON.stringify(before) === JSON.stringify(after), sc, "Escape eklenti taslağını atıyor; form değerleri değişmiyor", { before, after });
  } finally {
    await page.close();
  }
}

async function scenarioAutoSkipAndEscape(ctx, base) {
  const sc = "otomatik-adim";
  const page = await ctx.newPage();
  try {
    const s = await startTour(page, base, "/kidem-tazminati/30isci");
    check(s?.progress === "1 / 4", sc, "Kıdem kılavuzu açıldı", s?.progress);
    const hasSkip = s?.buttons.some((b) => b.text === "Atla" && b.hit);
    check(hasSkip, sc, "otomatik adımda güvenli 'Atla' seçeneği var", s?.buttons);
    if (hasSkip) {
      await clickBubble(page, "Atla");
      const next = await waitFor(page, (x) => x.progress === "2 / 4", 2000);
      check(!!next, sc, "'Atla' sonraki adıma geçiriyor", next?.progress);
    }
    await page.keyboard.press("Escape");
    const closed = await waitFor(page, (x) => !x.bubbleVisible, 1500);
    check(!!closed, sc, "modal yokken Escape kılavuzu kapatıyor");
  } finally {
    await page.close();
  }
}

async function scenarioRemountedTarget(ctx, base) {
  const sc = "yeniden-olusan-hedef";
  const page = await ctx.newPage();
  try {
    const s = await startTour(page, base, "/kidem-tazminati/30isci");
    check(s?.progress === "1 / 4", sc, "Kıdem kılavuzu açıldı", s?.progress);
    if (!s) return;
    await page.evaluate(() => {
      const el = document.querySelector('[data-tour="kidem-tarihler"]');
      const clone = el.cloneNode(true);
      clone.removeAttribute("data-tour-active");
      el.replaceWith(clone);
    });
    await page.waitForTimeout(400);
    await fillTarget(page, '[data-tour="kidem-tarihler"]');
    const next = await waitFor(page, (x) => x.progress === "2 / 4", 3500);
    check(!!next, sc, "hedef yeniden oluşturulduktan sonra otomatik ilerleme çalışıyor", (await measure(page)).progress);
  } finally {
    await page.close();
  }
}

async function scenarioMissingTarget(ctx, base) {
  const sc = "kayip-hedef";
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/kidem-tazminati/30isci`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tour="kidem-tarihler"]', { timeout: 60000 });
    await page.evaluate(() => document.querySelector('[data-tour="kidem-tarihler"]')?.removeAttribute("data-tour"));
    await page.getByRole("button", { name: /Etkileşimli kılavuzu başlat/ }).first().click();
    const s = await waitFor(page, (x) => x.bubbleVisible, 3500);
    check(!!s, sc, "hedef bulunamayınca da kılavuz balonu görünüyor", s);
    if (!s) return;
    check(/görünmüyor|bulunamadı/i.test(s.bodyText), sc, "kullanıcıya hedefin bulunamadığı açıklanıyor", s.bodyText);
    const skip = s.buttons.find((b) => b.text === "Atla");
    const close = s.buttons.find((b) => b.text === "Kılavuzu kapat");
    check(skip?.hit && close?.hit, sc, "Atla ve Kılavuzu kapat tıklanabilir", s.buttons);
    if (skip?.hit) {
      await clickBubble(page, "Atla");
      const next = await waitFor(page, (x) => x.progress === "2 / 4", 2500);
      check(!!next, sc, "Atla ile sonraki (mevcut) adıma geçiliyor", next?.progress);
    }
  } finally {
    await page.close();
  }
}

/** Tek tarih alanına ISO tarihi gerçek klavye olaylarıyla yazar (date desteği olmayan motorda metin). */
async function typeDate(page, handle, iso) {
  const type = await handle.evaluate((el) => el.type);
  if (type !== "date") {
    await handle.click();
    await page.keyboard.type(iso, { delay: 15 });
    return;
  }
  const [y, m, d] = iso.split("-");
  await handle.click({ position: { x: 12, y: 10 } });
  await page.keyboard.type(`${d}${m}${y}`, { delay: 25 });
  if ((await handle.evaluate((el) => el.value)) !== iso) {
    await handle.click({ position: { x: 12, y: 10 } });
    await page.keyboard.type(`${m}${d}${y}`, { delay: 25 });
  }
}

/**
 * Koşullu (Atla'sız) isteğe bağlı adımlar: koşul sağlanmadan açıklama + Kapat görünür,
 * koşul doğru sağlanınca kılavuz ilerler — kullanıcı açıklamasız kilitlenmez.
 */
async function scenarioGatedSteps(ctx, base) {
  const sc = "kosullu-adimlar";
  const page = await ctx.newPage();
  try {
    let s = await startTour(page, base, "/prim-alacagi");
    check(s?.progress === "1 / 2", sc, "Prim Alacağı kılavuzu açıldı", s?.progress);
    if (s?.progress === "1 / 2") {
      await clickBubble(page, "Primleri tamamladım");
      const warned = await waitFor(page, (x) => /Devam etmek için/.test(x.bodyText ?? ""), 1500);
      check(!!warned && warned.progress === "1 / 2", sc, "Prim: koşul sağlanmadan açıklama gösteriliyor, adım korunuyor", warned?.bodyText);
      check(!!warned?.buttons.find((b) => b.text === "Kılavuzu kapat" && b.hit), sc, "Prim: Kılavuzu kapat tıklanabilir", warned?.buttons);
      const row = page.locator('[data-tour="prim-alacagi-kalemler"] [data-tour-prim-row]').first();
      const inputs = row.locator("input:not([readonly])");
      await inputs.nth(0).click();
      await page.keyboard.type("30000", { delay: 20 });
      await inputs.nth(1).click();
      await page.keyboard.type("5", { delay: 20 });
      await clickBubble(page, "Primleri tamamladım");
      const next = await waitFor(page, (x) => x.progress === "2 / 2", 2500);
      check(!!next, sc, "Prim: matrah ve oran girilince kılavuz 2/2'ye ilerliyor", (await measure(page)).progress);
    }
    await page.close();

    const page2 = await ctx.newPage();
    try {
      s = await startTour(page2, base, "/bakiye-ucret-alacagi");
      check(s?.progress === "1 / 5", sc, "Bakiye Ücret kılavuzu açıldı", s?.progress);
      if (s?.progress !== "1 / 5") return;
      const dates = await page2.$$('[data-tour="bakiye-ucret-donem"] input[type="date"], [data-tour="bakiye-ucret-donem"] input[max="9999-12-31"]');
      const isoList = ["2020-01-01", "2025-12-31", "2023-06-30"];
      for (let i = 0; i < Math.min(dates.length, 3); i += 1) await typeDate(page2, dates[i], isoList[i]);
      await page2.mouse.click(5, (page2.viewportSize()?.height ?? 700) - 5);
      s = (await waitFor(page2, (x) => x.progress === "2 / 5", 2500)) ?? (await (async () => { await clickBubble(page2, "İleri"); return waitFor(page2, (x) => x.progress === "2 / 5", 2000); })());
      for (let i = 0; i < 3 && s && s.progress !== "4 / 5"; i += 1) s = await settled(page2, await advanceStep(page2, s));
      check(s?.progress === "4 / 5", sc, "Bakiye: 4/5 Bakiye hesabı adımına ulaşıldı", s?.progress);
      if (s?.progress !== "4 / 5") return;
      await clickBubble(page2, "Hesabı oluşturdum");
      const warned = await waitFor(page2, (x) => /Devam etmek için/.test(x.bodyText ?? ""), 1500);
      check(!!warned && warned.progress === "4 / 5", sc, "Bakiye: cetvel yokken açıklama gösteriliyor, adım korunuyor", warned?.bodyText);
      await page2.locator('[data-tour="bakiye-ucret-hesapla"] button').first().click();
      await page2.waitForTimeout(800);
      await clickBubble(page2, "Hesabı oluşturdum");
      const next = await waitFor(page2, (x) => x.progress === "5 / 5", 2500);
      check(!!next, sc, "Bakiye: Bakiye Hesapla sonrası kılavuz 5/5'e ilerliyor", (await measure(page2)).progress);
    } finally {
      await page2.close();
    }
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

const SMALL_ROUTES = [
  "/fazla-mesai/haftalik-karma",
  "/fazla-mesai/donemsel",
  "/fazla-mesai/standart",
  "/fazla-mesai/gemi-adami-7-24",
  "/ucret-alacagi",
  "/yillik-izin/standart",
  "/yillik-izin/basin/gunluk-olmayan",
  "/kidem-tazminati/gemi",
];

async function scenarioSmallViewports(browser, base) {
  for (const [w, h] of [[1440, 760], [1280, 720]]) {
    const ctx = await newContext(browser, base, w, h);
    try {
      for (const route of SMALL_ROUTES) {
        const sc = `kucuk-ekran-${w}x${h}${route.replace(/\//g, "_")}`;
        if (ONLY && !sc.includes(ONLY)) continue;
        console.log(`• ${sc}`);
        const page = await ctx.newPage();
        try {
          let s = await settled(page, await startTour(page, base, route));
          const total = Number(String(s?.progress ?? "").split("/")[1]) || 0;
          const blocked = [];
          let reached = 0;
          for (let guard = 0; guard < 10 && s && s.bubbleVisible; guard += 1) {
            reached = Number(String(s.progress).split("/")[0]) || reached;
            const bad = s.buttons.filter((b) => !b.disabled && !b.hit);
            if (bad.length) {
              blocked.push(`${s.progress}: ${bad.map((b) => b.text).join(", ")}`);
              await page.screenshot({ path: path.join(SHOT_DIR, `${sc}-${guard + 1}.png`) });
            }
            if (modeOf(s) === "finish") break;
            const next = await advanceStep(page, s);
            if (!next) break;
            s = await settled(page, next);
          }
          check(blocked.length === 0, sc, "her adımda balon düğmeleri tıklanabilir", blocked);
          check(total > 0 && reached === total, sc, `kılavuz son adıma ulaştı (${reached}/${total})`, { reached, total });
        } finally {
          await page.close();
        }
      }
    } finally {
      await ctx.close();
    }
  }
}

/** Her kare çizildikten sonra vurgu ve hedef konumunu kaydeder (kullanıcının gördüğü durum). */
function installAlignProbe() {
  window.__align = [];
  const record = () => {
    const spot = document.querySelector('[class*="_spotlight_"]');
    const target = document.querySelector('[data-tour-active="true"]');
    const bubble = document.querySelector('[data-guided-tour-bubble]');
    if (spot && target) {
      const s = spot.getBoundingClientRect();
      const g = target.getBoundingClientRect();
      window.__align.push({
        p: (bubble?.textContent.match(/(\d+)\s*\/\s*(\d+)/) ?? [])[0] ?? null,
        tgt: target.getAttribute("data-tour"),
        pos: getComputedStyle(target).position,
        dy: Math.round(s.top + 6 - g.top),
        dx: Math.round(s.left + 6 - g.left),
        y: Math.round(window.scrollY),
      });
    }
  };
  const tick = () => {
    window.setTimeout(record, 0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const ALIGN_ROUTES = ["/ucret-alacagi", "/ubgt/bilirkisi"];

async function scenarioFixedTargetAlignment(browser, base) {
  const ctx = await newContext(browser, base, 1920, 1080);
  try {
    for (const route of ALIGN_ROUTES) {
      const sc = `hizalama-1920x1080${route.replace(/\//g, "_")}`;
      if (ONLY && !sc.includes(ONLY)) continue;
      console.log(`• ${sc}`);
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("main", { timeout: 60000 });
        const btn = page.getByRole("button", { name: /Etkileşimli kılavuzu başlat/ }).first();
        await btn.waitFor({ state: "visible", timeout: 30000 });
        await page.waitForTimeout(600);
        await page.evaluate(installAlignProbe);
        await btn.click();
        let s = await waitFor(page, (x) => x.bubbleVisible && !!x.progress, 5000);
        const total = Number(String(s?.progress ?? "").split("/")[1]) || 0;
        for (let guard = 0; guard < 10 && s && s.bubbleVisible && modeOf(s) !== "finish"; guard += 1) {
          const next = await advanceStep(page, s);
          if (!next) break;
          s = await settled(page, next);
        }
        const reachedLast = !!s && s.progress === `${total} / ${total}`;
        check(total > 0 && reachedLast, sc, `kılavuz son adıma ulaştı (${s?.progress ?? "-"})`);
        if (!reachedLast) continue;
        await page.mouse.move(960, 540);
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(500);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(500);
        const frames = await page.evaluate(() => window.__align ?? []);
        const lastFrames = frames.filter((f) => f.p === s.progress);
        const bad = frames.filter((f) => Math.abs(f.dy) > 2 || Math.abs(f.dx) > 2);
        check(frames.length > 20, sc, `kare kaydı alındı (${frames.length} kare, son adım ${lastFrames.length})`);
        check(
          lastFrames.length > 0 && lastFrames.some((f) => f.pos === "fixed" || f.pos === "sticky"),
          sc,
          "son adım hedefi sabit/yapışkan kaydet çubuğu",
          [...new Set(lastFrames.map((f) => `${f.tgt}:${f.pos}`))],
        );
        check(bad.length === 0, sc, "ilk yerleşim, adım geçişi ve kaydırma boyunca vurgu hedefle hizalı (≤2 px)", bad.slice(0, 8));
      } finally {
        await page.close();
      }
    }
  } finally {
    await ctx.close();
  }
}

async function newContext(browser, base, w, h) {
  const appHost = new URL(base).host;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "tr-TR" });
  ctx.setDefaultTimeout(5000);
  ctx.setDefaultNavigationTimeout(90000);
  await ctx.addInitScript(sessionScript());
  await ctx.route("**/*", (route, request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return handleApi(route, request);
    if (url.host === appHost || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    return route.abort();
  });
  return ctx;
}

/* ───────────── çalıştır ───────────── */

const server = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { host: "localhost", port: 5390 + (ENGINE === "webkit" ? 1 : 0), strictPort: false },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await pw[ENGINE].launch();
try {
  const warm = await newContext(browser, base, 1440, 900);
  const wp = await warm.newPage();
  await wp.goto(`${base}/kidem-tazminati/30isci`, { waitUntil: "domcontentloaded" });
  await wp.waitForSelector("main", { timeout: 90000 }).catch(() => undefined);
  await wp.waitForTimeout(2000);
  await warm.close();

  const ctx = await newContext(browser, base, 1440, 900);
  const scenarios = [
    ["kidem-modallar", scenarioKidemModals],
    ["ihbar-eklenti", scenarioIhbarModal],
    ["otomatik-adim", scenarioAutoSkipAndEscape],
    ["yeniden-olusan-hedef", scenarioRemountedTarget],
    ["kayip-hedef", scenarioMissingTarget],
    ["kosullu-adimlar", scenarioGatedSteps],
  ];
  for (const [name, fn] of scenarios) {
    if (ONLY && !name.includes(ONLY)) continue;
    console.log(`• ${name}`);
    await fn(ctx, base).catch((e) => check(false, name, "senaryo hata verdi", String(e?.message ?? e).split("\n")[0]));
  }
  await ctx.close();
  if (!ONLY || ONLY.startsWith("hizalama")) {
    await scenarioFixedTargetAlignment(browser, base).catch((e) => check(false, "hizalama", "senaryo hata verdi", String(e?.message ?? e).split("\n")[0]));
  }
  if (!ONLY || ONLY.startsWith("kucuk")) {
    await scenarioSmallViewports(browser, base).catch((e) => check(false, "kucuk-ekran", "senaryo hata verdi", String(e?.message ?? e).split("\n")[0]));
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nguided-tour.browser (${ENGINE}): ${results.length - failed.length}/${results.length} kontrol geçti`);
if (failed.length) {
  console.log("Başarısız kontroller:");
  for (const f of failed) console.log(`  - [${f.scenario}] ${f.message}`);
  process.exitCode = 1;
}
