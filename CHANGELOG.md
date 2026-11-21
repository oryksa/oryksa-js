# Changelog

## 0.1.5

- **Attach a photo or a document in the chat.** `mountChat` has an attach button (photo library, camera, document); photos are made smaller (up to 2 MB), documents up to 8 MB (PDF, Word, text, CSV). `attachments: false` hides it. `client.send(text, { image })` / `{ file }`. Offline tests: `test/attach.test.js`.
- **The AI doing what you want in your app: `client.ai({...})`.** An AI task of your own feature with the session token (never the secret key): instructions, text, up to 4 photos and an optional JSON Schema; the answer comes back as text and, with a schema, as an object in `json`. Each answer counts as 1 ORYKSA interaction; it does not create a conversation and never acts on the account (`POST /v1/client/ai`). Offline tests: `test/ai.test.js`.
- **Links you can click, with an Open button.** The links of the AI's replies in `mountChat` were plain text. They can now be clicked (web and e-mail, underlined, in the accent colour on her bubbles and white on the customer's), and each web link (3 at most) gets a card under the reply with the picture and the title of the page and an **Open** button (en "Open", pt/br/es "Abrir"). Titles and pictures come from `client.linkPreview(url)` (new `GET /v1/client/link-preview`, kept in memory, never throws), only for the pages of the business's own site (its website chat domains); other links show the address.
- `mountChat({ onLink: (url) => boolean })` lets your app open its own pages (return true) instead of a new tab (`window.open(url, "_blank", "noopener")`).
- New exports: `linksIn`, `withoutLinks`, `linkParts`, `openLink` (and the types `LinkHandler`, `LinkPreview`). Offline tests: `test/links.test.js` (`npm run test:links`); `npm test` runs them before the live test.
