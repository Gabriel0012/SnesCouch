import { expect, test } from "@playwright/test";
import { closeEveryone, person, seats } from "./helpers";

test.afterEach(closeEveryone);

test("a troca local inverte P1 e P2, anima as linhas e o Manual acompanha", async ({ browser }) => {
  const page = await person(browser, { cid: "local-swap" });
  await expect.poll(() => seats(page)).toEqual([
    expect.objectContaining({ seat: "a", chip: "P1" }),
    expect.objectContaining({ seat: "b", chip: "P2" }),
  ]);
  await page.locator(".swap-btn").click();
  const moving = await page.evaluate(() => document.getAnimations().filter((anim) => (anim.effect as KeyframeEffect | null)?.target instanceof HTMLLIElement).length);
  expect(moving).toBe(2);
  await expect.poll(() => seats(page)).toEqual([
    expect.objectContaining({ seat: "b", chip: "P1", name: "Jogador 1" }),
    expect.objectContaining({ seat: "a", chip: "P2", name: "Jogador 2" }),
  ]);

  await page.locator("#manual-open").click();
  const text = (await page.locator("#manual-body").textContent()) ?? "";
  const first = text.indexOf("Jogador 1");
  const second = text.indexOf("Jogador 2");
  expect(first).toBeGreaterThanOrEqual(0);
  expect(text.indexOf("ICima")).toBeGreaterThan(first);
  expect(text.indexOf("ICima")).toBeLessThan(second);
});
