import { expect, test } from "@playwright/test";
import { bootTestRom, closeEveryone, createRoom, expectBanner, expectLinked, joinRoom, person, seats } from "./helpers";

test.afterEach(closeEveryone);

test.describe("sala", () => {
  test("criar, entrar e ver o ping sozinho e com o convidado", async ({ browser }) => {
    const host = await person(browser, { cid: "room-host-1", name: "Dono", ping: true });
    await bootTestRom(host);
    const code = await createRoom(host);
    await expect(host.locator("#ping")).toHaveText(/^\d+ ms$/);

    const guest = await person(browser, { cid: "room-guest-1", name: "Gabs", joinAs: "play", ping: true });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);
    await expect(guest.locator("#ping")).toHaveText(/^\d+ ms$/);
    await expect(guest.locator("#ping")).toHaveClass(/good|mid|bad/);
    await expect.poll(() => seats(guest)).toEqual([
      expect.objectContaining({ chip: "P1", name: "Dono", meta: "Teclado · na sala" }),
      expect.objectContaining({ chip: "P2", name: "Gabs", meta: "Teclado · você" }),
    ]);
  });

  test("o dono vira P2 antes do convidado entrar, e o convidado entra como P1", async ({ browser }) => {
    const host = await person(browser, { cid: "room-host-2", name: "Dono" });
    await bootTestRom(host);
    const code = await createRoom(host);
    await host.locator(".swap-btn").click();
    await expect.poll(() => seats(host)).toEqual([
      expect.objectContaining({ seat: "guest", chip: "P1" }),
      expect.objectContaining({ seat: "host", chip: "P2", meta: "Teclado · você" }),
    ]);

    const guest = await person(browser, { cid: "room-guest-2", name: "Gabs", joinAs: "play" });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);
    await expect.poll(() => seats(guest)).toEqual([
      expect.objectContaining({ seat: "guest", chip: "P1", name: "Gabs" }),
      expect.objectContaining({ seat: "host", chip: "P2", name: "Dono" }),
    ]);
  });

  test("a troca com os dois conectados vale nos dois lados e não dessincroniza", async ({ browser }) => {
    const host = await person(browser, { cid: "room-host-3", name: "Dono" });
    await bootTestRom(host);
    const code = await createRoom(host);
    const guest = await person(browser, { cid: "room-guest-3", name: "Gabs", joinAs: "play" });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);

    await guest.locator(".swap-btn").click();
    await expectBanner(guest, "Você agora é o jogador 1.");
    await expect.poll(() => seats(host)).toEqual([
      expect.objectContaining({ seat: "guest", chip: "P1" }),
      expect.objectContaining({ seat: "host", chip: "P2", meta: "Teclado · você" }),
    ]);
    await expectLinked(host, guest);
    await host.waitForTimeout(3000);
    for (const page of [host, guest]) await expect(page.locator("#banner-text")).not.toContainText("dessincronizou");
    await expectLinked(host, guest);
  });
});
