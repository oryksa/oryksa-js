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
  createSession(p?: { conversationId?: string; customerName?: string; ttlMinutes?: number }): Promise<{ client_token: string; conversation_id: string; expires_at: string }>;
  learnApp(app: AppDescription): Promise<any>;
}

export declare function verifyWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number }): Promise<{ id: string; type: string; created_at: string; data: any }>;

export interface AgentInfo {
  name: string; business: string | null; gender: "female" | "male"; avatar: string;
  greeting: Record<string, string>; suggestions: Record<string, string[]>; subtitle: Record<string, string>;
  voice_replies: boolean; conversation_id: string;
}

export declare class OryksaClient {
  constructor(opts: { token?: string; getToken?: () => Promise<string>; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number });
  agent(): Promise<AgentInfo>;
  send(message: string): Promise<ChatReply>;
  messages(): Promise<{ id: string; messages: Message[] }>;
}

export declare function mountChat(opts: {
  client: OryksaClient; lang?: "en" | "pt" | "br" | "es"; position?: "left" | "right";
  accent?: string; ink?: string; soft?: string; open?: boolean;
}): { open(): void; close(): void; send(text: string): Promise<void>; destroy(): void };

export default Oryksa;
