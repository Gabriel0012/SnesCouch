export interface Env {
  ROOMS: DurableObjectNamespace;
  INBOX: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DB: D1Database;
  // Ausente de propósito. O save na nuvem está desligado. Ver AGENTS.md.
  SAVES?: R2Bucket;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Link do botão de café. Fica no .dev.vars e como secret do Worker. Sem valor, o botão some.
  MERCADO_PAGO_URL?: string;
  // Só os testes E2E ligam ("1"), para aceitar a ROM caseira de teste.
  E2E?: string;
}
