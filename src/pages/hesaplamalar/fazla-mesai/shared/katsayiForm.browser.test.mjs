/**
 * Fazla mesai "Kat Sayı Hesapla" penceresi — 10 sayfa için tarayıcı testi (Playwright).
 * Çalıştır (proje kökünden): node src/pages/hesaplamalar/fazla-mesai/shared/katsayiForm.browser.test.mjs
 *
 * Senaryo: bilinen ücret 13.350 TL, asgari ücret 10.000 TL → pencere 1,3350; Uygula sonrası cetvel,
 * sonuç, kayıt payload'u ve yeniden açma aynı katsayıyı kullanmalı. Cetvel "Kat" hücresine elle
 * girilen katsayı kalmalı, sonucu değiştirmeli ve kayıttan geri gelmeli.
 * Backend gerekmez: tüm /api/ istekleri bellekteki sahte kayıt deposuna yönlendirilir,
 * diğer dış istekler engellenir. Gerçek veritabanına veya müşteri kayıtlarına dokunulmaz.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const { createServer } = await import("vite");
const { chromium } = await import("playwright");

const SHOT_DIR = path.join(os.tmpdir(), "katsayi-form-shots");
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function assert(condition, message, detail) {
  results.push({ ok: Boolean(condition), message, ...(detail === undefined ? {} : { detail }) });
}

const TEST_ME = {
  id: 1,
  email: "katsayi-test@local",
  name: "Katsayi Test",
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

function webSessionScript() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const token = fakeJwt({ userId: 1, id: 1, email: TEST_ME.email, role: "user", tenantId: 1, exp });
  const user = { id: 1, email: TEST_ME.email, name: TEST_ME.name, role: "user" };
  const license = {
    v: 1,
    userId: 1,
    allowed: true,
    isAdmin: false,
    code: null,
    licenseType: "professional",
    subscriptionType: "yearly",
    expiresAt: null,
    updatedAt: Date.now(),
  };
  return `(() => {
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

const PAGE_META = {
  standart: { route: "/fazla-mesai/standart", type: "fazla_mesai_standart" },
  "tanikli-standart": { route: "/fazla-mesai/tanikli-standart", type: "tanikli_standart_fazla_mesai" },
  "haftalik-karma": { route: "/fazla-mesai/haftalik-karma", type: "haftalik_karma_fazla_mesai" },
  donemsel: { route: "/fazla-mesai/donemsel", type: "donemsel_fazla_mesai" },
  "donemsel-haftalik": { route: "/fazla-mesai/donemsel-haftalik", type: "donemsel_haftalik_fazla_mesai" },
  "yeralti-isci": { route: "/fazla-mesai/yeralti-isci", type: "fazla_mesai_yeralti_isci" },
  "vardiya-24": { route: "/fazla-mesai/vardiya-24", type: "fazla_mesai_vardiya_24" },
  "vardiya-48": { route: "/fazla-mesai/vardiya-48", type: "fazla_mesai_vardiya_48" },
  "gemi-adami-gunluk": { route: "/fazla-mesai/gemi-adami-gunluk", type: "fazla_mesai_gemi_gunluk" },
  "gemi-adami-7-24": { route: "/fazla-mesai/gemi-adami-7-24", type: "fazla_mesai_gemi_7_24" },
};

const BILINEN = "13.350";
const ASGARI = "10.000";
const K = 1.335;
const UYGULANAN = "1,335";
const ESKI_HATALI = "1.335";
const HATALI = "1335";
const PENCERE_RE = /1[.,]3350/;
const HATALI_RE = /(^|[^\d.,])1335([^\d.,]|$)/;
const ELLE = 1.25;
const LABELS = ["Kat Sayı Hesapla", "Bilinen Ücret", "Asgari Ücret", "Katsayı", "İptal", "Uygula"];
const MOJIBAKE =
  /[\u00c3\u00c4\u00c5][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2122]|\u00e2\u20ac|\u00e2\u201a/;
/** Gemi Adamı 7/24 katsayıyı V3'ten beri noktalı ondalık saklar. */
const NOKTA_ONDALIK = new Set(["gemi-adami-7-24"]);

const fmt = (v) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const katsayiField = (key) => (key === "yeralti-isci" ? "katsayi" : "katSayi");

const store = new Map();
const writes = [];
const unexpectedRequests = [];

function handleApi(route, request) {
  const url = new URL(request.url());
  const method = request.method();
  if (url.pathname.startsWith("/api/auth/me")) return route.fulfill({ json: TEST_ME });
  const m = url.pathname.match(/^\/api\/saved-cases(?:\/(\d+))?\/?$/);
  if (m) {
    const id = m[1] ? Number(m[1]) : null;
    if (method === "GET" && id === null) return route.fulfill({ json: [...store.values()] });
    if (method === "GET" && id !== null) {
      const rec = store.get(id);
      return rec ? route.fulfill({ json: rec }) : route.fulfill({ status: 404, json: { message: "yok" } });
    }
    if ((method === "PUT" || method === "PATCH") && id !== null) {
      const body = request.postDataJSON();
      writes.push({ method, id, body });
      const next = { ...store.get(id), ...body, id };
      store.set(id, next);
      return route.fulfill({ json: next });
    }
    if (method === "POST" && id === null) {
      unexpectedRequests.push(`${method} ${url.pathname}`);
      return route.fulfill({ status: 403, json: { message: "testte yeni kayıt yok" } });
    }
    if (method === "DELETE") {
      unexpectedRequests.push(`${method} ${url.pathname}`);
      return route.fulfill({ status: 403, json: { message: "testte silme yok" } });
    }
  }
  return route.fulfill({ json: /notification/.test(url.pathname) ? [] : {} });
}

const stickyLoc = (page) => page.locator('[data-tour$="-kaydet-actions"]');
const isDirty = (page) => page.evaluate(() => document.querySelector("main")?.innerText.includes("· değişti") ?? false);
const mainText = (page) => page.evaluate(() => document.querySelector("main")?.innerText ?? "");

async function openRecord(page, base, route, caseId) {
  await page.goto(`${base}${route}?caseId=${caseId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForFunction(
    () => /Güncelle/.test(document.querySelector('[data-tour$="-kaydet-actions"]')?.textContent ?? ""),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
}

async function waitForText(page, needle) {
  for (let t = 0; t < 60; t += 1) {
    if ((await mainText(page)).includes(needle)) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

const num = (c) => Number(String(c).replace(",", "."));
const katsayiHucreleriDogru = (cells) => cells.length > 0 && cells.every((c) => num(c) === K);

/** Cetvel hücrelerindeki katsayı değerleri ("Kat" / "Katsayı" sütunu). */
async function cetvelKatsayilari(page) {
  return page.evaluate(() => {
    const out = [];
    for (const table of document.querySelectorAll("main table")) {
      const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      const idx = heads.findIndex((h) => /^(kat|kat ?sayı|katsayı)$/i.test(h));
      if (idx < 0) continue;
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cell = tr.children[idx];
        if (!cell) continue;
        const input = cell.querySelector("input");
        const v = (input ? input.value : cell.textContent ?? "").trim();
        if (v) out.push(v);
      }
    }
    return out;
  });
}

async function runPage(page, base, m, mod, parsers, index) {
  const n = m.name;
  const meta = PAGE_META[m.key];
  const field = katsayiField(m.key);
  const parse = parsers[m.key];
  const form = m.buildForm();
  const expected = m.compute({ ...form, [field]: UYGULANAN });
  const buggy = m.compute({ ...form, [field]: HATALI });
  const expectedNet = fmt(expected[m.netField]);
  const buggyNet = fmt(buggy[m.netField]);

  await openRecord(page, base, meta.route, m.caseId);
  assert(!(await isDirty(page)), `${n}: kayıt açılınca değişiklik yok`);
  const before = m.compute({ ...form, [field]: "1" });
  assert(fmt(before[m.netField]) !== expectedNet, `${n}: katsayı sonucu değiştirir (${fmt(before[m.netField])} → ${expectedNet})`);
  const hasKatsayiColumn = (await cetvelKatsayilari(page)).length > 0;

  await page.locator("main").getByRole("button", { name: /^Kat Sayı/i }).first().click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator("input") }).last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill(BILINEN);
  await inputs.nth(1).fill(ASGARI);
  await page.waitForTimeout(150);
  const dialogText = (await dialog.textContent()) ?? "";
  assert(PENCERE_RE.test(dialogText), `${n}: pencere 13.350 / 10.000 = 1,3350`, dialogText.replace(/\s+/g, " ").slice(0, 200));
  for (const label of LABELS) {
    assert(dialogText.includes(label), `${n}: pencerede "${label}"`);
  }
  const bad = dialogText.match(MOJIBAKE);
  assert(!bad, `${n}: pencerede bozuk Türkçe karakter yok`, bad ? bad[0] : undefined);
  if (index === 4) await page.screenshot({ path: path.join(SHOT_DIR, `${m.key}-pencere.png`) });

  await dialog.getByRole("button", { name: "Uygula" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });

  const netOk = await waitForText(page, expectedNet);
  assert(netOk, `${n}: Uygula sonrası sonuç 1,335 ile (${expectedNet})`, netOk ? undefined : `hatalı 1335 sonucu: ${buggyNet}`);
  let cells = await cetvelKatsayilari(page);
  for (let t = 0; t < 40 && hasKatsayiColumn && !katsayiHucreleriDogru(cells); t += 1) {
    await page.waitForTimeout(50);
    cells = await cetvelKatsayilari(page);
  }
  const text = await mainText(page);
  if (buggyNet !== expectedNet) assert(!text.includes(buggyNet), `${n}: hatalı sonuç (${buggyNet}) görünmez`);
  assert(!HATALI_RE.test(text), `${n}: sayfada 1335 katsayısı görünmez`);
  if (hasKatsayiColumn) {
    assert(katsayiHucreleriDogru(cells), `${n}: cetvel katsayı sütunu 1,335 (${cells.length} satır)`, cells.slice(0, 5));
  }
  assert(await isDirty(page), `${n}: Uygula sonrası değişiklik görünür`);
  if (index === 4) await page.screenshot({ path: path.join(SHOT_DIR, `${m.key}-cetvel.png`), fullPage: true });

  const writesBefore = writes.length;
  await stickyLoc(page).locator("button").filter({ hasText: /Güncelle/ }).click();
  for (let t = 0; t < 60 && writes.length === writesBefore; t += 1) await page.waitForTimeout(100);
  const saved = writes.length > writesBefore ? writes[writes.length - 1] : null;
  assert(saved?.method === "PUT" && saved.id === m.caseId, `${n}: mevcut sahte kayıt güncellendi (PUT)`);
  const savedForm = saved?.body?.data?.form ?? {};
  const savedK = savedForm.katSayi ?? savedForm.katsayi;
  assert(parse(String(savedK ?? "")) === K, `${n}: kaydedilen katsayı 1,335 olarak okunur`, savedK);
  if (NOKTA_ONDALIK.has(m.key)) {
    assert(savedK === "1.335", `${n}: kayıt biçimi V3/V3.5 ile aynı (noktalı ondalık)`, savedK);
  } else {
    assert(!/^\d+\.\d+$/.test(String(savedK ?? "")), `${n}: kaydedilen katsayı noktalı değil`, savedK);
  }
  assert(Number(saved?.body?.data?.brut_total) === Number(expected[m.totalField]), `${n}: brut_total 1,335 ile`, saved?.body?.data?.brut_total);
  await page.waitForTimeout(300);
  assert(!(await isDirty(page)), `${n}: kayıt sonrası değişiklik yok`);

  await openRecord(page, base, meta.route, m.caseId);
  assert(await waitForText(page, expectedNet), `${n}: yeniden açınca sonuç 1,335 ile (${expectedNet})`);
  assert(!HATALI_RE.test(await mainText(page)), `${n}: yeniden açınca 1335 görünmez`);
  assert(!(await isDirty(page)), `${n}: yeniden açınca değişiklik yok`);
}

async function runLegacy(page, base, m, legacyId) {
  const n = m.name;
  const field = katsayiField(m.key);
  const legacy = m.compute({ ...m.buildForm(), [field]: ESKI_HATALI });
  await openRecord(page, base, PAGE_META[m.key].route, legacyId);
  assert(
    await waitForText(page, fmt(legacy[m.netField])),
    `${n}: eski "${ESKI_HATALI}" kaydı önceki sonuçla açılır (sessiz dönüşüm yok)`,
  );
  assert(!(await isDirty(page)), `${n}: eski kayıt açılınca değişiklik yok`);
  assert(writes.every((w) => w.id !== legacyId), `${n}: eski kayıt kendiliğinden yazılmadı`);
}

/** Cetvel "Kat" hücresine elle katsayı: değer kalır, sonuç değişir, kayıttan geri gelir. */
async function runManualCell(page, base, m) {
  const n = m.name;
  const field = katsayiField(m.key);
  const expected = m.compute({ ...m.buildForm(), [field]: UYGULANAN });
  const expectedNet = fmt(expected[m.netField]);
  await openRecord(page, base, PAGE_META[m.key].route, m.caseId);
  assert(await waitForText(page, expectedNet), `${n}: elle giriş öncesi sonuç 1,335 ile`);
  const input = page.locator('main table input[aria-label="Kat"], main table td input[type="number"][step="0.0001"]').first();
  if ((await input.count()) === 0) {
    assert(false, `${n}: cetvelde elle katsayı hücresi var`);
    return;
  }
  await input.fill(String(ELLE));
  await page.waitForTimeout(800);
  assert(num(await input.inputValue()) === ELLE, `${n}: elle girilen 1,25 hücrede kalır`, await input.inputValue());
  const cells = await cetvelKatsayilari(page);
  assert(
    cells.filter((c) => num(c) !== ELLE).every((c) => num(c) === K),
    `${n}: diğer satırlar 1,335 kalır`,
    cells.slice(0, 4),
  );
  assert(!(await mainText(page)).includes(expectedNet), `${n}: elle katsayı sonucu değiştirir`);
  assert(await isDirty(page), `${n}: elle katsayı değişiklik olarak görünür`);

  const writesBefore = writes.length;
  await stickyLoc(page).locator("button").filter({ hasText: /Güncelle/ }).click();
  for (let t = 0; t < 60 && writes.length === writesBefore; t += 1) await page.waitForTimeout(100);
  const saved = writes.length > writesBefore ? writes[writes.length - 1] : null;
  const overrides = saved?.body?.data?.form?.rowOverrides ?? {};
  assert(Object.values(overrides).some((o) => o?.katsayi === ELLE), `${n}: kayda satır katsayısı 1,25 yazılır`, overrides);
  const savedTotal = Number(saved?.body?.data?.brut_total);
  assert(savedTotal < Number(expected[m.totalField]), `${n}: kayıttaki toplam elle katsayıyı içerir`, savedTotal);

  await openRecord(page, base, PAGE_META[m.key].route, m.caseId);
  const reopened = await cetvelKatsayilari(page);
  assert(reopened.some((c) => num(c) === ELLE), `${n}: yeniden açınca satır katsayısı 1,25`, reopened.slice(0, 4));
  assert(!(await mainText(page)).includes(expectedNet), `${n}: yeniden açınca elle katsayılı sonuç`);
  assert(!(await isDirty(page)), `${n}: yeniden açınca değişiklik yok`);
}

/** Dönemsel Haftalık "Mahsuplaşma Ekle" penceresi: Türkçe metinler bozuk değil. */
async function runMahsup(page, base, m, caseId) {
  await openRecord(page, base, PAGE_META[m.key].route, caseId);
  await page.locator("main").getByRole("button", { name: /Mahsupla/i }).first().click();
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const text = (await dialog.textContent()) ?? "";
  for (const label of ["Mahsuplaşma Ekle", "Ay ve yıl bazında", "Şubat", "Ağustos", "Eylül", "Aralık", "İptal"]) {
    assert(text.includes(label), `Dönemsel Haftalık Mahsuplaşma: "${label}"`);
  }
  const bad = text.match(MOJIBAKE);
  assert(!bad, "Dönemsel Haftalık Mahsuplaşma: bozuk Türkçe karakter yok", bad ? bad[0] : undefined);
  await page.screenshot({ path: path.join(SHOT_DIR, "donemsel-haftalik-mahsup.png") });
  await page.keyboard.press("Escape").catch(() => undefined);
}

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { host: "localhost", port: 5336, strictPort: false },
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] ?? "http://localhost:5336/").replace(/\/$/, "");
const appHost = new URL(base).host;

let browser;
try {
  const mod = await server.ssrLoadModule("/src/pages/hesaplamalar/fazla-mesai/shared/hakkaniyetOrani.fixtures.test.ts");
  const modules = mod.FM_MODULES;
  assert(modules.length === 10, "10 fazla mesai sayfası test ediliyor", modules.length);
  const parsers = {};
  for (const m of modules) {
    const engine = await server.ssrLoadModule(`/src/pages/hesaplamalar/fazla-mesai/${m.key}/engine.ts`);
    parsers[m.key] = engine.parseKatsayi;
  }

  const record = (id, m, form, name) => {
    const data = JSON.parse(JSON.stringify(m.buildSaveData(form, m.compute(form))));
    store.set(id, {
      id,
      name,
      type: PAGE_META[m.key].type,
      createdAt: "2025-01-15T10:00:00.000Z",
      ise_giris: "2019-01-01",
      isten_cikis: "2021-12-31",
      data,
    });
  };
  modules.forEach((m, idx) => {
    m.caseId = 9400 + idx;
    record(m.caseId, m, { ...m.buildForm(), [katsayiField(m.key)]: "1" }, `Katsayı testi ${idx + 1}`);
  });
  const legacyModule = modules.find((m) => m.key === "donemsel-haftalik");
  const LEGACY_ID = 9450;
  record(LEGACY_ID, legacyModule, { ...legacyModule.buildForm(), katSayi: ESKI_HATALI }, "Eski hatalı katsayı");

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(webSessionScript());
  await context.route("**/*", (route, request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return handleApi(route, request);
    if (url.host === appHost || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => assert(false, "sayfada yakalanmamış hata yok", String(err).slice(0, 300)));
  for (let i = 0; i < modules.length; i += 1) {
    try {
      await runPage(page, base, modules[i], mod, parsers, i);
    } catch (error) {
      assert(false, `${modules[i].name}: akış tamamlandı`, String(error?.message ?? error).slice(0, 400));
      await page.screenshot({ path: path.join(SHOT_DIR, `hata-${modules[i].key}.png`) }).catch(() => undefined);
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }
  try {
    await runLegacy(page, base, legacyModule, LEGACY_ID);
  } catch (error) {
    assert(false, "eski kayıt akışı tamamlandı", String(error?.message ?? error).slice(0, 400));
  }
  try {
    await runMahsup(page, base, legacyModule, legacyModule.caseId);
  } catch (error) {
    assert(false, "Mahsuplaşma akışı tamamlandı", String(error?.message ?? error).slice(0, 400));
  }
  for (const key of ["vardiya-48", "gemi-adami-gunluk", "gemi-adami-7-24"]) {
    const m = modules.find((x) => x.key === key);
    try {
      await runManualCell(page, base, m);
    } catch (error) {
      assert(false, `${m.name}: elle katsayı akışı tamamlandı`, String(error?.message ?? error).slice(0, 400));
      await page.screenshot({ path: path.join(SHOT_DIR, `hata-elle-${key}.png`) }).catch(() => undefined);
    }
  }
  assert(unexpectedRequests.length === 0, "yeni kayıt / silme isteği gönderilmedi", unexpectedRequests);
} catch (error) {
  assert(false, "test akışı tamamlandı", String(error?.stack ?? error).slice(0, 800));
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.message}${r.detail === undefined ? "" : ` ${JSON.stringify(r.detail)}`}`);
console.log(`katsayiForm.browser.test: ${results.length - failed.length}/${results.length} geçti; ekran görüntüleri: ${SHOT_DIR}`);
process.exit(failed.length > 0 ? 1 : 0);
