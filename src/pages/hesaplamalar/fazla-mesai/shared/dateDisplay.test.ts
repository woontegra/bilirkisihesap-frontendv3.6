import { describe, expect, it } from "vitest";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";

describe("formatIsoDateTR", () => {
  it("formats YYYY-MM-DD", () => {
    expect(formatIsoDateTR("2020-01-01")).toBe("01.01.2020");
    expect(formatIsoDateTR("2018-07-21")).toBe("21.07.2018");
    expect(formatIsoDateTR("2021-05-14")).toBe("14.05.2021");
  });

  it("formats ISO datetime date part only", () => {
    expect(formatIsoDateTR("2020-01-01T15:30:00.000Z")).toBe("01.01.2020");
    expect(formatIsoDateTR("2020-01-01 09:00:00")).toBe("01.01.2020");
  });

  it("passes through / normalizes DD.MM.YYYY", () => {
    expect(formatIsoDateTR("01.01.2020")).toBe("01.01.2020");
    expect(formatIsoDateTR("1.1.2020")).toBe("01.01.2020");
  });

  it("handles empty / null", () => {
    expect(formatIsoDateTR(null)).toBe("—");
    expect(formatIsoDateTR(undefined)).toBe("—");
    expect(formatIsoDateTR("")).toBe("—");
    expect(formatIsoDateTR("   ")).toBe("—");
  });

  it("does not invent dates from invalid input", () => {
    expect(formatIsoDateTR("not-a-date")).toBe("not-a-date");
    expect(formatIsoDateTR("2020-13-40")).toBe("2020-13-40");
  });
});

describe("formatIsoDateRangeTR", () => {
  it("formats range", () => {
    expect(formatIsoDateRangeTR("2020-01-01", "2020-12-31")).toBe("01.01.2020 – 31.12.2020");
  });

  it("handles one-sided / empty", () => {
    expect(formatIsoDateRangeTR("2020-01-01", "")).toBe("01.01.2020");
    expect(formatIsoDateRangeTR(null, null)).toBe("—");
  });
});
