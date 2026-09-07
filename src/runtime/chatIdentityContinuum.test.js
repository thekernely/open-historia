import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeIncomingChats,
  reconcileChatsForPlayer,
  resolveChatParticipantIdentity,
} from "./gameState.js";

const world = {
  polityOverrides: {
    Germany: { name: "Third Reich", aliases: ["Germany", "the Reich"], status: "active" },
    France: { name: "French Republic", aliases: ["France"], status: "active" },
    Latvia: { name: "Republic of Latvia", aliases: ["Latvia"], status: "active" },
    Lithuania: { name: "Republic of Lithuania", aliases: ["Lithuania"], status: "active" },
    Estonia: { name: "Republic of Estonia", aliases: ["Estonia"], status: "active" },
    Poland: { name: "Republic of Poland", aliases: ["Poland"], status: "active" },
  },
};

test("chat identity follows a polity rename without minting a second thread", () => {
  const chats = reconcileChatsForPlayer([
    {
      id: "older",
      countries: [{ name: "Germany" }],
      messages: [{ id: "m1", speaker: "Germany", role: "assistant", text: "First", time: "1936-01-01" }],
      status: "open",
    },
    {
      id: "newer",
      countries: [{ name: "Third Reich" }],
      messages: [{ id: "m2", speaker: "Third Reich", role: "assistant", text: "Second", time: "1936-02-01" }],
      status: "open",
    },
  ], world, "France");

  assert.equal(chats.length, 1);
  assert.equal(chats[0].countries[0].polityKey, "Germany");
  assert.equal(chats[0].countries[0].name, "Third Reich");
  assert.deepEqual(chats[0].messages.map((message) => message.text), ["First", "Second"]);
});

test("incoming chat data merges onto the established stable thread", () => {
  const merged = mergeIncomingChats(
    [{
      id: "thread",
      countries: [{ name: "Germany" }],
      messages: [{ id: "m1", speaker: "Germany", role: "assistant", text: "First" }],
      status: "open",
    }],
    [{
      id: "generated-copy",
      countries: [{ name: "the Reich" }],
      messages: [{ id: "m2", speaker: "the Reich", role: "assistant", text: "Reply" }],
      status: "open",
    }],
    world,
    { playerCountry: "France" },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "thread");
  assert.deepEqual(merged[0].messages.map((message) => message.text), ["First", "Reply"]);
});

test("participant resolution persists the stable polity key but keeps the current display name", () => {
  const resolved = resolveChatParticipantIdentity({ name: "Germany", code: "DEU" }, world);
  assert.equal(resolved.safe, true);
  assert.equal(resolved.polityKey, "Germany");
  assert.equal(resolved.participant.name, "Third Reich");
});


test("event-generated group outreach strips the implicit player and preserves the established group history", () => {
  const merged = mergeIncomingChats(
    [{
      id: "baltic-thread",
      countries: [
        { name: "Republic of Lithuania", polityKey: "Lithuania" },
        { name: "Republic of Estonia", polityKey: "Estonia" },
      ],
      messages: [
        { id: "old-1", speaker: "Republic of Lithuania", role: "leader", text: "Earlier Baltic coordination", time: "2014-03-20" },
        { id: "old-2", speaker: "Republic of Estonia", role: "leader", text: "Earlier Estonian reply", time: "2014-03-20" },
      ],
      status: "open",
    }],
    [{
      id: "event-generated-copy",
      // Event transport may redundantly include the campaign player. The player is
      // implicit and must not turn the same Baltic channel into a new participant set.
      countries: [
        { name: "Republic of Latvia" },
        { name: "Republic of Lithuania" },
        { name: "Republic of Estonia" },
      ],
      messages: [
        { id: "new-1", speaker: "Republic of Lithuania", role: "leader", text: "New event-based coordination message", time: "2014-03-22" },
      ],
      status: "open",
    }],
    world,
    { playerCountry: "Republic of Latvia" },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "baltic-thread");
  assert.deepEqual(merged[0].countries.map((country) => country.polityKey).sort(), ["Estonia", "Lithuania"]);
  assert.deepEqual(merged[0].messages.map((message) => message.text), [
    "Earlier Baltic coordination",
    "Earlier Estonian reply",
    "New event-based coordination message",
  ]);
});

test("event-generated bilateral outreach cannot create a me plus me plus Poland thread", () => {
  const merged = mergeIncomingChats(
    [{
      id: "poland-thread",
      countries: [{ name: "Republic of Poland", polityKey: "Poland" }],
      messages: [{ id: "old", speaker: "Republic of Poland", role: "leader", text: "Existing Polish channel", time: "2014-04-21" }],
      status: "open",
    }],
    [{
      id: "event-copy",
      countries: [{ name: "Republic of Latvia" }, { name: "Republic of Poland" }],
      messages: [{ id: "new", speaker: "Republic of Poland", role: "leader", text: "Event follow-up", time: "2014-06-20" }],
      status: "open",
    }],
    world,
    { playerCountry: "Latvia" },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "poland-thread");
  assert.deepEqual(merged[0].countries.map((country) => country.polityKey), ["Poland"]);
  assert.deepEqual(merged[0].messages.map((message) => message.text), ["Existing Polish channel", "Event follow-up"]);
});
