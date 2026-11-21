// The AI doing what your app needs, offline (no key, no network): node test/ai.test.js
// Owner 2026-11-21: counted as ORYKSA interactions.
import assert from "node:assert/strict";
import { OryksaClient, aiBody, aiResult } from "../src/index.js";

let seen = null;
const fakeFetch = async (url, init) => {
  seen = { url, body: JSON.parse(init.body) };
  return { ok: true, status: 200, json: async () => ({ object: "ai_result", text: '{"size":"205/55 R16 91V"}', json: { size: "205/55 R16 91V" }, oryksa: { interactions_spent: 1, interactions_remaining: 99 } }) };
};
const c = new OryksaClient({ token: "oryk_cs_test", fetch: fakeFetch });
const r = await c.ai({ instructions: "Read the tyre size. Never invent.", images: [{ base64: "AQID" }], schema: { type: "object" } });
assert.equal(seen.url, "https://api.oryksa.com/v1/client/ai");
assert.equal(seen.body.instructions, "Read the tyre size. Never invent.");
assert.deepEqual(seen.body.images, [{ base64: "AQID", mime: "image/jpeg" }]);
assert.deepEqual(seen.body.schema, { type: "object" });
assert.ok(!("message" in seen.body));
assert.equal(r.json.size, "205/55 R16 91V");
assert.equal(r.interactionsSpent, 1);
assert.equal(r.interactionsRemaining, 99);
const t = aiResult({ object: "ai_result", text: "Lisboa.", json: null, oryksa: { interactions_spent: 1 } });
assert.equal(t.text, "Lisboa.");
assert.equal(t.json, null);
assert.equal(t.interactionsRemaining, null);
assert.throws(() => aiBody({}), /needs/);
const p = { base64: "AQ" };
assert.throws(() => aiBody({ input: "x", images: [p, p, p, p, p] }), /at most 4/);
console.log("ai tests passed");
