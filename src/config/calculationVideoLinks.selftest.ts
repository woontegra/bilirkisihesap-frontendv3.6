/**
 * Çalıştır: npx vite-node --config vite.config.ts src/config/calculationVideoLinks.selftest.ts
 * Router'daki her gerçek hesaplama sayfasının video dosyasında tam bir satırı olduğunu ve düğme kurallarını denetler.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import appSource from "@/App.tsx?raw";
import buttonSource from "@/components/calculation-video/CalculationVideoButton.tsx?raw";
import modalSource from "@/components/calculation-video/CalculationVideoModal.tsx?raw";
import {
  buildYoutubeEmbedUrl,
  CalculationVideoButton,
  extractYoutubeVideoId,
  findCalculationPageKey,
  normalizeCalculationRoute,
  resolveCalculationVideo,
  type CalculationVideoLinkTable,
} from "@/components/calculation-video";
import { calculationVideoLinks } from "./calculationVideoLinks";
import configSource from "./calculationVideoLinks.ts?raw";

/** Hesaplama olmayan route'lar; yeni bir route ne buraya ne video dosyasına eklenmişse test hata verir. */
const NON_CALCULATION_ROUTES = new Set([
  "/",
  "*",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/subscription-expired",
  "/dashboard",
  "/profile",
  "/profile/saved-calculations",
  "/kayitli-hesaplamalar",
  "/yedekleme",
  "/ayarlar",
  "/lisans",
  "/araclar/manuel-brut-ucret",
  // Varyant seçim ekranları (hesap yapmaz, alt sayfaya yönlendirir)
  "/kidem-tazminati",
  "/fazla-mesai",
  "/ihbar-tazminati",
  "/yillik-izin",
  "/ubgt",
  "/hafta-tatili",
  "/icra-takip-brutten-nete",
]);

const SAMPLE_PAGE_KEY = "kidem-borclar-kanunu";
const SAMPLE_VIDEO_ID = "M7lc1UVf-VE";
const SAMPLE_URL = `https://youtu.be/${SAMPLE_VIDEO_ID}`;

const failures: string[] = [];
function check(condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}

function routerPaths(source: string): string[] {
  const paths: string[] = [];
  const pattern = /<Route\b[^>]*?\bpath="([^"]+)"/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    paths.push(match[1] === "*" ? "*" : normalizeCalculationRoute(match[1]));
  }
  if (/<Route\b[^>]*?\bindex\b/.test(source)) paths.push("/");
  return paths;
}

function isExcluded(route: string): boolean {
  return NON_CALCULATION_ROUTES.has(route) || route === "/admin" || route.startsWith("/admin/");
}

const links: CalculationVideoLinkTable = calculationVideoLinks;
const entries = Object.entries(links);

// 1) Route kapsamı
const appRoutes = new Set(routerPaths(appSource));
const calculationRoutes = [...appRoutes].filter((route) => !isExcluded(route)).sort();
const routeOwners = new Map<string, string[]>();
for (const [pageKey, link] of entries) {
  check(link.routes.length > 0, `${pageKey}: routes boş`);
  for (const raw of link.routes) {
    const route = normalizeCalculationRoute(raw);
    check(route === raw, `${pageKey}: route normalize biçimde değil (${raw})`);
    check(appRoutes.has(route), `${pageKey}: route router'da yok (${raw})`);
    check(!isExcluded(route), `${pageKey}: hesaplama olmayan route eşlenmiş (${raw})`);
    routeOwners.set(route, [...(routeOwners.get(route) ?? []), pageKey]);
  }
}
for (const route of calculationRoutes) {
  const owners = routeOwners.get(route) ?? [];
  check(owners.length === 1, `route ${route}: video satırı sayısı ${owners.length} (${owners.join(", ") || "eksik"})`);
}

// 2) Anahtar ve başlıklar
const sourceKeys = [...configSource.matchAll(/^ {2}"([^"]+)":\s*\{/gm)].map((match) => match[1]);
const duplicateKeys = sourceKeys.filter((key, index) => sourceKeys.indexOf(key) !== index);
check(duplicateKeys.length === 0, `yinelenen pageKey: ${duplicateKeys.join(", ")}`);
check(sourceKeys.length === entries.length, `kaynak anahtar sayısı ${sourceKeys.length}, nesne ${entries.length}`);
const titles = entries.map(([, link]) => link.title.trim());
check(new Set(titles).size === titles.length, "yinelenen başlık var");
for (const [pageKey, link] of entries) {
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pageKey), `${pageKey}: pageKey kebab-case değil`);
  check(link.title.trim().length > 0, `${pageKey}: başlık boş`);
  check(typeof link.youtubeUrl === "string", `${pageKey}: youtubeUrl metin değil`);
  if (link.youtubeUrl.trim() !== "") {
    check(extractYoutubeVideoId(link.youtubeUrl) !== null, `${pageKey}: geçersiz YouTube linki (${link.youtubeUrl})`);
  }
}

// 3) YouTube bağlantıları
const accepted: Array<[string, string]> = [
  [`https://www.youtube.com/watch?v=${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`https://youtu.be/${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`https://www.youtube.com/shorts/${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`https://www.youtube.com/embed/${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`https://www.youtube.com/watch?v=${SAMPLE_VIDEO_ID}&t=42s&list=PL1`, SAMPLE_VIDEO_ID],
  [`https://youtu.be/${SAMPLE_VIDEO_ID}?si=abc`, SAMPLE_VIDEO_ID],
  [`https://www.youtube.com/shorts/${SAMPLE_VIDEO_ID}/`, SAMPLE_VIDEO_ID],
  [`https://m.youtube.com/watch?v=${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`youtube.com/watch?v=${SAMPLE_VIDEO_ID}`, SAMPLE_VIDEO_ID],
  [`  https://youtu.be/${SAMPLE_VIDEO_ID}  `, SAMPLE_VIDEO_ID],
];
for (const [url, id] of accepted) {
  check(extractYoutubeVideoId(url) === id, `kabul edilmeli: ${url} -> ${extractYoutubeVideoId(url)}`);
}
const rejected = [
  "",
  "   ",
  "https://youtu.be/VIDEO_ID",
  `https://vimeo.com/${SAMPLE_VIDEO_ID}`,
  `https://youtube.com.evil.example/watch?v=${SAMPLE_VIDEO_ID}`,
  `https://evil.example/watch?v=${SAMPLE_VIDEO_ID}`,
  `https://evil.example/embed/${SAMPLE_VIDEO_ID}`,
  `https://notyoutube.com/watch?v=${SAMPLE_VIDEO_ID}`,
  `https://www.youtube.com:8443/watch?v=${SAMPLE_VIDEO_ID}`,
  `https://user@www.youtube.com/watch?v=${SAMPLE_VIDEO_ID}`,
  `javascript:alert(1)//youtu.be/${SAMPLE_VIDEO_ID}`,
  `ftp://youtu.be/${SAMPLE_VIDEO_ID}`,
  "https://www.youtube.com/watch",
  "https://www.youtube.com/channel/UC1234567890",
  `https://www.youtube.com/embed/${SAMPLE_VIDEO_ID}/extra`,
  `https://youtu.be/${SAMPLE_VIDEO_ID}"><script>`,
];
for (const url of rejected) {
  check(extractYoutubeVideoId(url) === null, `reddedilmeli: ${url}`);
}
check(
  buildYoutubeEmbedUrl(SAMPLE_VIDEO_ID)?.startsWith(`https://www.youtube-nocookie.com/embed/${SAMPLE_VIDEO_ID}?`),
  "embed adresi youtube-nocookie değil",
);
check(buildYoutubeEmbedUrl("../evil") === null, "geçersiz kimlikle embed adresi üretildi");

// 4) Route normalizasyonu
const variants = [
  "/kidem-tazminati/borclar",
  "/kidem-tazminati/borclar/",
  "/kidem-tazminati/borclar?caseId=12",
  "/kidem-tazminati/borclar/?caseId=12#sonuc",
  "#/kidem-tazminati/borclar/?caseId=12",
  "index.html#/kidem-tazminati/borclar",
  "/KIDEM-TAZMINATI/Borclar",
  "//kidem-tazminati//borclar//",
];
for (const variant of variants) {
  check(findCalculationPageKey(variant, links) === SAMPLE_PAGE_KEY, `route eşleşmedi: ${variant}`);
}
check(findCalculationPageKey("/kidem-tazminati", links) === null, "seçim ekranı video satırına eşlendi");
check(findCalculationPageKey("/kidem-tazminati/borclar-x", links) === null, "benzer route yanlış eşlendi");

// 5) Örnek link yalnız ilgili sayfada görünür
const sampleLinks: CalculationVideoLinkTable = Object.fromEntries(
  entries.map(([key, link]) => [key, { ...link, youtubeUrl: key === SAMPLE_PAGE_KEY ? SAMPLE_URL : "" }]),
);
const visibleOn = calculationRoutes.filter((route) => resolveCalculationVideo(route, sampleLinks) !== null);
const sampleRoutes = links[SAMPLE_PAGE_KEY]?.routes.map(normalizeCalculationRoute) ?? [];
check(
  JSON.stringify(visibleOn) === JSON.stringify([...sampleRoutes].sort()),
  `örnek link görünen sayfalar: ${visibleOn.join(", ")}`,
);
const resolvedSample = resolveCalculationVideo("/kidem-tazminati/borclar/?caseId=3", sampleLinks);
check(resolvedSample?.videoId === SAMPLE_VIDEO_ID, "örnek video kimliği çözülemedi");
check(resolvedSample?.title === links[SAMPLE_PAGE_KEY]?.title, "modal başlığı config başlığı değil");

// 6) Düğme DOM çıktısı
const render = (pathname: string, table: CalculationVideoLinkTable) =>
  renderToStaticMarkup(createElement(CalculationVideoButton, { pathname, links: table }));
const sampleMarkup = render("/kidem-tazminati/borclar", sampleLinks);
check(sampleMarkup.includes("Videoyu İzle"), "geçerli linkte düğme metni yok");
check(sampleMarkup.startsWith("<button") && sampleMarkup.includes('type="button"'), "düğme button öğesi değil");
check(!/<a\b|href=/i.test(sampleMarkup), "düğme bağlantı olarak basıldı");
check(!sampleMarkup.includes("youtube"), "düğme YouTube adresi içeriyor");
check(!sampleMarkup.includes("<iframe"), "modal açılmadan iframe basıldı");
for (const route of calculationRoutes) {
  const expected = resolveCalculationVideo(route, links) !== null;
  check((render(route, links) !== "") === expected, `gerçek config düğme görünürlüğü uyuşmuyor: ${route}`);
}
check(render("/kidem-tazminati/is-kanunu-yok", sampleLinks) === "", "bilinmeyen route düğme bastı");
check(render("/ihbar-tazminati/borclar", sampleLinks) === "", "örnek link başka sayfada göründü");
const emptyLinks: CalculationVideoLinkTable = { ...sampleLinks, [SAMPLE_PAGE_KEY]: { ...sampleLinks[SAMPLE_PAGE_KEY], youtubeUrl: "" } };
check(render("/kidem-tazminati/borclar", emptyLinks) === "", "boş linkte düğme DOM'a basıldı");
const badDomain: CalculationVideoLinkTable = {
  ...sampleLinks,
  [SAMPLE_PAGE_KEY]: { ...sampleLinks[SAMPLE_PAGE_KEY], youtubeUrl: `https://evil.example/watch?v=${SAMPLE_VIDEO_ID}` },
};
check(render("/kidem-tazminati/borclar", badDomain) === "", "geçersiz alan adında düğme basıldı");

// 7) Yönlendirme yok
for (const [name, source] of [["CalculationVideoButton", buttonSource], ["CalculationVideoModal", modalSource]] as const) {
  check(!/window\.location|window\.open|openExternal|<a\b|href=|<webview/i.test(source), `${name}: dış yönlendirme kodu var`);
}
check(/sandbox="allow-scripts allow-same-origin allow-presentation"/.test(modalSource), "iframe sandbox ayarı değişti");

const withVideo = entries.filter(([, link]) => extractYoutubeVideoId(link.youtubeUrl) !== null).map(([key]) => key);
if (failures.length > 0) {
  console.error(`calculationVideoLinks.selftest: ${failures.length} hata`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(
  JSON.stringify({
    hesaplamaRouteSayisi: calculationRoutes.length,
    videoSatiriSayisi: entries.length,
    linkiOlanSatirlar: withVideo,
  }),
);
console.log("calculationVideoLinks.selftest: geçti");
