/*! Open Historia Continuum — Country/Advisor drawer architecture regression */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(here, name), "utf8");

test("Country and Advisor are separate mutually-exclusive right drawers", () => {
  const main = read("main.jsx");
  assert.match(main, /const \[isCountryOpen, setIsCountryOpen\] = useState\(false\)/);
  assert.match(main, /setIsCountryOpen\(false\);\s*setIsAdvisorOpen\(true\)/);
  assert.match(main, /if \(next\) setIsAdvisorOpen\(false\)/);
  assert.match(main, /if \(next\) setIsCountryOpen\(false\)/);
  assert.match(main, /<LazyCountryPanel/);
  assert.match(main, /isCountryOpen=\{isCountryOpen\}/);
});

test("Advisor no longer embeds the Country/Stats pane", () => {
  const advisor = read("advisor.jsx");
  assert.doesNotMatch(advisor, /StatsPane/);
  assert.doesNotMatch(advisor, /label="Stats"/);
  assert.match(advisor, />Advisor</);
});

test("Country exposes Politics, Diplomacy and Economy as sibling views", () => {
  const stats = read("stats.jsx");
  assert.match(stats, /useState\("politics"\)/);
  assert.match(stats, /<span aria-hidden="true">🏛<\/span><span>Politics<\/span>/);
  assert.match(stats, /<span aria-hidden="true">🤝<\/span><span>Diplomacy<\/span>/);
  assert.match(stats, /<span aria-hidden="true">📈<\/span><span>Economy<\/span>/);
  assert.match(stats, /flexDirection: "column"/);
  assert.match(stats, /\{statsView === "politics" && \(\s*<PoliticalOverview/);
});

test("Player polity launcher is a full-size active Country button", () => {
  const other = read("other.jsx");
  assert.match(other, /height: "4rem"/);
  assert.match(other, /width: "4rem"/);
  assert.match(other, /aria-pressed/);
  assert.match(other, /isCountryOpen/);
});

test("Political landscape shows governing party or coalition below the chart", () => {
  const politics = read("PoliticalOverview.jsx");
  assert.match(politics, /Governing coalition/);
  assert.match(politics, /new Set\(\[\.\.\.rulingParties, \.\.\.coalitionParties\]\)/);
  assert.match(politics, /coalitionName \|\| governmentParties\.join\(" · "\)/);
});
