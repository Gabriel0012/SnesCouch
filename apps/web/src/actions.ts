export interface GuideLike {
  button: string;
  does: string;
}

export type SpotId = "dpad" | "b" | "a" | "y" | "x" | "l" | "r" | "select" | "start" | "super";

export interface Spot {
  id: SpotId;
  action: string;
  hint: string;
  idle: boolean;
}

export interface KeyFace {
  label: string;
  wide: boolean;
  arrow?: "up" | "down" | "left" | "right";
}

export interface KeyRow {
  keys: KeyFace[];
  action: string;
  idle: boolean;
}

export interface ExtraKey extends KeyFace {
  action: string;
}

const DIRECTIONS = new Set(["Cima", "Baixo", "Esquerda", "Direita"]);

const BY_GAME: Record<string, Record<string, string>> = {
  "final-fight-3": {
    Direções: "Andar",
    Y: "Soco",
    B: "Pulo",
    A: "Especial",
    X: "Sem uso",
    L: "Segura a frente",
    R: "Segura a frente",
    Select: "Menu",
    Start: "Pausa",
    Super: "Super",
  },
  "pocky-rocky-2": {
    Direções: "Andar",
    Y: "Cartas",
    B: "Varinha",
    A: "Magia",
    X: "Sem uso",
    L: "Sem uso",
    R: "Joga o parceiro",
    Select: "Menu",
    Start: "Pausa",
  },
  "mighty-morphin-power-rangers-the-movie": {
    Direções: "Andar",
    Y: "Ataque",
    B: "Pulo",
    X: "Especial",
    A: "Agarra no alto",
    L: "Troca de fila",
    R: "Troca de fila",
    Select: "Menu",
    Start: "Pausa",
  },
  "king-of-dragons": {
    Direções: "Andar",
    Y: "Arma",
    B: "Pulo",
    X: "Magia",
    A: "Escudo",
    L: "Sem uso",
    R: "Sem uso",
    Select: "Sem uso",
    Start: "Pausa",
  },
};

const TO_SPOT: Record<string, SpotId> = {
  Direções: "dpad",
  B: "b",
  A: "a",
  Y: "y",
  X: "x",
  L: "l",
  R: "r",
  Select: "select",
  Start: "start",
  Super: "super",
};

const ORDER: SpotId[] = ["l", "r", "dpad", "x", "y", "a", "b", "select", "start"];

const SPOT_DOES: Record<SpotId, string> = {
  dpad: "Direções",
  b: "B",
  a: "A",
  y: "Y",
  x: "X",
  l: "L",
  r: "R",
  select: "Select",
  start: "Start",
  super: "Super",
};

const SAME: Record<SpotId, string[]> = {
  dpad: ["Direcional"],
  b: ["B"],
  a: ["A"],
  y: ["Y"],
  x: ["X"],
  l: ["L"],
  r: ["R"],
  select: ["Select"],
  start: ["Start"],
  super: [],
};

/** In-game action for a Super Nintendo button. Null hides a binding this game never uses. */
export function actionFor(gameId: string, does: string): string | null {
  if ((gameId === "local" || gameId.startsWith("local:")) && does === "Super") return null;
  if (does === "Abre a conversa" || does === "Segura o histórico") return does;
  if (DIRECTIONS.has(does)) return does;
  const table = BY_GAME[gameId];
  if (!table) return does;
  if (!(does in table)) return null;
  return table[does] ?? "Sem uso";
}

function keycaps(button: string): KeyFace[] {
  if (button === "Setas") {
    return [
      { label: "Cima", wide: false, arrow: "up" as const },
      { label: "Esquerda", wide: false, arrow: "left" as const },
      { label: "Baixo", wide: false, arrow: "down" as const },
      { label: "Direita", wide: false, arrow: "right" as const },
    ];
  }
  if (button === "Espaço" || button === "Enter") return [{ label: button, wide: true }];
  if (button === "Shift esquerdo") return [{ label: "Shift", wide: true }];
  return [{ label: button, wide: false }];
}

export function keyboardRows(guide: GuideLike[], gameId: string): KeyRow[] {
  const rows: KeyRow[] = [];
  for (const row of guide) {
    const action = actionFor(gameId, row.does);
    if (!action) continue;
    rows.push({ keys: keycaps(row.button), action, idle: action === "Sem uso" });
  }
  return rows;
}

function listed(buttons: string[]): string {
  const names = buttons.map((button) => (button.startsWith("Botão ") ? button.slice(6) : button));
  if (names.length === 1) return `botão ${names[0]}`;
  return `botões ${names.join(" e ")}`;
}

function hintFor(id: SpotId, buttons: string[], device: string): string {
  if (id === "dpad") {
    const stick = buttons.find((button) => /analógico|alavanca/i.test(button));
    return stick ? `${stick} também` : "";
  }
  if (device === "Super Nintendo" || buttons.every((button) => SAME[id].includes(button))) return "";
  return listed(buttons);
}

/** One callout per Super Nintendo button, in diagram order. */
export function spotsFor(guide: GuideLike[], gameId: string, device: string): Spot[] {
  const grouped = new Map<SpotId, string[]>();
  for (const row of guide) {
    const id = TO_SPOT[row.does];
    if (!id) continue;
    const list = grouped.get(id) ?? [];
    list.push(row.button);
    grouped.set(id, list);
  }
  const spots: Spot[] = [];
  for (const id of ORDER) {
    const buttons = grouped.get(id);
    if (!buttons) continue;
    const action = actionFor(gameId, SPOT_DOES[id]);
    if (!action) continue;
    spots.push({ id, action, hint: hintFor(id, buttons, device), idle: action === "Sem uso" });
  }
  return spots;
}

/** Keys that sit beside the drawn pad: the Super shortcut, plus the pad button that fires it. */
export function extraKeys(guide: GuideLike[] | null, gameId: string, superKey: string | null): ExtraKey[] {
  const action = actionFor(gameId, "Super");
  if (!action) return [];
  const rows: ExtraKey[] = [];
  if (superKey) rows.push({ label: superKey, wide: false, action });
  for (const row of guide ?? []) {
    if (row.does === "Super") rows.push({ label: row.button, wide: false, action });
  }
  return rows;
}
