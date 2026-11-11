import catalog from "../../../packages/catalog/games.json";
import testGame from "../../../packages/catalog/test-game.json";
import type { Env } from "./env";

export type CatalogGame = (typeof catalog.games)[number];

export function catalogGames(env: Pick<Env, "E2E">): CatalogGame[] {
  return env.E2E === "1" ? [...catalog.games, testGame] : catalog.games;
}
