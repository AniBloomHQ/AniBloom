import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeasonInfo,
  getNext3DaysRange,
  getPrevious3DaysRange,
} from "../lib/catalog-config.js";
import { getRollingCatalogRange } from "../api/catalog-source.js";

function seasonSlots(iso) {
  const info = getSeasonInfo(new Date(iso));
  return [info.previous, info.ongoing, info.upcoming].map(({ season, year }) => `${season}:${year}`);
}

test("season changes at midnight JST rather than one hour later in Philippine time", () => {
  const boundaries = [
    ["2026-03-31T14:59:59.999Z", ["FALL:2025", "WINTER:2026", "SPRING:2026"],
     "2026-03-31T15:00:00.000Z", ["WINTER:2026", "SPRING:2026", "SUMMER:2026"]],
    ["2026-06-30T14:59:59.999Z", ["WINTER:2026", "SPRING:2026", "SUMMER:2026"],
     "2026-06-30T15:00:00.000Z", ["SPRING:2026", "SUMMER:2026", "FALL:2026"]],
    ["2026-09-30T14:59:59.999Z", ["SPRING:2026", "SUMMER:2026", "FALL:2026"],
     "2026-09-30T15:00:00.000Z", ["SUMMER:2026", "FALL:2026", "WINTER:2027"]],
    ["2026-12-31T14:59:59.999Z", ["SUMMER:2026", "FALL:2026", "WINTER:2027"],
     "2026-12-31T15:00:00.000Z", ["FALL:2026", "WINTER:2027", "SPRING:2027"]],
  ];
  for (const [before, expectedBefore, after, expectedAfter] of boundaries) {
    assert.deepEqual(seasonSlots(before), expectedBefore, before);
    assert.deepEqual(seasonSlots(after), expectedAfter, after);
  }
});

test("rolling 3-day feeds still use absolute instants and fixed elapsed durations", () => {
  for (const iso of ["2026-03-31T14:59:59.999Z", "2026-03-31T15:00:00.000Z", "2026-12-31T15:00:00.000Z"]) {
    const now = new Date(iso);
    const epoch = now.getTime();
    const day = 24 * 60 * 60 * 1000;
    assert.deepEqual(getNext3DaysRange(now), { start: epoch, end: epoch + 3 * day });
    assert.deepEqual(getPrevious3DaysRange(now), { start: epoch - 3 * day, end: epoch });
    for (const [id, range] of [
      ["upcoming_3_days", getNext3DaysRange(now)],
      ["previous_3_days", getPrevious3DaysRange(now)],
    ]) {
      assert.deepEqual(getRollingCatalogRange(id, now), range, id + " at " + iso);
    }
  }
});
