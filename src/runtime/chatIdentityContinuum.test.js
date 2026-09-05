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
