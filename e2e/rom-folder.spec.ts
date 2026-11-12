import { expect, test } from "@playwright/test";
import { buildTestRom } from "../core/fixtures/test-rom.mjs";
import { closeEveryone, closeSettings, openSettings, person, probe } from "./helpers";

test.afterEach(closeEveryone);

test("a pasta das ROMs encontra nas subpastas, grava no navegador e depois abre a copia local", async ({ browser }) => {
  const page = await person(browser, { cid: "rom-folder", romFolder: true });
  const rom = [...buildTestRom()];
  await page.evaluate(async (bytes) => {
    const root = await navigator.storage.getDirectory();
    const roms = await root.getDirectoryHandle("roms", { create: true });
    const nested = await roms.getDirectoryHandle("colecao", { create: true });
    const file = await nested.getFileHandle("teste.sfc", { create: true });
    const writable = await file.createWritable();
    await writable.write(new Uint8Array(bytes));
    await writable.close();
  }, rom);

  await openSettings(page);
  await page.locator("#rom-folder-open").click();
  await expect(page.locator("#rom-folder")).toHaveText("Pasta selecionada: roms");
  await closeSettings(page);
  await page.locator('button.game[title="ROM de teste"]').click();
  await expect(page.locator("#picture")).toBeVisible();
  await expect.poll(async () => (await probe(page)).length).toBeGreaterThan(30);
  await expect(page.locator('button.game[title="ROM de teste"] small')).toContainText("ROM neste navegador");

  await expect(page.locator("#welcome-rom-upload")).toBeHidden();
  await page.locator("#close-play").click();
  await expect(page.locator("#welcome")).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#welcome-rom-upload").click();
  await (await fileChooserPromise).setFiles({ name: "manual.sfc", mimeType: "application/octet-stream", buffer: Buffer.from(rom) });
  await expect(page.locator("#picture")).toBeVisible();
  await expect.poll(async () => (await probe(page)).length).toBeGreaterThan(30);
  await openSettings(page);
  await expect(page.locator("#forget")).toBeEnabled();
  await closeSettings(page);

  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const roms = await root.getDirectoryHandle("roms");
    await roms.removeEntry("colecao", { recursive: true });
  });
  await page.reload();
  await expect(page.locator("#picture")).toBeVisible();
  await expect.poll(async () => (await probe(page)).length).toBeGreaterThan(30);
});
