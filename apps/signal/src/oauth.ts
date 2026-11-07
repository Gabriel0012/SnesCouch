export type Provider = "discord" | "google";

export function allowedAvatar(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return host === "cdn.discordapp.com" || host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

export function keepAvatar(url: string | null | undefined): string | null {
  if (!url || url.length > 500) return null;
  return allowedAvatar(url) ? url : null;
}

export function authorizeUrl(provider: Provider, clientId: string, redirectUri: string, state: string, challenge: string): string {
  const url = new URL(provider === "discord"
    ? "https://discord.com/oauth2/authorize"
    : "https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider === "discord" ? "identify" : "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return url.toString();
}
