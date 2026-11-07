import { extraKeys, keyboardRows, spotsFor, type GuideLike, type KeyFace, type Spot, type SpotId } from "./actions.ts";

const SVG = "http://www.w3.org/2000/svg";

const PAINT: Record<SpotId, string> = {
  b: "#f5c518",
  a: "#ff6b62",
  y: "#3dce74",
  x: "#8eb0ff",
  l: "#f6f3ea",
  r: "#f6f3ea",
  dpad: "#f6f3ea",
  select: "#f6f3ea",
  start: "#f6f3ea",
  super: "#f6f3ea",
};

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
  item.dataset.paint = spot.idle ? "#8b93a3" : PAINT[spot.id];
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

function padGraphic(uid: string): SVGSVGElement {
  const bodyId = `snes-body-${uid}`;
  const shadowId = `snes-shadow-${uid}`;
  const svg = svgEl("svg", { class: "snes-pad", viewBox: "0 0 400 250", role: "img", "aria-label": "Controle do Super Nintendo" });
  const defs = svgEl("defs", {});
  const gradient = svgEl("linearGradient", { id: bodyId, x1: "0", y1: "0", x2: "0", y2: "1" });
  gradient.append(svgEl("stop", { offset: "0", "stop-color": "#f4f1f8" }));
  gradient.append(svgEl("stop", { offset: "1", "stop-color": "#b7b2c6" }));
  const shadow = svgEl("filter", { id: shadowId, x: "-8%", y: "-8%", width: "124%", height: "130%" });
  shadow.append(svgEl("feDropShadow", { dx: "4", dy: "5", stdDeviation: "0", "flood-color": "#000", "flood-opacity": "0.9" }));
  defs.append(gradient, shadow);
  svg.append(defs);

  svg.append(svgEl("rect", {
    x: 28, y: 46, width: 344, height: 170, rx: 54,
    fill: `url(#${bodyId})`, stroke: "#241f2e", "stroke-width": 3, filter: `url(#${shadowId})`,
  }));

  const shoulders: [SpotId, number, string][] = [["l", 52, "L"], ["r", 236, "R"]];
  for (const [id, x, glyph] of shoulders) {
    svg.append(svgEl("rect", {
      "data-spot": id, x, y: 30, width: 112, height: 28, rx: 8,
      fill: "#cdc8d8", stroke: "#3a3648", "stroke-width": 2,
    }));
    svg.append(svgEl("rect", { x: x + 8, y: 50, width: 96, height: 6, fill: "#8e89a0" }));
    const text = svgEl("text", {
      x: x + 56, y: 43, "text-anchor": "middle", "dominant-baseline": "middle",
      fill: "#1c1e26", "font-size": 15, "font-family": "Silkscreen, Courier New, monospace",
    });
    text.textContent = glyph;
    svg.append(text);
  }

  const dpad = svgEl("g", { "data-spot": "dpad" });
  dpad.append(svgEl("rect", { x: 99, y: 98, width: 18, height: 72, rx: 3, fill: "#2a2a32" }));
  dpad.append(svgEl("rect", { x: 72, y: 125, width: 72, height: 18, rx: 3, fill: "#2a2a32" }));
  dpad.append(svgEl("rect", { x: 99, y: 98, width: 18, height: 10, rx: 2, fill: "#6a6a76" }));
  dpad.append(svgEl("circle", { cx: 108, cy: 134, r: 5, fill: "#16161c" }));
  svg.append(dpad);

  for (const [id, x] of [["select", 156], ["start", 198]] as const) {
    svg.append(svgEl("rect", {
      "data-spot": id, x, y: 124, width: 36, height: 18, rx: 9,
      fill: "#4a4658", stroke: "#211e28", "stroke-width": 2,
    }));
  }

  const faces: [SpotId, number, number, string, string, string][] = [
    ["x", 292, 96, "#1f5bff", "#f4f7ff", "X"],
    ["y", 258, 134, "#00a34a", "#06210f", "Y"],
    ["a", 332, 134, "#e10600", "#fff6f4", "A"],
    ["b", 292, 172, "#f5c518", "#12141a", "B"],
  ];
  for (const [id, cx, cy, fill, ink, glyph] of faces) {
    svg.append(svgEl("circle", { cx, cy: cy + 2, r: 17, fill: "#000", opacity: "0.35" }));
    svg.append(svgEl("circle", { "data-spot": id, cx, cy, r: 17, fill, stroke: "#1a1208", "stroke-width": 2 }));
    svg.append(svgEl("circle", { cx: cx - 5, cy: cy - 6, r: 4, fill: "#fff", opacity: "0.35" }));
    const text = svgEl("text", {
      x: cx, y: cy + 1, "text-anchor": "middle", "dominant-baseline": "middle",
      fill: ink, "font-size": 15, "font-family": "Silkscreen, Courier New, monospace",
    });
    text.textContent = glyph;
    svg.append(text);
  }
  return svg;
}

function diagram(spots: Spot[], uid: string): HTMLElement {
  const map = document.createElement("div");
  map.className = "snes-map";
  const left = document.createElement("div");
  left.className = "snes-col left";
  const right = document.createElement("div");
  right.className = "snes-col right";
  const bottom = document.createElement("div");
  bottom.className = "snes-bottom";
  const pad = document.createElement("div");
  pad.className = "snes-pad-wrap";
  pad.append(padGraphic(uid));
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

function route(id: string, button: Box, label: Box, pad: Box, channel: number): string {
  const below = label.top >= pad.bottom - 2;
  if (below) {
    if (Math.abs(button.cx - label.cx) < 16) return `M ${button.cx} ${button.bottom} V ${label.top - 5}`;
    return `M ${button.cx} ${button.bottom} V ${channel} H ${label.cx} V ${label.top - 5}`;
  }
  const toLeft = label.cx < pad.cx;
  if (id === "y" && toLeft) {
    const lane = pad.top + (pad.bottom - pad.top) * (66 / 250);
    const endX = label.right + 8;
    if (Math.abs(lane - label.cy) < 4) return `M ${button.cx} ${button.top} V ${lane} H ${endX}`;
    return `M ${button.cx} ${button.top} V ${lane} H ${endX} V ${label.cy}`;
  }
  if (toLeft) {
    const endX = label.right + 8;
    if (Math.abs(button.cy - label.cy) < 7) return `M ${button.left} ${button.cy} H ${endX}`;
    const gutter = Math.min(pad.left - 8, endX);
    return `M ${button.left} ${button.cy} H ${gutter} V ${label.cy} H ${endX}`;
  }
  const endX = label.left - 8;
  if (Math.abs(button.cy - label.cy) < 7) return `M ${button.right} ${button.cy} H ${endX}`;
  const gutter = Math.max(pad.right + 8, endX);
  return `M ${button.right} ${button.cy} H ${gutter} V ${label.cy} H ${endX}`;
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
  const below = calls.filter((call) => call.box.top >= padBox.bottom - 2);
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
    if (call.box.top >= padBox.bottom - 2) dropped += 1;
    const path = svgEl("path", {
      d: route(id, boxOf(button, origin), call.box, padBox, channel),
      fill: "none",
      stroke: label.dataset.paint ?? "#f6f3ea",
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
      cx: from.cx, cy: from.cy, r: 3.5, fill: label.dataset.paint ?? "#f6f3ea",
    }));
  }
  map.dataset.drew = "1";
}

function track(maps: HTMLElement[]) {
  watch?.disconnect();
  watch = new ResizeObserver(() => {
    for (const map of maps) drawLeads(map);
  });
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
    if (index > 0) section.classList.add("off");
    const title = document.createElement("h3");
    title.textContent = `Jogador ${player.slot} · ${player.device}`;
    section.append(title);
    if (player.guide) {
      const spots = spotsFor(player.guide, gameId, player.device);
      const map = diagram(spots, String(index));
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
      for (const row of keyboardRows(player.keys, gameId)) section.append(keyRow(row.keys, row.action, row.idle));
    }
    root.append(section);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", section.id);
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.textContent = `Jogador ${player.slot}`;
    if (index === 0) tab.classList.add("on");
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
