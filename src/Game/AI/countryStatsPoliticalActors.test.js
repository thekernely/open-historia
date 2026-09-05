import test from "node:test";
import assert from "node:assert/strict";

import { buildTargetDossierKernel } from "./countryStatsWorkerKernel.js";

test("Stats worker dossier uses canonical Political Actor government, leader, and parties", () => {
  const dossier = buildTargetDossierKernel({
    code: "Republic of Poland",
    bundle: {
      world: {
        polityOverrides: {
          "Republic of Poland": {
            name: "Republic of Poland",
            aliases: ["Poland"],
            status: "active",
          },
        },
        politicalActors: {
          schemaVersion: 1,
          byPolity: {
            "Republic of Poland": {
              polityKey: "Republic of Poland",
              government: {
                form: "Parliamentary republic",
                headOfState: "Bronisław Komorowski",
                headOfGovernment: "Donald Tusk",
              },
              parties: [
                { name: "Civic Platform", support: { percent: 39 } },
                { name: "Law and Justice", support: { percent: 30 } },
              ],
              goals: ["Strengthen NATO cooperation", "Support regional security"],
            },
          },
        },
        regionOwnershipOverrides: {},
        units: [],
      },
    },
    scenarioCatalog: [],
    fallbackCatalog: [],
  });

  assert.match(dossier, /Current political system \(canonical Political Actor\): Parliamentary republic/);
  assert.match(dossier, /Current leader \(canonical Political Actor\): Bronisław Komorowski/);
  assert.match(dossier, /Current head of government \(canonical Political Actor\): Donald Tusk/);
  assert.match(dossier, /Current parties: Civic Platform \(39%\), Law and Justice \(30%\)/);
  assert.match(dossier, /Current political goals: Strengthen NATO cooperation; Support regional security/);
});

test("Stats worker dossier remains valid when no Political Actor profile exists", () => {
  const dossier = buildTargetDossierKernel({
    code: "Test Polity",
    bundle: {
      world: {
        polityOverrides: { "Test Polity": { name: "Test Polity", status: "active" } },
        regionOwnershipOverrides: {},
        units: [],
      },
    },
  });

  assert.match(dossier, /Polity: Test Polity/);
  assert.doesNotMatch(dossier, /canonical Political Actor/);
});
