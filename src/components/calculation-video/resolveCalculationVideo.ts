import { calculationVideoLinks, type CalculationVideoLink } from "@/config/calculationVideoLinks";
import { buildYoutubeEmbedUrl, extractYoutubeVideoId } from "./youtube";

export type CalculationVideoLinkTable = Readonly<Record<string, CalculationVideoLink>>;

export type ResolvedCalculationVideo = {
  pageKey: string;
  title: string;
  videoId: string;
  embedUrl: string;
};

/**
 * Router yolunu karşılaştırılabilir biçime getirir.
 * "#/kidem-tazminati/borclar/?caseId=3", "/Kidem-Tazminati/Borclar/" ve "/kidem-tazminati/borclar" aynı sonucu verir.
 */
export function normalizeCalculationRoute(raw: string): string {
  let path = String(raw ?? "").trim();
  const hashRoute = path.indexOf("#/");
  if (hashRoute >= 0) path = path.slice(hashRoute + 1);
  path = path.split(/[?#]/, 1)[0] ?? "";
  try {
    path = decodeURI(path);
  } catch {
    /* çözülemeyen yol olduğu gibi karşılaştırılır */
  }
  path = `/${path}`.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path.toLowerCase();
}

export function findCalculationPageKey(
  pathname: string,
  links: CalculationVideoLinkTable = calculationVideoLinks,
): string | null {
  const target = normalizeCalculationRoute(pathname);
  for (const [pageKey, link] of Object.entries(links)) {
    if (link.routes.some((route) => normalizeCalculationRoute(route) === target)) {
      return pageKey;
    }
  }
  return null;
}

export function resolveCalculationVideo(
  pathname: string,
  links: CalculationVideoLinkTable = calculationVideoLinks,
): ResolvedCalculationVideo | null {
  const pageKey = findCalculationPageKey(pathname, links);
  if (!pageKey) return null;
  const link = links[pageKey];
  const videoId = extractYoutubeVideoId(link?.youtubeUrl);
  if (!link || !videoId) return null;
  const embedUrl = buildYoutubeEmbedUrl(videoId);
  if (!embedUrl) return null;
  return { pageKey, title: link.title.trim() || pageKey, videoId, embedUrl };
}
