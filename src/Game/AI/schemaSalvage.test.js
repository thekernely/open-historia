/*! Open Historia — keeping an answer that is wrong in one place: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/schemaSalvage.test.js
//
// The first block runs without node_modules: schemaSalvage.js imports nothing.
// The second drives the game's real jump schema, because the promise being
// tested is about THAT validator's messages: if its wording changes, the
// salvage silently stops finding the fault and every malformed op costs the
// player a second request again.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeSchemaRemoval, parseErrorPath, salvageBySchema } from "./schemaSalvage.js";
import { validateGameplayPayload } from "./gameplaySchemas.js";

test("the path is read from the front of the validator's message", () => {
    assert.deepEqual(parseErrorPath("$.events[3].impacts.unitOps[1].unit.strength must be at most 1000."), {
        segments: ["events", 3, "impacts", "unitOps", 1, "unit", "strength"],
        rest: "must be at most 1000.",
    });
    assert.deepEqual(parseErrorPath("$ must be object; received array."), { segments: [], rest: "must be object; received array." });
    assert.deepEqual(parseErrorPath('$.stats["GDP (nominal)"].value must be number; received string.').segments, ["stats", "GDP (nominal)", "value"]);
    assert.equal(parseErrorPath("Jump payload must contain at least one event."), null);
    assert.equal(parseErrorPath(""), null);
});

// A small validator with the real one's wording.
const validateOrders = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, error: "$ must be object; received array." };
    if (typeof value.summary !== "string") return { valid: false, error: "$.summary is required." };
    if (!Array.isArray(value.orders)) return { valid: false, error: "$.orders is required." };
    if (value.orders.length > 3) return { valid: false, error: "$.orders must contain at most 3 items." };
    for (const [index, order] of value.orders.entries()) {
        if (typeof order.unit !== "string") return { valid: false, error: `$.orders[${index}].unit is required.` };
        for (const key of Object.keys(order)) {
            if (!["unit", "strength", "note"].includes(key)) return { valid: false, error: `$.orders[${index}].${key} is not allowed.` };
        }
        if (order.strength !== undefined && !(order.strength <= 1000)) {
            return { valid: false, error: `$.orders[${index}].strength must be at most 1000.` };
        }
    }
    return { valid: true };
};

test("a valid answer is returned untouched", () => {
    const answer = { summary: "quiet", orders: [{ unit: "1st Army", strength: 400 }] };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, true);
    assert.deepEqual(result.removed, []);
    assert.equal(result.value, answer);
});

test("an unknown field and a malformed optional field are removed, and the order survives", () => {
    const answer = { summary: "x", orders: [{ unit: "1st Army", strength: 4000, mood: "grim" }] };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, true);
    assert.deepEqual(answer.orders, [{ unit: "1st Army" }]);
    assert.deepEqual(result.removed.map((entry) => [entry.kind, entry.path]), [
        ["property", "$.orders[0].mood"],
        ["property", "$.orders[0].strength"],
    ]);
});

test("a missing required field takes its list item with it, and only that item", () => {
    const answer = { summary: "x", orders: [{ unit: "1st Army" }, { strength: 10 }, { unit: "3rd Army" }] };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, true);
    assert.deepEqual(answer.orders.map((order) => order.unit), ["1st Army", "3rd Army"]);
    assert.deepEqual(result.removed.map((entry) => [entry.kind, entry.path]), [["item", "$.orders[1]"]]);
});


test("protected path prefixes fail closed instead of deleting canonical state", () => {
    const answer = { summary: "x", orders: [{ unit: "1st Army" }, { strength: 10 }] };
    const result = salvageBySchema(answer, validateOrders, { protectedPathPrefixes: ["$.orders"] });
    assert.equal(result.valid, false);
    assert.match(result.error, /\$\.orders\[1\]\.unit is required/);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(answer.orders, [{ unit: "1st Army" }, { strength: 10 }]);
});

test("two faulty items in a row both go (the second moves into the first one's place)", () => {
    const answer = { summary: "x", orders: [{ strength: 1 }, { strength: 2 }, { unit: "3rd Army" }] };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, true);
    assert.deepEqual(answer.orders, [{ unit: "3rd Army" }]);
    assert.equal(result.removed.length, 2);
});

test("an over-long list keeps its first items", () => {
    const answer = { summary: "x", orders: ["a", "b", "c", "d", "e"].map((unit) => ({ unit })) };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, true);
    assert.deepEqual(answer.orders.map((order) => order.unit), ["a", "b", "c"]);
    assert.deepEqual(result.removed, [{
        kind: "truncate", path: "$.orders", error: "$.orders must contain at most 3 items.", removedCount: 2,
    }]);
});

test("a fault outside every list is not salvageable, and the answer is left as it came", () => {
    const answer = { orders: [{ unit: "1st Army" }] };
    const result = salvageBySchema(answer, validateOrders);
    assert.equal(result.valid, false);
    assert.equal(result.error, "$.summary is required.");
    assert.deepEqual(result.removed, []);
    assert.deepEqual(answer, { orders: [{ unit: "1st Army" }] });
});

test("an answer that is not an object, or a message with no path, is not salvageable", () => {
    assert.equal(salvageBySchema([], validateOrders).valid, false);
    assert.equal(salvageBySchema(null, validateOrders).valid, false);
    const noPath = salvageBySchema({ a: [1] }, () => ({ valid: false, error: "Payload must contain at least one event." }));
    assert.equal(noPath.valid, false);
    assert.deepEqual(noPath.removed, []);
});

test("an answer that is wrong everywhere stops at the cap instead of being taken apart", () => {
    const answer = { summary: "x", orders: Array.from({ length: 3 }, () => ({ strength: 1 })) };
    const result = salvageBySchema(answer, validateOrders, { maxRemovals: 2 });
    assert.equal(result.valid, false);
    assert.equal(result.removed.length, 2);
});

test("a removal is reported in words, with the caller's name for the place", () => {
    const answer = { summary: "x", orders: [{ unit: "1st Army" }, { strength: 10 }] };
    const result = salvageBySchema(answer, validateOrders, {
        describe: (value, path) => `order ${path[1] + 1} of ${value.orders.length}`,
    });
    assert.equal(result.removed[0].label, "order 2 of 2");
    assert.equal(
        describeSchemaRemoval(result.removed[0]),
        "order 2 of 2: $.orders[1] was malformed and was left out whole ($.orders[1].unit is required.)",
    );
    // A describe that throws costs the label, never the salvage.
    const again = salvageBySchema({ summary: "x", orders: [{ strength: 1 }] }, validateOrders, { describe: () => { throw new Error("no"); } });
    assert.equal(again.valid, true);
    assert.equal(again.removed[0].label, undefined);
});

// --- Against the game's own jump schema ---

const jumpEvent = (overrides = {}) => ({
    date: "2014-03-02",
    title: "Border guards withdraw",
    description: "The garrison pulls back from the crossing after a night of shelling.",
    importance: "medium",
    impacts: {},
    ...overrides,
});

const jumpAnswer = (events) => ({
    stopDate: "2014-03-30",
    summary: "A tense month.",
    clearActions: false,
    events,
});

test("the jump schema accepts the baseline answer these tests build on", () => {
    const verdict = validateGameplayPayload("jumpForward", jumpAnswer([jumpEvent()]));
    assert.equal(verdict.valid, true, verdict.error);
});

test("one malformed unit op costs that op, not the turn", () => {
    const answer = jumpAnswer([
        jumpEvent({ impacts: { unitOps: [
            { op: "strength", unitId: "u-1", strength: 5000 },
            { op: "move", unitId: "u-2", toLng: 30.5, toLat: 50.4 },
        ] } }),
        jumpEvent({ title: "Second event" }),
    ]);
    const before = validateGameplayPayload("jumpForward", structuredClone(answer));
    assert.equal(before.valid, false, "the fixture must start out rejected");
    const result = salvageBySchema(answer, (value) => validateGameplayPayload("jumpForward", value));
    assert.equal(result.valid, true, result.error);
    assert.equal(answer.events.length, 2);
    assert.ok(result.removed.length >= 1);
    assert.ok(result.removed.every((entry) => entry.path.startsWith("$.events[0].impacts.unitOps")), JSON.stringify(result.removed));
    assert.ok(answer.events[0].impacts.unitOps.some((op) => op.unitId === "u-2"), "the sound op is kept");
});

test("an event with no title is left out and the rest of the turn stands", () => {
    const broken = jumpEvent();
    delete broken.title;
    const answer = jumpAnswer([jumpEvent({ title: "Kept" }), broken]);
    const result = salvageBySchema(answer, (value) => validateGameplayPayload("jumpForward", value));
    assert.equal(result.valid, true, result.error);
    assert.deepEqual(answer.events.map((event) => event.title), ["Kept"]);
});

test("Opossum regression: an unsupported applied economic event cannot vanish while the summary survives", () => {
    const account = { status: "applied",
        reason: "The Khanate changed trade tariff arrangements and commodity settlement procedures." };
    const claim = jumpEvent({
        title: "Steppe Relay Khanate Formalizes Silver-Standard Barter Tariffs",
        tags: ["Economy"], economicAccounting: account,
        description: "The Khanate finalizes a new tariff regime for silver settlement.",
    });
    const input = jumpAnswer([
        jumpEvent({ title: "Other accepted event" }), claim,
    ]);
    input.summary = "The Steppe Relay Khanate finalizes silver-standard barter tariffs.";
    input.history = { summary: "The Khanate adopted new silver tariffs.",
        document: "National silver tariffs are now enacted." };
    // The production jump schema does not accept arbitrary fields or invent
    // statsEffects to make 'applied' true. Its actual error first points at
    // economicAccounting; naive salvage drops that field, then the whole event.
    const base = structuredClone(input);
    const response = salvageBySchema(input,
        (candidate) => validateGameplayPayload("jumpForward", candidate),
        { protectedArrayItems: ["$.events"] });
    assert.equal(response.valid, false);
    assert.equal(input.events.length, 2, "an event cannot be removed while history still asserts it");
    assert.deepEqual(input.events[1].title, claim.title);
    assert.equal(input.summary, base.summary);
    assert.ok(response.removed.every((entry) => entry.path !== "$.events[1]"));
    assert.match(response.error, /economicAccounting|events\[1\]/);
});

test("an unrepairable missing event title cannot be hidden by truncating the timeline", () => {
    const missingTitle = jumpEvent();
    delete missingTitle.title;
    const input = jumpAnswer([jumpEvent({ title: "Keep" }), missingTitle]);
    input.summary = "A second, now-invalid event occurred.";
    const output = salvageBySchema(input, (candidate) => validateGameplayPayload("jumpForward", candidate),
        { protectedArrayItems: ["$.events"] });
    assert.equal(output.valid, false);
    assert.equal(input.events.length, 2);
    assert.deepEqual(output.removed, []);
});

test("the jump still salvages malformed optional tags without discarding the event", () => {
    const input = jumpAnswer([jumpEvent({ title: "Retain", tags: ["Military", "UNKNOWN"] })]);
    const response = salvageBySchema(input, (candidate) => validateGameplayPayload("jumpForward", candidate),
        { protectedArrayItems: ["$.events"] });
    assert.equal(response.valid, true, response.error);
    assert.deepEqual(input.events[0].tags, ["Military"]);
    assert.deepEqual(response.removed.map((entry) => entry.path), ["$.events[0].tags[1]"]);
});

test("a protected timeline array cannot be truncated to remove events referenced by the summary", () => {
    const answer = { summary: "All four events happened.",
        orders: [{ unit: "one" }, { unit: "two" }, { unit: "three" }, { unit: "four" }] };
    const denied = salvageBySchema(structuredClone(answer), validateOrders,
        { protectedArrayItems: ["$.orders"] });
    assert.equal(denied.valid, false);
    assert.equal(denied.value.orders.length, 4);
    const allowed = salvageBySchema(structuredClone(answer), validateOrders);
    assert.equal(allowed.valid, true);
    assert.equal(allowed.value.orders.length, 3);
});

test("time-skip task runner actually protects canonical event deletion", () => {
    const source = readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");
    assert.match(source, /protectedArrayItems: \["jumpForward", "autoJumpForward"\]\.includes\(taskKey\)/);
});

test("a jump with no stop date is not something removal can fix", () => {
    const answer = jumpAnswer([jumpEvent()]);
    delete answer.stopDate;
    const result = salvageBySchema(answer, (value) => validateGameplayPayload("jumpForward", value));
    assert.equal(result.valid, false);
    assert.deepEqual(result.removed, []);
});
