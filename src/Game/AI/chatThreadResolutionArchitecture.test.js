import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const gameplay = fs.readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");
const chatUi = fs.readFileSync(new URL("../GameUI/chat.jsx", import.meta.url), "utf8");

test("generated chats resolve by stable participant identity with the player implicit", () => {
  assert.match(gameplay, /reconcileChatsForPlayer\(\[stampedBuilt\], world, playerCountry\)/);
  assert.match(gameplay, /chatParticipantSetKey\(built, world\)/);
  assert.match(gameplay, /mergeIncomingChats\(chats, \[built\], world, \{ playerCountry \}\)/);
});

test("event-reaction and idle diplomacy use save-aware chat folding", () => {
  assert.match(gameplay, /source: "event-reaction"/);
  assert.match(gameplay, /readChatsState\(\{ force: true, world: latestWorld, playerCountry: bundle\.game\?\.country \}\)/);
  assert.match(gameplay, /export const maybeRunIdlePulse = maybeSendIdleDiplomacy/);
  assert.match(gameplay, /world: latestWorld,\s*playerCountry: bundle\.game\?\.country/);
});

test("chat UI loads and saves through player-aware reconciliation", () => {
  assert.match(chatUi, /readChatsState\(\{[^}]*world[^}]*playerCountry/s);
  assert.match(chatUi, /writeChatsState\([^,]+, \{[^}]*world[^}]*playerCountry/s);
});
