import { expect, test, type Browser } from "@playwright/test";
import {
  bootTestRom,
  chatLines,
  closeEveryone,
  createRoom,
  expectBanner,
  expectLinked,
  expectWatching,
  joinRoom,
  leaveRoom,
  person,
  sameFrames,
  seats,
  sendChat,
  watchers,
} from "./helpers";

test.afterEach(closeEveryone);

async function hostRoom(browser: Browser, cid: string) {
  const host = await person(browser, { cid, name: "Dono" });
  await bootTestRom(host);
  const code = await createRoom(host);
  return { host, code };
}

test.describe("espectador", () => {
  test("a modal de escolha aparece uma vez e a escolha fica guardada", async ({ browser }) => {
    const { code } = await hostRoom(browser, "spec-host-1");
    const viewer = await person(browser, { cid: "spec-viewer-1", name: "Vovo" });
    await bootTestRom(viewer);
    await joinRoom(viewer, code);
    await expect(viewer.locator("#join-choice")).toBeVisible();
    await expect(viewer.locator("#join-choice-text")).toHaveText(`Como você quer entrar na sala ${code}?`);
    await viewer.locator("#join-watch").click();
    await expectWatching(viewer, code);

    await leaveRoom(viewer);
    await joinRoom(viewer, code);
    await expect(viewer.locator("#join-choice")).toBeHidden();
    await expectWatching(viewer, code);
  });

  test("com o lugar ocupado, quem escolheu jogar assiste e acompanha o dono frame a frame", async ({ browser }) => {
    const { host, code } = await hostRoom(browser, "spec-host-2");
    const guest = await person(browser, { cid: "spec-guest-2", name: "Gabs", joinAs: "play" });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);

    const viewer = await person(browser, { cid: "spec-viewer-2", name: "Vovo", joinAs: "play" });
    await bootTestRom(viewer);
    await joinRoom(viewer, code);
    await expectBanner(viewer, "O lugar de jogador está ocupado. Você entrou para assistir.");
    await expectWatching(viewer, code);
    await expect.poll(() => watchers(host)).toEqual(["Vovo"]);
    await expect(host.locator("#watchers .eye-chip")).toHaveAttribute("title", "Assistindo");

    await expect(viewer.locator("#reset")).toBeDisabled();
    await expect(viewer.locator(".swap-btn")).toBeHidden();
    await expect(viewer.locator("[data-seat-mode=watch]")).toHaveClass(/on/);

    await expect.poll(async () => (await sameFrames(host, viewer)).common, { timeout: 20_000 }).toBeGreaterThan(120);
    expect((await sameFrames(host, viewer)).mismatched).toBe(0);
  });

  test("o chat marca P1/P2 e o olho, com o nome de quem assiste em cinza", async ({ browser }) => {
    const { host, code } = await hostRoom(browser, "spec-host-3");
    const viewer = await person(browser, { cid: "spec-viewer-3", name: "Vovo", joinAs: "watch" });
    await bootTestRom(viewer);
    await joinRoom(viewer, code);
    await expectWatching(viewer, code);

    await sendChat(host, "bem-vindo");
    await sendChat(viewer, "to assistindo");
    await expect.poll(async () => (await chatLines(host)).length).toBe(2);
    const [mine, theirs] = await chatLines(host);
    expect(mine).toMatchObject({ slot: "P1", eye: false, watcher: false, name: "Dono" });
    expect(theirs).toMatchObject({ slot: "", eye: true, watcher: true, name: "Vovo" });
    expect(theirs.nameColor).not.toBe(mine.nameColor);
    expect(theirs.nameColor).toMatch(/^rgba?\(190, 194, 204/);
  });

  test("remover pede confirmação, bloqueia a volta e Desbloquear libera", async ({ browser }) => {
    const { host, code } = await hostRoom(browser, "spec-host-4");
    const viewer = await person(browser, { cid: "spec-viewer-4", name: "Vovo", joinAs: "watch" });
    await bootTestRom(viewer);
    await joinRoom(viewer, code);
    await expectWatching(viewer, code);
    await expect.poll(() => watchers(host)).toEqual(["Vovo"]);

    await host.locator("#watchers .kick-btn").click();
    await expect(host.locator("#alert")).toBeVisible();
    await expect(host.locator("#alert-text")).toContainText("Remover Vovo da sala?");
    await host.locator("#alert-yes").click();
    await expectBanner(viewer, "Você foi removido da sala.");
    await expect(viewer.locator("#leave")).toBeHidden();
    await expect.poll(() => watchers(host)).toEqual([]);
    await expect(host.locator("#bans-open")).toHaveText("Bloqueados (1)");

    await joinRoom(viewer, code);
    await expectBanner(viewer, "Você foi removido desta sala.");
    await expect(viewer.locator("#leave")).toBeHidden();

    await host.locator("#bans-open").click();
    await expect(host.locator("#bans-list li")).toHaveText(["VovoDesbloquear"]);
    await host.locator("#bans-list button").click();
    await expect(host.locator("#bans-list li")).toHaveText(["Ninguém bloqueado."]);
    await host.locator("#bans-close").click();

    await joinRoom(viewer, code);
    await expectWatching(viewer, code);
  });

  test("Jogar/Assistindo troca de papel: o convidado vai assistir e o espectador assume o P2", async ({ browser }) => {
    const { host, code } = await hostRoom(browser, "spec-host-5");
    const guest = await person(browser, { cid: "spec-guest-5", name: "Gabs", joinAs: "play" });
    await bootTestRom(guest);
    await joinRoom(guest, code);
    await expectLinked(host, guest);
    const viewer = await person(browser, { cid: "spec-viewer-5", name: "Vovo", joinAs: "watch" });
    await bootTestRom(viewer);
    await joinRoom(viewer, code);
    await expectWatching(viewer, code);

    await guest.locator("[data-seat-mode=watch]").click();
    await expectWatching(guest, code);
    await expect.poll(() => watchers(host)).toEqual(expect.arrayContaining(["Vovo", "Gabs"]));

    await viewer.locator("[data-seat-mode=play]").click();
    await expectLinked(host, viewer);
    await expect.poll(() => seats(viewer)).toEqual([
      expect.objectContaining({ chip: "P1", name: "Dono" }),
      expect.objectContaining({ chip: "P2", name: "Vovo", meta: "Teclado · você" }),
    ]);
    await expect.poll(() => watchers(host)).toEqual(["Gabs"]);
  });
});
