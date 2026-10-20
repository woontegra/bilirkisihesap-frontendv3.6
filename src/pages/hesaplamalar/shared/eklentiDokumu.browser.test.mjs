/**
 * Kıdem/İhbar 12 aylık eklenti penceresi — aylık dökümün saklanması ve yeniden düzenlenmesi (Playwright).
 * Çalıştır (proje kökünden): node src/pages/hesaplamalar/shared/eklentiDokumu.browser.test.mjs
 *
 * Backend gerekmez: tüm /api/ istekleri bellekteki sahte kayıt deposuna yönlendirilir,
 * diğer dış istekler engellenir. Gerçek veritabanına veya kayıtlara dokunulmaz.
 * Beklenen tutarlar sayfa kodundan bağımsız olarak (toplam / gün esası) × 30 ile hesaplanır.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const { createServer } = await import("vite");
const { chromium } = await import("playwright");

const SHOT_DIR = path.join(os.tmpdir(), "eklenti-dokumu-shots");
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function assert(condition, message, detail) {
  results.push({ ok: Boolean(condition), message, ...(detail === undefined ? {} : { detail }) });
}

const TEST_ME = {
  id: 1,
  email: "eklenti-dokumu-test@local",
  name: "Eklenti Döküm Test",
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

/** 12 farklı aylık tutar (kullanıcının yazdığı biçim). */
const AYLAR = ["1000", "1100,50", "1200", "1350,25", "1400", "1500", "1625,75", "1700", "1800", "1950,60", "2000", "2100"];
const DEGISEN_AY_INDEX = 4;
const DEGISEN_AY_DEGERI = "2600";
const EKSTRA_AYLAR = Array.from({ length: 12 }, () => "600");

function parseTr(value) {
  const s = String(value ?? "").trim();
  if (!s) return 0;
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}
function eklentiBeklenen(aylar, gunEsasi) {
  return (aylar.reduce((acc, v) => acc + parseTr(v), 0) / gunEsasi) * 30;
}
function fmtTr(n) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function digitsOnly(value) {
  return String(value ?? "").replace(/\./g, "");
}

const DATES = { start: "2015-03-01", end: "2024-06-30" };
const MONEY = { brut: "30.000,00", prim: "1.500,00", ekstra: "300,00" };
const EXTRA = { id: "x1", name: "Yakacak", label: "Yakacak", value: MONEY.ekstra };

function kidemStd(withExtra) {
  return {
    ciplakBrut: MONEY.brut,
    prim: MONEY.prim,
    ikramiye: "",
    yol: "",
    yemek: "",
    diger: "",
    extras: withExtra ? [EXTRA] : [],
    notes: "",
  };
}
const periods = [{ id: "p1", start: DATES.start, end: DATES.end, days: 0 }];
function ihbarStd(withExtra) {
  return {
    startDate: DATES.start,
    endDate: DATES.end,
    brut: MONEY.brut,
    prim: MONEY.prim,
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: withExtra ? [EXTRA] : [],
    brutUcret: MONEY.brut,
    iseGiris: DATES.start,
    istenCikis: DATES.end,
    exitDate: DATES.end,
  };
}

const PAGES = [
  { name: "Kıdem — İş Kanunu", route: "/kidem-tazminati/30isci", type: "kidem_30isci", form: (x) => ({ iseGirisTarihi: DATES.start, istenCikisTarihi: DATES.end, ...kidemStd(x) }) },
  { name: "Kıdem — Basın İş", route: "/kidem-tazminati/basin", type: "kidem_basin", form: (x) => ({ meslegeBaslangic: "2010-01-01", iseGiris: DATES.start, istenCikis: DATES.end, denemeSuresiGun: "", ...kidemStd(x) }) },
  { name: "Kıdem — Gemi Adamları", route: "/kidem-tazminati/gemi", type: "kidem_gemi", form: (x) => ({ startDate: DATES.start, endDate: DATES.end, ...kidemStd(x) }) },
  { name: "Kıdem — Kısmi Süreli", route: "/kidem-tazminati/kismi-sureli", type: "kidem_kismi_sureli", form: (x) => ({ periods, totalDaysManual: "", isManualOverride: false, exitDateOverride: DATES.end, ...kidemStd(x) }) },
  { name: "Kıdem — Mevsimlik İşçi", route: "/kidem-tazminati/mevsimlik", type: "kidem_mevsimlik", form: (x) => ({ periods, manualTotalDaysOverride: "", ...kidemStd(x) }) },
  { name: "İhbar — İş Kanunu", route: "/ihbar-tazminati/30isci", type: "ihbar_30isci", form: ihbarStd },
  { name: "İhbar — Borçlar Kanunu", route: "/ihbar-tazminati/borclar", type: "ihbar_borclar", form: ihbarStd },
  { name: "İhbar — Gemi Adamları", route: "/ihbar-tazminati/gemi", type: "ihbar_gemi", form: ihbarStd },
  { name: "İhbar — Mevsimlik", route: "/ihbar-tazminati/mevsim", type: "ihbar_mevsim", form: ihbarStd },
  { name: "İhbar — Basın İş", route: "/ihbar-tazminati/basin", type: "ihbar_basin", form: (x) => ({ ...ihbarStd(x), meslegeBaslangic: "2010-01-01" }) },
  { name: "İhbar — Kısmi Süreli", route: "/ihbar-tazminati/kismi", type: "ihbar_kismi", form: ihbarStd },
  { name: "İhbar — Belirli Süreli", route: "/ihbar-tazminati/belirli", type: "ihbar_belirli", form: ihbarStd },
];

/** Sahte /api/saved-cases deposu (yalnızca bellekte). */
const store = new Map();
const writes = [];
function record(id, name, type, form) {
  return {
    id,
    name,
    type,
    createdAt: "2025-01-15T10:00:00.000Z",
    data: { form, formValues: form, brut_total: 100, net_total: 90, ise_giris: DATES.start, isten_cikis: DATES.end, results: { brut: 100, net: 90 } },
  };
}
PAGES.forEach((p, idx) => {
  // V3.6 kaydı: 365 seçili, ekstra kalemli, aylık döküm yok
  p.recordId = 9300 + idx;
  store.set(p.recordId, record(p.recordId, `Döküm testi ${idx + 1}`, p.type, { ...p.form(true), eklentiGunEsasi: 365 }));
  // V3.5 kaydı: gün esası ve döküm alanı yok
  p.legacyId = 9400 + idx;
  store.set(p.legacyId, record(p.legacyId, `Eski kayıt ${idx + 1}`, p.type, p.form(false)));
});
const legacySnapshots = new Map(PAGES.map((p) => [p.legacyId, JSON.stringify(store.get(p.legacyId))]));

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
      writes.push({ method, id, body: null });
      return route.fulfill({ status: 403, json: { message: "testte silme yok" } });
    }
  }
  return route.fulfill({ json: /notification/.test(url.pathname) ? [] : {} });
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
const isDirty = async (page) => /Kaydedilmemiş/.test(await stickyText(page));
const eklentiButtons = (page) => page.locator("main button").filter({ hasText: /^\s*Eklenti( Hesapla)?\s*$/ });
const eklentiDialog = (page) => page.locator('[role="dialog"]').filter({ hasText: "gün esasına göre" });

async function mainMoneyValues(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main input[inputmode="decimal"]')).map((el) => el.value),
  );
}

async function openEklenti(page, which) {
  const btns = eklentiButtons(page);
  await (which === "last" ? btns.last() : btns.first()).click();
  const dialog = eklentiDialog(page);
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  return dialog;
}

async function dialogState(dialog) {
  return dialog.evaluate((card) => ({
    aylar: Array.from(card.querySelectorAll('input[inputmode="decimal"]')).map((el) => el.value),
    r360: card.querySelector('input[type="radio"][value="360"]')?.checked ?? null,
    r365: card.querySelector('input[type="radio"][value="365"]')?.checked ?? null,
    sonuc: (card.innerText.match(/Sonuç:\s*([\d.,]+)/) ?? [])[1] ?? null,
  }));
}

async function fillMonths(dialog, values) {
  const inputs = dialog.locator('input[inputmode="decimal"]');
  for (let i = 0; i < values.length; i += 1) await inputs.nth(i).fill(values[i]);
  await dialog.page().waitForTimeout(120);
}

async function closeWith(dialog, label) {
  await dialog.getByRole("button", { name: label }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

async function clickSave(page) {
  const before = writes.length;
  await page.locator('[data-tour$="-kaydet-actions"] button').filter({ hasText: /Güncelle/ }).click();
  for (let t = 0; t < 60 && writes.length === before; t += 1) await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  return writes.length > before ? writes[writes.length - 1] : null;
}

const bos12 = JSON.stringify(Array.from({ length: 12 }, () => ""));

async function runPage(page, base, p, index) {
  const n = p.name;
  const primKeyOf = (dokumler) => ["field:prim", "fixed:prim"].find((k) => dokumler && k in dokumler);

  // 1) Dökümsüz V3.6 kaydı: tutarlar ve 365 korunur, pencere boş açılır
  await openPage(page, base, p.route, p.recordId);
  assert(!(await isDirty(page)), `${n}: dökümsüz kayıt açılınca değişiklik yok`);
  let values = await mainMoneyValues(page);
  assert(values.includes(MONEY.prim) && values.some((v) => digitsOnly(v) === "300,00"), `${n}: prim ve ekstra tutarı aynen geldi`, values);

  let dialog = await openEklenti(page, "first");
  let st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === bos12, `${n}: dökümsüz kayıtta aylar boş (tahmin yok)`, st.aylar);
  assert(st.r365 === true && st.r360 === false, `${n}: dökümsüz kayıtta kayıtlı 365 seçili`, st);
  assert(st.sonuc === "0,00", `${n}: boş pencerede sonuç 0,00`, st.sonuc);
  await closeWith(dialog, "İptal");
  assert((await mainMoneyValues(page)).includes(MONEY.prim), `${n}: boş pencereyi kapatmak tutarı değiştirmez`);
  assert(!(await isDirty(page)), `${n}: boş pencereyi kapatmak değişiklik oluşturmaz`);

  // 2) İptal: aylar ve gün esası taslakta kalır, forma yazılmaz
  dialog = await openEklenti(page, "first");
  await fillMonths(dialog, AYLAR);
  await dialog.getByRole("radio", { name: "360 gün esasına göre" }).check();
  await page.waitForTimeout(120);
  st = await dialogState(dialog);
  assert(st.sonuc === fmtTr(eklentiBeklenen(AYLAR, 360)), `${n}: 12 farklı ay, 360 sonucu ${fmtTr(eklentiBeklenen(AYLAR, 360))}`, st.sonuc);
  await closeWith(dialog, "İptal");
  assert((await mainMoneyValues(page)).includes(MONEY.prim), `${n}: İptal sonrası prim değişmez`);
  assert(!(await isDirty(page)), `${n}: İptal sonrası değişiklik yok`);
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === bos12 && st.r365 === true, `${n}: İptal edilen aylar ve 360 seçimi geri gelmez`, st);
  await fillMonths(dialog, AYLAR);
  await page.locator('[role="presentation"]').last().click({ position: { x: 4, y: 4 } });
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  assert((await mainMoneyValues(page)).includes(MONEY.prim) && !(await isDirty(page)), `${n}: dışarı tıklayıp kapatmak da veri değiştirmez`);

  // 3) Uygula: 365 ile 12 farklı ay
  dialog = await openEklenti(page, "first");
  await fillMonths(dialog, AYLAR);
  st = await dialogState(dialog);
  const beklenen365 = eklentiBeklenen(AYLAR, 365);
  assert(st.r365 === true && st.sonuc === fmtTr(beklenen365), `${n}: 365 sonucu ${fmtTr(beklenen365)}`, st);
  const girilenAylar = st.aylar;
  await closeWith(dialog, "Uygula");
  values = await mainMoneyValues(page);
  assert(values.some((v) => digitsOnly(v) === digitsOnly(fmtTr(beklenen365))) && !values.includes(MONEY.prim), `${n}: Uygula → prim ${fmtTr(beklenen365)}`, values);
  assert(await isDirty(page), `${n}: Uygula sonrası kaydedilmemiş değişiklik görünür`);

  // 4) Aynı sayfada yeniden aç: değerler ve 365 korunur; tek ay değişince yeni sonuç
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === JSON.stringify(girilenAylar) && st.r365 === true, `${n}: pencere uygulanan 12 ay ve 365 ile açılır`, st);
  assert(st.sonuc === fmtTr(beklenen365), `${n}: yeniden açılınca sonuç aynı`, st.sonuc);
  await dialog.locator('input[inputmode="decimal"]').nth(DEGISEN_AY_INDEX).fill(DEGISEN_AY_DEGERI);
  await page.waitForTimeout(120);
  const yeniAylar = AYLAR.map((v, i) => (i === DEGISEN_AY_INDEX ? DEGISEN_AY_DEGERI : v));
  const beklenenYeni = eklentiBeklenen(yeniAylar, 365);
  st = await dialogState(dialog);
  assert(st.sonuc === fmtTr(beklenenYeni), `${n}: yalnızca 5. ay değişince sonuç ${fmtTr(beklenenYeni)}`, st.sonuc);
  const duzenlenenAylar = st.aylar;
  await closeWith(dialog, "Uygula");
  values = await mainMoneyValues(page);
  assert(values.some((v) => digitsOnly(v) === digitsOnly(fmtTr(beklenenYeni))), `${n}: tek ay düzenlemesi ana forma aktarıldı`, values);

  // 5) Ekstra kalem: kendi dökümü ve kendi gün esası (360)
  dialog = await openEklenti(page, "last");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === bos12, `${n}: ekstra kalemin penceresi prim aylarını göstermez`, st.aylar);
  await fillMonths(dialog, EKSTRA_AYLAR);
  await dialog.getByRole("radio", { name: "360 gün esasına göre" }).check();
  await page.waitForTimeout(120);
  st = await dialogState(dialog);
  assert(st.sonuc === "600,00", `${n}: ekstra 360 sonucu 600,00`, st.sonuc);
  await closeWith(dialog, "Uygula");
  values = await mainMoneyValues(page);
  assert(values.some((v) => digitsOnly(v) === "600,00"), `${n}: ekstra kalem 600,00 oldu`, values);
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(st.r365 === true && st.sonuc === fmtTr(beklenenYeni), `${n}: prim penceresi kendi 365 tercihini korur`, st);
  await closeWith(dialog, "İptal");

  // 6) Kaydet → payload
  const saved = await clickSave(page);
  assert(saved?.method === "PUT" && saved.id === p.recordId, `${n}: mevcut kayıt güncellendi (PUT)`, saved && { method: saved.method, id: saved.id });
  const form = saved?.body?.data?.form ?? {};
  const dokumler = form.eklentiDokumleri;
  const primKey = primKeyOf(dokumler);
  assert(!!primKey, `${n}: payload prim dökümünü içerir`, dokumler && Object.keys(dokumler));
  assert(JSON.stringify(dokumler?.[primKey]?.aylar) === JSON.stringify(duzenlenenAylar) && dokumler?.[primKey]?.gunEsasi === 365, `${n}: payload prim aylar + 365`, dokumler?.[primKey]);
  assert(JSON.stringify(dokumler?.["extra:x1"]?.aylar) === JSON.stringify(EKSTRA_AYLAR) && dokumler?.["extra:x1"]?.gunEsasi === 360, `${n}: payload ekstra aylar + 360`, dokumler?.["extra:x1"]);
  assert(JSON.stringify(saved?.body?.data?.formValues?.eklentiDokumleri) === JSON.stringify(dokumler), `${n}: formValues aynı dökümü taşır`);
  assert(digitsOnly(form.prim) === digitsOnly(fmtTr(beklenenYeni)) || Math.abs(parseTr(form.prim) - beklenenYeni) < 0.006, `${n}: payload prim tutarı`, form.prim);
  assert(saved?.body?.type === p.type, `${n}: kayıt türü korunur`, saved?.body?.type);
  assert(!(await isDirty(page)), `${n}: kayıt sonrası değişiklik yok`);

  // 7) Kapat → yeniden aç
  await openPage(page, base, p.route, p.recordId);
  assert(!(await isDirty(page)), `${n}: dökümlü kayıt açılınca değişiklik yok`);
  values = await mainMoneyValues(page);
  assert(values.some((v) => digitsOnly(v) === digitsOnly(fmtTr(beklenenYeni))) && values.some((v) => digitsOnly(v) === "600,00"), `${n}: yeniden açılınca tutarlar aynı`, values);
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === JSON.stringify(duzenlenenAylar), `${n}: yeniden açılan kayıtta 12 ay aynen geldi`, st.aylar);
  assert(st.r365 === true && st.sonuc === fmtTr(beklenenYeni), `${n}: yeniden açılan kayıtta 365 ve sonuç aynı`, st);
  if (index === 0 || index === 5) {
    await page.screenshot({ path: path.join(SHOT_DIR, `${index === 0 ? "kidem" : "ihbar"}-yeniden-acilan-dokum.png`) });
  }
  await closeWith(dialog, "İptal");
  dialog = await openEklenti(page, "last");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === JSON.stringify(EKSTRA_AYLAR) && st.r360 === true, `${n}: ekstra kalemin dökümü ve 360 geri geldi`, st);
  await closeWith(dialog, "İptal");
  assert(!(await isDirty(page)), `${n}: yalnızca açıp kapatmak değişiklik oluşturmaz`);

  // 8) Yeni Hesaplama: alanlar sıfırlanır, kayıt etkilenmez
  const writesBeforeNew = writes.length;
  await page.locator("main button").filter({ hasText: /^\s*Yeni Hesaplama\s*$/ }).first().click();
  await page.waitForTimeout(500);
  values = await mainMoneyValues(page);
  assert(!values.some((v) => digitsOnly(v) === digitsOnly(fmtTr(beklenenYeni))), `${n}: Yeni Hesaplama prim tutarını temizler`, values);
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === bos12 && st.r360 === true, `${n}: Yeni Hesaplama'da pencere boş ve 360`, st);
  await closeWith(dialog, "İptal");
  assert(writes.length === writesBeforeNew, `${n}: Yeni Hesaplama kayda yazmaz`);
  const storedForm = store.get(p.recordId)?.data?.form;
  assert(JSON.stringify(storedForm?.eklentiDokumleri?.[primKey]?.aylar) === JSON.stringify(duzenlenenAylar), `${n}: kayıttaki döküm Yeni Hesaplama'dan etkilenmez`);

  // 9) V3.5 kaydı: önceki kaydın aylık değerleri sızmaz, 360 açılır
  await openPage(page, base, p.route, p.legacyId);
  assert(!(await isDirty(page)), `${n}: V3.5 kaydı açılınca değişiklik yok`);
  assert((await mainMoneyValues(page)).includes(MONEY.prim), `${n}: V3.5 kaydı prim tutarı korunur`);
  dialog = await openEklenti(page, "first");
  st = await dialogState(dialog);
  assert(JSON.stringify(st.aylar) === bos12 && st.r360 === true && st.sonuc === "0,00", `${n}: V3.5 kaydında pencere boş, 360, 0,00`, st);
  await closeWith(dialog, "İptal");
  assert((await mainMoneyValues(page)).includes(MONEY.prim) && !(await isDirty(page)), `${n}: V3.5 kaydında pencereyi kapatmak veri değiştirmez`);
  assert(store.get(p.legacyId) && JSON.stringify(store.get(p.legacyId)) === legacySnapshots.get(p.legacyId), `${n}: V3.5 kaydına hiç yazılmadı`);
}

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { host: "localhost", port: 5334, strictPort: false },
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] ?? "http://localhost:5334/").replace(/\/$/, "");
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
  const touched = new Set(writes.map((w) => w.id));
  const allowed = new Set(PAGES.map((p) => p.recordId));
  assert([...touched].every((id) => allowed.has(id)) && writes.every((w) => w.method === "PUT"), "yalnızca test kayıtları PUT ile güncellendi", writes.map((w) => `${w.method} ${w.id}`));
} catch (error) {
  assert(false, "test akışı tamamlandı", String(error?.stack ?? error).slice(0, 800));
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.message}${r.detail === undefined ? "" : ` ${JSON.stringify(r.detail)}`}`);
console.log(`eklentiDokumu.browser.test: ${results.length - failed.length}/${results.length} geçti; ekran görüntüleri: ${SHOT_DIR}`);
process.exit(failed.length > 0 ? 1 : 0);
