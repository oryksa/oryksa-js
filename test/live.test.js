// Live test against https://api.oryksa.com/v1 with a test account key.
// Usage: ORYKSA_API_KEY=oryk_live_... node test/live.test.js
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { Oryksa, OryksaClient, OryksaError, verifyWebhook } from "../src/index.js";

const key = process.env.ORYKSA_API_KEY || (existsSync(".testkey") ? readFileSync(".testkey", "utf8").trim() : "");
assert.ok(key, "set ORYKSA_API_KEY");
const ok = (m) => console.log("  ok  " + m);

const o = new Oryksa(key);

// guards
assert.throws(() => new Oryksa("nope"));
assert.throws(() => new OryksaClient({ token: key }), /secret API key/);
ok("constructor guards");

const acc = await o.account();
assert.equal(acc.object, "account");
ok("account: plan=" + acc.plan);

const learned = await o.learnApp({
  name: "FitTrack",
  agentName: "Nova",
  description: "FitTrack is a fitness app to log workouts and follow training plans. Premium costs 4.99 EUR per month.",
  languages: ["en", "pt"],
  screens: [
    { title: "Workouts", content: "Tap + to log a workout. You can pick running, cycling, gym or yoga." },
    { title: "Plans", content: "Training plans: 5K beginner (6 weeks), Half marathon (12 weeks). Plans are in Premium." },
  ],
  settings: { units: "metric", sync: "Apple Health and Google Fit" },
  faq: [{ question: "How do I cancel Premium?", answer: "Settings > Subscription > Cancel. You keep Premium until the end of the paid month." }],
});
assert.ok(learned.pages && learned.pages.pages >= 3, "pages stored");
assert.equal(learned.faq.added + learned.faq.updated, 1);
ok("learnApp: " + learned.pages.pages + " pages, " + learned.pages.chars + " chars");

const kn = await o.knowledge.get();
assert.ok(kn.site_pages >= 3 && kn.faq_items >= 1);
ok("knowledge.get");

const r1 = await o.chat({ message: "How much is Premium and how do I cancel it?", customerName: "Test" });
assert.equal(r1.object, "chat_reply");
assert.ok(r1.reply && /4[.,]99/.test(r1.reply), "reply mentions the price: " + r1.reply);
ok("chat (learned app knowledge): " + r1.reply.slice(0, 90));

const r2 = await o.chat({ message: "Which sync options are there?", conversationId: r1.conversation_id });
assert.equal(r2.conversation_id, r1.conversation_id);
ok("chat keeps conversation: " + r2.reply.slice(0, 80));

const conv = await o.conversation(r1.conversation_id);
assert.ok(conv.messages.length >= 4);
ok("conversation read: " + conv.messages.length + " messages");

const sn = await o.widget.snippet({ framework: "react" });
assert.ok(sn.code.includes("oryksa-widget.js"));
ok("widget snippet");

// sessions + in-app client
const s = await o.createSession({ customerName: "App user", ttlMinutes: 10 });
assert.ok(s.client_token.startsWith("oryk_cs_"));
const c = new OryksaClient({ token: s.client_token });
const ag = await c.agent();
assert.equal(ag.name, "Nova");
const cr = await c.send("Is there a 5K plan?");
assert.ok(cr.reply && /5\s?K/i.test(cr.reply));
const cm = await c.messages();
assert.equal(cm.messages.length, 2);
ok("session client: agent=" + ag.name + ", reply=" + cr.reply.slice(0, 70));

// token refresh path
let calls = 0;
const c2 = new OryksaClient({ getToken: async () => { calls++; return (await o.createSession({ ttlMinutes: 5 })).client_token; } });
await c2.agent();
assert.equal(calls, 1);
ok("getToken refresh");

// errors
await assert.rejects(o.chat({ message: "" }), (e) => e instanceof OryksaError && e.code === "invalid_request" && e.status === 400);
await assert.rejects(o.webhooks.create({ url: "http://localhost/x" }), (e) => e.code === "invalid_request");
ok("typed errors");

// webhooks lifecycle
const wh = await o.webhooks.create({ url: "https://api.oryksa.com/v1", events: ["message.replied"] });
assert.ok(wh.secret.startsWith("whsec_"));
const tst = await o.webhooks.test(wh.id);
assert.equal(tst.delivered, false); // endpoint is not a receiver, but the request was sent
await o.webhooks.delete(wh.id);
ok("webhooks create/test/delete (HTTP " + tst.status + ")");

// webhook verification helper
const secret = "whsec_unit";
const body = JSON.stringify({ id: "evt_1", type: "message.replied", data: {} });
const t = Math.floor(Date.now() / 1000);
const header = `t=${t},v1=${createHmac("sha256", secret).update(t + "." + body).digest("hex")}`;
const ev = await verifyWebhook(body, header, secret);
assert.equal(ev.type, "message.replied");
await assert.rejects(verifyWebhook(body, header.replace(/v1=./, "v1=0"), secret));
await assert.rejects(verifyWebhook(body, `t=${t - 1000},v1=x`, secret));
ok("verifyWebhook");

console.log("\nALL PASSED");
