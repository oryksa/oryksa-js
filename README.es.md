<p align="center"><img src="https://app.oryksa.com/static/oryksa_logo.png" width="300" alt="ORYKSA"></p>

# @oryksa/sdk

[![English](https://img.shields.io/badge/English-30363d?style=for-the-badge)](README.md) [![Português](https://img.shields.io/badge/Portugu%C3%AAs-30363d?style=for-the-badge)](README.pt.md) [![Español](https://img.shields.io/badge/Espa%C3%B1ol-0891b2?style=for-the-badge)](README.es.md) [![Français](https://img.shields.io/badge/Fran%C3%A7ais-30363d?style=for-the-badge)](README.fr.md)

SDK oficial de JavaScript y TypeScript de **ORYKSA AI Employees**: pon un empleado de IA que ya conoce el negocio dentro de tu app web, tu backend Node o tu app de escritorio Electron. El mismo cerebro de WhatsApp y del chat del sitio web, en texto y voz.

- Documentación: https://developer.oryksa.com
- API: `https://api.oryksa.com/v1`

## Capturas de pantalla

<p align="center"><img src="docs/screenshots/js_chat_en.png" width="420" alt="Chat"> <img src="docs/screenshots/js_theme_en.png" width="420" alt="Chat with the README theme"></p>

Una página de tienda con `mountChat`, capturada por el CI en Chrome con una cuenta de prueba de ORYKSA (`test/shots.html`): colores por defecto a la izquierda y, a la derecha, el código de *Colores y tema*, más abajo.

## Instalar

```bash
npm install @oryksa/sdk
```

## Servidor (clave secreta)

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

## En la app (token de sesión, nunca la clave secreta)

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

## Colores y tema

`mountChat` acepta tres colores como texto CSS: `accent` (botones, burbujas del visitante, enlaces), `ink` (texto principal) y `soft` (burbujas de la IA). Los que falten mantienen el valor por defecto (`#5B57E0`, `#161B3D` y `#EEEBFB`). `position` (`"left"` o `"right"`) elige el lado de la pantalla.

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

## Errores

Cada llamada que falla lanza `OryksaError` con `status`, `code` (por ejemplo `interaction_limit_reached`, `rate_limited`, `plan_required`) y `message`.

## Sobre el autor

**Weslley Harakawa** - Fundador de ORYKSA AI. En Lisboa, Portugal. Especialidades: inteligencia artificial, desarrollo web y móvil, tokenización en blockchain. Formación: University of the People.

- LinkedIn: https://www.linkedin.com/in/weslleyharakawa/
- ORYKSA AI Employees: https://oryksa.com (X: https://x.com/oryksa, Instagram: https://www.instagram.com/oryksaai, YouTube: https://www.youtube.com/@ORYKSA)

---

MIT License · ORYKSA AI Employees · W8 Atlantic Unipessoal Lda
