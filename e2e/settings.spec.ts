import { expect, test } from "@playwright/test";
import { closeEveryone, closeSettings, openSettings, person } from "./helpers";

test.afterEach(closeEveryone);

const BLUE = "rgb(31, 91, 255)";

test.describe("configurações", () => {
  test("a engrenagem abre a modal e o Fill desliga o zoom", async ({ browser }) => {
    const page = await person(browser, { cid: "settings-zoom" });
    await openSettings(page);
    const zoom = page.locator("#settings [data-zoom]");
    await expect(zoom).toHaveCount(4);
    await page.locator("#settings [data-frame=fill]").click();
    for (const button of await zoom.all()) await expect(button).toBeDisabled();
    await expect(page.locator("#zoom-row")).toHaveClass(/off/);
    await page.locator("#settings [data-frame=fit]").click();
    for (const button of await zoom.all()) await expect(button).toBeEnabled();
    await expect(page.locator("#settings [data-zoom=fit]")).toHaveClass(/on/);
    await closeSettings(page);
  });

  test("FPS e ping ligam em azul e continuam ligados depois de recarregar", async ({ browser }) => {
    const page = await person(browser, { cid: "settings-toggles" });
    await openSettings(page);
    const fps = page.locator("#settings [data-fps]");
    const ping = page.locator("#settings [data-ping]");
    await fps.click();
    await ping.click();
    for (const toggle of [fps, ping]) {
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toHaveCSS("background-color", BLUE);
    }
    await page.reload();
    await openSettings(page);
    await expect(fps).toHaveAttribute("aria-pressed", "true");
    await expect(ping).toHaveAttribute("aria-pressed", "true");
  });

  test("opção não escolhida fica neutra e a escolhida fica azul", async ({ browser }) => {
    const page = await person(browser, { cid: "settings-colors" });
    await openSettings(page);
    await expect(page.locator("#settings [data-frame=fit]")).toHaveCSS("background-color", BLUE);
    await expect(page.locator("#settings [data-frame=fill]")).not.toHaveCSS("background-color", BLUE);
  });
});
