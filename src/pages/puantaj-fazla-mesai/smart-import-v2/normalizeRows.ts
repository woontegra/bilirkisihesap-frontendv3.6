import { readLogicalCell } from "./groupLogicalColumns";
import type { DetectedSegment } from "./detectSegments";
import { classifyAttendanceStatus } from "./classifyStatus";
import { normalizeSmartDate, normalizeSmartTime } from "./normalizeDateTime";
import type { CanonicalAttendanceRow, ColumnClassification, SmartFieldRole } from "./types";

function setRoleValue(row: CanonicalAttendanceRow, role: SmartFieldRole, value: string): void {
  switch (role) {
    case "employeeName":
      row.employeeName = value;
      break;
    case "department":
      row.department = value;
      break;
    case "position":
      row.position = value;
      break;
    case "employeeId":
      row.employeeId = value;
      break;
    case "workDate":
      row.workDate = value;
      break;
    case "actualEntry":
      row.actualEntry = value;
      break;
    case "actualExit":
      row.actualExit = value;
      break;
    case "plannedEntry":
      row.plannedEntry = value;
      break;
    case "plannedExit":
      row.plannedExit = value;
      break;
    case "plannedShiftText":
      row.plannedShiftText = value;
      break;
    case "leaveText":
      row.leaveText = value;
      break;
    default:
      break;
  }
}

/**
 * Sınıflandırılmış segment satırlarını CanonicalAttendanceRow listesine dönüştürür.
 */
export function normalizeSegmentRows(
  grid: string[][],
  segment: DetectedSegment,
  classifications: ColumnClassification[],
  sheetName: string,
): CanonicalAttendanceRow[] {
  const rows: CanonicalAttendanceRow[] = [];
  const roleByIndex = new Map<number, SmartFieldRole>();
  classifications.forEach((c, idx) => {
    if (c.duplicateOf != null) return;
    roleByIndex.set(idx, c.role);
  });

  for (let r = segment.startRow; r <= segment.endRow; r++) {
    const raw = grid[r] ?? [];
    if (raw.every((c) => !(c ?? "").toString().trim())) continue;

    const row: CanonicalAttendanceRow = {
      sourceSheet: sheetName,
      sourceRow: r + 1,
      sourceSegment: segment.index,
      rawValues: [...raw],
    };

    for (const g of segment.groups) {
      const role = roleByIndex.get(g.index);
      if (!role || role === "unknown") continue;
      const val = readLogicalCell(raw, g);
      if (!val) continue;
      if (role === "workDate") {
        const d = normalizeSmartDate(val);
        setRoleValue(row, role, d.valid ? d.value : val);
      } else if (role === "actualEntry" || role === "actualExit" || role === "plannedEntry" || role === "plannedExit") {
        const t = normalizeSmartTime(val);
        setRoleValue(row, role, t.valid ? t.value : val);
      } else {
        setRoleValue(row, role, val);
      }
    }

    row.status = classifyAttendanceStatus(row.plannedShiftText, row.leaveText);
    rows.push(row);
  }
  return rows;
}
