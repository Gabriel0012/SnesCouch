export function originFrom(url: string, hostHeader: string | null): string {
  const parsed = new URL(url);
  const host = hostHeader ?? parsed.host;
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return `${local ? "http" : "https"}://${host}`;
}

export function publicOrigin(request: Request): string {
  return originFrom(request.url, request.headers.get("host"));
}

export function baseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers({
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAge: number, secure: boolean): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return cookieHeader(name, "", 0, secure);
}

function withCookies(headers: Headers, cookies: string[]) {
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

export function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = baseHeaders({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  return new Response(JSON.stringify(body), { status, headers: withCookies(headers, cookies) });
}

export function problem(error: string, status: number, cookies: string[] = []): Response {
  return json({ error }, status, cookies);
}

export function text(message: string, status: number, cookies: string[] = []): Response {
  const headers = baseHeaders({ "cache-control": "no-store" });
  return new Response(message, { status, headers: withCookies(headers, cookies) });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = baseHeaders({ location: location, "cache-control": "no-store" });
  return new Response(null, { status: 302, headers: withCookies(headers, cookies) });
}
