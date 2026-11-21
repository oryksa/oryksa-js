<p align="center"><img src="https://app.oryksa.com/static/oryksa_logo.png" width="300" alt="ORYKSA"></p>

# @oryksa/sdk

[![English](https://img.shields.io/badge/English-0891b2?style=for-the-badge)](README.md) [![Português](https://img.shields.io/badge/Portugu%C3%AAs-30363d?style=for-the-badge)](README.pt.md) [![Español](https://img.shields.io/badge/Espa%C3%B1ol-30363d?style=for-the-badge)](README.es.md) [![Français](https://img.shields.io/badge/Fran%C3%A7ais-30363d?style=for-the-badge)](README.fr.md)

<p align="center"><a href="https://developer.oryksa.com/en/sdks"><img src="https://developer.oryksa.com/assets/img/sdk/oryksa-sdks-en.gif" width="760" alt="ORYKSA SDKs: the AI chat and voice on iOS, Android, Flutter, React Native and the web"></a></p>

Official JavaScript and TypeScript SDK for **ORYKSA AI Employees**: put an AI employee that already knows the business inside your web app, Node backend or Electron desktop app. Same brain as WhatsApp and the website chat, text and voice.

- Docs: https://developer.oryksa.com
- API: `https://api.oryksa.com/v1`

## Screenshots

<p align="center"><img src="https://raw.githubusercontent.com/oryksa/oryksa-js/main/docs/screenshots/js_chat_en.png" width="420" alt="Chat"> <img src="https://raw.githubusercontent.com/oryksa/oryksa-js/main/docs/screenshots/js_theme_en.png" width="420" alt="Chat with the README theme"></p>

A store page with `mountChat`, captured by CI in Chrome with an ORYKSA test account (`test/shots.html`): default colors on the left, the code of *Colours and theme* below on the right.

## Install

```bash
npm install @oryksa/sdk
```

## Server (secret key)

```js
import { Oryksa } from "@oryksa/sdk";
const oryksa = new Oryksa(process.env.ORYKSA_API_KEY); // developer.oryksa.com > Keys

const r = await oryksa.chat({ message: "Are you open on Saturday?" });
console.log(r.reply, r.conversation_id);

// Teach the AI employee about your app (e.g. on every release)
await oryksa.learnApp({
  name: "FitTrack",
  description: "Fitness app to log workouts and follow training plans.",
  screens: [{ title: "Workouts", content: "Tap + to log a workout." }],
  faq: [{ question: "How do I cancel Premium?", answer: "Settings > Subscription > Cancel." }],
});
```

## In the app (session token, never the secret key)

```js
// your server
app.get("/oryksa-token", requireLogin, async (req, res) => {
  const s = await oryksa.createSession({ conversationId: "user-" + req.user.id, customerName: req.user.firstName });
  res.json({ token: s.client_token });
});

// your web app
import { OryksaClient, mountChat } from "@oryksa/sdk";
const client = new OryksaClient({ getToken: async () => (await fetch("/oryksa-token").then(r => r.json())).token });
mountChat({ client, lang: "en" }); // ready-made chat UI
```

## Links with an Open button (0.1.5)

The links the AI gives can be clicked in the chat (web addresses and e-mails), and each web link gets a card under her reply with the picture and title of the page and an **Open** button (the pages of your own site, the domains of your website chat; other sites show the address). Pass `onLink` to open your own pages, for example your product page: return true when your app opened it, false to open it in a new tab.

```js
mountChat({
  client, lang: "en",
  onLink: (url) => {
    const id = myProductIdOf(url); // your routes
    if (!id) return false;
    router.push("/product/" + id);
    return true;
  },
});
```

`client.linkPreview(url)` gives the title and picture of a link (`null` when it cannot be read); `linksIn(text)` and `withoutLinks(text)` are exported too.

## Attach a photo or a document (0.1.5)

The chat of `mountChat` has an attach button: a photo from the library, the camera (phones and tablets) or a document (PDF, Word, text, CSV). Photos are made smaller before they go (up to 2 MB); documents up to 8 MB. The AI looks at the photo or reads the document. Turn it off with `attachments: false`. From code: `client.send(text, { image: { base64, mime } })` or `{ file: { base64, name, mime } }`.

## Your own AI features: `ai` (0.1.5)

Have the AI do what your app or site needs (read a photo, extract data, classify, translate, write) and pay with ORYKSA interactions: 1 per answer. Your prompt and your JSON Schema live in your code; the session token is enough (never ship the secret key). It does not create a conversation in your inbox.

```js
const r = await client.ai({
  instructions: "Read the tyre on the photo: brand, model and size exactly as written on the sidewall. " +
    "If the size is not legible, readable=false and size=null. Never invent.",
  images: [{ base64: photoBase64, mime: "image/jpeg" }], // resized to 1600 px
  schema: {
    type: "object",
    properties: { readable: { type: "boolean" }, brand: { type: ["string", "null"] }, size: { type: ["string", "null"] } },
    required: ["readable", "brand", "size"],
  },
});
if (r.json?.readable) showProducts(r.json.size);
```

`r.text` has the answer as text, `r.json` the object (with a schema), `r.interactionsSpent` the interactions used. When the plan's interactions are used up the call rejects with `OryksaError` status 402.

## Colours and theme

`mountChat` accepts three colors as CSS strings: `accent` (buttons, visitor bubbles, links), `ink` (main text) and `soft` (AI bubbles). Missing ones keep the default (`#5B57E0`, `#161B3D` and `#EEEBFB`). `position` (`"left"` or `"right"`) picks the side of the screen.

```js
mountChat({ client, lang: "en", accent: "#0E8A6B", ink: "#10281F", soft: "#E3F5EE" });
```

## Webhooks

```js
import { verifyWebhook } from "@oryksa/sdk";
app.post("/oryksa-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await verifyWebhook(req.body, req.get("ORYKSA-Signature"), process.env.ORYKSA_WEBHOOK_SECRET);
  if (event.type === "booking.created") { /* save it */ }
  res.sendStatus(200);
});
```

## Errors

Every failed call throws `OryksaError` with `status`, `code` (for example `interaction_limit_reached`, `rate_limited`, `plan_required`) and `message`.

## About the author

**Weslley Harakawa** - Founder of ORYKSA AI. Based in Lisbon, Portugal. Specialties: artificial intelligence, web and mobile development, blockchain tokenization. Education: University of the People.

- LinkedIn: https://www.linkedin.com/in/weslleyharakawa/
- ORYKSA AI Employees: https://oryksa.com (X: https://x.com/oryksa, Instagram: https://www.instagram.com/oryksaai, YouTube: https://www.youtube.com/@ORYKSA)

---

MIT License · ORYKSA AI Employees · W8 Atlantic Unipessoal Lda
