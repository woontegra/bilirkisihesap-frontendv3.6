/**
 * Paylaşılan izin/dışlama havuzu — birim testler.
 */
import assert from "node:assert/strict";
import {
  fmItemsToPoolItems,
  mergeRowsByFingerprint,
  normalizeLeaveTypeForFm,
  poolItemsToFmItems,
  rowFingerprint,
} from "./sharedLeaveExclusionPool";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
}

check("Kullanılan İzin → Yıllık İzin", normalizeLeaveTypeForFm("Kullanılan İzin"), "Yıllık İzin");
check(
  "rowFingerprint",
  rowFingerprint({ type: "Rapor", start: "2024-01-01", end: "2024-01-05", days: 5 }),
  "rapor|2024-01-01|2024-01-05|5",
);

const merged = mergeRowsByFingerprint(
  [{ id: "a", type: "Yıllık İzin", start: "2024-01-01", end: "2024-01-03", days: 3 }],
  [
    { id: "b", type: "Yıllık İzin", start: "2024-01-01", end: "2024-01-03", days: 3 },
    { id: "c", type: "Rapor", start: "2024-02-01", end: "2024-02-02", days: 2 },
  ],
  () => "new-id",
);
check("mergeRowsByFingerprint dedup", merged.length, 2);
check("mergeRowsByFingerprint keeps new row", merged[1]?.type, "Rapor");

const pool = fmItemsToPoolItems([
  { id: "1", type: "Kullanılan İzin", start: "2025-06-01", end: "2025-06-10", days: 10 },
]);
check("fmItemsToPoolItems type map", pool[0]?.type, "Yıllık İzin");
const back = poolItemsToFmItems(pool);
check("poolItemsToFmItems roundtrip days", back[0]?.days, 10);

console.log("sharedLeaveExclusionPool.test: geçti ✔");
