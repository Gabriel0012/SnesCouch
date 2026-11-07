import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allowedAvatar, authorizeUrl } from "../apps/signal/src/oauth.ts";
import { FRIEND_CODE, cleanName, makeCode, pkceChallenge, sameSecret } from "../apps/signal/src/codes.ts";
import { originFrom, readCookie } from "../apps/signal/src/http.ts";
import { SCHEMA } from "../apps/signal/src/schema.ts";

test("o esquema do Worker é o mesmo arquivo SQL", () => {
  const file = readFileSync(new URL("../apps/signal/schema.sql", import.meta.url), "utf8");
  assert.equal(SCHEMA.trim().replaceAll("\r\n", "\n"), file.trim().replaceAll("\r\n", "\n"));
});

test("o código de amigo evita letras ambíguas", () => {
  for (let index = 0; index < 40; index++) {
    const code = makeCode(6);
    assert.match(code, FRIEND_CODE);
    assert.equal(code.includes("I") || code.includes("O") || code.includes("0") || code.includes("1"), false);
  }
});

test("PKCE S256 segue o vetor do RFC 7636", async () => {
  const challenge = await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("a origem pública usa o Host e trata o loopback como http", () => {
  assert.equal(originFrom("http://127.0.0.1:8787/api/auth/discord", "127.0.0.1:5173"), "http://127.0.0.1:5173");
  assert.equal(originFrom("https://snescouch.example/api/me", "snescouch.example"), "https://snescouch.example");
});

test("o cookie de sessão é lido pelo nome", () => {
  const request = new Request("https://snescouch.example/api/me", {
    headers: { cookie: "a=1; session=abc%2F; oauth_state=zz" },
  });
  assert.equal(readCookie(request, "session"), "abc/");
  assert.equal(readCookie(request, "faltou"), null);
});

test("a comparação de segredo não aceita tamanho diferente", () => {
  assert.equal(sameSecret("abc", "abc"), true);
  assert.equal(sameSecret("abc", "abd"), false);
  assert.equal(sameSecret("abc", "abcd"), false);
});

test("o nome da conta cabe na sala e descarta controle", () => {
  assert.equal(cleanName("  Ana\nSouza  ", "Jogador"), "Ana Souza");
  assert.equal(cleanName("   ", "Jogador"), "Jogador");
  assert.equal(cleanName("x".repeat(40), "Jogador").length, 32);
});

test("a foto só vem dos CDNs do Discord e do Google", () => {
  assert.equal(allowedAvatar("https://cdn.discordapp.com/avatars/1/a.png"), true);
  assert.equal(allowedAvatar("https://lh3.googleusercontent.com/a/foto"), true);
  assert.equal(allowedAvatar("https://evil.example/a.png"), false);
  assert.equal(allowedAvatar("http://cdn.discordapp.com/avatars/1/a.png"), false);
});

test("os pedidos de login pedem identify e openid profile, sem e-mail", () => {
  const discord = new URL(authorizeUrl("discord", "id", "http://127.0.0.1:5173/api/auth/discord/callback", "state", "challenge"));
  assert.equal(discord.origin, "https://discord.com");
  assert.equal(discord.searchParams.get("scope"), "identify");
  assert.equal(discord.searchParams.get("code_challenge_method"), "S256");
  const google = new URL(authorizeUrl("google", "id", "http://127.0.0.1:5173/api/auth/google/callback", "state", "challenge"));
  assert.equal(google.searchParams.get("scope"), "openid profile");
  assert.equal(google.searchParams.get("prompt"), "select_account");
  assert.equal(google.searchParams.get("scope")?.includes("email"), false);
});
