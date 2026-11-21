// Attachments in the chat, offline (no key, no network): node test/attach.test.js
import assert from "node:assert/strict";
import {
  OryksaClient, MAX_PHOTO_BYTES, MAX_FILE_BYTES, mimeOf, base64Bytes, scaledSize, photoAttachment, documentAttachment, documentFromFile,
} from "../src/index.js";

const ok = (m) => console.log("  ok  " + m);
const b64 = (n) => Buffer.alloc(n, 7).toString("base64");

// the request body: a document goes as file_base64 / file_name / file_mime, a photo as image_base64 / image_mime
const sent = [];
const fakeFetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return { ok: true, status: 200, json: async () => ({ status: "replied", reply: "Recebi o documento." }) };
};
const c = new OryksaClient({ token: "oryk_cs_test", fetch: fakeFetch });
const pdf = Buffer.from("%PDF-1.4 orcamento").toString("base64");
const r = await c.send("Veja o orçamento", { file: { base64: pdf, name: "orcamento.pdf", mime: "application/pdf" } });
assert.equal(r.reply, "Recebi o documento.");
assert.equal(sent[0].url, "https://api.oryksa.com/v1/client/chat");
assert.equal(sent[0].auth, "Bearer oryk_cs_test");
assert.deepEqual(sent[0].body, { message: "Veja o orçamento", file_base64: pdf, file_name: "orcamento.pdf", file_mime: "application/pdf" });
await c.send("", { image: { base64: "/9j/AAA=", mime: "image/jpeg" } });
assert.deepEqual(sent[1].body, { message: "", image_base64: "/9j/AAA=", image_mime: "image/jpeg" });
await c.send("Olá");
assert.deepEqual(sent[2].body, { message: "Olá" }, "no attachment, no attachment fields (as before)");
ok("request body: file_base64 / file_name / file_mime and image_base64 / image_mime");

// the limits
assert.equal(MAX_PHOTO_BYTES, 2 * 1024 * 1024);
assert.equal(MAX_FILE_BYTES, 8 * 1024 * 1024);
for (const n of [0, 1, 2, 3, 4, 1000, 1001, 1002]) assert.equal(base64Bytes(b64(n)), n);
assert.deepEqual(photoAttachment({ base64: b64(MAX_PHOTO_BYTES + 1), mime: "image/jpeg" }), { error: "big" });
assert.deepEqual(photoAttachment({ base64: b64(10) }), { image: { base64: b64(10), mime: "image/jpeg" } });
assert.deepEqual(photoAttachment(null), { error: "failed" });
assert.deepEqual(documentAttachment({ base64: b64(MAX_FILE_BYTES + 1), name: "big.pdf" }), { error: "big" });
assert.deepEqual(documentAttachment({ tooBig: true, name: "big.pdf" }), { error: "big" });
const ok8 = documentAttachment({ base64: b64(MAX_FILE_BYTES), name: "Contrato.PDF" });
assert.equal(ok8.file.mime, "application/pdf");
assert.equal(ok8.file.name, "Contrato.PDF");
const huge = await documentFromFile({ size: MAX_FILE_BYTES + 1, name: "huge.pdf" });
assert.deepEqual(huge, { tooBig: true, name: "huge.pdf" }, "too large: not even read");
ok("limits: photo 2 MB, document 8 MB");

// a picture from the document picker: up to 2 MB a photo (the AI looks at it), larger a file
assert.deepEqual(documentAttachment({ base64: b64(1000), name: "foto.png" }), { image: { base64: b64(1000), mime: "image/png" } });
assert.equal(documentAttachment({ base64: b64(MAX_PHOTO_BYTES + 1), name: "foto.png" }).file.mime, "image/png");
assert.equal(mimeOf("a.doc"), "application/msword");
assert.equal(mimeOf("a.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
assert.equal(mimeOf("lista.TXT"), "text/plain");
assert.equal(mimeOf("a.csv"), "text/csv");
assert.equal(mimeOf("a.zip"), "application/octet-stream");
assert.equal(documentAttachment({ base64: "", name: "notas", mime: "text/markdown" }).file.mime, "text/markdown");
ok("document types and pictures from the document picker");

// photos are made smaller to 1600 px on the longest side, never larger
assert.deepEqual(scaledSize(3200, 2000), { width: 1600, height: 1000 });
assert.deepEqual(scaledSize(2000, 3200), { width: 1000, height: 1600 });
assert.deepEqual(scaledSize(800, 600), { width: 800, height: 600 });
ok("photo size: 1600 px at most");

console.log("attach: all tests passed");
