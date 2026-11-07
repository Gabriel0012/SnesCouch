import { keepAvatar, authorizeUrl as buildAuthorizeUrl, type Provider } from "./oauth";
import { cleanName, pkceChallenge, randomBase64Url, randomHex, sameSecret } from "./codes";
import type { Env } from "./env";
import { clearCookie, cookieHeader, publicOrigin, readCookie, redirect, text } from "./http";
import { createSession, upsertUser, type Profile } from "./users";

export type { Provider };

const OAUTH_STATE = "oauth_state";
const OAUTH_VERIFIER = "oauth_verifier";

function credentials(env: Env, provider: Provider): { id: string; secret: string } | null {
  const id = provider === "discord" ? env.DISCORD_CLIENT_ID : env.GOOGLE_CLIENT_ID;
  const secret = provider === "discord" ? env.DISCORD_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET;
  if (!id?.trim() || !secret?.trim()) return null;
  return { id: id.trim(), secret: secret.trim() };
}

function secure(request: Request): boolean {
  return publicOrigin(request).startsWith("https:");
}

export async function beginLogin(request: Request, env: Env, provider: Provider): Promise<Response> {
  const creds = credentials(env, provider);
  if (!creds) {
    const who = provider === "discord" ? "Discord" : "Google";
    return text(`O login com ${who} ainda não está configurado.`, 503);
  }
  const state = randomHex(16);
  const verifier = randomBase64Url(32);
  const challenge = await pkceChallenge(verifier);
  const redirectUri = `${publicOrigin(request)}/api/auth/${provider}/callback`;
  const useSecure = secure(request);
  return redirect(buildAuthorizeUrl(provider, creds.id, redirectUri, state, challenge), [
    cookieHeader(OAUTH_STATE, state, 600, useSecure),
    cookieHeader(OAUTH_VERIFIER, verifier, 600, useSecure),
  ]);
}

export async function finishLogin(request: Request, env: Env, provider: Provider): Promise<Response> {
  const origin = publicOrigin(request);
  const useSecure = secure(request);
  const cleared = [clearCookie(OAUTH_STATE, useSecure), clearCookie(OAUTH_VERIFIER, useSecure)];
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request, OAUTH_STATE);
  const verifier = readCookie(request, OAUTH_VERIFIER);
  if (url.searchParams.get("error") || !code || !state || !expected || !verifier || !sameSecret(state, expected)) {
    return redirect(`${origin}/?login=falhou`, cleared);
  }
  const creds = credentials(env, provider);
  if (!creds) return redirect(`${origin}/?login=falhou`, cleared);
  try {
    const redirectUri = `${origin}/api/auth/${provider}/callback`;
    const profile = await exchange(provider, creds, code, verifier, redirectUri);
    const userId = await upsertUser(env, profile);
    const session = await createSession(env, userId);
    return redirect(`${origin}/`, [
      ...cleared,
      cookieHeader("session", session.id, session.maxAge, useSecure),
    ]);
  } catch {
    return redirect(`${origin}/?login=falhou`, cleared);
  }
}

async function exchange(
  provider: Provider,
  creds: { id: string; secret: string },
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<Profile> {
  const body = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const tokenUrl = provider === "discord" ? "https://discord.com/api/oauth2/token" : "https://oauth2.googleapis.com/token";
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new Error("token");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("token");
  if (provider === "discord") return discordProfile(token.access_token);
  return googleProfile(token.access_token);
}

async function discordProfile(access: string): Promise<Profile> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!response.ok) throw new Error("perfil");
  const user = await response.json() as {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    discriminator?: string;
  };
  if (!user.id) throw new Error("perfil");
  return {
    provider: "discord",
    providerId: user.id,
    name: cleanName(user.global_name || user.username, "Jogador"),
    avatar: discordAvatar(user.id, user.avatar ?? null, user.discriminator),
  };
}

function discordAvatar(id: string, avatar: string | null, discriminator: string | undefined): string | null {
  if (avatar) return keepAvatar(`https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`);
  const index = Number(discriminator && discriminator !== "0" ? discriminator : NaN);
  let fallback = Number.isFinite(index) ? index % 5 : 0;
  if (!Number.isFinite(index)) {
    try {
      fallback = Number((BigInt(id) >> 22n) % 6n);
    } catch {
      fallback = 0;
    }
  }
  return keepAvatar(`https://cdn.discordapp.com/embed/avatars/${fallback}.png`);
}

async function googleProfile(access: string): Promise<Profile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!response.ok) throw new Error("perfil");
  const user = await response.json() as { sub?: string; name?: string; picture?: string };
  if (!user.sub) throw new Error("perfil");
  return {
    provider: "google",
    providerId: user.sub,
    name: cleanName(user.name, "Jogador"),
    avatar: keepAvatar(user.picture),
  };
}

export function clearSessionCookie(request: Request): string {
  return clearCookie("session", secure(request));
}
