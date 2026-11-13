import { expect, test } from "@playwright/test";
import { closeEveryone, person } from "./helpers";

test.afterEach(closeEveryone);

test("busca filtra jogos e favoritos ficam primeiro na ordem em que foram marcados", async ({ browser }) => {
  const page = await person(browser, { cid: "favorites-search" });
  let favorites: string[] = [];
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: {
      id: "user-1",
      name: "Jogador",
      provider: "google",
      friendCode: "ABC234",
      hasAvatar: false,
      presence: "auto",
    } }),
  }));
  await page.route("**/api/friends", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ friends: [], incoming: [], outgoing: [] }),
  }));
  await page.route("**/api/invites", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ invites: [] }),
  }));
  await page.route("**/api/me/presence", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/favorites**", async (route) => {
    const url = new URL(route.request().url());
    const gameId = url.pathname.split("/").at(-1);
    if (url.pathname === "/api/favorites") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ favorites }) });
      return;
    }
    if (route.request().method() === "PUT" && gameId && !favorites.includes(gameId)) favorites.push(gameId);
    if (route.request().method() === "DELETE" && gameId) favorites = favorites.filter((id) => id !== gameId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ favorites }) });
  });
  await page.reload();
  await expect(page.locator("#account-in")).toBeVisible();

  const cards = page.locator("#pick [data-game-id]");
  const donkeyKong = page.locator('[data-favorite="donkey-kong-country"]');
  const finalFight = page.locator('[data-favorite="final-fight-3"]');
  await expect(donkeyKong).toHaveAttribute("aria-pressed", "false");
  await donkeyKong.click();
  await expect(donkeyKong).toHaveAttribute("aria-pressed", "true");
  await finalFight.click();

  await expect.poll(() => cards.evaluateAll((items) => items.slice(0, 2).map((item) => (item as HTMLElement).dataset.gameId))).toEqual([
    "donkey-kong-country",
    "final-fight-3",
  ]);
  await expect.poll(async () => decodeURIComponent((await donkeyKong.locator("img").getAttribute("src")) ?? ""))
    .toMatch(/stroke-width='1'/);

  await page.locator("#game-search").fill("mario");
  await expect.poll(() => cards.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.gameId))).toEqual([
    "super-mario-world",
    "new-super-mario-land",
  ]);
  await page.locator("#game-search").fill("");
  await donkeyKong.click();
  await expect.poll(() => cards.evaluateAll((items) => items.slice(0, 1).map((item) => (item as HTMLElement).dataset.gameId))).toEqual([
    "final-fight-3",
  ]);
});
