import assert from "node:assert/strict";
import {
  getDefaultRowLanguage,
  getDefaultServiceLanguage,
  getLanguageDeviationRowNumbers,
  getNearestSunday,
  isSecondSunday,
  propagateServiceLanguageToRows,
  shouldBlockSaveForLanguageDeviation,
} from "../src/planning-lifecycle/service-context-defaults";

assert.equal(getNearestSunday(new Date(2026, 6, 6)).toDateString(), new Date(2026, 6, 12).toDateString());
assert.equal(getNearestSunday(new Date(2026, 6, 12)).toDateString(), new Date(2026, 6, 12).toDateString());
assert.equal(isSecondSunday(new Date(2026, 6, 12)), true);
assert.equal(isSecondSunday(new Date(2026, 6, 19)), false);
assert.equal(getDefaultServiceLanguage(new Date(2026, 6, 12)), "polish");
assert.equal(getDefaultServiceLanguage(new Date(2026, 6, 19)), "czech");
assert.equal(getDefaultRowLanguage("czech"), "czech");
assert.equal(getDefaultRowLanguage("polish"), "polish");
assert.equal(getDefaultRowLanguage("mixed"), "");

assert.deepEqual(
  propagateServiceLanguageToRows(
    [
      { songLanguage: "czech", songNumber: "", note: "", languageTouched: false },
      { songLanguage: "czech", songNumber: "42", note: "", languageTouched: false },
      { songLanguage: "czech", songNumber: "", note: "Manual", languageTouched: false },
    ],
    "polish",
  ),
  [
    { songLanguage: "polish", songNumber: "", note: "", languageTouched: false },
    { songLanguage: "czech", songNumber: "42", note: "", languageTouched: false },
    { songLanguage: "czech", songNumber: "", note: "Manual", languageTouched: false },
  ],
);
assert.deepEqual(
  propagateServiceLanguageToRows([{ songLanguage: "czech", songNumber: "", note: "", languageTouched: true }], "polish"),
  [{ songLanguage: "czech", songNumber: "", note: "", languageTouched: true }],
);
assert.deepEqual(
  getLanguageDeviationRowNumbers(
    [{ songLanguage: "czech" }, { songLanguage: "polish" }, { songLanguage: "" }],
    "czech",
  ),
  [2, 3],
);
assert.deepEqual(
  getLanguageDeviationRowNumbers(
    [{ songLanguage: "czech" }, { songLanguage: "polish" }, { songLanguage: "" }],
    "mixed",
  ),
  [],
);
assert.equal(shouldBlockSaveForLanguageDeviation([{ songLanguage: "" }], "polish", false), true);
assert.equal(shouldBlockSaveForLanguageDeviation([{ songLanguage: "" }], "polish", true), false);

console.log("service context and row default helper tests passed");
