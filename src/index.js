/*!
 * @oryksa/sdk - ORYKSA AI Employees SDK for JavaScript and TypeScript.
 * Server client (secret API key), webhook verification, and an in-app chat
 * client that only uses short-lived session tokens (never the secret key).
 * Docs: https://developer.oryksa.com   License: MIT
 */

const DEFAULT_BASE = "https://api.oryksa.com/v1";
export const VERSION = "0.1.5";

export class OryksaError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "OryksaError";
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

async function request(base, token, method, path, body, fetchImpl, timeoutMs) {
  const f = fetchImpl || globalThis.fetch;
  if (!f) throw new Error("fetch is not available: pass { fetch } in the options (Node < 18).");
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await f(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-ORYKSA-SDK": "js/" + VERSION,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok && res.status !== 202) {
    const e = (data && data.error) || {};
    const { code, message, ...extra } = e;
    throw new OryksaError(res.status, code || "http_" + res.status, message || "Request failed with HTTP " + res.status, extra);
  }
  return data;
}

/**
 * Server-side client. Uses the SECRET API key (oryk_live_...). Never ship it in a browser or app bundle.
 */
export class Oryksa {
  constructor(apiKey, opts = {}) {
    if (!apiKey || !String(apiKey).startsWith("oryk_live_")) {
      throw new Error("An ORYKSA API key (oryk_live_...) is required. Create one at developer.oryksa.com.");
    }
    if (typeof window !== "undefined" && typeof document !== "undefined" && !opts.dangerouslyAllowBrowser) {
      throw new Error("The secret API key must stay on the server. In apps use OryksaClient with a session token.");
    }
    this._key = apiKey;
    this._base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
    this._fetch = opts.fetch;
    this._timeout = opts.timeoutMs || 60000;
  }

  _req(method, path, body) {
    return request(this._base, this._key, method, path, body, this._fetch, this._timeout);
  }

  account() { return this._req("GET", "/account"); }

  /** Chat with the AI employee. Reuse conversationId to keep the context. */
  chat({ message, conversationId, customerName } = {}) {
    return this._req("POST", "/chat", { message, conversation_id: conversationId, customer_name: customerName });
  }

  conversations({ limit } = {}) { return this._req("GET", "/conversations" + (limit ? "?limit=" + Number(limit) : "")); }
  conversation(id) { return this._req("GET", "/conversations/" + encodeURIComponent(id)); }

  get agent() {
    return {
      update: (fields) => this._req("PATCH", "/agent", fields),
      appearance: (fields) => this._req("PATCH", "/agent/appearance", fields),
    };
  }

  get knowledge() {
    return {
      get: () => this._req("GET", "/knowledge"),
      setPages: ({ pages, businessSummary, siteUrl }) =>
        this._req("PUT", "/knowledge/pages", { pages, business_summary: businessSummary, site_url: siteUrl }),
      crawl: ({ url, maxPages }) => this._req("POST", "/knowledge/crawl", { url, max_pages: maxPages }),
      addFaq: (items) => this._req("POST", "/knowledge/faq", { items }),
    };
  }

  get widget() {
    return {
      snippet: ({ framework = "html", lang = "", position = "" } = {}) =>
        this._req("GET", `/widget?framework=${encodeURIComponent(framework)}&lang=${encodeURIComponent(lang)}&position=${encodeURIComponent(position)}`),
      setDomains: (domains) => this._req("PUT", "/widget/domains", { domains }),
    };
  }

  get webhooks() {
    return {
      list: () => this._req("GET", "/webhooks"),
      create: ({ url, events = ["*"] }) => this._req("POST", "/webhooks", { url, events }),
      delete: (id) => this._req("DELETE", "/webhooks/" + encodeURIComponent(id)),
      test: (id) => this._req("POST", "/webhooks/" + encodeURIComponent(id) + "/test"),
    };
  }

  /** Short-lived token for an app user. Send only this token to the app.
   * For a user signed in to your app, pass customerEmail and/or customerPhone (with the country code):
   * the AI then asks for no contact details and knows the customer is signed in. */
  createSession({ conversationId, customerName, customerEmail, customerPhone, ttlMinutes = 60 } = {}) {
    return this._req("POST", "/sessions", { conversation_id: conversationId, customer_name: customerName,
      customer_email: customerEmail, customer_phone: customerPhone, ttl_minutes: ttlMinutes });
  }

  /**
   * Teach the AI employee about an app: what it is, its screens/features and FAQs.
   * The agent then answers users inside the app with that knowledge.
   * @param {{name:string, description?:string, screens?:{title:string, content:string, url?:string}[], faq?:{question:string, answer:string}[], languages?:string[], agentName?:string, settings?:object}} app
   */
  async learnApp(app) {
    if (!app || !app.name) throw new Error("learnApp needs at least { name }.");
    const out = {};
    const profile = { business_name: app.name };
    if (app.description) profile.business_description = app.description;
    if (app.agentName) profile.agent_name = app.agentName;
    if (Array.isArray(app.languages)) profile.languages = app.languages;
    if (Array.isArray(app.services)) profile.services = app.services;
    out.agent = await this.agent.update(profile);
    const pages = [];
    if (app.description) pages.push({ title: app.name + " - overview", content: app.description });
    for (const s of app.screens || []) {
      if (s && s.content) pages.push({ title: s.title || "Screen", url: s.url, content: String(s.content) });
    }
    if (app.settings && typeof app.settings === "object") {
      const lines = Object.entries(app.settings).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      pages.push({ title: app.name + " - configuration", content: lines.join("\n") });
    }
    if (pages.length) out.pages = await this.knowledge.setPages({ pages, siteUrl: app.url });
    if (Array.isArray(app.faq) && app.faq.length) out.faq = await this.knowledge.addFaq(app.faq);
    return out;
  }
}

/**
 * Verify an ORYKSA webhook signature (Node.js). Pass the RAW request body.
 * @returns {Promise<object>} the parsed event, or throws OryksaError(400).
 */
export async function verifyWebhook(rawBody, signatureHeader, secret, { toleranceSeconds = 300 } = {}) {
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map((p) => p.split("=")));
  const t = Number(parts.t || 0);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) throw new OryksaError(400, "invalid_signature", "Webhook timestamp is missing or too old.");
  const body = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  let expected;
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body));
    expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    const { createHmac } = await import("node:crypto");
    expected = createHmac("sha256", secret).update(t + "." + body).digest("hex");
  }
  const got = String(parts.v1 || "");
  let diff = expected.length ^ got.length;
  for (let i = 0; i < Math.min(expected.length, got.length); i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) throw new OryksaError(400, "invalid_signature", "Webhook signature does not match.");
  return JSON.parse(body);
}

/**
 * In-app client (browser, React Native, Electron). Uses a short-lived session token
 * created by YOUR server with Oryksa.createSession(). Pass getToken() to refresh it.
 */
export class OryksaClient {
  constructor({ token, getToken, baseUrl, fetch, timeoutMs } = {}) {
    if (!token && !getToken) throw new Error("OryksaClient needs { token } or { getToken }.");
    if (token && String(token).startsWith("oryk_live_")) throw new Error("Never use the secret API key in an app. Use a session token (oryk_cs_...).");
    this._token = token || null;
    this._getToken = getToken || null;
    this._base = (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
    this._fetch = fetch;
    this._timeout = timeoutMs || 60000;
    this._previews = new Map();
  }

  async _tok(force) {
    if ((!this._token || force) && this._getToken) this._token = await this._getToken();
    return this._token;
  }

  async _req(method, path, body) {
    try {
      return await request(this._base, await this._tok(false), method, path, body, this._fetch, this._timeout);
    } catch (e) {
      if (e instanceof OryksaError && (e.code === "session_expired" || e.status === 401) && this._getToken) {
        return request(this._base, await this._tok(true), method, path, body, this._fetch, this._timeout);
      }
      throw e;
    }
  }

  agent() { return this._req("GET", "/client/agent"); }
  /**
   * Sends a message. opts.image: a photo from the customer ({ base64, mime }, up to 2 MB), the AI looks at it.
   * opts.file: a document ({ base64, name, mime }: PDF, Word, text, CSV, up to 8 MB), the AI reads it.
   */
  send(message, opts) { return this._req("POST", "/client/chat", chatBody(message, opts)); }
  messages() { return this._req("GET", "/client/messages"); }

  /**
   * An AI task of your own app, counted as ORYKSA interactions (1 per answer): read a photo, extract data,
   * classify, translate, write. It never creates a conversation in the business's inbox and never acts on the
   * account. Your prompt (instructions) and your JSON Schema (schema) live in your app.
   * opts: { instructions?, input?, images?: [{ base64, mime? }] (up to 4, about 1.5 MB each), schema?, maxTokens?, temperature? }
   * Resolves { text, json, interactionsSpent, interactionsRemaining }.
   */
  async ai(opts) {
    return aiResult(await this._req("POST", "/client/ai", aiBody(opts)));
  }

  /**
   * Title and picture of a link the AI gave, for the card under her reply:
   * { object: "link_preview", url, title, image, site, price }. Only the pages of the business's own
   * site (its website chat domains) get a title and a picture. Resolves null when it cannot be read;
   * never throws. Kept in memory for this client.
   */
  async linkPreview(url) {
    const key = String(url || "");
    if (this._previews.has(key)) return this._previews.get(key);
    try {
      const d = (await this._req("GET", "/client/link-preview?url=" + encodeURIComponent(key))) || {};
      const str = (v) => (v === null || v === undefined ? "" : String(v));
      const p = { object: "link_preview", url: str(d.url), title: str(d.title), image: str(d.image), site: str(d.site), price: str(d.price) };
      if (this._previews.size > 200) this._previews.clear();
      this._previews.set(key, p);
      return p;
    } catch (_) {
      return null;
    }
  }
}

/** The JSON of POST /v1/client/ai. */
export function aiBody(opts) {
  const o = opts || {};
  const images = Array.isArray(o.images) ? o.images : [];
  if (!o.instructions && !o.input && !images.length) throw new Error("ai() needs instructions, input or an image.");
  if (images.length > 4) throw new Error("ai() takes at most 4 images.");
  const body = { platform: "web" };
  if (o.instructions) body.instructions = String(o.instructions);
  if (o.input) body.input = String(o.input);
  if (images.length) body.images = images.map((i) => ({ base64: i.base64, mime: i.mime || "image/jpeg" }));
  if (o.schema) body.schema = o.schema;
  if (o.maxTokens != null) body.max_tokens = o.maxTokens;
  if (o.temperature != null) body.temperature = o.temperature;
  return body;
}

/** Reads an ai_result answer. */
export function aiResult(d) {
  const use = (d && d.oryksa) || {};
  return {
    text: (d && d.text) || "",
    json: d && d.json && typeof d.json === "object" ? d.json : null,
    interactionsSpent: use.interactions_spent || 0,
    interactionsRemaining: use.interactions_remaining == null ? null : use.interactions_remaining,
  };
}

/** The JSON of POST /v1/client/chat. */
function chatBody(message, opts) {
  const o = opts || {};
  const body = { message };
  if (o.image && o.image.base64) { body.image_base64 = o.image.base64; body.image_mime = o.image.mime || "image/jpeg"; }
  if (o.file && typeof o.file.base64 === "string") {
    body.file_base64 = o.file.base64; body.file_name = o.file.name || "file"; body.file_mime = o.file.mime || "application/octet-stream";
  }
  return body;
}

/* ------------------------------------------------------------------ Attachments */
/** The largest photo the chat sends (after it is made smaller): 2 MB. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** The largest document the chat sends: 8 MB. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const DOC_MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };

/** The type of a file from its name ("application/octet-stream" when it is not a known one). */
export function mimeOf(name) { return DOC_MIME[extOf(name)] || "application/octet-stream"; }

/** How many bytes a base64 text holds. */
export function base64Bytes(b64) {
  const s = String(b64 || "").replace(/\s+/g, "");
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** The size of a photo of w x h pixels with its longest side at most maxSide (never larger). */
export function scaledSize(w, h, maxSide = 1600) {
  if (!(w > 0 && h > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** A photo ({ base64, mime }) as what the chat sends: { image } or { error: "big" | "failed" }. */
export function photoAttachment(p) {
  if (!p || typeof p.base64 !== "string" || !p.base64) return { error: "failed" };
  if (base64Bytes(p.base64) > MAX_PHOTO_BYTES) return { error: "big" };
  return { image: { base64: p.base64, mime: p.mime || "image/jpeg" } };
}

/**
 * A document ({ base64, name, mime } or { tooBig: true }) as what the chat sends: pictures up to 2 MB
 * as { image } (the AI looks at it), the rest as { file } up to 8 MB, else { error: "big" | "failed" }.
 */
export function documentAttachment(d) {
  if (!d) return { error: "failed" };
  if (d.tooBig) return { error: "big" };
  if (typeof d.base64 !== "string") return { error: "failed" };
  const size = base64Bytes(d.base64);
  if (size > MAX_FILE_BYTES) return { error: "big" };
  const name = d.name || "file";
  const mime = DOC_MIME[extOf(name)] || d.mime || "application/octet-stream";
  if (mime.startsWith("image/") && size <= MAX_PHOTO_BYTES) return { image: { base64: d.base64, mime } };
  return { file: { base64: d.base64, name, mime } };
}

const blobToBase64 = (blob) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result || "").replace(/^data:[^,]*,/, ""));
  r.onerror = () => fail(r.error || new Error("read failed"));
  r.readAsDataURL(blob);
});

/** A picture File as a JPEG of at most 1600 pixels on its longest side, at 80% (browser: canvas). */
export async function photoFromFile(file, maxSide = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("not a picture")); i.src = url; });
    const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, maxSide);
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; // JPEG has no transparency
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", quality));
    if (!blob) throw new Error("could not make the JPEG");
    return { base64: await blobToBase64(blob), mime: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A document File as { base64, name, mime } (or { tooBig: true } above 8 MB, without reading it). */
export async function documentFromFile(file) {
  if (file.size > MAX_FILE_BYTES) return { tooBig: true, name: file.name };
  return { base64: await blobToBase64(file), name: file.name, mime: file.type || mimeOf(file.name) };
}

/* ------------------------------------------------------------------ Links of the AI's replies */
const URL_RE = /https?:\/\/[^\s<>"'\)\]]+/gi;
const MAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Every match of re in s (a fresh copy of the regular expression, so no state is shared). */
function allMatches(re, s) {
  const r = new RegExp(re.source, re.flags);
  const out = [];
  let m;
  while ((m = r.exec(s)) !== null) {
    out.push(m);
    if (m[0] === "") r.lastIndex++;
  }
  return out;
}

const trimEnd = (u) => u.replace(/[.,;:!?…]+$/, "");

/** The distinct web links of text, in order, without the punctuation that ends the sentence (at most max). */
export function linksIn(text, max = 3) {
  const out = [];
  for (const m of allMatches(URL_RE, String(text || ""))) {
    const u = trimEnd(m[0]);
    if (!out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** text without its web links (what a voice screen shows: the link is on the button). */
export function withoutLinks(text) {
  return String(text || "")
    .replace(URL_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;!?])/g, "$1")
    .replace(/:\s*$/gm, "")
    .trim();
}

/** text as parts { text, url }: url only on the links (web, and e-mail as mailto:). */
export function linkParts(text) {
  const s = String(text || "");
  const hits = [];
  for (const m of allMatches(URL_RE, s)) {
    const u = trimEnd(m[0]);
    hits.push({ start: m.index, end: m.index + u.length, url: u });
  }
  for (const m of allMatches(MAIL_RE, s)) {
    const start = m.index, end = m.index + m[0].length;
    if (hits.some((x) => start < x.end && end > x.start)) continue;
    hits.push({ start, end, url: "mailto:" + m[0] });
  }
  hits.sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const x of hits) {
    if (x.start < at) continue;
    if (x.start > at) out.push({ text: s.slice(at, x.start), url: null });
    out.push({ text: s.slice(x.start, x.end), url: x.url });
    at = x.end;
  }
  if (at < s.length) out.push({ text: s.slice(at), url: null });
  return out;
}

/**
 * Opens a link: your handler first (return true when your app opened it, for example its own product
 * page), then a new tab (window.open with noopener).
 */
export function openLink(url, handler) {
  if (handler && handler(url) === true) return;
  if (typeof window !== "undefined" && window.open) window.open(url, "_blank", "noopener");
}

const hostOf = (url) => {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(String(url || ""));
  return m ? m[1].replace(/^www\./i, "") : "";
};

/* ------------------------------------------------------------------ Browser chat UI */
const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:Manrope,Inter,system-ui,-apple-system,Segoe UI,sans-serif}
.btn{position:fixed;bottom:22px;display:flex;align-items:center;gap:10px;background:var(--accent);color:#fff;border:0;border-radius:999px;padding:8px 18px 8px 8px;cursor:pointer;box-shadow:0 12px 30px rgba(22,27,61,.28);font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;z-index:2147483000}
.btn img{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #fff}
.panel{position:fixed;bottom:92px;width:380px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(22,27,61,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;color:var(--ink)}
.panel.open{display:flex}
.hd{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eceef6}
.hd img{width:46px;height:46px;border-radius:50%;object-fit:cover}
.hd b{display:block;font-size:14px;letter-spacing:.14em;text-transform:uppercase}
.hd small{color:#6b7280;font-size:12px}
.hd button{margin-left:auto;border:0;background:none;font-size:20px;cursor:pointer;color:#6b7280}
.msgs{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#fff}
.m{max-width:82%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
.m.a{background:var(--soft);align-self:flex-start;border-bottom-left-radius:6px}
.m.u{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:6px}
.m.t{opacity:.6}
.sug{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 10px}
.sug button{border:1px solid #dcdcf5;background:#fff;color:var(--accent);border-radius:999px;padding:7px 12px;font-size:12.5px;cursor:pointer}
form{display:flex;border-top:1px solid #eceef6}
input{flex:1;border:0;padding:14px 16px;font-size:14px;outline:none;color:var(--ink)}
form button{border:0;background:var(--accent);color:#fff;font-weight:800;padding:0 18px;letter-spacing:.1em;cursor:pointer}
.pw{text-align:center;font-size:10.5px;letter-spacing:.12em;color:#9ca3af;padding:6px 0 8px;text-transform:uppercase}
.pw b{color:var(--accent)}
.m a{text-decoration:underline;cursor:pointer;word-break:break-all}
.m.a a{color:var(--accent)}
.m.u a{color:#fff}
.lk{align-self:flex-start;width:86%;display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;cursor:pointer;margin-top:-4px}
.lk .pic{flex:none;width:52px;height:52px;border-radius:10px;background:#e5e7eb;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#6b7280}
.lk .pic img{width:100%;height:100%;object-fit:cover}
.lk .tx{flex:1;min-width:0}
.lk .tt{font-size:13.5px;line-height:1.3;font-weight:700;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.lk .sb{font-size:11.5px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lk button{flex:none;border:0;background:var(--accent);color:#fff;border-radius:999px;min-height:36px;padding:0 14px;font-size:13px;font-weight:700;cursor:pointer}
form button.clip{background:none;color:var(--accent);padding:0 10px;display:flex;align-items:center}
form button.clip:disabled{opacity:.5;cursor:default}
.menu{display:none;flex-direction:column;border-top:1px solid #eceef6;padding:4px 0}
.menu.open{display:flex}
.menu button{border:0;background:none;text-align:left;padding:11px 16px;font-size:14px;color:var(--ink);cursor:pointer}
.menu button:hover{background:#f5f5fb}
.note{display:none;align-self:center;margin:0 auto 8px;background:var(--ink);color:#fff;font-size:12.5px;padding:8px 12px;border-radius:999px}
.note.on{display:block}
.m .ph{display:block;width:200px;height:160px;object-fit:cover;border-radius:12px}
.m .fl{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}
.m .fl svg{flex:none}
.m .ph + .fl{margin-top:8px}
.m .ph + span,.m .fl + span{display:block;margin-top:8px}
`;

const CLIP_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
const DOC_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

const LINK_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

const UI_TXT = {
  en: { talk: "Talk to", ph: "Type your question", send: "Send", err: "Sorry, something went wrong. Try again.", open: "Open",
    attach: "Attach", gallery: "Photo library", camera: "Camera", document: "Document", big: "The file is too large (max 8 MB).", attachErr: "Could not attach the file." },
  pt: { talk: "Falar com", ph: "Escreve a tua pergunta", send: "Enviar", err: "Desculpa, algo correu mal. Tenta de novo.", open: "Abrir",
    attach: "Anexar", gallery: "Foto da galeria", camera: "Câmara", document: "Documento", big: "O ficheiro é demasiado grande (máx. 8 MB).", attachErr: "Não foi possível anexar o ficheiro." },
  br: { talk: "Falar com", ph: "Digite sua pergunta", send: "Enviar", err: "Desculpe, algo deu errado. Tente de novo.", open: "Abrir",
    attach: "Anexar", gallery: "Foto da galeria", camera: "Câmera", document: "Documento", big: "O arquivo é grande demais (máx. 8 MB).", attachErr: "Não foi possível anexar o arquivo." },
  es: { talk: "Hablar con", ph: "Escribe tu pregunta", send: "Enviar", err: "Lo siento, algo salió mal. Inténtalo de nuevo.", open: "Abrir",
    attach: "Adjuntar", gallery: "Foto de la galería", camera: "Cámara", document: "Documento", big: "El archivo es demasiado grande (máx. 8 MB).", attachErr: "No se pudo adjuntar el archivo." },
};

/**
 * Mount the ORYKSA chat inside a web app (same look as the website chat).
 * onLink(url): what your app does with a link the AI gave; return true when your app opened it,
 * otherwise it opens in a new tab. attachments (default true): the attach button (photo library,
 * camera on phones, document).
 * @param {{client: OryksaClient, lang?: 'en'|'pt'|'br'|'es', position?: 'left'|'right', accent?: string, ink?: string, soft?: string, open?: boolean, onLink?: (url: string) => boolean, attachments?: boolean}} opts
 */
export function mountChat(opts) {
  if (typeof document === "undefined") throw new Error("mountChat runs in a browser. In React Native use @oryksa/react-native.");
  const client = opts.client;
  const lang = UI_TXT[opts.lang] ? opts.lang : "en";
  const tx = UI_TXT[lang];
  const host = document.createElement("div");
  host.id = "oryksa-sdk-chat";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const side = opts.position === "left" ? "left:22px" : "right:22px";
  root.innerHTML = `<style>${CSS}
    :host{--accent:${opts.accent || "#5B57E0"};--ink:${opts.ink || "#161B3D"};--soft:${opts.soft || "#EEEBFB"}}
    .btn,.panel{${side}}</style>
    <button class="btn" part="button"><img alt=""><span></span></button>
    <div class="panel" part="panel"><div class="hd"><img alt=""><div><b></b><small></small></div><button aria-label="close">&times;</button></div>
    <div class="msgs"></div><div class="sug"></div><div class="note" role="status"></div><div class="menu"></div>
    <form><input maxlength="2000"><button type="button" class="clip"></button><button type="submit"></button></form><div class="pw">Powered by <b>ORYKSA</b></div>
    <input type="file" class="f-photo" accept="image/*" hidden><input type="file" class="f-cam" accept="image/*" capture="environment" hidden>
    <input type="file" class="f-doc" accept="image/*,.pdf,.doc,.docx,.txt,.csv" hidden></div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), msgs = $(".msgs"), sug = $(".sug"), input = $("form input");
  input.placeholder = tx.ph;
  $("form button[type=submit]").textContent = tx.send;
  const onLink = opts.onLink;
  // The links of a message can be tapped (web and e-mail): your onLink first, then the browser.
  const fill = (d, text) => {
    for (const p of linkParts(text)) {
      if (!p.url) { d.appendChild(document.createTextNode(p.text)); continue; }
      const a = document.createElement("a");
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = p.text;
      a.addEventListener("click", (e) => { if (onLink && onLink(p.url) === true) e.preventDefault(); });
      d.appendChild(a);
    }
  };
  // The card under a reply for each web link: picture, title (from ORYKSA) and an Open button.
  const card = (url) => {
    const c = document.createElement("div");
    c.className = "lk";
    c.innerHTML = '<div class="pic">' + LINK_ICON + '</div><div class="tx"><div class="tt"></div><div class="sb"></div></div><button type="button"></button>';
    const site = hostOf(url);
    const tt = c.querySelector(".tt"), sb = c.querySelector(".sb"), btn = c.querySelector("button");
    tt.textContent = site; sb.textContent = site; btn.textContent = tx.open;
    btn.setAttribute("aria-label", tx.open + ": " + site);
    const open = (e) => { e.stopPropagation(); openLink(url, onLink); };
    c.addEventListener("click", open);
    btn.addEventListener("click", open);
    Promise.resolve(client.linkPreview ? client.linkPreview(url) : null).then((p) => {
      if (!p) return;
      const title = p.title || site;
      tt.textContent = title;
      sb.textContent = p.price ? p.price + " · " + p.site : (p.site || site);
      btn.setAttribute("aria-label", tx.open + ": " + title);
      if (/^https?:\/\//i.test(p.image || "")) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = p.image;
        img.onload = () => { const pic = c.querySelector(".pic"); pic.textContent = ""; pic.appendChild(img); };
      }
    }).catch(() => {});
    return c;
  };
  // att: { image } or { file } the customer attached (thumbnail, or the document icon and its name).
  const add = (role, text, att) => {
    const d = document.createElement("div");
    d.className = "m " + (role === "user" ? "u" : role === "typing" ? "a t" : "a");
    if (att && att.image) {
      const img = document.createElement("img");
      img.className = "ph";
      img.alt = tx.gallery;
      img.src = "data:" + (att.image.mime || "image/jpeg") + ";base64," + att.image.base64;
      d.appendChild(img);
    }
    if (att && att.file) {
      const f = document.createElement("div");
      f.className = "fl";
      f.innerHTML = DOC_ICON;
      const n = document.createElement("span");
      n.textContent = att.file.name;
      f.appendChild(n);
      d.appendChild(f);
    }
    if (role === "typing") d.textContent = text;
    else if (text) { const t = document.createElement("span"); fill(t, text); d.appendChild(t); }
    msgs.appendChild(d);
    if (role !== "user" && role !== "typing") for (const u of linksIn(text)) msgs.appendChild(card(u));
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  };
  let busy = false;
  const clip = $("form button.clip");
  const send = async (text, att) => {
    text = String(text || "").trim();
    const a = att || {};
    if ((!text && !a.image && !a.file) || busy) return;
    busy = true; clip.disabled = true; sug.innerHTML = ""; add("user", text, a); input.value = "";
    const typing = add("typing", "...");
    try {
      let r = await client.send(text, a.image || a.file ? { image: a.image, file: a.file } : undefined);
      if (r && r.status === "pending") {
        for (let i = 0; i < 20 && r.status === "pending"; i++) {
          await new Promise((ok) => setTimeout(ok, 1500));
          const h = await client.messages();
          const last = (h.messages || []).slice(-1)[0];
          if (last && last.role === "assistant") r = { status: "replied", reply: last.content };
        }
      }
      typing.remove();
      add("assistant", (r && r.reply) || tx.err);
    } catch (e) {
      typing.remove();
      add("assistant", tx.err);
    } finally { busy = false; clip.disabled = false; }
  };

  // The attach button: photo library, camera (phones and tablets), document; a note when too large or unreadable.
  const menu = $(".menu"), note = $(".note");
  let noteTimer = null;
  const showNote = (t) => {
    note.textContent = t; note.classList.add("on");
    clearTimeout(noteTimer); noteTimer = setTimeout(() => note.classList.remove("on"), 3500);
  };
  const touch = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const attachIt = async (picked) => {
    const r = picked;
    if (r.error) { showNote(r.error === "big" ? tx.big : tx.attachErr); return; }
    await send(input.value, r);
  };
  const onPick = (el, kind) => el.addEventListener("change", async () => {
    const f = el.files && el.files[0];
    el.value = "";
    if (!f) return;
    try {
      if (kind === "doc") await attachIt(documentAttachment(await documentFromFile(f)));
      else await attachIt(photoAttachment(await photoFromFile(f)));
    } catch (_) {
      showNote(tx.attachErr);
    }
  });
  if (opts.attachments === false) {
    clip.remove();
  } else {
    clip.innerHTML = CLIP_ICON;
    clip.setAttribute("aria-label", tx.attach);
    clip.title = tx.attach;
    const choices = [["f-photo", tx.gallery]].concat(touch ? [["f-cam", tx.camera]] : [], [["f-doc", tx.document]]);
    for (const [cls, label] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { menu.classList.remove("open"); $("." + cls).click(); });
      menu.appendChild(b);
    }
    clip.addEventListener("click", () => { if (!busy) menu.classList.toggle("open"); });
    onPick($(".f-photo"), "photo");
    onPick($(".f-cam"), "photo");
    onPick($(".f-doc"), "doc");
  }
  $("form").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  $(".btn").addEventListener("click", () => { panel.classList.toggle("open"); if (panel.classList.contains("open")) input.focus(); });
  $(".hd button").addEventListener("click", () => panel.classList.remove("open"));
  client.agent().then(async (a) => {
    const pick = (o) => (o && (o[lang] || (lang === "br" && o.pt) || o.en || Object.values(o)[0])) || "";
    root.querySelectorAll("img").forEach((i) => (i.src = a.avatar));
    $(".btn span").textContent = tx.talk + " " + a.name;
    $(".hd b").textContent = a.name;
    $(".hd small").textContent = pick(a.subtitle) || a.business || "";
    const hist = await client.messages().catch(() => ({ messages: [] }));
    if ((hist.messages || []).length) hist.messages.forEach((m) => add(m.role, m.content));
    else if (pick(a.greeting)) add("assistant", pick(a.greeting));
    const sg = (a.suggestions && (a.suggestions[lang] || (lang === "br" && a.suggestions.pt) || a.suggestions.en)) || [];
    sg.slice(0, 4).forEach((s) => { const b = document.createElement("button"); b.textContent = s; b.onclick = () => send(s); sug.appendChild(b); });
  }).catch(() => { $(".btn span").textContent = tx.talk + " ORYKSA"; });
  if (opts.open) panel.classList.add("open");
  return {
    open: () => panel.classList.add("open"),
    close: () => panel.classList.remove("open"),
    send,
    destroy: () => host.remove(),
  };
}

export default Oryksa;
