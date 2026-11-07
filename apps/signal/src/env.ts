export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DB: D1Database;
  SAVES: R2Bucket;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
