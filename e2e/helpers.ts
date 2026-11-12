import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildTestRom } from "../core/fixtures/test-rom.mjs";

export const BASE = "http://127.0.0.1:5174";
const TEST_GAME = "ROM de teste";
const opened: BrowserContext[] = [];

export async function closeEveryone() {
  await Promise.all(opened.splice(0).map((context) => context.close()));
}

export interface PersonOptions {
  cid: string;
  name?: string;
  joinAs?: "play" | "watch";
  fps?: boolean;
  ping?: boolean;
  /** Atraso em ms em cada envio pelo WebSocket da sala, como um servidor longe. */
  socketLag?: number;
  /** Navegador sem WebRTC: a partida só tem o servidor da sala. */
  noDirect?: boolean;
  /** O seletor de pasta devolve uma pasta "replays" no armazenamento privado da página, sem dialog nativo. */
  replayFolder?: boolean;
}

/** Uma pessoa com navegador próprio: localStorage, IndexedDB e cid separados. */
export async function person(browser: Browser, options: PersonOptions): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1400, height: 900 } });
  opened.push(context);
  await context.addInitScript((opts) => {
    localStorage.setItem("snes-couch-tour", "1");
    localStorage.setItem("snes-couch-cid", opts.cid);
    if (opts.joinAs && !localStorage.getItem("snes-couch-join-as")) localStorage.setItem("snes-couch-join-as", opts.joinAs);
    if (opts.fps && localStorage.getItem("snes-couch-fps") === null) localStorage.setItem("snes-couch-fps", "1");
    if (opts.ping && localStorage.getItem("snes-couch-ping") === null) localStorage.setItem("snes-couch-ping", "1");
    if (opts.noDirect) Reflect.deleteProperty(window, "RTCPeerConnection");
    if (opts.replayFolder) {
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle("replays", { create: true }),
      });
    }
    if (opts.socketLag) {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (this: WebSocket, data) {
        window.setTimeout(() => {
          if (this.readyState === WebSocket.OPEN) send.call(this, data);
        }, opts.socketLag);
      };
    }
  }, options);
  const page = await context.newPage();
  await page.goto("/");
  if (options.name) await page.locator("#nick").fill(options.name);
  return page;
}

/** Escolhe o jogo de teste e envia a ROM caseira, como quem solta o arquivo. */
export async function bootTestRom(page: Page) {
  await page.locator(`button.game[title="${TEST_GAME}"]`).click();
  const rom = buildTestRom();
  await page.locator("#file").setInputFiles({ name: "teste.sfc", mimeType: "application/octet-stream", buffer: Buffer.from(rom) });
  await expect(page.locator("#picture")).toBeVisible();
  await expect.poll(() => runningFrames(page)).toBeGreaterThan(30);
}

export async function createRoom(page: Page): Promise<string> {
  await page.locator("#create").click();
  await expect(page.locator("#room-state")).toContainText("Manda o código");
  const code = (await page.locator("#room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  return code;
}

export async function joinRoom(page: Page, code: string) {
  await page.locator("#code").fill(code);
  await page.locator("#join").click();
}

export async function leaveRoom(page: Page) {
  await page.locator("#leave").click();
  await expect(page.locator("#leave")).toBeHidden();
}

export async function expectLinked(...pages: Page[]) {
  for (const page of pages) await expect(page.locator("#room-state")).toHaveText("No ar. Os dois estão no mesmo ponto.");
}

export async function expectDirect(page: Page, on: boolean) {
  await expect(page.locator("#ping")).toHaveAttribute("title", on ? "Ligação direta com o outro jogador" : "Pelo servidor da sala");
}

export async function expectWatching(page: Page, code: string) {
  await expect(page.locator("#room-state")).toHaveText(`Assistindo a sala ${code}.`);
}

export async function expectBanner(page: Page, text: string | RegExp) {
  await expect(page.locator("#banner-text")).toHaveText(text);
}

export async function seats(page: Page) {
  return page.locator("#players li[data-seat]").evaluateAll((rows) =>
    rows.map((row) => ({
      seat: (row as HTMLElement).dataset.seat ?? "",
      chip: row.querySelector(".slot-chip")?.textContent ?? "",
      name: row.querySelector("b")?.textContent ?? "",
      meta: row.querySelector("small")?.textContent ?? "",
    })),
  );
}

export async function watchers(page: Page) {
  return page.locator("#watchers li b").allTextContents();
}

export async function chatLines(page: Page) {
  return page.locator("#log .play-line").evaluateAll((rows) =>
    rows.map((row) => ({
      watcher: row.classList.contains("from-watcher"),
      eye: !!row.querySelector(".chat-eye"),
      slot: row.querySelector(".chat-slot")?.textContent ?? "",
      name: row.querySelector("b")?.textContent ?? "",
      nameColor: getComputedStyle(row.querySelector("b")!).color,
      text: row.textContent ?? "",
    })),
  );
}

export async function sendChat(page: Page, text: string) {
  await page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>("#chat-text")!;
    input.value = value;
    document.querySelector("#chat")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, text);
}

export async function probe(page: Page): Promise<[number, number][]> {
  return page.evaluate(() => (window as unknown as { __snesTest: { probe(): Promise<[number, number][]> } }).__snesTest.probe());
}

/** Frames em comum entre duas leituras do probe e quantos deles têm hash diferente. */
export function compareRings(left: [number, number][], right: [number, number][]) {
  const theirs = new Map(right);
  let common = 0;
  let mismatched = 0;
  for (const [frame, hash] of left) {
    const other = theirs.get(frame);
    if (other === undefined) continue;
    common += 1;
    if (other !== hash) mismatched += 1;
  }
  return { common, mismatched };
}

async function runningFrames(page: Page): Promise<number> {
  return (await probe(page)).length;
}

/** Frames em comum entre os dois emuladores e quantos deles têm hash diferente. */
export async function sameFrames(a: Page, b: Page) {
  const [left, right] = await Promise.all([probe(a), probe(b)]);
  return compareRings(left, right);
}

export async function openSettings(page: Page) {
  await page.locator("#settings-open").click();
  await expect(page.locator("#settings")).toBeVisible();
}

export async function closeSettings(page: Page) {
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings")).toBeHidden();
}
