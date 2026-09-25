/**
 * Yandex Metrica güvenlik ve SPA davranış birim testleri.
 */
import assert from "node:assert/strict";
import { isPlatformAdminFromSources } from "@/auth/session";
import {
  YANDEX_GOAL,
  YANDEX_TAG_JS,
  TRACKED_PREFIXES,
  buildGoalParams,
  classifyTrackedAction,
  createYandexMetricaClient,
  foldLabel,
  isBlockedPath,
  isEnabledFlag,
  isTrackedPath,
  moduleNameFromPath,
  parseCounterId,
  readYandexMetricaEnv,
  resolvePageTitle,
  sanitizePath,
  shouldStartYandexTracker,
  queuedYmCalls,
  tagJsWouldSkipClientInit,
  yandexInitOptions,
  yandexWatchRequestPath,
} from "./yandexMetrica";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
}

check("enabled only exact true", isEnabledFlag("true"), true);
check("enabled trims whitespace", isEnabledFlag(" true \n"), true);
check("enabled boolean true", isEnabledFlag(true), true);
check("enabled false string", isEnabledFlag("false"), false);
check("enabled missing", isEnabledFlag(undefined), false);
check("enabled 1 not enough", isEnabledFlag("1"), false);

check("counter numeric", parseCounterId("112580132"), 112580132);
check("counter numeric type", parseCounterId(112580132), 112580132);
check("counter trims", parseCounterId(" 112580132 "), 112580132);
check("counter rejects text", parseCounterId("abc"), null);
check("counter rejects empty", parseCounterId(""), null);
check("counter rejects float", parseCounterId("12.3"), null);

check("env both required", readYandexMetricaEnv("true", "112580132").enabled, true);
check("env missing flag", readYandexMetricaEnv(undefined, "112580132").enabled, false);
check("env missing id", readYandexMetricaEnv("true", undefined).enabled, false);
check("env false flag", readYandexMetricaEnv("false", "112580132").enabled, false);

check("sanitize query", sanitizePath("/kidem-tazminati/30isci?token=abc&email=a@b.com"), "/kidem-tazminati/30isci");
check("sanitize hash", sanitizePath("/dashboard#section"), "/dashboard");
check("sanitize both", sanitizePath("/login?next=/admin#x"), "/login");
check("sanitize absolute", sanitizePath("https://app.example.com/fazla-mesai/standart?id=9"), "/fazla-mesai/standart");
check("sanitize trailing slash", sanitizePath("/dashboard/"), "/dashboard");

check("blocked login", isBlockedPath("/login"), true);
check("blocked login query ignored", isBlockedPath("/login?token=xyz"), true);
check("blocked register", isBlockedPath("/register"), true);
check("blocked signup", isBlockedPath("/signup"), true);
check("blocked reset", isBlockedPath("/reset-password"), true);
check("blocked sifre sifirla", isBlockedPath("/sifre-sifirla"), true);
check("blocked activate", isBlockedPath("/activate/TOKEN"), true);
check("blocked aktivasyon", isBlockedPath("/aktivasyon"), true);
check("blocked admin", isBlockedPath("/admin/users"), true);
check("blocked admin root", isBlockedPath("/admin"), true);
check("blocked subscription expired", isBlockedPath("/subscription-expired"), true);
check("blocked professional license activation", isBlockedPath("/professional-license-activation"), true);

check("tracked dashboard", isTrackedPath("/dashboard"), true);
check("tracked kotu niyet", isTrackedPath("/kotu-niyet-tazminati"), true);
check("tracked kidem", isTrackedPath("/kidem-tazminati/30isci"), true);
check("tracked ihbar", isTrackedPath("/ihbar-tazminati/30isci"), true);
check("tracked fazla mesai", isTrackedPath("/fazla-mesai/standart"), true);
check("tracked yillik izin", isTrackedPath("/yillik-izin/standart"), true);
check("tracked hafta tatili", isTrackedPath("/hafta-tatili/standard"), true);
check("tracked calc with query", isTrackedPath("/kidem-tazminati/30isci?caseId=12"), true);
check("not tracked profile", isTrackedPath("/profile"), false);
check("not tracked profile tab", isTrackedPath("/profile?tab=saved"), false);
check("not tracked login", isTrackedPath("/login"), false);
check("not tracked register", isTrackedPath("/register"), false);
check("not tracked reset", isTrackedPath("/reset-password"), false);
check("not tracked activate", isTrackedPath("/activate"), false);
check("not tracked admin", isTrackedPath("/admin/analytics"), false);
check("not tracked subscription expired", isTrackedPath("/subscription-expired"), false);
check("not tracked professional license activation", isTrackedPath("/professional-license-activation"), false);

for (const prefix of TRACKED_PREFIXES) {
  check(`allow calc prefix ${prefix}`, isTrackedPath(prefix), true);
}

check(
  "normal user calc mounts",
  shouldStartYandexTracker({
    enabled: true,
    isPlatformAdmin: false,
    pathname: "/kotu-niyet-tazminati",
  }),
  true,
);
check(
  "platform admin never mounts",
  shouldStartYandexTracker({
    enabled: true,
    isPlatformAdmin: true,
    pathname: "/kotu-niyet-tazminati",
  }),
  false,
);
check(
  "login never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/login" }),
  false,
);
check(
  "register never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/register" }),
  false,
);
check(
  "reset never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/reset-password" }),
  false,
);
check(
  "activate never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/aktivasyon" }),
  false,
);
check(
  "profile never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/profile" }),
  false,
);
check(
  "admin route never mounts",
  shouldStartYandexTracker({ enabled: true, isPlatformAdmin: false, pathname: "/admin" }),
  false,
);
check(
  "env off never mounts",
  shouldStartYandexTracker({
    enabled: false,
    isPlatformAdmin: false,
    pathname: "/kotu-niyet-tazminati",
  }),
  false,
);

check("jwt user is not platform admin", isPlatformAdminFromSources("user", "user"), false);
check("jwt customer is not platform admin", isPlatformAdminFromSources("user", "customer"), false);
check("jwt wins over stale localStorage admin", isPlatformAdminFromSources("user", "admin"), false);
check("jwt admin is platform admin", isPlatformAdminFromSources("admin", "user"), true);
check("session admin fallback when jwt missing", isPlatformAdminFromSources(undefined, "admin"), true);
check("session user fallback when jwt missing", isPlatformAdminFromSources(undefined, "user"), false);
check("Kullanıcı display role is not admin", isPlatformAdminFromSources("user", "Kullanıcı"), false);

check("module dashboard", moduleNameFromPath("/dashboard"), "dashboard");
check("module kidem", moduleNameFromPath("/kidem-tazminati/30isci?x=1"), "kidem_30isci");
check("module kotu niyet", moduleNameFromPath("/kotu-niyet-tazminati"), "kotu_niyet");
check("goal params keys", Object.keys(buildGoalParams("/ucret-alacagi?email=a@b.com")).sort(), ["module", "route"]);
check("goal params clean route", buildGoalParams("/ucret-alacagi?email=a@b.com").route, "/ucret-alacagi");
check("goal params no email", JSON.stringify(buildGoalParams("/ucret-alacagi?email=a@b.com")).includes("email"), false);

check("title mapped", resolvePageTitle("Kıdem Tazminatı", "Bilirkişi Hesap"), "Kıdem Tazminatı");
check("title fallback", resolvePageTitle("  ", "Bilirkişi Hesap · Yönetim Paneli"), "Bilirkişi Hesap · Yönetim Paneli");

check("goal guide", classifyTrackedAction("Nasıl kullanılır?", "Nasıl kullanılır? Etkileşimli kılavuzu başlat"), YANDEX_GOAL.GUIDE_OPEN);
check("goal hesapla", classifyTrackedAction("Hesapla"), YANDEX_GOAL.CALCULATION_START);
check("goal bakiye hesapla", classifyTrackedAction("Bakiye Hesapla"), YANDEX_GOAL.CALCULATION_START);
check("goal kaydet", classifyTrackedAction("Kaydet"), YANDEX_GOAL.CALCULATION_SAVE);
check("goal guncelle", classifyTrackedAction("Güncelle"), YANDEX_GOAL.CALCULATION_SAVE);
check("goal pdf", classifyTrackedAction("PDF İndir"), YANDEX_GOAL.REPORT_CREATE);
check("goal reset", classifyTrackedAction("Yeni Hesaplama"), YANDEX_GOAL.CALCULATION_RESET);
check("goal temizle", classifyTrackedAction("Temizle"), YANDEX_GOAL.CALCULATION_RESET);
check("ignore katsayi uygula", classifyTrackedAction("Uygula", "Kat Sayı Hesapla"), null);
check("ignore kat sayi hesapla heading click", classifyTrackedAction("Kat Sayı Hesapla"), null);
check("ignore kaydediliyor", classifyTrackedAction("Kaydediliyor…"), null);
check("ignore hesaplama notu", classifyTrackedAction("Hesaplama Notu"), null);
check("fold tr", foldLabel("  PDF  İndir  "), "pdf indir");

const init = yandexInitOptions();
check("init must not set ssr", "ssr" in init, false);
check("init ssr would not abort tag.js", tagJsWouldSkipClientInit(init), false);
check("ssr true would abort constructor", tagJsWouldSkipClientInit({ ssr: true }), true);
check("init webvisor", init.webvisor, true);
check("init clickmap", init.clickmap, true);
check("init trackLinks", init.trackLinks, true);
check("init accurateTrackBounce", init.accurateTrackBounce, true);
check("init defer", init.defer, true);
check("watch path", yandexWatchRequestPath(112580132), "/watch/112580132");

type ScriptNode = {
  src: string;
  async: boolean;
  onerror: (() => void) | null;
  parentNode: { insertBefore: (node: ScriptNode, ref: ScriptNode) => void } | null;
  getAttribute(name: string): string;
};

function createMockHost() {
  const injected: ScriptNode[] = [];
  const liveScripts: ScriptNode[] = [
    {
      src: "",
      async: false,
      onerror: null,
      parentNode: {
        insertBefore() {
          throw new Error("insertBefore must not be used; append to head");
        },
      },
      getAttribute(name: string) {
        return name === "src" ? this.src : "";
      },
    },
    {
      src: "https://panel.test/assets/index.js",
      async: false,
      onerror: null,
      parentNode: {
        insertBefore() {
          throw new Error("insertBefore must not be used; append to head");
        },
      },
      getAttribute(name: string) {
        return name === "src" ? this.src : "";
      },
    },
  ];

  const win = {
    ym: undefined as undefined | ((...args: unknown[]) => void),
    location: { pathname: "/dashboard", origin: "https://app.test", search: "?token=secret", hash: "#x" },
  };

  const doc = {
    scripts: liveScripts,
    getElementsByTagName(tag: string) {
      if (tag === "script") return liveScripts;
      return [];
    },
    createElement(tag: string) {
      if (tag !== "script") throw new Error("unexpected");
      return {
        src: "",
        async: false,
        onerror: null,
        parentNode: null,
        getAttribute(name: string) {
          return name === "src" ? this.src : "";
        },
      } as ScriptNode;
    },
    head: {
      appendChild(node: ScriptNode) {
        injected.push(node);
        liveScripts.push(node);
      },
    },
    body: { appendChild(node: ScriptNode) { injected.push(node); } },
    documentElement: { appendChild(node: ScriptNode) { injected.push(node); } },
  };

  return { win, doc, scripts: injected };
}

{
  const disabled = createYandexMetricaClient({ enabled: false, counterId: 112580132 });
  disabled.ensure();
  disabled.hit("/dashboard", "Yönetim Paneli");
  disabled.goal("guide_open", "/dashboard");
  check("disabled never inits", disabled.initStarted, false);
}

{
  const { win, doc, scripts } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => {
    collected.push(args);
  };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.ensure();
  client.ensure();
  client.ensure();
  check("script injected once", scripts.filter((s) => s.src === YANDEX_TAG_JS).length, 1);
  check("script src official tag.js", scripts[0]?.src, YANDEX_TAG_JS);
  check("init started once", client.initStarted, true);
  check(
    "ym init once",
    collected.filter((args) => args[1] === "init").length,
    1,
  );
}

{
  const { win, doc, scripts } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => {
    collected.push(args);
  };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.hit("/kotu-niyet-tazminati", "Kötü Niyet Tazminatı");
  client.hit("/kotu-niyet-tazminati", "Kötü Niyet Tazminatı");
  check("strict-mode double hit is one", collected.filter((args) => args[1] === "hit").length, 1);
  check("strict-mode still one script", scripts.filter((s) => s.src === YANDEX_TAG_JS).length, 1);
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => {
    collected.push(args);
  };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  win.location.pathname = "/kidem-tazminati/30isci";
  client.hit("/kidem-tazminati/30isci?token=abc&email=user@test.com", "Kıdem Tazminatı — İş Kanununa Göre");
  client.hit("/kidem-tazminati/30isci?token=abc", "Kıdem Tazminatı — İş Kanununa Göre");
  client.hit("/fazla-mesai/standart?case=1", "Fazla Mesai — Standart");

  const hits = collected.filter((args) => args[1] === "hit");
  check("first hit not doubled", hits.length, 2);
  check("hit url is pathname only", hits[0]?.[2], "/kidem-tazminati/30isci");
  check("second route hit", hits[1]?.[2], "/fazla-mesai/standart");
  check("hit has no query", String(hits[0]?.[2]).includes("?"), false);
  check("hit has no hash", String(hits[0]?.[2]).includes("#"), false);
  check("hit has no token", JSON.stringify(hits).includes("token"), false);
  check("hit has no email", JSON.stringify(hits).includes("email"), false);
  check("hit title turkish", (hits[0]?.[3] as { title?: string } | undefined)?.title, "Kıdem Tazminatı — İş Kanununa Göre");
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => collected.push(args);
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.hit("/login", "Giriş");
  client.hit("/register", "Kayıt");
  client.hit("/reset-password", "Sıfırla");
  client.hit("/activate", "Aktivasyon");
  client.hit("/profile", "Profilim");
  client.hit("/admin/users", "Kullanıcı Yönetimi");
  client.goal("guide_open", "/admin");
  client.goal("calculation_start", "/login");
  const hits = collected.filter((args) => args[1] === "hit");
  const goals = collected.filter((args) => args[1] === "reachGoal");
  check("no hit on auth/profile/admin", hits.length, 0);
  check("no goal on login/admin", goals.length, 0);
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => collected.push(args);
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.goal("guide_open", "/ucret-alacagi?token=abc");
  const goal = collected.find((args) => args[1] === "reachGoal");
  check("goal name", goal?.[2], "guide_open");
  check("goal params", goal?.[3], { route: "/ucret-alacagi", module: "ucret_alacagi" });
}

{
  const { win, doc, scripts } = createMockHost();
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.ensure();
  const injected = scripts.find((s) => s.src === YANDEX_TAG_JS);
  assert.ok(injected, "tag.js injected");
  assert.equal(injected?.src, "https://mc.yandex.ru/metrika/tag.js");
  assert.doesNotThrow(() => injected?.onerror?.());
  assert.doesNotThrow(() => client.hit("/dashboard", "Yönetim Paneli"));
  assert.doesNotThrow(() => client.goal("frontend_error", "/dashboard"));
}

{
  const { win, doc, scripts } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => collected.push(args);
  const client = createYandexMetricaClient({
    enabled: false,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.hit("/kotu-niyet-tazminati", "Kötü Niyet Tazminatı");
  check("env off no script", scripts.length, 0);
  check("env off no ym calls", collected.length, 0);
}

{
  const { win, doc, scripts } = createMockHost();
  type YmStub = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.hit("/kotu-niyet-tazminati?token=abc&email=a@b.com", "Kötü Niyet Tazminatı");
  client.hit("/kotu-niyet-tazminati", "Kötü Niyet Tazminatı");
  client.hit("/kidem-tazminati/30isci#top", "Kıdem Tazminatı — İş Kanununa Göre");
  client.goal("guide_open", "/kidem-tazminati/30isci?userId=9");

  const ym = win.ym as YmStub;
  assert.equal(typeof ym, "function");
  assert.ok(Array.isArray(ym.a), "ym.a queue exists before tag.js runs");
  assert.equal(typeof ym.l, "number");
  check("real stub injects tag.js once", scripts.filter((s) => s.src === YANDEX_TAG_JS).length, 1);

  const queued = queuedYmCalls(ym);
  check("queue has init, first hit, spa hit, goal", queued.length, 4);
  check("queue init method", queued[0]?.[1], "init");
  check("queue init id is number", queued[0]?.[0], 112580132);
  check("queue init id type", typeof queued[0]?.[0], "number");
  const initOpts = queued[0]?.[2] as Record<string, unknown>;
  check("queued init does not skip constructor", tagJsWouldSkipClientInit(initOpts), false);
  check("queued init has defer", initOpts.defer, true);
  check("queued init has webvisor", initOpts.webvisor, true);
  check("queue first hit method", queued[1]?.[1], "hit");
  check("queue first hit path", queued[1]?.[2], "/kotu-niyet-tazminati");
  check("queue spa hit path", queued[2]?.[2], "/kidem-tazminati/30isci");
  check("queue goal method", queued[3]?.[1], "reachGoal");
  check("queue goal name", queued[3]?.[2], "guide_open");
  check("queue has no query", JSON.stringify(queued).includes("?"), false);
  check("queue has no token", JSON.stringify(queued).includes("token"), false);
  check("queue has no email", JSON.stringify(queued).includes("email"), false);
  check("queue has no userId", JSON.stringify(queued).includes("userId"), false);

  const watchRequests: string[] = [];
  const applied: unknown[][] = [];
  let counter: { hit: (...args: unknown[]) => void; reachGoal: (...args: unknown[]) => void } | null = null;

  const replayLikeTagJs = (item: unknown) => {
    const args = Array.from(item as ArrayLike<unknown>);
    const id = args[0];
    const method = args[1];
    const rest = args.slice(2);
    if (method === "init") {
      if (tagJsWouldSkipClientInit(rest[0] as Record<string, unknown>)) return;
      if (typeof id !== "number" || id !== 112580132) throw new Error("bad counter id");
      counter = {
        hit(...hitArgs: unknown[]) {
          applied.push(["hit", ...hitArgs]);
          watchRequests.push(yandexWatchRequestPath(id));
        },
        reachGoal(...goalArgs: unknown[]) {
          applied.push(["reachGoal", ...goalArgs]);
        },
      };
      return;
    }
    if (!counter) return;
    const fn = (counter as Record<string, ((...args: unknown[]) => void) | undefined>)[String(method)];
    fn?.(...rest);
  };

  for (const item of ym.a ?? []) replayLikeTagJs(item);

  check("tag.js replay created counter", counter != null, true);
  check("replay first hit produced", applied[0]?.[0], "hit");
  check("replay first hit url", applied[0]?.[1], "/kotu-niyet-tazminati");
  check("replay spa hit url", applied[1]?.[1], "/kidem-tazminati/30isci");
  check("replay goal", applied[2], [
    "reachGoal",
    "guide_open",
    { route: "/kidem-tazminati/30isci", module: "kidem_30isci" },
  ]);
  check("watch request after first hit", watchRequests[0], "/watch/112580132");
  check("watch request after spa hit", watchRequests[1], "/watch/112580132");
  check("two counted visits", watchRequests.length, 2);
}

console.log("yandexMetrica.selftest: ok");
