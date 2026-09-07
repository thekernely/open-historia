import assert from "node:assert/strict";
import test from "node:test";

import { resolveCountryTags } from "./countryTags.js";

const world = {
  polityOverrides: {
    Poland: { name: "Republic of Poland", aliases: ["Poland"], status: "active" },
  },
  politicalActors: {
    byPolity: {
      Poland: {
        politicalSystem: { type: "parliamentary democracy", representation: "electoral" },
        government: { form: "Parliamentary Republic" },
      },
    },
  },
  powerStatus: {
    schemaVersion: 1,
    byPolity: { Poland: { polityKey: "Poland", tier: "regional-power", basis: "generated-estimate" } },
  },
  institutions: {
    schemaVersion: 1,
    ledgerVersion: 1,
    byId: {
      nato: {
        id: "nato",
        name: "North Atlantic Treaty Organization",
        shortName: "NATO",
        kind: "security_alliance",
        status: "active",
        members: [{ polity: "Poland", status: "member", role: "member" }],
      },
      "european-union": {
        id: "european-union",
        name: "European Union",
        shortName: "EU",
        kind: "political_union",
        status: "active",
        members: [{ polity: "Poland", status: "member", role: "member" }],
      },
    },
  },
  countryTags: {
    Poland: ["nato-aligned", "eu-member", "great-power", "conservative"],
  },
};

test("country header tags project canonical power, regime and formal memberships", () => {
  const tags = resolveCountryTags({}, world, "Poland");
  assert.ok(tags.includes("regional-power"));
  assert.ok(tags.includes("democratic"));
  assert.ok(tags.includes("parliamentary"));
  assert.ok(tags.includes("nato-member"));
  assert.ok(tags.includes("eu-member"));
  assert.ok(tags.includes("conservative"));
  assert.ok(!tags.includes("nato-aligned"), "formal NATO membership suppresses weaker alignment metadata");
  assert.ok(!tags.includes("great-power"), "legacy power tags are superseded by one canonical tier");
  assert.equal(tags.filter((tag) => ["major-power", "regional-power", "minor-power"].includes(tag)).length, 1);
});
