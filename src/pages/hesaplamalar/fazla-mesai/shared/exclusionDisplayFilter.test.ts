import { describe, expect, it } from "vitest";
import {
  countSelectedInYear,
  exclusionRangeVisible,
  filterUbgtGroupsByCutoff,
} from "./exclusionDisplayFilter";
import { addDatesToSet, removeDatesFromSet } from "./useUbgtYearView";

describe("exclusionDisplayFilter", () => {
  it("filters UBGT years and days by cutoff without dropping later years", () => {
    const groups = [
      { year: 2020, entries: [{ date: "2020-04-23" }] },
      { year: 2021, entries: [{ date: "2021-04-21" }, { date: "2021-04-23" }] },
      { year: 2022, entries: [{ date: "2022-05-01" }] },
    ];
    const visible = filterUbgtGroupsByCutoff(groups, "2021-04-22");
    expect(visible.map((g) => g.year)).toEqual([2021, 2022]);
    expect(visible[0].entries.map((e) => e.date)).toEqual(["2021-04-23"]);
  });

  it("keeps overlapping leave rows and hides fully elapsed ones", () => {
    expect(exclusionRangeVisible("2021-04-20", "2021-04-26", "2021-04-22")).toBe(true);
    expect(exclusionRangeVisible("2021-03-01", "2021-03-17", "2021-04-22")).toBe(false);
    expect(exclusionRangeVisible("2018-07-21", "2018-07-23", "2021-04-22")).toBe(false);
  });

  it("counts selected days per year independently", () => {
    expect(countSelectedInYear(["2019-04-23", "2019-05-01", "2020-01-01"], 2019)).toBe(2);
  });

  it("keeps draft rows without dates visible", () => {
    expect(exclusionRangeVisible("", "", "2021-04-22")).toBe(true);
  });

  it("year switch helpers keep other years selected", () => {
    let selected = new Set(["2019-04-23", "2019-05-01"]);
    selected = addDatesToSet(selected, ["2020-01-01"]);
    expect(selected.has("2019-04-23")).toBe(true);
    selected = removeDatesFromSet(selected, ["2020-01-01"]);
    expect(selected.has("2019-04-23")).toBe(true);
    expect(selected.has("2020-01-01")).toBe(false);
  });
});
