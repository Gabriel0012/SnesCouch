import padUrl from "./assets/snes-pad.png";
import { extraKeys, keyboardRows, spotsFor, type GuideLike, type KeyFace, type Spot, type SpotId } from "./actions.ts";

const SVG = "http://www.w3.org/2000/svg";

const LEFT: SpotId[] = ["l", "y", "dpad"];
const RIGHT: SpotId[] = ["r", "x", "a", "b"];

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

export interface ManualPlayer {
  slot: number;
  device: string;
  guide: GuideLike[] | null;
  keys: GuideLike[];
  superKey: string | null;
}

let watch: ResizeObserver | null = null;
let scheme: MediaQueryList | null = null;
let redrawLeads: (() => void) | null = null;

function leadPaint(label: HTMLElement): string {
  const root = getComputedStyle(document.documentElement);
  if (label.classList.contains("idle")) return root.getPropertyValue("--dot").trim() || "#8b93a3";
  return getComputedStyle(label).color;
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function keyRow(keys: KeyFace[], action: string, idle: boolean): HTMLParagraphElement {
  const line = document.createElement("p");
  line.className = "manual-row";
  const caps = document.createElement("span");
  caps.className = keys.some((key) => key.arrow) ? "keycaps arrows" : "keycaps";
  for (const key of keys) {
    const cap = document.createElement("kbd");
    cap.className = key.wide ? "keycap wide" : "keycap";
    if (key.arrow) {
      cap.classList.add("arrow", key.arrow);
      cap.setAttribute("aria-label", key.label);
    } else {
      cap.textContent = key.label;
    }
    caps.append(cap);
  }
  const name = document.createElement("span");
  name.className = idle ? "key-action idle" : "key-action";
  name.textContent = action;
  line.append(caps, name);
  return line;
}

function callout(spot: Spot, where: "left" | "right" | "bottom"): HTMLElement {
  const item = document.createElement("p");
  item.className = `snes-call ${spot.id}${spot.idle ? " idle" : ""}`;
  item.dataset.spot = spot.id;
  if (where === "bottom") item.classList.add(where);
  const action = document.createElement("span");
  action.textContent = spot.action;
  item.append(action);
  if (spot.hint) {
    const hint = document.createElement("small");
    hint.textContent = spot.hint;
    item.append(hint);
  }
  return item;
}

const PAD_W = 680;
const PAD_H = 340;

/** Button boxes on snes-pad.png, in pixels: left, top, width, height. */
const HOT: Partial<Record<SpotId, [number, number, number, number]>> = {
  l: [125, 21, 96, 18],
  r: [459, 21, 95, 18],
  dpad: [85, 117, 116, 116],
  select: [253, 175, 48, 42],
  start: [327, 175, 49, 42],
  x: [511, 100, 48, 49],
  y: [444, 150, 50, 50],
  a: [576, 150, 48, 49],
  b: [510, 201, 49, 48],
};

function padPicture(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "snes-pad-wrap";
  const image = document.createElement("img");
  image.className = "snes-pad";
  image.src = padUrl;
  image.alt = "Controle do Super Nintendo";
  image.draggable = false;
  const redraw = () => {
    const map = wrap.closest(".snes-map");
    if (map instanceof HTMLElement) drawLeads(map);
  };
  image.addEventListener("load", redraw);
  wrap.append(image);
  for (const [id, box] of Object.entries(HOT) as [SpotId, [number, number, number, number]][]) {
    const [x, y, width, height] = box;
    const spot = document.createElement("span");
    spot.className = "snes-spot";
    spot.dataset.spot = id;
    spot.style.left = `${(x / PAD_W) * 100}%`;
    spot.style.top = `${(y / PAD_H) * 100}%`;
    spot.style.width = `${(width / PAD_W) * 100}%`;
    spot.style.height = `${(height / PAD_H) * 100}%`;
    wrap.append(spot);
  }
  return wrap;
}

function diagram(spots: Spot[]): HTMLElement {
  const map = document.createElement("div");
  map.className = "snes-map";
  const left = document.createElement("div");
  left.className = "snes-col left";
  const right = document.createElement("div");
  right.className = "snes-col right";
  const bottom = document.createElement("div");
  bottom.className = "snes-bottom";
  const pad = padPicture();
  const byId = new Map(spots.map((spot) => [spot.id, spot]));
  for (const id of LEFT) {
    const spot = byId.get(id);
    if (spot) left.append(callout(spot, "left"));
  }
  for (const id of RIGHT) {
    const spot = byId.get(id);
    if (spot) right.append(callout(spot, "right"));
  }
  for (const id of ["select", "start"] as const) {
    const spot = byId.get(id);
    if (spot) bottom.append(callout(spot, "bottom"));
  }
  const leads = svgEl("svg", { class: "snes-leads" });
  map.append(left, pad, right, bottom, leads);
  return map;
}

function boxOf(el: Element, origin: DOMRect): Box {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    right: rect.right - origin.left,
    top: rect.top - origin.top,
    bottom: rect.bottom - origin.top,
    cx: rect.left - origin.left + rect.width / 2,
    cy: rect.top - origin.top + rect.height / 2,
  };
}

function route(button: Box, label: Box, pad: Box, channel: number, slot: number): string {
  const below = label.top >= pad.bottom + 4;
  if (below) {
    const lane = Math.max(channel, pad.bottom + 6);
    const spine = pad.cx - 12 + slot * 3;
    const y = label.top - 5;
    const into = label.cx < pad.cx ? Math.min(label.right + 6, spine) : Math.max(label.left - 6, spine);
    return `M ${button.cx} ${button.bottom} V ${lane} H ${spine} V ${y} H ${into}`;
  }
  const toLeft = label.cx < pad.cx;
  const opposite = toLeft ? button.cx > pad.cx : button.cx < pad.cx;
  if (opposite) {
    const over = pad.top - 8;
    const endX = toLeft ? Math.min(label.right + 8, pad.left - 10) : Math.max(label.left - 8, pad.right + 10);
    return `M ${button.cx} ${button.top} V ${over} H ${endX} V ${label.cy}`;
  }
  if (toLeft) {
    const endX = Math.min(label.right + 8, pad.left - 10);
    if (Math.abs(button.cy - label.cy) < 7) return `M ${button.left} ${button.cy} H ${endX}`;
    return `M ${button.left} ${button.cy} H ${pad.left - 10} V ${label.cy} H ${endX}`;
  }
  const endX = Math.max(label.left - 8, pad.right + 10);
  if (Math.abs(button.cy - label.cy) < 7) return `M ${button.right} ${button.cy} H ${endX}`;
  return `M ${button.right} ${button.cy} H ${pad.right + 10} V ${label.cy} H ${endX}`;
}

function drawLeads(map: HTMLElement) {
  const leads = map.querySelector<SVGSVGElement>(".snes-leads");
  const pad = map.querySelector(".snes-pad-wrap");
  if (!leads || !pad || map.clientWidth < 8) return;
  const origin = map.getBoundingClientRect();
  leads.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);
  leads.replaceChildren();
  const padBox = boxOf(pad, origin);
  const animate = map.dataset.drew !== "1";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const calls = [...map.querySelectorAll<HTMLElement>(".snes-call")].map((label) => ({
    label,
    box: boxOf(label, origin),
  }));
  const below = calls.filter((call) => call.box.top >= padBox.bottom + 4);
  const ceiling = below.length ? Math.min(...below.map((call) => call.box.top)) - 8 : padBox.bottom + 8;
  const room = Math.max(0, ceiling - (padBox.bottom + 4));
  const step = below.length > 1 ? room / (below.length - 1) : 0;
  let dropped = 0;
  for (const call of calls) {
    const label = call.label;
    const id = label.dataset.spot ?? "";
    const button = pad.querySelector<SVGElement>(`[data-spot="${id}"]`);
    if (!button) continue;
    const channel = Math.min(padBox.bottom + 4 + dropped * step, ceiling);
    if (call.box.top >= padBox.bottom + 4) dropped += 1;
    const path = svgEl("path", {
      d: route(boxOf(button, origin), call.box, padBox, channel, dropped),
      fill: "none",
      stroke: leadPaint(label),
      "stroke-width": 2,
      "stroke-linejoin": "miter",
      "stroke-linecap": "square",
    });
    leads.append(path);
    if (animate && !reduce) {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      path.classList.add("snes-line");
    }
    const from = boxOf(button, origin);
    leads.append(svgEl("circle", {
      cx: from.cx, cy: from.cy, r: 3.5, fill: leadPaint(label),
    }));
  }
  map.dataset.drew = "1";
}

function track(maps: HTMLElement[]) {
  watch?.disconnect();
  if (scheme && redrawLeads) scheme.removeEventListener("change", redrawLeads);
  const redraw = () => {
    for (const map of maps) drawLeads(map);
  };
  watch = new ResizeObserver(redraw);
  redrawLeads = redraw;
  scheme = window.matchMedia("(prefers-color-scheme: light)");
  scheme.addEventListener("change", redraw);
  for (const map of maps) {
    watch.observe(map);
    drawLeads(map);
  }
}

export function paintManual(opts: {
  root: HTMLElement;
  tabs: HTMLElement;
  card: HTMLElement;
  players: ManualPlayer[];
  gameId: string;
  note: string;
}) {
  const { root, tabs, card, players, gameId, note } = opts;
  const maps: HTMLElement[] = [];
  const openTab = [...tabs.querySelectorAll("button")].findIndex((button) => button.getAttribute("aria-selected") === "true");
  const active = openTab >= 0 && openTab < players.length ? openTab : 0;
  root.replaceChildren();
  root.classList.toggle("solo", players.length < 2);
  card.classList.toggle("solo", players.length < 2);
  tabs.replaceChildren();
  tabs.hidden = players.length < 2;
  players.forEach((player, index) => {
    const section = document.createElement("section");
    section.className = "manual-pane";
    section.id = `manual-pane-${index}`;
    section.setAttribute("role", "tabpanel");
    if (index !== active) section.classList.add("off");
    const title = document.createElement("h3");
    title.textContent = `Jogador ${player.slot} · ${player.device}`;
    section.append(title);
    if (player.guide) {
      const spots = spotsFor(player.guide, gameId, player.device);
      const map = diagram(spots);
      maps.push(map);
      section.append(map);
      const extras = extraKeys(player.guide, gameId, player.superKey);
      if (extras.length) {
        const extra = document.createElement("div");
        extra.className = "manual-extra";
        for (const row of extras) extra.append(keyRow([row], row.action, false));
        section.append(extra);
      }
    } else {
      const keys = document.createElement("div");
      keys.className = "manual-keys";
      for (const row of keyboardRows(player.keys, gameId)) keys.append(keyRow(row.keys, row.action, row.idle));
      section.append(keys);
    }
    root.append(section);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", section.id);
    tab.setAttribute("aria-selected", index === active ? "true" : "false");
    tab.textContent = `Jogador ${player.slot}`;
    if (index === active) tab.classList.add("on");
    tab.addEventListener("click", () => {
      const buttons = [...tabs.querySelectorAll("button")];
      const panes = [...root.querySelectorAll<HTMLElement>(".manual-pane")];
      buttons.forEach((button, buttonIndex) => {
        button.classList.toggle("on", buttonIndex === index);
        button.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      });
      panes.forEach((pane, paneIndex) => pane.classList.toggle("off", paneIndex !== index));
      for (const map of maps) drawLeads(map);
    });
    tabs.append(tab);
  });
  if (note) {
    const line = document.createElement("p");
    line.className = "note manual-note";
    line.textContent = note;
    root.append(line);
  }
  track(maps);
}
