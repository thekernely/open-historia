/*! Open Historia - deterministic two-seat host/client integration for private Statistics views.
 * Real gameHost/gameClient handlers and on-wire message validators, with
 * in-memory transport and an injected clock; no provider, socket, or browser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createGameHost } from "./host/gameHost.js";
import { createGameClient } from "./client/gameClient.js";
import { normalizeSettings } from "./host/settings.js";
import { PLAYER_REQUESTS, HOST_MESSAGES } from "./game/messages.js";
import { validate } from "./protocol/validate.js";
import { normalizeEvents, normalizeWorldState } from "../runtime/gameState.js";

const LATVIA = "Republic of Latvia";
const RUSSIA = "Russian Federation";
const SECRET_SOURCE = "CANARY-DIRECTOR-PRIVATE-CRISIS";
const SECRET_EVENT = "CANARY-LATVIAN-PRIVATE-INTELLIGENCE";
const SECRET_EVIDENCE = "CANARY-PRIVATE-CREDIT-EVIDENCE: unpublished Russian settlement records.";

const roundTrip = (value, schema, direction) => {
  // Both real sessions copy and validate the serialized wire payload.
  const serialized = JSON.parse(JSON.stringify(value));
  const checked = validate(schema, serialized);
  assert.equal(checked.ok, true, direction + ": " + (checked.error || ""));
  return checked.value;
};

const initialDocs = () => ({
  game: { country: LATVIA, gameDate: "2014-04-01", round: 1 },
  world: {
    polityOverrides: Object.fromEntries([LATVIA, RUSSIA].map((name) =>
      [name, { code: name, name, status: "active" }])),
    countryStats: {
      [LATVIA]: { capital: "Riga", economy: { gdp: 600_000_000, gdpGrowth: 2 } },
      [RUSSIA]: {
        capital: "Moscow", economy: { gdp: 1_000_000_000, gdpGrowth: 3 },
        continuity: { accountedEventIds: ["CANARY-PRIVATE-NATIONAL-RECEIPT"] },
      },
    },
    statsEventReceipts: [{
      eventId: "CANARY-HOST-PRIVATE-RECEIPT", polity: RUSSIA,
      date: "2014-03-29", sourceStorylineId: SECRET_SOURCE,
      reason: "An internal national ledger adjustment.",
      changes: [{ metric: "stability", before: 50, after: 49 }],
    }],
    storylines: [{
      id: SECRET_SOURCE, title: "CANARY-HOST-ONLY-STORYLINE-TEXT",
      startedDate: "2014-03-01", status: "active",
      participants: [LATVIA, RUSSIA],
      sourceEventIds: ["credit-public", SECRET_EVENT],
    }],
  },
  events: [
    {
      id: "credit-public", date: "2014-03-25", title: "Baltic and Russian banking interruption",
      description: "Clearing delays reached financial institutions.",
      storylineIds: [SECRET_SOURCE],
      economicAccounting: {
        status: "unquantified", reason: "No national GDP change has been estimated yet.",
        exposures: [{
          polity: RUSSIA, channel: "credit", exposure: "direct",
          evidence: "Public bank statements document suspended correspondent settlements in Russia.",
        }],
      },
      impacts: { polityChanges: [] },
    },
    {
      id: SECRET_EVENT, date: "2014-03-28", title: "CANARY-PRIVATE-MARKET-REPORT",
      description: "Private intelligence report.",
      audience: [LATVIA], storylineIds: [SECRET_SOURCE],
      economicAccounting: {
        status: "unquantified", reason: "Further exposure was not quantified.",
        exposures: [{
          polity: RUSSIA, channel: "credit", exposure: "direct",
          evidence: SECRET_EVIDENCE,
        }],
      },
      impacts: { polityChanges: [] },
    },
  ],
  actions: [], chat: [], intercepts: {}, colors: {}, flags: {},
});

const createStore = () => {
  const docs = initialDocs();
  const update = (key) => async (mutate) => {
    const value = await mutate(structuredClone(docs[key]));
    if (value !== null && value !== undefined) docs[key] = value;
  };
  return {
    docs,
    read: async () => structuredClone(docs),
    updateGame: update("game"), updateWorld: update("world"),
    updateActions: update("actions"), updateChats: update("chat"),
    updateForces: async (mutate) => {
      const result = await mutate({
        world: structuredClone(docs.world),
        actions: structuredClone(docs.actions),
        game: structuredClone(docs.game),
      });
      if (result?.world) docs.world = result.world;
      if (result?.actions) docs.actions = result.actions;
    },
  };
};

const harness = (t) => {
  const store = createStore();
  // The test advances phases by host controls/requests, not wall-clock waits.
  const timers = {
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 2, clearInterval: () => {},
  };
  const players = new Map();
  const sent = [];
  const hostConnections = {
    host: { id: "host-connection", device: "host-device", name: "Latvia player" },
    guest: { id: "guest-connection", device: "guest-device", name: "Russia player" },
  };
  let host;
  let onResolved;
  const resolved = new Promise((resolve) => { onResolved = resolve; });
  const settings = normalizeSettings({
    roundMinutes: 10, countdownSeconds: 30, leaverGraceMinutes: 1,
  }).settings;
  const transport = {
    send: (id, value) => {
      const wire = roundTrip(value, HOST_MESSAGES[value.t], "host to client");
      sent.push({ id, message: wire });
      const peer = players.get(id);
      assert.ok(peer, "a host message must target a connected client");
      peer.client.receive(wire);
    },
  };
  host = createGameHost({
    transport, settings,
    hostSeat: { device: "host-device", name: "Latvia player", country: LATVIA },
    scenario: { id: "test-scenario", name: "Two-seat integration", hash: "test" },
    countries: [LATVIA, RUSSIA],
    store, now: () => 1_000_000, timers,
    resolveRound: async ({ humanCountries }) => {
      assert.deepEqual(humanCountries, [LATVIA, RUSSIA]);
      // Stand-in for an accepted host-native transaction. The test verifies
      // delivery/privacy, NOT whether the simulation calculated the GDP.
      store.docs.game = { ...store.docs.game, gameDate: "2014-05-01", round: 2 };
      store.docs.world.countryStats[RUSSIA].economy.gdp = 920_000_000;
      store.docs.world.storylines[0].sourceEventIds.push("credit-followup");
      store.docs.events.push({
        id: "credit-followup", date: "2014-05-01", title: "Public national credit assessment",
        storylineIds: [SECRET_SOURCE],
        impacts: { polityChanges: [{
          code: RUSSIA,
          statsEffects: {
            sourceStorylineId: SECRET_SOURCE,
            assessesUnquantifiedEventId: "credit-public",
            annualRealGrowthDelta: -3, durationDays: 30, gdpCause: "trade",
            economicShockEstimate: { basis: "simulation-estimate", channel: "credit",
              exposure: "direct",
              evidence: "Public bank statements document suspended correspondent settlements in Russia." },
            reason: "Accepted national settlement evidence supports a bounded growth loss.",
          },
        }] },
      });
      onResolved();
    },
  });

  for (const [role, connection] of Object.entries(hostConnections)) {
    const clientState = { rev: -1, docs: {}, views: [] };
    const client = createGameClient({
      timers,
      send: (message) => {
        const wire = roundTrip(message, PLAYER_REQUESTS[message.t], "client to host");
        // No direct write to canonical state: every client request passes
        // through the real host's seat and phase handlers.
        void host.receive(connection, wire);
      },
      applyView: ({ rev, docs }) => {
        assert.ok(rev > clientState.rev, "viewer revisions increase monotonically");
        clientState.rev = rev;
        clientState.views.push({ rev, keys: Object.keys(docs) });
        for (const [key, value] of Object.entries(docs)) {
          clientState.docs[key] = key === "world" ? normalizeWorldState(value)
            : key === "events" ? normalizeEvents(value) : value;
        }
        return true;
      },
    });
    players.set(connection.id, { client, clientState });
  }
  t.after(async () => {
    for (const peer of players.values()) peer.client.close();
    await host.stop();
  });
  const peer = (role) => players.get(hostConnections[role].id);
  const send = (role, name, fields = {}) => peer(role).client.request(name, fields);
  const settleViews = () => host.pushViews();
  const wireFor = (role) => sent.filter((row) =>
    row.id === hostConnections[role].id && row.message.t === "view").map((row) => row.message);
  return { host, store, peer, send, sent, settleViews, wireFor, resolved, hostConnections };
};

const connected = async (h) => {
  h.host.join(h.hostConnections.host);
  h.host.join(h.hostConnections.guest);
  assert.equal((await h.send("guest", "pick", { country: RUSSIA })).ok, true);
  await h.host.control.start();
  await h.settleViews();
};

test("two actual game clients receive serialized, seat-scoped Statistics and private economic events", async (t) => {
  const h = harness(t);
  await connected(h);
  const lv = h.peer("host").clientState;
  const ru = h.peer("guest").clientState;
  assert.equal(lv.docs.game.country, LATVIA);
  assert.equal(ru.docs.game.country, RUSSIA);
  assert.deepEqual(h.store.docs.game.humanCountries, [LATVIA, RUSSIA]);
  assert.equal(lv.docs.world.countryStats[RUSSIA].economy.gdp,
    ru.docs.world.countryStats[RUSSIA].economy.gdp, "public national GDP matches on both clients");
  assert.equal(ru.docs.world.countryEconomicCoverageView.byPolity[RUSSIA].status,
    "documented-unquantified");
  assert.equal(ru.docs.world.countryEconomicCoverageView.byPolity[RUSSIA].confirmedCount, 1);
  assert.equal(lv.docs.world.countryEconomicCoverageView.byPolity[LATVIA].status,
    "potential-unverified", "a country's own tentative crisis is visible to its seat");
  assert.equal(ru.docs.world.countryEconomicCoverageView.byPolity[LATVIA].status,
    "none", "private host storyline participation is not a public foreign claim");
  assert.equal(ru.docs.events.length, 1);
  assert.equal(lv.docs.events.length, 2);
  const guestWire = JSON.stringify(h.wireFor("guest"));
  for (const secret of [SECRET_SOURCE, SECRET_EVENT, SECRET_EVIDENCE,
    "CANARY-HOST-ONLY-STORYLINE-TEXT", "CANARY-PRIVATE-MARKET-REPORT",
    "CANARY-PRIVATE-NATIONAL-RECEIPT", "CANARY-HOST-PRIVATE-RECEIPT"]) {
    assert.equal(guestWire.includes(secret), false, "private material crossed the guest wire: " + secret);
  }
  assert.equal(Object.hasOwn(h.wireFor("guest").at(-1).docs.world, "storylines"), false);
  assert.equal(Object.hasOwn(h.wireFor("guest").at(-1).docs.world, "statsEventReceipts"), false);

  assert.equal((await h.send("guest", "order", { text: "Reinforce Smolensk." })).ok, true);
  await h.settleViews();
  assert.equal(ru.docs.actions.length, 1);
  assert.equal(lv.docs.actions.length, 0, "another seat's order is not sent to the host player's UI");
  assert.deepEqual(h.peer("guest").clientState.views.at(-1).keys, ["actions"],
    "only changed documents are transmitted after a guest order");
  assert.equal((await h.send("host", "order", { text: "Fortify Daugavpils." })).ok, true);
  await h.settleViews();
  assert.equal(lv.docs.actions.length, 1);
  assert.equal(ru.docs.actions.length, 1);
  assert.equal(ru.docs.actions[0].text, "Reinforce Smolensk.");
  assert.equal(lv.docs.actions[0].text, "Fortify Daugavpils.");
  assert.equal((await h.send("guest", "pick", { country: LATVIA })).ok, false,
    "a player cannot take the already claimed host seat");
  const beforeCanonical = JSON.stringify(h.store.docs.world);
  const refusedWrite = await h.send("guest", "world", { countryStats: {} });
  assert.equal(refusedWrite.ok, false, "arbitrary world writes have no player request schema");
  assert.equal(JSON.stringify(h.store.docs.world), beforeCanonical,
    "the rejected client write must not reach canonical host world");
});

test("two connected clients receive a single authoritative round and distinct crisis closures", async (t) => {
  const h = harness(t);
  await connected(h);
  const beforeLv = h.peer("host").clientState.rev;
  const beforeRu = h.peer("guest").clientState.rev;
  h.host.control.resolveNow();
  await h.resolved;
  // The round's onResolve callback publishes changes through the same
  // queued host push used after requests, not through a direct client write.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await h.settleViews();
  const lv = h.peer("host").clientState;
  const ru = h.peer("guest").clientState;
  assert.ok(lv.rev > beforeLv && ru.rev > beforeRu, "both clients received the new revision");
  assert.equal(lv.docs.game.gameDate, "2014-05-01");
  assert.equal(ru.docs.game.gameDate, "2014-05-01");
  assert.equal(lv.docs.world.countryStats[RUSSIA].economy.gdp, 920_000_000);
  assert.equal(ru.docs.world.countryStats[RUSSIA].economy.gdp, 920_000_000);
  assert.equal(ru.docs.world.countryEconomicCoverageView.byPolity[RUSSIA].status,
    "none", "a visible national follow-up closes the publicly documented original");
  assert.equal(lv.docs.world.countryEconomicCoverageView.byPolity[RUSSIA].status,
    "documented-unquantified", "private country evidence is not silently cleared by a public follow-up");
  assert.equal(ru.docs.events.some((event) => event.id === SECRET_EVENT), false);
  assert.ok(ru.docs.events.some((event) => event.id === "credit-followup"));
  const publicEffect = ru.docs.events.find((event) => event.id === "credit-followup")
    ?.impacts?.polityChanges?.[0]?.statsEffects;
  assert.equal(publicEffect?.sourceStorylineId, undefined);
  assert.equal(publicEffect?.assessesUnquantifiedEventId, undefined);
  assert.equal(publicEffect?.annualRealGrowthDelta, -3,
    "public numerical effects survive the removal of private causal IDs");
  assert.equal(JSON.stringify(h.wireFor("guest")).includes(SECRET_SOURCE), false);
  assert.equal(h.store.docs.events.at(-1).impacts.polityChanges[0].statsEffects.sourceStorylineId,
    SECRET_SOURCE, "host keeps canonical causal provenance");
});
