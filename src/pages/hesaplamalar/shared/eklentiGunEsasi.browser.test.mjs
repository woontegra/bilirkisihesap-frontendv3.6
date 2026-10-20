/**
 * Kıdem/İhbar 12 aylık eklenti penceresi — 360/365 gün esası tarayıcı testi (Playwright).
 * Çalıştır (proje kökünden): node src/pages/hesaplamalar/shared/eklentiGunEsasi.browser.test.mjs
 *
 * Backend gerekmez: tüm /api/ istekleri bellekteki sahte kayıt deposuna yönlendirilir,
 * diğer dış istekler engellenir. Gerçek veritabanına veya kayıtlara dokunulmaz.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const { createServer } = await import("vite");
const { chromium } = await import("playwright");

const SHOT_DIR = path.join(os.tmpdir(), "eklenti-gun-esasi-shots");
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function assert(condition, message, detail) {
  results.push({ ok: Boolean(condition), message, ...(detail === undefined ? {} : { detail }) });
}

const TEST_ME = {
  id: 1,
  email: "eklenti-test@local",
  name: "Eklenti Test",
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

const DATES = { start: "2015-03-01", end: "2024-06-30" };
const MONEY = { brut: "30.000,00", prim: "1.500,00" };

const kidemStd = { ciplakBrut: MONEY.brut, prim: MONEY.prim, ikramiye: "", yol: "", yemek: "", diger: "", extras: [], notes: "" };
const periods = [{ id: "p1", start: DATES.start, end: DATES.end, days: 0 }];
const ihbarStd = {
  startDate: DATES.start,
  endDate: DATES.end,
  brut: MONEY.brut,
  prim: MONEY.prim,
  ikramiye: "",
  yol: "",
  yemek: "",
  extras: [],
  brutUcret: MONEY.brut,
  iseGiris: DATES.start,
  istenCikis: DATES.end,
  exitDate: DATES.end,
};

/** Eski kayıt biçimi: eklentiGunEsasi alanı yok. */
const PAGES = [
  { name: "Kıdem — İş Kanunu", route: "/kidem-tazminati/30isci", type: "kidem_30isci", form: { iseGirisTarihi: DATES.start, istenCikisTarihi: DATES.end, ...kidemStd } },
  { name: "Kıdem — Basın İş", route: "/kidem-tazminati/basin", type: "kidem_basin", form: { meslegeBaslangic: "2010-01-01", iseGiris: DATES.start, istenCikis: DATES.end, denemeSuresiGun: "", ...kidemStd } },
  { name: "Kıdem — Gemi Adamları", route: "/kidem-tazminati/gemi", type: "kidem_gemi", form: { startDate: DATES.start, endDate: DATES.end, ...kidemStd } },
  { name: "Kıdem — Kısmi Süreli", route: "/kidem-tazminati/kismi-sureli", type: "kidem_kismi_sureli", form: { periods, totalDaysManual: "", isManualOverride: false, exitDateOverride: DATES.end, ...kidemStd } },
  { name: "Kıdem — Mevsimlik İşçi", route: "/kidem-tazminati/mevsimlik", type: "kidem_mevsimlik", form: { periods, manualTotalDaysOverride: "", ...kidemStd } },
  { name: "İhbar — İş Kanunu", route: "/ihbar-tazminati/30isci", type: "ihbar_30isci", form: ihbarStd },
  { name: "İhbar — Borçlar Kanunu", route: "/ihbar-tazminati/borclar", type: "ihbar_borclar", form: ihbarStd },
  { name: "İhbar — Gemi Adamları", route: "/ihbar-tazminati/gemi", type: "ihbar_gemi", form: ihbarStd },
  { name: "İhbar — Mevsimlik", route: "/ihbar-tazminati/mevsim", type: "ihbar_mevsim", form: ihbarStd },
  { name: "İhbar — Basın İş", route: "/ihbar-tazminati/basin", type: "ihbar_basin", form: { ...ihbarStd, meslegeBaslangic: "2010-01-01" } },
  { name: "İhbar — Kısmi Süreli", route: "/ihbar-tazminati/kismi", type: "ihbar_kismi", form: ihbarStd },
  { name: "İhbar — Belirli Süreli", route: "/ihbar-tazminati/belirli", type: "ihbar_belirli", form: ihbarStd },
];

/** Sahte /api/saved-cases deposu (yalnızca bellekte). */
const store = new Map();
const writes = [];
PAGES.forEach((p, idx) => {
  const id = 9100 + idx;
  p.legacyId = id;
  store.set(id, {
    id,
    name: `Eski kayıt ${idx + 1}`,
    type: p.type,
    createdAt: "2025-01-15T10:00:00.000Z",
    data: { form: p.form, formValues: p.form, brut_total: 100, net_total: 90, ise_giris: DATES.start, isten_cikis: DATES.end, results: { brut: 100, net: 90 } },
  });
});

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
  }
  return route.fulfill({ json: /notification/.test(url.pathname) ? [] : {} });
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\./g, "");
}

async function openPage(page, base, route, caseId) {
  await page.goto(`${base}${route}?caseId=${caseId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForFunction(
    () => /Güncelle/.test(document.querySelector('[data-tour$="-kaydet-actions"]')?.textContent ?? ""),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
}

const stickyText = (page) => page.locator('[data-tour$="-kaydet-actions"]').innerText();
const eklentiButtons = (page) => page.locator("main button").filter({ hasText: /^\s*Eklenti( Hesapla)?\s*$/ });
const eklentiDialog = (page) => page.locator('[role="dialog"]').filter({ hasText: "gün esasına göre" });

async function radioState(dialog) {
  return {
    r360: await dialog.getByRole("radio", { name: "360 gün esasına göre" }).isChecked(),
    r365: await dialog.getByRole("radio", { name: "365 gün esasına göre" }).isChecked(),
  };
}

async function mainMoneyValues(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main input[inputmode="decimal"]')).map((el) => el.value),
  );
}

async function runPage(page, base, p, index) {
  const n = p.name;

  // Eski kayıt: alan yok → 360, değerler aynen, kaydedilmemiş değişiklik yok
  await openPage(page, base, p.route, p.legacyId);
  const sticky0 = await stickyText(page);
  assert(!/Kaydedilmemiş/.test(sticky0), `${n}: eski kayıt açılınca kaydedilmemiş değişiklik yok`, sticky0);
  const values0 = await mainMoneyValues(page);
  assert(values0.includes(MONEY.prim), `${n}: eski kayıt prim değeri aynen geldi (${MONEY.prim})`, values0);

  const btnCount = await eklentiButtons(page).count();
  assert(btnCount > 0, `${n}: eklenti düğmesi var`, btnCount);
  await eklentiButtons(page).first().click();
  const dialog = eklentiDialog(page);
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  assert(JSON.stringify(await radioState(dialog)) === JSON.stringify({ r360: true, r365: false }), `${n}: eski kayıtta 360 seçili`);
  assert(/\/\s*360\)\s*×\s*30/.test(await dialog.innerText()), `${n}: formül metni 360`);
  const layout = await dialog.evaluate((card) => {
    const group = card.querySelector('[role="radiogroup"]')?.getBoundingClientRect();
    const result = Array.from(card.querySelectorAll("p")).find((el) => el.textContent?.trim().startsWith("Sonuç"));
    const resultRect = result?.getBoundingClientRect();
    const actions = Array.from(card.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Uygula");
    const cardRect = card.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      sameRowAsResult: !!group && !!resultRect && Math.abs(group.top + group.height / 2 - (resultRect.top + resultRect.height / 2)) < 14,
      uygulaVisible: !!actionsRect && actionsRect.bottom <= cardRect.bottom + 1,
      overflowPx: card.scrollHeight - card.clientHeight,
      groupHeight: group ? Math.round(group.height) : null,
    };
  });
  if (p.type.startsWith("ihbar_")) {
    assert(layout.sameRowAsResult, `${n}: gün esası seçimi Sonuç satırında (pencere yüksekliği artmaz)`, layout);
  } else {
    assert(layout.uygulaVisible, `${n}: Uygula düğmesi kaydırmadan görünür`, layout);
  }

  const months = dialog.locator('input[inputmode="decimal"]');
  const monthCount = await months.count();
  assert(monthCount === 12, `${n}: 12 ay alanı`, monthCount);
  for (let i = 0; i < monthCount; i += 1) await months.nth(i).fill("9125");
  await page.waitForTimeout(150);
  assert((await dialog.innerText()).includes("9.125,00"), `${n}: 360 sonucu 9.125,00`);

  await dialog.getByRole("radio", { name: "365 gün esasına göre" }).check();
  await page.waitForTimeout(150);
  const text365 = await dialog.innerText();
  assert(text365.includes("9.000,00"), `${n}: 365 seçilince sonuç anında 9.000,00`);
  assert(/\/\s*365\)\s*×\s*30/.test(text365), `${n}: formül metni 365`);
  assert(!/Kaydedilmemiş/.test(await stickyText(page)), `${n}: 365 seçimi Uygula'dan önce forma yazılmaz`);

  await dialog.getByRole("radio", { name: "360 gün esasına göre" }).check();
  await page.waitForTimeout(150);
  assert((await dialog.innerText()).includes("9.125,00"), `${n}: tekrar 360 → 9.125,00`);
  await dialog.getByRole("radio", { name: "365 gün esasına göre" }).check();
  await page.waitForTimeout(150);

  if (index === 0 || index === 5) {
    await page.screenshot({ path: path.join(SHOT_DIR, `${index === 0 ? "kidem" : "ihbar"}-365-modal.png`) });
  }

  await dialog.getByRole("button", { name: "Uygula" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  const values1 = await mainMoneyValues(page);
  assert(values1.some((v) => digitsOnly(v) === "9000,00"), `${n}: Uygula → alana 9.000,00 yazıldı`, values1);

  // Sayfa içinde seçim korunur
  await eklentiButtons(page).first().click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  assert(JSON.stringify(await radioState(dialog)) === JSON.stringify({ r360: false, r365: true }), `${n}: pencere yeniden açılınca 365 korunur`);
  await dialog.getByRole("button", { name: "İptal" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });

  // Kaydet (Güncelle) → payload'da 365
  const writesBefore = writes.length;
  await page.locator('[data-tour$="-kaydet-actions"] button').filter({ hasText: /Güncelle/ }).click();
  for (let t = 0; t < 50 && writes.length === writesBefore; t += 1) await page.waitForTimeout(100);
  const w = writes[writes.length - 1];
  const saved = writes.length > writesBefore ? w : null;
  assert(saved?.method === "PUT" && saved.id === p.legacyId, `${n}: mevcut kayıt güncellendi (PUT)`, saved && { method: saved.method, id: saved.id });
  assert(saved?.body?.type === p.type, `${n}: kayıt türü korunur (${p.type})`, saved?.body?.type);
  assert(saved?.body?.data?.form?.eklentiGunEsasi === 365, `${n}: payload form.eklentiGunEsasi = 365`, saved?.body?.data?.form?.eklentiGunEsasi);
  assert(saved?.body?.data?.formValues?.eklentiGunEsasi === 365, `${n}: payload formValues.eklentiGunEsasi = 365`);
  await page.waitForTimeout(300);
  assert(!/Kaydedilmemiş/.test(await stickyText(page)), `${n}: kayıt sonrası kaydedilmemiş değişiklik yok`);

  // Kayıt yeniden açılınca 365 geri yüklenir
  await openPage(page, base, p.route, p.legacyId);
  assert(!/Kaydedilmemiş/.test(await stickyText(page)), `${n}: 365 kaydı açılınca kaydedilmemiş değişiklik yok`);
  const values2 = await mainMoneyValues(page);
  assert(values2.some((v) => digitsOnly(v) === "9000,00"), `${n}: yeniden açılan kayıtta eklenti tutarı korunur`, values2);
  await eklentiButtons(page).first().click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  assert(JSON.stringify(await radioState(dialog)) === JSON.stringify({ r360: false, r365: true }), `${n}: yeniden açılan kayıtta 365 seçili`);
  await dialog.getByRole("button", { name: "İptal" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { host: "localhost", port: 5331, strictPort: false },
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] ?? "http://localhost:5331/").replace(/\/$/, "");
const appHost = new URL(base).host;

let browser;
try {
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
  for (let i = 0; i < PAGES.length; i += 1) {
    try {
      await runPage(page, base, PAGES[i], i);
    } catch (error) {
      assert(false, `${PAGES[i].name}: akış tamamlandı`, String(error?.message ?? error).slice(0, 400));
      await page.screenshot({ path: path.join(SHOT_DIR, `hata-${i}.png`) }).catch(() => undefined);
    }
  }
} catch (error) {
  assert(false, "test akışı tamamlandı", String(error?.stack ?? error).slice(0, 800));
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.message}${r.detail === undefined ? "" : ` ${JSON.stringify(r.detail)}`}`);
console.log(`eklentiGunEsasi.browser.test: ${results.length - failed.length}/${results.length} geçti; ekran görüntüleri: ${SHOT_DIR}`);
process.exit(failed.length > 0 ? 1 : 0);
