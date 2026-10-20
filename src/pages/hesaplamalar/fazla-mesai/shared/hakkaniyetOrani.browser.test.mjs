/**
 * Fazla mesai hakkaniyet indirimi oranı — 10 sayfa için tarayıcı testi (Playwright).
 * Çalıştır (proje kökünden): node src/pages/hesaplamalar/fazla-mesai/shared/hakkaniyetOrani.browser.test.mjs
 *
 * Backend gerekmez: tüm /api/ istekleri bellekteki sahte kayıt deposuna yönlendirilir,
 * diğer dış istekler engellenir. Gerçek veritabanına veya müşteri kayıtlarına dokunulmaz.
 * Beklenen tutarlar, birim testteki örnek formlar ve sayfa motorlarıyla Node tarafında üretilir.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const { createServer } = await import("vite");
const { chromium } = await import("playwright");

const SHOT_DIR = path.join(os.tmpdir(), "hakkaniyet-orani-shots");
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function assert(condition, message, detail) {
  results.push({ ok: Boolean(condition), message, ...(detail === undefined ? {} : { detail }) });
}

const TEST_ME = {
  id: 1,
  email: "hakkaniyet-test@local",
  name: "Hakkaniyet Test",
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

const ORANLAR = ["1/3", "%20", "%25", "%30", "%35", "%40", "%45"];
const KAYIT_ORANI = "%30";
const MAHSUP = "5.000,50";

const fmt = (v) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

function stripField(value) {
  if (Array.isArray(value)) return value.map(stripField);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k !== "hakkaniyetOrani") out[k] = stripField(v);
  }
  return out;
}

function containsKey(value, key) {
  if (Array.isArray(value)) return value.some((v) => containsKey(v, key));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key));
}

/** Rapor/önizleme etiketi: Tanıklı Standart kendi biçimini korur. */
function previewLabel(key, oran) {
  if (key === "tanikli-standart") {
    return oran === "1/3" ? "Hakkaniyet İndirimi (Brüt / 3)" : `Hakkaniyet İndirimi (Brüt × ${oran})`;
  }
  return `${oran} Hakkaniyet İndirimi`;
}

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
      const body = request.postDataJSON();
      const newId = 9900 + writes.length;
      writes.push({ method, id: newId, body });
      const rec = { id: newId, createdAt: new Date().toISOString(), ...body };
      store.set(newId, rec);
      return route.fulfill({ json: rec });
    }
    if (method === "DELETE") {
      unexpectedRequests.push(`${method} ${url.pathname}`);
      return route.fulfill({ status: 403, json: { message: "testte silme yok" } });
    }
  }
  return route.fulfill({ json: /notification/.test(url.pathname) ? [] : {} });
}

const selectLoc = (page) => page.locator("main select[data-hakkaniyet-orani]");
const stickyLoc = (page) => page.locator('[data-tour$="-kaydet-actions"]');
const isDirty = (page) => page.evaluate(() => document.querySelector("main")?.innerText.includes("· değişti") ?? false);

async function openRecord(page, base, route, caseId) {
  await page.goto(`${base}${route}?caseId=${caseId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForFunction(
    () => /Güncelle/.test(document.querySelector('[data-tour$="-kaydet-actions"]')?.textContent ?? ""),
    undefined,
    { timeout: 30000 },
  );
  await selectLoc(page).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(300);
}

async function hakkaniyetRowAmount(page) {
  return selectLoc(page).evaluate((el) => el.closest("div")?.lastElementChild?.textContent?.trim() ?? "");
}

/** Seçim sonrası tutarın yansımasını kısa aralıklarla bekler (motor ertelenmiş çalışır). */
async function waitForRow(page, expected) {
  for (let t = 0; t < 40; t += 1) {
    if ((await hakkaniyetRowAmount(page)).includes(expected)) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function mainText(page) {
  return page.evaluate(() => document.querySelector("main")?.innerText ?? "");
}

async function previewText(page) {
  await stickyLoc(page).getByRole("button", { name: /Önizleme/ }).click();
  const dialog = page.locator('[role="dialog"]').filter({ hasText: "Hakkaniyet" }).last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const text = await dialog.innerText();
  await dialog.getByRole("button", { name: /Kapat/ }).first().click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  return text;
}

async function runPage(page, base, m, mod, index) {
  const n = m.name;
  const meta = PAGE_META[m.key];
  const baseForm = mod.buildScenarioForm(m, MAHSUP);
  const expected = Object.fromEntries(
    ORANLAR.map((oran) => {
      const r = m.compute({ ...baseForm, hakkaniyetOrani: oran });
      return [oran, { hk: r[m.hakkaniyetField], net: r[m.netField], total: r[m.totalField] }];
    }),
  );

  // Eski kayıt: alan yok → 1/3, tutarlar referansla aynı, değişiklik yok
  await openRecord(page, base, meta.route, m.legacyId);
  assert((await selectLoc(page).count()) === 1, `${n}: tek oran seçim kutusu var`);
  assert((await selectLoc(page).inputValue()) === "1/3", `${n}: eski kayıt 1/3 açılır`);
  const options = await selectLoc(page).evaluate((el) => Array.from(el.options).map((o) => o.value));
  assert(JSON.stringify(options) === JSON.stringify(ORANLAR), `${n}: 7 seçenek (1/3 ve %20–%45)`, options);
  assert(!(await isDirty(page)), `${n}: eski kayıt açılınca değişiklik yok`);
  assert(await waitForRow(page, fmt(expected["1/3"].hk)), `${n}: 1/3 tutarı referansla aynı (${fmt(expected["1/3"].hk)})`, await hakkaniyetRowAmount(page));
  assert((await mainText(page)).includes(fmt(expected["1/3"].net)), `${n}: 1/3 mahsup sonrası tutar (${fmt(expected["1/3"].net)})`);
  const preview13 = await previewText(page);
  assert(preview13.includes(previewLabel(m.key, "1/3")), `${n}: önizlemede "${previewLabel(m.key, "1/3")}"`);
  assert(preview13.includes(fmt(expected["1/3"].hk)), `${n}: önizlemede 1/3 tutarı`);

  if (index === 0) {
    await selectLoc(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, "standart-1-3.png") });
  }

  // Tüm oranlar: tutarlar anında yansır, değişiklik algılanır
  for (const oran of ORANLAR.slice(1)) {
    await selectLoc(page).selectOption(oran);
    const ok = await waitForRow(page, fmt(expected[oran].hk));
    assert(ok, `${n} ${oran}: hakkaniyet tutarı anında ${fmt(expected[oran].hk)}`, await hakkaniyetRowAmount(page));
    assert((await mainText(page)).includes(fmt(expected[oran].net)), `${n} ${oran}: mahsup sonrası tutar ${fmt(expected[oran].net)}`);
    assert(await isDirty(page), `${n} ${oran}: kaydedilmemiş değişiklik görünür`);
  }
  await selectLoc(page).selectOption("1/3");
  assert(await waitForRow(page, fmt(expected["1/3"].hk)), `${n}: 1/3'e dönünce tutar referansa döner`);
  assert(!(await isDirty(page)), `${n}: 1/3'e dönünce değişiklik kalmaz`);

  // Kayıt oranı: önizleme, sayfa metinleri
  await selectLoc(page).selectOption(KAYIT_ORANI);
  await waitForRow(page, fmt(expected[KAYIT_ORANI].hk));
  const previewP = await previewText(page);
  assert(previewP.includes(previewLabel(m.key, KAYIT_ORANI)), `${n}: önizlemede "${previewLabel(m.key, KAYIT_ORANI)}"`);
  assert(!previewP.includes(previewLabel(m.key, "1/3")), `${n}: önizlemede eski 1/3 etiketi kalmaz`);
  assert(previewP.includes(fmt(expected[KAYIT_ORANI].hk)), `${n}: önizlemede ${KAYIT_ORANI} tutarı`);
  assert(previewP.includes(fmt(expected[KAYIT_ORANI].net)), `${n}: önizlemede mahsup sonrası tutar`);
  const text = await mainText(page);
  assert(!/1\/3 hakkaniyet/i.test(text), `${n}: sayfada sabit "1/3 hakkaniyet" metni kalmaz`);
  if (m.key === "vardiya-24" || m.key === "vardiya-48") {
    assert(text.includes(`${KAYIT_ORANI} hakkaniyet indirimi ve`), `${n}: açıklama metni seçilen oranı söyler`);
  }
  if (m.key === "standart") {
    const notes = await page.evaluate(() => document.querySelector("main details")?.textContent ?? "");
    assert(notes.includes(`${KAYIT_ORANI} oranındaki indirim`), `${n}: notlar seçilen oranı söyler`);
  }
  if (index === 0 || index === 6) {
    await selectLoc(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, `${m.key}-yuzde30.png`) });
  }

  // Kaydet (Güncelle) → payload'da oran
  const writesBefore = writes.length;
  await stickyLoc(page).locator("button").filter({ hasText: /Güncelle/ }).click();
  for (let t = 0; t < 60 && writes.length === writesBefore; t += 1) await page.waitForTimeout(100);
  const saved = writes.length > writesBefore ? writes[writes.length - 1] : null;
  assert(saved?.method === "PUT" && saved.id === m.legacyId, `${n}: mevcut kayıt güncellendi (PUT)`, saved && { method: saved.method, id: saved.id });
  assert(saved?.body?.type === meta.type, `${n}: kayıt türü korunur (${meta.type})`, saved?.body?.type);
  assert(saved?.body?.data?.form?.hakkaniyetOrani === KAYIT_ORANI, `${n}: payload form.hakkaniyetOrani = ${KAYIT_ORANI}`, saved?.body?.data?.form?.hakkaniyetOrani);
  assert(saved?.body?.data?.formValues?.hakkaniyetOrani === KAYIT_ORANI, `${n}: payload formValues.hakkaniyetOrani = ${KAYIT_ORANI}`);
  const nested = saved?.body?.data?.data?.form;
  if (nested) assert(nested.hakkaniyetOrani === KAYIT_ORANI, `${n}: payload data.form.hakkaniyetOrani = ${KAYIT_ORANI}`);
  assert(Number(saved?.body?.data?.brut_total) === Number(expected[KAYIT_ORANI].total), `${n}: brut_total değişmez`, saved?.body?.data?.brut_total);
  await page.waitForTimeout(300);
  assert(!(await isDirty(page)), `${n}: kayıt sonrası değişiklik yok`);

  // Yeniden açınca oran ve tutarlar geri gelir
  await openRecord(page, base, meta.route, m.legacyId);
  assert((await selectLoc(page).inputValue()) === KAYIT_ORANI, `${n}: yeniden açınca ${KAYIT_ORANI} seçili`);
  assert(await waitForRow(page, fmt(expected[KAYIT_ORANI].hk)), `${n}: yeniden açınca ${KAYIT_ORANI} tutarı`);
  assert(!(await isDirty(page)), `${n}: yeniden açınca değişiklik yok`);

  // Yeni hesaplama → varsayılan 1/3
  await stickyLoc(page).locator("button").filter({ hasText: /Yeni/ }).first().click();
  await page.waitForTimeout(400);
  const discard = page.locator('[role="dialog"]').filter({ hasText: /kaydedilmemiş|vazgeç|devam/i });
  if (await discard.count()) assert(false, `${n}: değişiklik yokken onay penceresi açılmaz`);
  assert((await selectLoc(page).inputValue()) === "1/3", `${n}: yeni hesaplama 1/3 ile başlar`);
}

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { host: "localhost", port: 5332, strictPort: false },
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] ?? "http://localhost:5332/").replace(/\/$/, "");
const appHost = new URL(base).host;

let browser;
try {
  const mod = await server.ssrLoadModule("/src/pages/hesaplamalar/fazla-mesai/shared/hakkaniyetOrani.fixtures.test.ts");
  const modules = mod.FM_MODULES;
  assert(modules.length === 10, "10 fazla mesai sayfası test ediliyor", modules.length);

  modules.forEach((m, idx) => {
    const id = 9200 + idx;
    m.legacyId = id;
    const form = mod.buildScenarioForm(m, MAHSUP);
    const legacyData = stripField(JSON.parse(JSON.stringify(m.buildSaveData(form, m.compute(form)))));
    assert(!containsKey(legacyData, "hakkaniyetOrani"), `${m.name}: sahte eski kayıtta oran alanı yok`);
    store.set(id, {
      id,
      name: `Eski FM kaydı ${idx + 1}`,
      type: PAGE_META[m.key].type,
      createdAt: "2025-01-15T10:00:00.000Z",
      ise_giris: "2019-01-01",
      isten_cikis: "2021-12-31",
      data: legacyData,
    });
  });

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
      await runPage(page, base, modules[i], mod, i);
    } catch (error) {
      assert(false, `${modules[i].name}: akış tamamlandı`, String(error?.message ?? error).slice(0, 400));
      await page.screenshot({ path: path.join(SHOT_DIR, `hata-${modules[i].key}.png`) }).catch(() => undefined);
    }
  }
  assert(unexpectedRequests.length === 0, "silme isteği gönderilmedi", unexpectedRequests);
  assert(writes.every((w) => w.method === "PUT"), "yalnızca mevcut sahte kayıtlar güncellendi", writes.map((w) => w.method));
} catch (error) {
  assert(false, "test akışı tamamlandı", String(error?.stack ?? error).slice(0, 800));
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.message}${r.detail === undefined ? "" : ` ${JSON.stringify(r.detail)}`}`);
console.log(`hakkaniyetOrani.browser.test: ${results.length - failed.length}/${results.length} geçti; ekran görüntüleri: ${SHOT_DIR}`);
process.exit(failed.length > 0 ? 1 : 0);
