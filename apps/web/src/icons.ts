import arcadeUrl from "./assets/arcade.png";
import controlUrl from "./assets/control.png";
import keyboardUrl from "./assets/keyboard.png";

export type PadKind = "teclado" | "ps4" | "ps5" | "xbox" | "fliperama" | "snes" | "usb";

const src: Record<PadKind, string> = {
  teclado: keyboardUrl,
  fliperama: arcadeUrl,
  ps4: controlUrl,
  ps5: controlUrl,
  xbox: controlUrl,
  snes: controlUrl,
  usb: controlUrl,
};

export function kindFromLabel(label: string): PadKind | null {
  if (label === "PS5") return "ps5";
  if (label === "PS4") return "ps4";
  if (label === "Xbox") return "xbox";
  if (label === "Fliperama") return "fliperama";
  if (label === "Super Nintendo") return "snes";
  if (label === "Controle USB") return "usb";
  if (label === "Teclado") return "teclado";
  return null;
}

export function padIcon(kind: PadKind): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src[kind];
  img.alt = "";
  img.className = "pad-icon";
  return img;
}
