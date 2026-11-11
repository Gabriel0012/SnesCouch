import { expect, test } from "@playwright/test";
import { bootTestRom, closeEveryone, person } from "./helpers";

test.afterEach(closeEveryone);

test.describe("jogo aberto", () => {
  test("a ROM de teste roda perto de 60 FPS", async ({ browser }) => {
    const page = await person(browser, { cid: "play-fps", fps: true });
    await bootTestRom(page);
    await expect(page.locator("#fps")).toBeVisible();
    await expect.poll(async () => Number.parseInt((await page.locator("#fps").textContent()) ?? "0", 10), { timeout: 10_000 }).toBeGreaterThanOrEqual(55);
  });

  test("Fechar jogo só aparece com o jogo aberto", async ({ browser }) => {
    const page = await person(browser, { cid: "play-close" });
    await expect(page.locator("#close-play")).toBeHidden();
    await bootTestRom(page);
    await expect(page.locator("#close-play")).toBeVisible();
    await page.locator("#close-play").click();
    await expect(page.locator("#picture")).toBeHidden();
    await expect(page.locator("#close-play")).toBeHidden();
  });

  test("os botões da barra têm a mesma altura", async ({ browser }) => {
    const page = await person(browser, { cid: "play-bar" });
    await bootTestRom(page);
    const heights = await page.locator(".toolbar .dock-group > *").evaluateAll((items) =>
      items.filter((item) => (item as HTMLElement).offsetParent !== null).map((item) => Math.round(item.getBoundingClientRect().height)),
    );
    expect(heights.length).toBeGreaterThanOrEqual(8);
    expect(new Set(heights).size).toBe(1);
  });
});

test("o alerta é pequeno, amarelo quando avisa, fica no meio logo abaixo do header e fecha com um clique", async ({ browser }) => {
  const page = await person(browser, { cid: "play-banner" });
  const banner = page.locator("#banner");
  await page.locator("#copy").click();
  await expect(page.locator("#banner-text")).toHaveText("Cria a sala, ou cola um código, antes de copiar.");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-tone", "warn");
  await expect(banner).toHaveCSS("background-color", "rgb(201, 164, 58)");
  await expect(banner.locator("button")).toHaveCount(0);
  await expect.poll(async () => {
    const box = await banner.boundingBox();
    const header = await page.locator("body > header").boundingBox();
    const width = page.viewportSize()!.width;
    if (!box || !header) return null;
    return {
      width: Math.round(box.width),
      centered: Math.abs(box.x + box.width / 2 - width / 2) <= 1,
      underHeader: Math.abs(box.y - header.height) <= 1,
    };
  }).toEqual({ width: 200, centered: true, underHeader: true });
  await banner.click();
  await expect(banner).toBeHidden();
});
