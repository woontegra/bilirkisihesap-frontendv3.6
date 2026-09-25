const TURKISH_VOWELS = "aeıioöuüAEIİOÖUÜ";

export type MergeTextResult = {
  value: string;
  confidence: number;
  ambiguous: boolean;
  rawParts: string[];
};

const KNOWN_SPLIT_SUFFIXES = ["rol", "zmetler", "der", "metler", "izmetler", "netler"];

function shouldBridgeWithI(lastToken: string, firstToken: string): boolean {
  if (lastToken.length !== 1) return false;
  if (!firstToken) return false;
  if (TURKISH_VOWELS.includes(firstToken[0])) return false;
  return KNOWN_SPLIT_SUFFIXES.some((s) => firstToken === s || firstToken.endsWith(s));
}

function scoreCandidate(merged: string, left: string, right: string, usedBridge: boolean): number {
  let score = 45;
  const lastToken = left.split(/\s+/).pop() ?? "";
  const firstToken = right.split(/\s+/)[0] ?? "";

  if (lastToken.length === 1) score += 22;
  else if (lastToken.length === 2) score += 10;
  else if (lastToken.length >= 4) score -= 25;

  if (usedBridge) score += 18;
  if (/[A-ZÇĞİÖŞÜ]/.test(lastToken) && /^[a-zçğıöşü]/.test(firstToken)) score += 8;
  if (merged.length >= 3 && merged.length <= 48) score += 5;
  if (/\d/.test(merged)) score -= 30;

  return Math.max(0, Math.min(100, score));
}

/**
 * Parçalanmış Türkçe metin birleştirme — kör yapıştırma yapmaz.
 */
export function mergeSplitWords(left: string, right: string): string {
  return mergeTextParts([left, right], true).value;
}

export function mergeTextParts(
  parts: string[],
  isTextIdentity: boolean,
  _peerSamples?: string[][],
): MergeTextResult {
  const cleaned = parts.map((p) => (p ?? "").toString().trim()).filter(Boolean);
  if (cleaned.length === 0) return { value: "", confidence: 0, ambiguous: false, rawParts: [] };
  if (!isTextIdentity) {
    return { value: cleaned.join(" "), confidence: 90, ambiguous: false, rawParts: cleaned };
  }

  let acc = cleaned[0];
  let minConfidence = 100;
  let ambiguous = false;

  for (let i = 1; i < cleaned.length; i++) {
    const right = cleaned[i];
    const leftTokens = acc.split(/\s+/);
    const rightTokens = right.split(/\s+/);
    const last = leftTokens[leftTokens.length - 1] ?? "";
    const first = rightTokens[0] ?? "";

    const spaced = `${acc} ${right}`.replace(/\s+/g, " ").trim();
    let bridged = spaced;
    let usedBridge = false;

    if (last.length > 0 && last.length <= 3 && first.length > 0) {
      const bridge = shouldBridgeWithI(last, first);
      const mergedToken = bridge ? last + "i" + first : last + first;
      const prefix = leftTokens.slice(0, -1).join(" ");
      const suffix = rightTokens.slice(1).join(" ");
      bridged = [prefix, mergedToken, suffix].filter(Boolean).join(" ");
      usedBridge = bridge;
    }

    const spacedScore = scoreCandidate(spaced, acc, right, false);
    const bridgedScore = scoreCandidate(bridged, acc, right, usedBridge);
    const pickBridged = bridgedScore > spacedScore + 6;

    const chosen = pickBridged ? bridged : spaced;
    const conf = pickBridged ? bridgedScore : spacedScore;
    if (Math.abs(bridgedScore - spacedScore) < 8 && last.length <= 2) ambiguous = true;
    minConfidence = Math.min(minConfidence, conf);
    acc = chosen;
  }

  return {
    value: acc,
    confidence: minConfidence,
    ambiguous,
    rawParts: cleaned,
  };
}
