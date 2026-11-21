export declare const VERSION: string;

export declare class OryksaError extends Error {
  status: number;
  code: string;
  upgrade_url?: string;
  retry_after?: number;
}

export interface ChatReply {
  object: "chat_reply";
  conversation_id: string;
  status: "replied" | "pending";
  reply: string | null;
  hint?: string;
}

export interface Message { role: "user" | "assistant"; content: string }

export interface ServerOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Only for local tools. The secret key must never reach end users. */
  dangerouslyAllowBrowser?: boolean;
}

export interface AppDescription {
  name: string;
  description?: string;
  url?: string;
  agentName?: string;
  languages?: string[];
  services?: string[];
  screens?: { title: string; content: string; url?: string }[];
  faq?: { question: string; answer: string }[];
  settings?: Record<string, unknown>;
}

export type WebhookEvent = "message.replied" | "booking.created" | "limit.reached" | "knowledge.updated" | "*";

export declare class Oryksa {
  constructor(apiKey: string, opts?: ServerOptions);
  account(): Promise<any>;
  chat(p: { message: string; conversationId?: string; customerName?: string }): Promise<ChatReply>;
  conversations(p?: { limit?: number }): Promise<{ object: "list"; data: any[] }>;
  conversation(id: string): Promise<{ object: "conversation"; id: string; messages: Message[] }>;
  readonly agent: {
    update(fields: Record<string, unknown>): Promise<{ object: "agent"; updated: string[] }>;
    appearance(fields: Record<string, unknown>): Promise<{ object: "agent_appearance"; updated: string[] }>;
  };
  readonly knowledge: {
    get(): Promise<any>;
    setPages(p: { pages: { title?: string; url?: string; content: string }[]; businessSummary?: string; siteUrl?: string }): Promise<any>;
    crawl(p: { url: string; maxPages?: number }): Promise<any>;
    addFaq(items: { question: string; answer: string }[]): Promise<{ added: number; updated: number }>;
  };
  readonly widget: {
    snippet(p?: { framework?: string; lang?: string; position?: "left" | "right" }): Promise<any>;
    setDomains(domains: string[]): Promise<any>;
  };
  readonly webhooks: {
    list(): Promise<any>;
    create(p: { url: string; events?: WebhookEvent[] }): Promise<any>;
    delete(id: string): Promise<any>;
    test(id: string): Promise<{ status: number; delivered: boolean }>;
  };
  createSession(p?: { conversationId?: string; customerName?: string; customerEmail?: string; customerPhone?: string; ttlMinutes?: number }): Promise<{ client_token: string; conversation_id: string; expires_at: string }>;
  learnApp(app: AppDescription): Promise<any>;
}

export declare function verifyWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number }): Promise<{ id: string; type: string; created_at: string; data: any }>;

export interface AgentInfo {
  name: string; business: string | null; gender: "female" | "male"; avatar: string;
  greeting: Record<string, string>; suggestions: Record<string, string[]>; subtitle: Record<string, string>;
  voice_replies: boolean; conversation_id: string;
}

/** Title and picture of a link of the business's own site (OryksaClient.linkPreview). */
export interface LinkPreview {
  object: "link_preview";
  url: string;
  /** Title of the page (empty for other sites). */
  title: string;
  /** Picture of the page (empty when it has none). */
  image: string;
  /** Name of the site. */
  site: string;
  /** Price, when the page says it (shops). */
  price: string;
}

/**
 * What your app does with a link the AI gave (a product, a service, a page). Return true when your app
 * opened it itself (for example its own product page); return false and it opens in a new tab.
 */
export type LinkHandler = (url: string) => boolean;

/** A photo from the customer (JPEG, PNG or WebP, up to 2 MB). The AI looks at it. */
export interface ChatImage { base64: string; mime?: string }

/** A document from the customer (PDF, Word, text or CSV, up to 8 MB). The AI reads it. */
export interface ChatFile { base64: string; name: string; mime?: string }

/** Options of OryksaClient.ai: your prompt and your JSON Schema live in your app. */
export interface AiOptions {
  instructions?: string;
  input?: string;
  /** Up to 4 photos (about 1.5 MB each; resize to 1600 px). */
  images?: ChatImage[];
  /** A JSON Schema: the answer comes back in `json`. */
  schema?: object;
  maxTokens?: number;
  temperature?: number;
}
/** The answer of OryksaClient.ai. */
export interface AiResult {
  text: string;
  json: Record<string, unknown> | null;
  interactionsSpent: number;
  interactionsRemaining: number | null;
}
export declare function aiBody(opts: AiOptions): Record<string, unknown>;
export declare function aiResult(d: unknown): AiResult;

export declare class OryksaClient {
  constructor(opts: { token?: string; getToken?: () => Promise<string>; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number });
  agent(): Promise<AgentInfo>;
  /** image: sent as image_base64 / image_mime; file: sent as file_base64 / file_name / file_mime. */
  send(message: string, opts?: { image?: ChatImage; file?: ChatFile }): Promise<ChatReply>;
  messages(): Promise<{ id: string; messages: Message[] }>;
  /** Title and picture of a link the AI gave (only the pages of the business's own site); null when it cannot be read, never throws. */
  linkPreview(url: string): Promise<LinkPreview | null>;
  /** An AI task of your own app, counted as ORYKSA interactions (1 per answer). Never creates a conversation. */
  ai(opts: AiOptions): Promise<AiResult>;
}

export declare function mountChat(opts: {
  client: OryksaClient; lang?: "en" | "pt" | "br" | "es"; position?: "left" | "right";
  accent?: string; ink?: string; soft?: string; open?: boolean;
  /** What your app does with a link the AI gave: return true when your app opened it, false to open it in a new tab. */
  onLink?: LinkHandler;
  /** Shows the attach button (photo library, camera on phones, document). Default true. */
  attachments?: boolean;
}): { open(): void; close(): void; send(text: string, att?: { image?: ChatImage; file?: ChatFile }): Promise<void>; destroy(): void };

export type AttachResult = { image: ChatImage } | { file: ChatFile } | { error: "big" | "failed" };

/** 2 MB: the largest photo the chat sends. */
export declare const MAX_PHOTO_BYTES: number;
/** 8 MB: the largest document the chat sends. */
export declare const MAX_FILE_BYTES: number;
/** The type of a file from its name. */
export declare function mimeOf(name: string): string;
/** How many bytes a base64 text holds. */
export declare function base64Bytes(b64: string): number;
/** The size of a photo with its longest side at most maxSide (1600 by default), never larger. */
export declare function scaledSize(w: number, h: number, maxSide?: number): { width: number; height: number };
/** A photo as what the chat sends ({ error: "big" } above 2 MB). */
export declare function photoAttachment(p: { base64: string; mime?: string } | null): AttachResult;
/** A document as what the chat sends: pictures up to 2 MB as a photo, the rest as a file up to 8 MB. */
export declare function documentAttachment(d: { base64?: string; name?: string; mime?: string; tooBig?: boolean } | null): AttachResult;
/** Browser: a picture File as a JPEG of at most 1600 pixels, 80%. */
export declare function photoFromFile(file: Blob, maxSide?: number, quality?: number): Promise<{ base64: string; mime: string }>;
/** Browser: a document File as { base64, name, mime } (or { tooBig: true } above 8 MB). */
export declare function documentFromFile(file: File): Promise<{ base64?: string; name: string; mime?: string; tooBig?: boolean }>;

/** The distinct web links of text, in order, without the final punctuation (at most max, 3 by default). */
export declare function linksIn(text: string, max?: number): string[];

/** text without its web links (what a voice screen shows while she speaks). */
export declare function withoutLinks(text: string): string;

/** text as parts: url only on the links (web, and e-mail as mailto:). */
export declare function linkParts(text: string): { text: string; url: string | null }[];

/** Opens a link: handler first (true = your app opened it), then a new tab (window.open, noopener). */
export declare function openLink(url: string, handler?: LinkHandler): void;

export default Oryksa;
