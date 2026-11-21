// The links of the AI's replies, offline (no key, no network): node test/links.test.js
import assert from "node:assert/strict";
import { OryksaClient, linksIn, withoutLinks, linkParts, openLink } from "../src/index.js";

// The reply the TugaFreela app showed as plain text on 21/11/2026 (owner: "os links ainda não estão clicáveis").
const reply = "Sim, encontrei alguns webdesigners para criar sua landing page. Você pode conferir este serviço de " +
  "landing page profissional focada em conversões:\n" +
  "https://tugafreela.pt/wharakawa/criar-uma-landing-page-profissional-focada-em-conversoes\n" +
  "Se quiser ver mais opções, aqui está a lista: https://tugafreela.pt/servico/explorar/28.";
const first = "https://tugafreela.pt/wharakawa/criar-uma-landing-page-profissional-focada-em-conversoes";
const second = "https://tugafreela.pt/servico/explorar/28";
const ok = (m) => console.log("  ok  " + m);

// the links of a reply, in order, without the final dot
assert.deepEqual(linksIn(reply), [first, second]);
assert.deepEqual(linksIn("a https://x.pt/a, b https://x.pt/a! c https://y.pt/b; d https://z.pt/c? e https://w.pt/d"),
  ["https://x.pt/a", "https://y.pt/b", "https://z.pt/c"]);
assert.deepEqual(linksIn('(see https://x.pt/a) or "https://y.pt/b"…'), ["https://x.pt/a", "https://y.pt/b"]);
assert.deepEqual(linksIn("no links here, write to info@x.pt"), []);
assert.deepEqual(linksIn(reply), [first, second], "the same answer twice (no state kept between calls)");
ok("links of a reply, in order, without the final dot (3 at most, no repeats)");

// the text without links: no addresses and no dangling colon
const t = withoutLinks(reply);
assert.ok(!t.includes("http"));
assert.ok(!t.includes("conversões:"));
assert.ok(t.includes("focada em conversões"));
assert.ok(!t.endsWith(":"));
assert.equal(withoutLinks("See https://x.pt/a ."), "See.");
ok("text without links: no addresses, no dangling colon");

// the parts of a message: web links and e-mails are tappable
const parts = linkParts("Snowboard at " + first + ". Mail info@tugafreela.pt or " + second + ".");
assert.equal(parts.map((p) => p.text).join(""), "Snowboard at " + first + ". Mail info@tugafreela.pt or " + second + ".");
assert.deepEqual(parts.filter((p) => p.url).map((p) => [p.text, p.url]),
  [[first, first], ["info@tugafreela.pt", "mailto:info@tugafreela.pt"], [second, second]]);
ok("message parts: web links and e-mails (mailto:)");

// the app's handler goes first: true = the app opened it, nothing else happens
const handled = [];
const opened = [];
globalThis.window = { open: (...a) => opened.push(a) };
openLink(first, (u) => { handled.push(u); return true; });
assert.deepEqual(handled, [first]);
assert.equal(opened.length, 0);
openLink(second, () => false);
assert.deepEqual(opened, [[second, "_blank", "noopener"]]);
delete globalThis.window;
ok("openLink: onLink first, then a new tab with noopener");

// the preview comes from the server once (same token as the other calls) and is kept
const asked = [];
let fail = false;
const fakeFetch = async (url, init) => {
  asked.push({ url, auth: init.headers.Authorization });
  if (fail) return { ok: false, status: 500, json: async () => ({ error: { code: "boom", message: "no" } }) };
  const u = decodeURIComponent(url.split("?url=")[1]);
  return { ok: true, status: 200, json: async () => ({ object: "link_preview", url: u, title: "Eu vou criar uma landing page profissional focada em conversões", image: "", site: "tugafreela.pt", price: null }) };
};
const c = new OryksaClient({ token: "oryk_cs_test", fetch: fakeFetch });
const p = await c.linkPreview(first);
assert.equal(p.title, "Eu vou criar uma landing page profissional focada em conversões");
assert.equal(p.site, "tugafreela.pt");
assert.equal(p.price, "");
assert.equal(asked.length, 1);
assert.equal(asked[0].url, "https://api.oryksa.com/v1/client/link-preview?url=" + encodeURIComponent(first));
assert.equal(asked[0].auth, "Bearer oryk_cs_test");
assert.deepEqual(await c.linkPreview(first), p);
assert.equal(asked.length, 1, "kept in memory");
await c.linkPreview("https://shop.pt/p?id=5&c=a+b#top");
assert.ok(asked[1].url.endsWith("?url=https%3A%2F%2Fshop.pt%2Fp%3Fid%3D5%26c%3Da%2Bb%23top"), "the whole address goes in the query");
fail = true;
assert.equal(await c.linkPreview("https://tugafreela.pt/other"), null, "a failed preview is null, never an error");
ok("linkPreview: one request with the session token, kept in memory, null on failure");

console.log("links: all tests passed");
