/*!
 * @oryksa/sdk - ORYKSA AI Employees SDK for JavaScript and TypeScript.
 * Server client (secret API key), webhook verification, and an in-app chat
 * client that only uses short-lived session tokens (never the secret key).
 * Docs: https://developer.oryksa.com   License: MIT
 */

const DEFAULT_BASE = "https://api.oryksa.com/v1";
export const VERSION = "0.1.2";

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

  /** Short-lived token for an app user. Send only this token to the app. */
  createSession({ conversationId, customerName, ttlMinutes = 60 } = {}) {
    return this._req("POST", "/sessions", { conversation_id: conversationId, customer_name: customerName, ttl_minutes: ttlMinutes });
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
  send(message) { return this._req("POST", "/client/chat", { message }); }
  messages() { return this._req("GET", "/client/messages"); }
}

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
`;

const UI_TXT = {
  en: { talk: "Talk to", ph: "Type your question", send: "Send", err: "Sorry, something went wrong. Try again." },
  pt: { talk: "Falar com", ph: "Escreve a tua pergunta", send: "Enviar", err: "Desculpa, algo correu mal. Tenta de novo." },
  br: { talk: "Falar com", ph: "Digite sua pergunta", send: "Enviar", err: "Desculpe, algo deu errado. Tente de novo." },
  es: { talk: "Hablar con", ph: "Escribe tu pregunta", send: "Enviar", err: "Lo siento, algo salió mal. Inténtalo de nuevo." },
};

/**
 * Mount the ORYKSA chat inside a web app (same look as the website chat).
 * @param {{client: OryksaClient, lang?: 'en'|'pt'|'br'|'es', position?: 'left'|'right', accent?: string, ink?: string, soft?: string, open?: boolean}} opts
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
    <div class="msgs"></div><div class="sug"></div>
    <form><input maxlength="2000"><button type="submit"></button></form><div class="pw">Powered by <b>ORYKSA</b></div></div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), msgs = $(".msgs"), sug = $(".sug"), input = $("input");
  input.placeholder = tx.ph;
  $("form button").textContent = tx.send;
  const add = (role, text) => {
    const d = document.createElement("div");
    d.className = "m " + (role === "user" ? "u" : role === "typing" ? "a t" : "a");
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  };
  let busy = false;
  const send = async (text) => {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; sug.innerHTML = ""; add("user", text); input.value = "";
    const typing = add("typing", "...");
    try {
      let r = await client.send(text);
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
    } finally { busy = false; }
  };
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
