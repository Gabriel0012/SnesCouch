import { expect, test } from "@playwright/test";
import { closeEveryone, person } from "./helpers";

test.afterEach(closeEveryone);

test("o botão de instalação usa o prompt nativo também no desktop", async ({ browser }) => {
  const page = await person(browser, { cid: "install-desktop" });
  const prevented = await page.evaluate(() => {
    const state = window as typeof window & { __installPromptCount?: number };
    state.__installPromptCount = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => { state.__installPromptCount = (state.__installPromptCount ?? 0) + 1; } },
      userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(true);
  await expect(page.locator("#install")).toBeVisible();
  await page.locator("#install").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __installPromptCount?: number }).__installPromptCount)).toBe(1);
  await expect(page.locator("#install")).toBeHidden();
});
