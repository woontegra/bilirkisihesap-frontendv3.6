/**
 * YouTube bağlantısından yalnız video kimliğini çıkarır.
 * Kabul edilen biçimler: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID.
 * Başka alan adı veya biçim kabul edilmez; iframe yalnız youtube-nocookie.com/embed adresini açar.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";

function asVideoId(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return VIDEO_ID_PATTERN.test(id) ? id : null;
}

function parseUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.port !== "" || url.username !== "" || url.password !== "") return null;
    return url;
  } catch {
    return null;
  }
}

export function extractYoutubeVideoId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = parseUrl(raw);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (SHORT_HOSTS.has(host)) {
    return segments.length === 1 ? asVideoId(segments[0]) : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (segments.length === 1 && segments[0] === "watch") {
    return asVideoId(url.searchParams.get("v"));
  }
  if (segments.length === 2 && (segments[0] === "shorts" || segments[0] === "embed")) {
    return asVideoId(segments[1]);
  }
  return null;
}

export function buildYoutubeEmbedUrl(videoId: string): string | null {
  const id = asVideoId(videoId);
  if (!id) return null;
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}
