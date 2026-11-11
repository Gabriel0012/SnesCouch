import { expect, test, type Page } from "@playwright/test";
import { closeEveryone, person, seats } from "./helpers";

test.afterEach(closeEveryone);

function rowAnimations(page: Page) {
  return page.evaluate(() =>
    document.getAnimations()
      .map((anim) => anim.effect as KeyframeEffect | null)
      .filter((effect) => effect?.target instanceof HTMLLIElement && effect.target.dataset.seat)
      .map((effect) => effect!.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)))),
  );
}

test("a troca local inverte P1 e P2 com fade, o Manual acompanha, e mudar o nome não anima", async ({ browser }) => {
  const page = await person(browser, { cid: "local-swap" });
  await expect.poll(() => seats(page)).toEqual([
    expect.objectContaining({ seat: "a", chip: "P1" }),
    expect.objectContaining({ seat: "b", chip: "P2" }),
  ]);
  await expect.poll(async () => (await rowAnimations(page)).length).toBe(0);
  await page.locator("#nick").fill("Outro nome");
  await expect.poll(() => seats(page)).toContainEqual(expect.objectContaining({ name: "Outro nome" }));
  expect(await rowAnimations(page)).toEqual([]);
  await page.locator("#nick").fill("");

  await page.locator(".swap-btn").click();
  const moving = await rowAnimations(page);
  expect(moving).toHaveLength(2);
  for (const props of moving) expect(new Set(props)).toEqual(new Set(["opacity"]));
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
