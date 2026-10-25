import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STAT_INDEX_KEYS,
  MAX_STAT_INDICES,
  normalizeCustomStatValues,
  normalizeStatIndexRows,
  normalizeStatSheetDefinition,
  serializeStatSheet,
  statSheetKeys,
  toStatIndexKey,
  statTileSpan,
} from "./statIndexDefinitions.js";

test("stat index compatibility still falls back to the stock six", () => {
  const rows = normalizeStatIndexRows(null);
  assert.deepEqual(rows.map((row) => row.key), [...DEFAULT_STAT_INDEX_KEYS]);
});

test("legacy V1 indices migrate into a full custom sheet without changing stable keys", () => {
  const definition = normalizeStatSheetDefinition({
    indices: [
      { key: "timber", label: "Timber supply", icon: "🪵", color: "#22C55E", description: "Usable timber access." },
      { key: "goldAccess", label: "Gold access", icon: "🪙", color: "#eab308" },
    ],
  });

  assert.equal(definition.custom, true);
  assert.equal(definition.sections.length, 1);
  assert.equal(definition.sections[0].key, "strategic");
  assert.deepEqual(statSheetKeys(definition), ["timber", "goldAccess"]);
  assert.equal(definition.sections[0].stats[0].color, "#22c55e");
});

test("full-sheet sections preserve order, types, units, and deterministic unique keys", () => {
  const definition = normalizeStatSheetDefinition({
    version: 2,
    sections: [
      {
        label: "Resources",
        icon: "🧰",
        stats: [
          { label: "Timber", kind: "index", icon: "🪵" },
          { label: "Timber", kind: "number", suffix: "tonnes", compact: true },
          { key: "treasury", label: "Treasury", kind: "currency", prefix: "ℳ", decimals: 2, minimum: 0 },
        ],
      },
      {
        label: "Population",
        stats: [{ key: "settlers", label: "Settlers", kind: "number", suffix: "people", minimum: 0 }],
      },
    ],
  });

  assert.equal(definition.custom, true);
  assert.deepEqual(definition.sections.map((section) => section.key), ["resources", "population"]);
  assert.deepEqual(statSheetKeys(definition), ["timber", "timber2", "treasury", "settlers"]);
  assert.equal(definition.sections[0].stats[0].kind, "index");
  assert.equal(definition.sections[0].stats[0].minimum, 0);
  assert.equal(definition.sections[0].stats[0].maximum, 100);
  assert.equal(definition.sections[0].stats[1].suffix, "tonnes");
  assert.equal(definition.sections[0].stats[2].prefix, "ℳ");
  assert.equal(definition.sections[0].stats[2].decimals, 2);
});

test("custom values clamp and round according to their scenario definitions", () => {
  const definition = normalizeStatSheetDefinition({
    sections: [{
      label: "Resources",
      stats: [
        { key: "timber", label: "Timber", kind: "index" },
        { key: "silver", label: "Silver", kind: "number", minimum: 0, maximum: 10000, decimals: 1 },
        { key: "balance", label: "Balance", kind: "percentage", minimum: -100, maximum: 100, decimals: 2 },
      ],
    }],
  });

  assert.deepEqual(normalizeCustomStatValues({ timber: 104.2, silver: 42.267, balance: -12.345 }, definition), {
    timber: 100,
    silver: 42.3,
    balance: -12.35,
  });
});

test("serialized V2 sheet contains canonical persistent fields, not editor metadata", () => {
  const sheet = serializeStatSheet({
    custom: true,
    sections: [{
      key: "resources",
      label: "Resources",
      icon: "🧰",
      draftId: "ui-section",
      isNew: true,
      stats: [{
        key: "timber",
        label: "Timber",
        kind: "number",
        icon: "🪵",
        color: "#22c55e",
        description: "Supply",
        suffix: "tonnes",
        decimals: 0,
        compact: true,
        minimum: 0,
        isNew: true,
        draftId: "ui-stat",
      }],
    }],
  });

  assert.equal(sheet.version, 2);
  assert.equal(sheet.sections.length, 1);
  assert.equal(sheet.sections[0].key, "resources");
  assert.equal(sheet.sections[0].stats[0].key, "timber");
  assert.equal(sheet.sections[0].stats[0].kind, "number");
  assert.equal(sheet.sections[0].stats[0].suffix, "tonnes");
  assert.equal(sheet.sections[0].stats[0].draftId, undefined);
  assert.equal(sheet.sections[0].stats[0].isNew, undefined);
});

test("legacy key generation and index bounding remain deterministic", () => {
  const input = Array.from({ length: MAX_STAT_INDICES + 4 }, (_, index) => ({
    label: index < 2 ? "Timber" : `Metric ${index}`,
  }));
  const rows = normalizeStatIndexRows(input, { fallback: false });

  assert.equal(rows.length, MAX_STAT_INDICES);
  assert.equal(rows[0].key, "timber");
  assert.equal(rows[1].key, "timber2");
  assert.equal(toStatIndexKey("Horse & cart capacity"), "horseCartCapacity");
});

// C2B2B: a presentation reference is not an AI-writable custom-stat key.
test("native-bound cards are excluded from the custom AI writer key set without changing legacy sheets", () => {
  const hybrid = normalizeStatSheetDefinition({ sections: [{ label: "National", stats: [
    { key: "gdpHero", label: "GDP headline", kind: "currency", nativeMetric: "gdp" },
    { key: "gdpCompact", label: "GDP small", kind: "currency", nativeMetric: "gdp" },
    { key: "grain", label: "Grain stocks", kind: "number" },
  ] }] });
  assert.deepEqual(statSheetKeys(hybrid), ["grain"]);
  assert.deepEqual(normalizeCustomStatValues({ gdpHero: 1200, gdpCompact: 1200, grain: 8 }, hybrid), { grain: 8 });
  const allNative = normalizeStatSheetDefinition({ sections: [{ label: "National", stats: [
    { key: "population", label: "Population", kind: "number", nativeMetric: "totalPopulation" },
  ] }] });
  assert.deepEqual(statSheetKeys(allNative), []);
  assert.deepEqual(statSheetKeys(normalizeStatSheetDefinition({ sections: [{ label: "National", stats: [
    { key: "population", label: "Population", kind: "number" },
  ] }] })), ["population"]);
});

// Statistics V2 layout: one persisted display choice, no new numeric ledger.
test("national tile width is bounded, round-trips, and preserves every legacy default", () => {
  const legacy = normalizeStatSheetDefinition({ sections: [{ label: "Overview", stats: [
    { key: "cohesion", label: "Stability", kind: "index" },
    { key: "gdp", label: "GDP", kind: "currency" },
  ] }] });
  assert.deepEqual(legacy.sections[0].stats.map(statTileSpan), [2, 1]);
  assert.deepEqual(legacy.sections[0].stats.map((row) => row.tileSpan), [undefined, undefined]);
  const configured = serializeStatSheet({ sections: [{ label: "Overview", stats: [
    { key: "main", label: "Main GDP", kind: "currency", nativeMetric: "gdp", tileSpan: 2 },
    { key: "cohesion", label: "Stability", kind: "index", tileSpan: 1 },
  ] }] });
  assert.deepEqual(configured.sections[0].stats.map(statTileSpan), [2, 1]);
  assert.deepEqual(configured.sections[0].stats.map((row) => row.tileSpan), [2, 1]);
  assert.equal(configured.sections[0].stats[0].nativeMetric, "gdp");
  assert.throws(() => normalizeStatSheetDefinition({ sections: [{ label: "Overview", stats: [
    { key: "bad", label: "Invalid", kind: "number", tileSpan: 9 },
  ] }] }), /tile width must be one or two/);
});

test('native standard sheet preserves opted-in dashboard without custom GDP writers', () => {
  const base={custom:false,version:2,sections:[],dashboard:{version:1,widgets:[
    {id:'gdpHero',source:'native:gdp',style:'trend',page:'overview',x:0,y:0,w:6,h:2},
    {id:'gdpAgain',source:'native:gdp',style:'value',page:'details',x:0,y:0,w:3,h:1},
  ]}};
  const normalized=normalizeStatSheetDefinition(base);
  assert.equal(normalized.custom,false);
  assert.deepEqual(statSheetKeys(normalized),statSheetKeys(normalizeStatSheetDefinition(null)));
  assert.equal(normalized.dashboard.widgets.length,2);
  const exported=serializeStatSheet(base);
  assert.equal(exported.custom,false);
  assert.deepEqual(exported.sections,[]);
  assert.deepEqual(normalizeStatSheetDefinition(exported).dashboard,normalized.dashboard);
});
test('authored custom value cards cannot silently bind to nonexistent or native-bound custom keys',()=>{
  const base={custom:true,sections:[{key:'economy',label:'Economy',stats:[
    {key:'grain',label:'Grain reserve',kind:'number'},
    {key:'gdpHero',label:'GDP',nativeMetric:'gdp',kind:'currency'},
  ]}],dashboard:{version:1,widgets:[{id:'grainWidget',source:'custom:grain',style:'bar',page:'overview',x:0,y:0,w:3,h:1}]}};
  assert.equal(normalizeStatSheetDefinition(base).dashboard.widgets[0].source,'custom:grain');
  assert.throws(()=>normalizeStatSheetDefinition({...base,dashboard:{version:1,widgets:[
    {...base.dashboard.widgets[0],source:'custom:gdpHero'}]}}));
});
