import { catalogGames } from "./catalog";
import type { Env } from "./env";
import { json, problem } from "./http";
import type { UserRow } from "./users";

export async function listFavorites(env: Env, user: UserRow): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT game_id FROM favorites WHERE user_id = ? ORDER BY rowid",
  ).bind(user.id).all<{ game_id: string }>();
  return json({ favorites: (result.results ?? []).map((row) => row.game_id) });
}

export async function changeFavorite(
  env: Env,
  user: UserRow,
  gameId: string,
  favorite: boolean,
): Promise<Response> {
  if (!catalogGames(env).some((game) => game.id === gameId)) return problem("Esse jogo não existe no catálogo.", 404);
  if (favorite) {
    await env.DB.prepare("INSERT OR IGNORE INTO favorites (user_id, game_id) VALUES (?, ?)")
      .bind(user.id, gameId).run();
  } else {
    await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND game_id = ?")
      .bind(user.id, gameId).run();
  }
  return listFavorites(env, user);
}
