import { defineConfig } from "vite";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export default defineConfig({
  server: {
    port: 5173,
    headers: isolation,
    fs: { allow: ["../.."] },
    proxy: {
      "/api": { target: env.SIGNAL_URL ?? "http://127.0.0.1:8787", ws: true },
    },
  },
  preview: { headers: isolation },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: { exclude: ["./src/generated/snes.js"] },
});
