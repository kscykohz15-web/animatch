import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, daysBetween, formatCycle, formatRelativeDays, median, medianAbsoluteDeviation, toDateKey } from "../date";

test("日付文字列を暦日に正規化する", () => {
  assert.equal(toDateKey("2026-10-04"), "2026-10-04");
  assert.equal(toDateKey("2026-10-04T23:30:00+09:00"), "2026-10-04");
  assert.equal(toDateKey(new Date("2026-10-04T00:00:00Z")), "2026-10-04");
});

test("日数差はタイムゾーンでズレない", () => {
  assert.equal(daysBetween("2026-10-01", "2026-10-04"), 3);
  assert.equal(daysBetween("2026-10-04", "2026-10-01"), -3);
  assert.equal(daysBetween("2026-10-04", "2026-10-04"), 0);
  // 月・年をまたぐ
  assert.equal(daysBetween("2025-12-31", "2026-01-01"), 1);
  // うるう年 (2028-02-29)
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2);
});

test("日数を加算する", () => {
  assert.equal(addDays("2026-10-04", 30), "2026-11-03");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("中央値と中央絶対偏差", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  // 外れ値100があっても中央値は動かない
  assert.equal(median([10, 10, 10, 100]), 10);
  assert.equal(medianAbsoluteDeviation([10, 10, 10]), 0);
});

test("相対表記と周期表記", () => {
  assert.equal(formatRelativeDays(0), "今日");
  assert.equal(formatRelativeDays(1), "昨日");
  assert.equal(formatRelativeDays(5), "5日前");
  assert.equal(formatRelativeDays(21), "約3週間前");
  assert.equal(formatCycle(30), "約1か月ごと");
  assert.equal(formatCycle(7), "約7日ごと");
  assert.equal(formatCycle(14), "約2週間ごと");
});
