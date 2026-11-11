import { expect, test, type Page } from "@playwright/test";
import { bootTestRom, closeEveryone, createRoom, expectDirect, expectLinked, joinRoom, person, probe } from "./helpers";

test.afterEach(closeEveryone);

async function lastFrame(page: Page) {
  const ring = await probe(page);
  return ring.length ? ring[ring.length - 1][0] : -1;
}

/**
 * The ROM writes both pads to RAM every frame and the players compare state
 * hashes every 60 frames; a mismatch stops the emulator. So both sides still
 * advancing after a few seconds of buttons means the inputs arrived in order.
 */
async function expectInSync(host: Page, guest: Page) {
  const start = await Promise.all([lastFrame(host), lastFrame(guest)]);
  for (const [page, key] of [[host, "ArrowRight"], [guest, "KeyZ"], [host, "KeyA"], [guest, "ArrowLeft"]] as const) {
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
  }
  await expect.poll(() => lastFrame(host)).toBeGreaterThan(start[0] + 360);
  await expect.poll(() => lastFrame(guest)).toBeGreaterThan(start[1] + 360);
  for (const page of [host, guest]) await expect(page.locator("#banner-text")).not.toContainText("dessincronizou");
  await expectLinked(host, guest);
}

test.describe("ligação direta", () => {
  test("com o servidor longe, os botões passam direto e o atraso volta ao mínimo", async ({ browser }) => {
    const host = await person(browser, { cid: "direct-host-1", name: "Dono", ping: true, socketLag: 90 });
    await bootTestRom(host);
    const code = await createRoom(host);
    const guest = await person(browser, { cid: "direct-guest-1", name: "Gabs", joinAs: "play", ping: true, socketLag: 90 });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);

    await expectDirect(host, true);
    await expectDirect(guest, true);
    await expect(host.locator("#delay")).toHaveText("Atraso de input: 2 frames.", { timeout: 20_000 });
    await expect(guest.locator("#delay")).toHaveText("Atraso de input: 2 frames.");
    await expectLinked(host, guest);
    await expect.poll(async () => Number.parseInt((await host.locator("#ping").textContent()) ?? "999", 10)).toBeLessThan(150);
    await expectInSync(host, guest);
  });

  test("sem WebRTC, a partida segue pelo servidor da sala", async ({ browser }) => {
    const host = await person(browser, { cid: "direct-host-2", name: "Dono", ping: true });
    await bootTestRom(host);
    const code = await createRoom(host);
    const guest = await person(browser, { cid: "direct-guest-2", name: "Gabs", joinAs: "play", ping: true, noDirect: true });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);

    await expect(guest.locator("#ping")).toHaveText(/^\d+ ms$/);
    await expectDirect(host, false);
    await expectDirect(guest, false);
    await expectInSync(host, guest);
  });
});
