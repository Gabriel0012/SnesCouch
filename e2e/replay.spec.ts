import { expect, test, type Page } from "@playwright/test";
import { bootTestRom, closeEveryone, compareRings, expectBanner, openSettings, person, probe } from "./helpers";

test.afterEach(closeEveryone);

async function recordFor(page: Page, ms: number, middle?: () => Promise<void>) {
  await page.locator("#rec").click();
  await expect(page.locator("#rec")).toHaveClass(/on/);
  await expectBanner(page, "Gravando o replay na pasta replays.");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(ms / 2);
  await page.keyboard.up("ArrowRight");
  await middle?.();
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(ms / 2);
  await page.keyboard.up("KeyZ");
  await page.locator("#rec").click();
  await expectBanner(page, /^Replay de \d+:\d\d gravado na pasta replays\.$/);
  await expect(page.locator("#rec")).not.toHaveClass(/on/);
}

async function openReplayList(page: Page) {
  await openSettings(page);
  await expect(page.locator("#replays-folder")).toHaveText("replays");
  await expect(page.locator("#replays-open")).toHaveText("Replays");
  await page.locator("#replays-open").click();
  await expect(page.locator("#replays-modal")).toBeVisible();
}

async function watchNewest(page: Page) {
  await openReplayList(page);
  await page.locator("#replays-list .replay-play").first().click();
  await expect(page.locator("#replays-modal")).toBeHidden();
  await expect(page.locator("#replay-bar")).toBeVisible();
  await expect(page.locator(".toolbar")).toBeHidden();
}

async function seekState(page: Page) {
  return page.locator("#replay-seek").evaluate((input) => ({
    pos: Number((input as HTMLInputElement).value),
    total: Number((input as HTMLInputElement).max),
  }));
}

async function waitReplayEnd(page: Page) {
  await expect.poll(async () => {
    const { pos, total } = await seekState(page);
    return total > 1 && pos === total;
  }, { timeout: 30_000 }).toBe(true);
  await expect(page.locator("#replay-toggle")).toHaveText("Tocar");
}

async function seekTo(page: Page, pos: number) {
  await page.locator("#replay-seek").evaluate((input, value) => {
    const range = input as HTMLInputElement;
    range.value = String(value);
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  }, pos);
}

test.describe("replays", () => {
  test("Gravar fica na barra, a pasta aparece nas configurações e o replay entra na lista", async ({ browser }) => {
    const page = await person(browser, { cid: "replay-list", replayFolder: true });
    await bootTestRom(page);
    await openSettings(page);
    await expect(page.locator("#replays-folder")).toHaveText("Nenhuma pasta escolhida");
    await expect(page.locator("#replays-open")).toHaveText("Escolher pasta");
    await page.locator("#settings-close").click();

    await recordFor(page, 1500);
    await openReplayList(page);
    await expect(page.locator("#replays-where")).toHaveText("Pasta: replays");
    await expect(page.locator("#replays-list li[data-replay]")).toHaveCount(1);
    await expect(page.locator("#replays-list li[data-replay] small")).toHaveText(/^0:0\d · \d+ KB$/);

    await page.locator("#replays-list .replay-drop").click();
    await expect(page.locator("#alert-text")).toHaveText("Apagar esse replay? O arquivo sai da pasta. Não tem como desfazer.");
    await page.locator("#alert-yes").click();
    await expect(page.locator("#replays-list li")).toHaveText(["Nenhum replay de ROM de teste nesta pasta."]);
  });

  test("o replay repete os mesmos frames, vai ao frame exato pela barra e acelera", async ({ browser }) => {
    const page = await person(browser, { cid: "replay-play", replayFolder: true });
    await bootTestRom(page);
    await recordFor(page, 4000);
    const recorded = await probe(page);

    await watchNewest(page);
    await waitReplayEnd(page);
    const played = await probe(page);
    const same = compareRings(played, recorded);
    expect(same.common).toBeGreaterThan(150);
    expect(same.mismatched).toBe(0);

    const first = Math.min(...played.map(([frame]) => frame));
    const target = 90;
    await seekTo(page, target);
    await expect.poll(async () => (await probe(page)).at(-1)?.[0]).toBe(first + target - 1);
    const [frame, hash] = (await probe(page)).at(-1)!;
    expect(hash).toBe(new Map(recorded).get(frame));
    await expect(page.locator("#replay-clock")).toHaveText(/^0:01 \/ 0:0\d$/);

    await page.locator("#replay-step").click();
    await expect.poll(async () => (await probe(page)).at(-1)?.[0]).toBe(first + target);

    await seekTo(page, 1);
    await page.locator("#replay-toggle").click();
    await expect(page.locator("#replay-toggle")).toHaveText("Pausar");
    const start = (await seekState(page)).pos;
    await page.waitForTimeout(500);
    const normal = (await seekState(page)).pos - start;
    await page.locator("[data-replay-speed='4']").click();
    await expect(page.locator("[data-replay-speed='4']")).toHaveClass(/on/);
    const fastStart = (await seekState(page)).pos;
    await page.waitForTimeout(500);
    const fast = (await seekState(page)).pos - fastStart;
    expect(normal).toBeGreaterThan(10);
    expect(fast).toBeGreaterThan(normal * 2);
  });

  test("Reiniciar no meio da gravação abre um trecho novo e o replay continua igual", async ({ browser }) => {
    const page = await person(browser, { cid: "replay-reset", replayFolder: true });
    await bootTestRom(page);
    await recordFor(page, 3000, async () => {
      await page.locator("#reset").click();
      await page.locator("#alert-yes").click();
      await expectBanner(page, "Jogo reiniciado.");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    });
    const recorded = await probe(page);

    await watchNewest(page);
    await waitReplayEnd(page);
    const same = compareRings(await probe(page), recorded);
    expect(same.common).toBeGreaterThan(120);
    expect(same.mismatched).toBe(0);
  });

  test("Sair do replay devolve o jogo ao ponto em que estava", async ({ browser }) => {
    const page = await person(browser, { cid: "replay-exit", replayFolder: true });
    await bootTestRom(page);
    await recordFor(page, 1500);
    const before = (await probe(page)).at(-1)![0];

    await watchNewest(page);
    await waitReplayEnd(page);
    await page.locator("#replay-exit").click();
    await expectBanner(page, "Replay fechado. O jogo voltou de onde parou.");
    await expect(page.locator("#replay-bar")).toBeHidden();
    await expect(page.locator(".toolbar")).toBeVisible();
    await expect.poll(async () => (await probe(page)).at(-1)?.[0] ?? 0).toBeGreaterThan(before + 30);
  });
});
