import { allowedAvatar } from "./oauth";
import { baseHeaders, text } from "./http";

export async function proxyAvatar(url: string | null): Promise<Response> {
  if (!url || !allowedAvatar(url)) return text("Sem foto.", 404);
  let upstream: Response;
  try {
    upstream = await fetch(url, { redirect: "manual" });
  } catch {
    return text("Sem foto.", 404);
  }
  if (!upstream.ok || !upstream.body) return text("Sem foto.", 404);
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024) return text("Sem foto.", 404);
  const type = upstream.headers.get("content-type") ?? "image/png";
  if (!type.startsWith("image/")) return text("Sem foto.", 404);
  const headers = baseHeaders({ "content-type": type, "cache-control": "private, max-age=3600" });
  return new Response(bytes, { headers });
}
