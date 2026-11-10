export const IDLE_MS = 15 * 60 * 1000;
export const LIVE_MS = 90 * 1000;

export type PresenceStatus = "online" | "away" | "offline";
export type PresenceMode = "auto" | "away" | "offline";
export type DeviceKind = "phone" | "desktop";

export function presenceStatus(
  mode: string | null,
  seenAt: number | null,
  liveAt: number | null,
  now = Date.now(),
): PresenceStatus {
  const live = liveAt !== null && now - liveAt < LIVE_MS;
  if (!live) return "offline";
  if (mode === "offline") return "offline";
  if (mode === "away") return "away";
  if (seenAt !== null && now - seenAt < IDLE_MS) return "online";
  return "away";
}

export function presenceMode(value: string | null): PresenceMode {
  return value === "away" || value === "offline" ? value : "auto";
}

export function deviceKind(value: string | null): DeviceKind | null {
  return value === "phone" || value === "desktop" ? value : null;
}
