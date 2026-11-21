# Changelog

## 0.1.5

- **Links you can click, with an Open button.** The links of the AI's replies in `mountChat` were plain text. They can now be clicked (web and e-mail, underlined, in the accent colour on her bubbles and white on the customer's), and each web link (3 at most) gets a card under the reply with the picture and the title of the page and an **Open** button (en "Open", pt/br/es "Abrir"). Titles and pictures come from `client.linkPreview(url)` (new `GET /v1/client/link-preview`, kept in memory, never throws), only for the pages of the business's own site (its website chat domains); other links show the address.
- `mountChat({ onLink: (url) => boolean })` lets your app open its own pages (return true) instead of a new tab (`window.open(url, "_blank", "noopener")`).
- New exports: `linksIn`, `withoutLinks`, `linkParts`, `openLink` (and the types `LinkHandler`, `LinkPreview`). Offline tests: `test/links.test.js` (`npm run test:links`); `npm test` runs them before the live test.
