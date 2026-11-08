import { conceal, reveal } from "./motion.ts";

const KEY = "snes-couch-tour";

type Pin = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: "b" | "y" | "x" | "a";
  place: "above" | "inside" | "inline" | "right" | "left" | "foot";
};

type Slide = {
  image: string;
  alt: string;
  title: string;
  body: string;
  pins: Pin[];
};

const slides: Slide[] = [
  {
    image: "/tour/home.png",
    alt: "Tela inicial com a lista de jogos, a área da ROM e a sala.",
    title: "Três cantos",
    body: "A lista fica à esquerda, a tela no meio e a sala à direita. Os dois jogam nesta máquina, ou o segundo controle vai para outra casa.",
    pins: [
      { x: 0.4, y: 6.2, w: 19.2, h: 87.6, label: "Jogos", color: "b", place: "foot" },
      { x: 20.3, y: 6.2, w: 53.6, h: 87.6, label: "Tela", color: "y", place: "inside" },
      { x: 74.6, y: 6.2, w: 25, h: 87.6, label: "Sala", color: "x", place: "foot" },
    ],
  },
  {
    image: "/tour/home.png",
    alt: "Jogo escolhido na lista e a área para soltar a ROM.",
    title: "A ROM",
    body: "Escolhe o jogo e solta a ROM USA na área do meio. O arquivo só entra se for a versão certa, fica neste navegador e não é enviado.",
    pins: [
      { x: 0.9, y: 7.1, w: 18.2, h: 12, label: "Escolhe", color: "b", place: "right" },
      { x: 31.3, y: 36.3, w: 31.8, h: 17, label: "Solta a ROM", color: "y", place: "above" },
    ],
  },
  {
    image: "/tour/volume.png",
    alt: "Barra da tela com tamanho, volume aberto, reiniciar e saves.",
    title: "A tela",
    body: "Ajusta o tamanho, o volume e a tela cheia. Reiniciar volta o jogo. Esquecer ROM apaga o arquivo daqui. Saves abre os slots, cada um com o print da tela.",
    pins: [
      { x: 20.7, y: 83.2, w: 25.1, h: 4.9, label: "Tamanho", color: "x", place: "above" },
      { x: 40.7, y: 77.7, w: 14.1, h: 10.4, label: "Volume", color: "b", place: "above" },
      { x: 54.7, y: 83.2, w: 19.1, h: 4.9, label: "Partida", color: "a", place: "above" },
      { x: 20.7, y: 88.6, w: 53.1, h: 5, label: "Saves", color: "y", place: "inline" },
    ],
  },
  {
    image: "/tour/manual.png",
    alt: "Manual aberto com os botões do jogador 1.",
    title: "Controles",
    body: "Jogador 1 e jogador 2 abrem em abas. O teclado aparece em teclas. O controle desenha o Super Nintendo, com uma linha até a ação no jogo. Na sala, só entra o seu.",
    pins: [
      { x: 34.1, y: 17.6, w: 31.8, h: 64.8, label: "Lista do teclado", color: "b", place: "above" },
      { x: 75.4, y: 56.9, w: 7.1, h: 4.8, label: "Abre aqui", color: "y", place: "right" },
    ],
  },
  {
    image: "/tour/home.png",
    alt: "Painel da sala com nome, criar sala e código.",
    title: "A sala",
    body: "Põe o nome, cria a sala e manda o código de 5 letras. Na outra casa, entra com esse código. A conversa aparece no canto do jogo. Os dois precisam da mesma ROM.",
    pins: [
      { x: 75.3, y: 10.2, w: 24.2, h: 7.4, label: "Nome", color: "b", place: "left" },
      { x: 75.3, y: 27.9, w: 24.2, h: 10.2, label: "Código", color: "x", place: "left" },
      { x: 75.3, y: 42.2, w: 24.2, h: 13.6, label: "Quem joga", color: "y", place: "left" },
    ],
  },
];

const tour = document.querySelector<HTMLElement>("#tour")!;
const frame = document.querySelector<HTMLElement>("#tour-frame")!;
const shot = document.querySelector<HTMLImageElement>("#tour-shot")!;
const marks = document.querySelector<HTMLElement>("#tour-marks")!;
const title = document.querySelector<HTMLElement>("#tour-title")!;
const copy = document.querySelector<HTMLElement>("#tour-copy")!;
const count = document.querySelector<HTMLElement>("#tour-count")!;
const pips = document.querySelector<HTMLElement>("#tour-pips")!;
const backButton = document.querySelector<HTMLButtonElement>("#tour-back")!;
const skipButton = document.querySelector<HTMLButtonElement>("#tour-skip")!;
const nextButton = document.querySelector<HTMLButtonElement>("#tour-next")!;

let index = 0;
let closing = false;

function pin(mark: Pin) {
  const box = document.createElement("span");
  box.className = `pin ${mark.color} ${mark.place}`;
  box.style.left = `${mark.x}%`;
  box.style.top = `${mark.y}%`;
  box.style.width = `${mark.w}%`;
  box.style.height = `${mark.h}%`;
  const tag = document.createElement("span");
  tag.className = "pin-tag";
  tag.textContent = mark.label;
  box.append(tag);
  return box;
}

function show(next: number, dir: "left" | "right" | "none") {
  index = next;
  const slide = slides[index];
  frame.classList.remove("step-in", "move-left", "move-right");
  shot.src = slide.image;
  shot.alt = slide.alt;
  title.textContent = slide.title;
  copy.textContent = slide.body;
  count.textContent = `${index + 1} / ${slides.length}`;
  marks.replaceChildren(...slide.pins.map(pin));
  pips.replaceChildren(...slides.map((_, pip) => {
    const dot = document.createElement("i");
    if (pip === index) dot.className = "on";
    return dot;
  }));
  backButton.disabled = index === 0;
  nextButton.textContent = index === slides.length - 1 ? "Jogar" : "Próximo";
  if (dir === "none") return;
  void frame.offsetWidth;
  frame.classList.add("step-in", dir === "left" ? "move-left" : "move-right");
}

function finish() {
  if (tour.hidden || closing) return;
  closing = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* a visita segue sem gravar */ }
  conceal(tour, "modal");
}

function forward() {
  if (closing || tour.hidden) return;
  if (index >= slides.length - 1) {
    finish();
    return;
  }
  show(index + 1, "left");
}

function back() {
  if (closing || tour.hidden || index === 0) return;
  show(index - 1, "right");
}

backButton.addEventListener("click", () => back());
skipButton.addEventListener("click", () => finish());
nextButton.addEventListener("click", () => forward());

window.addEventListener("keydown", (event) => {
  if (tour.hidden || closing) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    forward();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    back();
  } else if (event.key === "Escape") {
    event.preventDefault();
    finish();
  } else if (event.key === "Tab") {
    const items = [backButton, skipButton, nextButton].filter((button) => !button.disabled);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

export function startTour() {
  if (closing) return;
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch { /* mostra mesmo assim */ }
  show(0, "none");
  reveal(tour, "modal");
  nextButton.focus();
}
