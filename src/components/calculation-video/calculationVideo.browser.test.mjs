/**
 * Gerçek uygulama üzerinde video düğmesi ve modal testi (Playwright).
 * Çalıştır (proje kökünden): node src/components/calculation-video/calculationVideo.browser.test.mjs
 *
 * - Web: Vite dev sunucusu + Chromium. Backend gerekmez; test tarayıcısına yerel oturum/lisans önbelleği yazılır.
 * - Desktop: Vite dev sunucusu + gerçek Electron penceresi, geçici --user-data-dir ile (gerçek veritabanına dokunmaz).
 * Örnek link yalnız bellekte, sunucu dönüşümüyle "kidem-borclar-kanunu" satırına yazılır; dosya değişmez.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const isDesktop = existsSync(path.join(root, "electron", "main.ts"));
if (isDesktop) process.env.ELECTRON_SKIP = "1";

const { createServer } = await import("vite");
const { chromium, _electron } = await import("playwright");

const PROJECT = path.basename(root);
const SAMPLE_KEY = "kidem-is-kanunu";
const SAMPLE_TITLE = "Kıdem Tazminatı — İş Kanununa Göre";
const SAMPLE_ID = "M7lc1UVf-VE";
const SAMPLE_URL = `https://www.youtube.com/watch?v=${SAMPLE_ID}`;
const SAMPLE_ROUTE = "/kidem-tazminati/30isci";
const OTHER_ROUTES = ["/kidem-tazminati/borclar", "/ihbar-tazminati/30isci", "/fazla-mesai/standart"];
const SHOT_DIR = path.join(os.tmpdir(), "calc-video-shots");
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function assert(condition, message, detail) {
  results.push({ ok: Boolean(condition), message, ...(detail === undefined ? {} : { detail }) });
}

function sampleLinkPlugin() {
  return {
    name: "calculation-video-sample-link",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/config/calculationVideoLinks.ts")) return null;
      const pattern = new RegExp(`("${SAMPLE_KEY}": \\{[\\s\\S]*?youtubeUrl: )""`);
      const next = code.replace(pattern, `$1"${SAMPLE_URL}"`);
      if (next === code) throw new Error("örnek link config satırına yazılamadı");
      return next;
    },
  };
}

const TEST_ME = {
  id: 1,
  email: "video-test@local",
  name: "Video Test",
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
  const token = fakeJwt({ userId: 1, id: 1, email: "video-test@local", role: "user", tenantId: 1, exp });
  const user = { id: 1, email: "video-test@local", name: "Video Test", role: "user" };
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
    if (sessionStorage.getItem("__video_test_seeded")) return;
    sessionStorage.setItem("__video_test_seeded", "1");
    localStorage.setItem("access_token", ${JSON.stringify(token)});
    localStorage.setItem("refresh_token", "test");
    localStorage.setItem("token_expiry", String(Date.now() + 24 * 3600 * 1000));
    localStorage.setItem("current_user", ${JSON.stringify(JSON.stringify(user))});
    localStorage.setItem("tenant_id", "1");
    localStorage.setItem("user_id", "1");
    localStorage.setItem("email", "video-test@local");
    localStorage.setItem("v35_session", "1");
    localStorage.setItem("v35_license_access_v1", ${JSON.stringify(JSON.stringify(license))});
  })();`;
}

async function goto(page, base, route) {
  if (isDesktop) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, `#${route}`);
  } else {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  }
  const expectedPath = route.split("?")[0].replace(/\/+$/, "");
  await page.waitForFunction(
    (expected) => {
      const current = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : window.location.pathname;
      return current.split("?")[0].replace(/\/+$/, "") === expected && document.querySelector("main") !== null;
    },
    expectedPath,
    { timeout: 30000 },
  );
  await page.waitForTimeout(800);
}

const videoButton = (page) => page.locator("[data-calculation-video]");
const dialog = (page) => page.locator('[role="dialog"][aria-modal="true"]');

async function fillCalculationForm(page) {
  const main = page.locator("main");
  const dates = main.locator('input[type="date"]:visible');
  const dateCount = await dates.count();
  if (dateCount >= 2) {
    await dates.nth(0).fill("2015-03-01");
    await dates.nth(1).fill("2024-06-30");
  }
  const moneyInputs = main.locator('input[inputmode="decimal"]:visible, input[type="number"]:visible');
  const count = await moneyInputs.count();
  let wageFilled = false;
  for (let i = 0; i < count && !wageFilled; i += 1) {
    const input = moneyInputs.nth(i);
    if (await input.isEditable()) {
      await input.fill("50000");
      await input.press("Tab");
      wageFilled = true;
    }
  }
  const calc = main.getByRole("button", { name: /^hesapla/i });
  if ((await calc.count()) > 0 && (await calc.first().isEnabled())) {
    await calc.first().click();
    await page.waitForTimeout(800);
  }
  return { dateCount, wageFilled };
}

async function snapshotMain(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const fields = Array.from(main.querySelectorAll("input, select, textarea")).map((el) =>
      el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? String(el.checked) : el.value,
    );
    return { fields, text: main.innerText };
  });
}

async function mainScrollState(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    return { windowY: window.scrollY, mainTop: main ? main.scrollTop : 0 };
  });
}

async function scrollMainDown(page) {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = 240;
    window.scrollTo(0, 240);
  });
}

async function headerOrder(page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 ? { left: Math.round(r.left), right: Math.round(r.right) } : null;
    };
    return {
      egitim: box(header?.querySelector('a[title="Eğitim Videoları"]')),
      video: box(header?.querySelector("[data-calculation-video]")),
      baslik: box(header?.querySelector("h1")),
    };
  });
}

async function runFlow(page, base, context) {
  await page.evaluate(() => localStorage.setItem("bh.guidedTour.autoWelcomeSeen.v1", "true"));
  // Örnek link başka hesaplama sayfalarında görünmez
  for (const route of OTHER_ROUTES) {
    await goto(page, base, route);
    assert((await videoButton(page).count()) === 0, `düğme yok: ${route}`);
  }
  const noVideoOrder = await headerOrder(page);
  assert(
    noVideoOrder.egitim && noVideoOrder.baslik && !noVideoOrder.video && noVideoOrder.egitim.right <= noVideoOrder.baslik.left,
    "videosuz sayfada sıra: Eğitim Videoları → Sayfa Adı",
    noVideoOrder,
  );

  await goto(page, base, `${SAMPLE_ROUTE}/?kaynak=test`);
  const button = videoButton(page);
  assert((await button.count()) === 1, "query ve sondaki eğik çizgiyle düğme görünür");
  if (isDesktop) {
    await goto(page, base, "/kidem-tazminati/is-kanunu");
    assert((await button.getAttribute("data-calculation-video")) === SAMPLE_KEY, "desktop takma route'unda aynı düğme");
  }
  await goto(page, base, SAMPLE_ROUTE);
  assert((await button.count()) === 1, "ilgili sayfada tek düğme");
  assert((await button.getAttribute("data-calculation-video")) === SAMPLE_KEY, "düğme doğru pageKey'e bağlı");
  assert((await button.evaluate((el) => el.tagName)) === "BUTTON", "düğme <button> öğesi");
  assert((await button.innerText()).trim() === "Videoyu İzle", "düğme metni Videoyu İzle");
  const order = await headerOrder(page);
  assert(
    order.egitim &&
      order.video &&
      order.baslik &&
      order.egitim.right <= order.video.left &&
      order.video.left - order.egitim.right <= 12 &&
      order.video.right <= order.baslik.left,
    "sıra: Eğitim Videoları → Videoyu İzle → Sayfa Adı",
    order,
  );
  assert((await page.locator("header a[href*='youtu']").filter({ hasText: "Videoyu İzle" }).count()) === 0, "video düğmesi bağlantı değil");

  const pristine = await snapshotMain(page);
  const form = await fillCalculationForm(page);
  await scrollMainDown(page);
  const before = await snapshotMain(page);
  assert(form.dateCount >= 2 && form.wageFilled, "hesap formu dolduruldu", form);
  assert(before && pristine && before.text !== pristine.text, "form doldurulunca hesap sonucu oluştu");
  const scrollBefore = await mainScrollState(page);
  assert(scrollBefore.windowY > 0 || scrollBefore.mainTop > 0, "test öncesi sayfa aşağı kaydırıldı", scrollBefore);
  const urlBefore = page.url();
  await page.screenshot({ path: path.join(SHOT_DIR, `${PROJECT}-1-sayfa.png`) });

  // Aç → kapat düğmesi
  await button.click();
  await dialog(page).waitFor({ state: "visible" });
  const iframe = dialog(page).locator("iframe");
  const src = await iframe.getAttribute("src");
  assert(src?.startsWith(`https://www.youtube-nocookie.com/embed/${SAMPLE_ID}?`), "iframe youtube-nocookie embed", src);
  assert((await iframe.getAttribute("allowfullscreen")) !== null, "iframe allowfullscreen");
  assert(((await iframe.getAttribute("allow")) ?? "").includes("fullscreen"), "iframe allow=fullscreen");
  const labelled = await dialog(page).evaluate((el) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent);
  assert(labelled === SAMPLE_TITLE, "dialog başlığı config title", labelled);
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Videoyu kapat",
    "odak kapat düğmesinde",
  );
  assert((await page.evaluate(() => document.documentElement.style.overflow)) === "hidden", "arka sayfa kaydırması kilitli");
  const box = await dialog(page).locator("iframe").boundingBox();
  assert(box && Math.abs(box.width / box.height - 16 / 9) < 0.02, "video 16:9", box);
  const scrollOpened = await mainScrollState(page);
  await page.mouse.move(8, 400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const scrollAfterWheel = await mainScrollState(page);
  assert(
    JSON.stringify(scrollAfterWheel) === JSON.stringify(scrollBefore),
    "modal açıkken arka sayfa kaymadı",
    { once: scrollBefore, acilinca: scrollOpened, tekerSonrasi: scrollAfterWheel },
  );
  assert(page.url() === urlBefore, "modal açılınca adres değişmedi");

  let player = null;
  try {
    const frame = await (await iframe.elementHandle())?.contentFrame();
    if (frame) {
      await frame.waitForSelector(".html5-video-player, .ytp-error", { timeout: 25000 }).catch(() => undefined);
      player = await frame.evaluate(() => ({
        fullscreenEnabled: document.fullscreenEnabled,
        player: Boolean(document.querySelector(".html5-video-player")),
        error: document.querySelector(".ytp-error")?.textContent?.trim() || null,
      }));
    }
  } catch (error) {
    player = { unavailable: String(error?.message ?? error).slice(0, 120) };
  }
  assert(player && player.fullscreenEnabled === true && player.player && !player.error, "YouTube oynatıcı iframe içinde açıldı, tam ekran izinli", player);
  await page.screenshot({ path: path.join(SHOT_DIR, `${PROJECT}-2-modal.png`) });

  await dialog(page).getByRole("button", { name: "Videoyu kapat" }).click();
  assert((await dialog(page).count()) === 0 && (await page.locator("iframe[src*='youtube']").count()) === 0, "kapat → modal ve iframe DOM'dan kalktı");
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute("data-calculation-video"))) === SAMPLE_KEY,
    "kapanınca odak düğmeye döndü",
  );
  assert((await page.evaluate(() => document.documentElement.style.overflow)) !== "hidden", "kapanınca kaydırma kilidi kalktı");
  assert(
    JSON.stringify(await mainScrollState(page)) === JSON.stringify(scrollBefore),
    "kapanınca sayfa aynı kaydırma konumunda",
    { once: scrollBefore, sonra: await mainScrollState(page) },
  );

  // Escape
  await button.click();
  await dialog(page).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert((await dialog(page).count()) === 0 && (await page.locator("iframe[src*='youtube']").count()) === 0, "Escape → modal ve iframe kalktı");

  // Dışarı tıklama; içeri tıklama kapatmaz
  await button.click();
  await dialog(page).waitFor({ state: "visible" });
  await dialog(page).locator("h2").click();
  assert((await dialog(page).count()) === 1, "modal içine tıklama kapatmaz");
  await page.mouse.click(4, 4);
  assert((await dialog(page).count()) === 0 && (await page.locator("iframe[src*='youtube']").count()) === 0, "dışarı tıklama → modal ve iframe kalktı");

  // Tab odağı dialog içinde kalır
  await button.click();
  await dialog(page).waitFor({ state: "visible" });
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
  assert(await dialog(page).evaluate((el) => el.contains(document.activeElement)), "Tab odağı dialog içinde");
  await page.keyboard.press("Shift+Tab");
  assert(await dialog(page).evaluate((el) => el.contains(document.activeElement)), "Shift+Tab odağı dialog içinde");
  await dialog(page).getByRole("button", { name: "Videoyu kapat" }).click();
  assert((await dialog(page).count()) === 0, "odak testi sonrası modal kapandı");

  const after = await snapshotMain(page);
  assert(JSON.stringify(after) === JSON.stringify(before), "modal aç/kapat form verisini ve sonucu değiştirmedi", {
    doldurulan: form,
    alanSayisi: before?.fields.length,
    doluAlan: before?.fields.filter((value) => value && value !== "false").length,
  });

  // İnternet yok: sayfa çalışır, modal sade mesaj gösterir
  let offlineSupported = true;
  await context.setOffline(true).catch(() => {
    offlineSupported = false;
  });
  if (!offlineSupported) {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
  }
  {
    await button.click();
    await dialog(page).waitFor({ state: "visible" });
    const offlineText = await dialog(page).innerText();
    assert(/Video yüklenemedi/.test(offlineText) && (await dialog(page).locator("iframe").count()) === 0, "çevrimdışı mesajı, iframe yok");
    await page.screenshot({ path: path.join(SHOT_DIR, `${PROJECT}-3-cevrimdisi.png`) });
    await page.keyboard.press("Escape");
    if (offlineSupported) {
      await context.setOffline(false);
    } else {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
        window.dispatchEvent(new Event("online"));
      });
    }
    assert(JSON.stringify(await snapshotMain(page)) === JSON.stringify(before), "çevrimdışı modal sonrası sayfa aynı");
  }
}

async function runMobile(page, base) {
  await page.setViewportSize({ width: 375, height: 740 });
  await goto(page, base, SAMPLE_ROUTE);
  const button = videoButton(page);
  const box = await button.boundingBox();
  const overflow = await page.evaluate(() => {
    const header = document.querySelector("header");
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      header: header ? header.scrollWidth - header.clientWidth : 0,
    };
  });
  assert(box && box.x >= 0 && box.x + box.width <= 375, "mobil: düğme ekranda", box);
  assert(overflow.doc <= 0 && overflow.header <= 0, "mobil: üst bar taşmıyor", overflow);
  await button.click();
  await dialog(page).waitFor({ state: "visible" });
  const dialogBox = await dialog(page).boundingBox();
  const frameBox = await dialog(page).locator("iframe").boundingBox();
  assert(dialogBox && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 375, "mobil: modal genişliğe sığıyor", dialogBox);
  assert(frameBox && Math.abs(frameBox.width / frameBox.height - 16 / 9) < 0.02, "mobil: video 16:9", frameBox);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOT_DIR, `${PROJECT}-4-mobil.png`) });
  await page.keyboard.press("Escape");
}

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { host: "localhost", port: 5320, strictPort: false },
  plugins: [sampleLinkPlugin()],
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] ?? "http://localhost:5320/").replace(/\/$/, "");

let browser;
let electronApp;
let userDataDir;
try {
  if (isDesktop) {
    const require = createRequire(path.join(root, "package.json"));
    userDataDir = mkdtempSync(path.join(os.tmpdir(), "bilirkisi-video-test-"));
    electronApp = await _electron.launch({
      executablePath: require("electron"),
      args: [root, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, VITE_DEV_SERVER_URL: `${base}/`, NODE_ENV: "development" },
      timeout: 60000,
    });
    const page = await electronApp.firstWindow();
    await page.waitForSelector("main", { timeout: 60000 });
    const userData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    assert(path.resolve(userData) === path.resolve(userDataDir), "Electron geçici veri klasörüyle çalıştı", userData);
    await runFlow(page, base, page.context());
    assert(existsSync(path.join(userDataDir, "data", "bilirkisi.sqlite")), "test veritabanı geçici klasörde");
  } else {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    await context.addInitScript(webSessionScript());
    const appHost = new URL(base).host;
    await context.route((url) => url.host === appHost && /^\/(api|uploads)\//.test(url.pathname), (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/auth/me")) {
        return route.fulfill({ json: TEST_ME });
      }
      return route.fulfill({ json: url.pathname.includes("notification") ? [] : {} });
    });
    const page = await context.newPage();
    await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded" });
    await runFlow(page, base, context);
    await runMobile(page, base);
  }
} catch (error) {
  assert(false, "test akışı tamamlandı", String(error?.stack ?? error).slice(0, 800));
} finally {
  await electronApp?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.message}${r.detail === undefined ? "" : ` ${JSON.stringify(r.detail)}`}`);
console.log(`${PROJECT}: ${results.length - failed.length}/${results.length} geçti; ekran görüntüleri: ${SHOT_DIR}`);
process.exit(failed.length > 0 ? 1 : 0);
