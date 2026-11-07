import {
  acceptFriend,
  AccountError,
  askFriend,
  cloudSaves,
  declineFriend,
  downloadSave,
  downloadShot,
  fetchAccount,
  listCloud,
  loadFriends,
  logoutAccount,
  publishOpenRoom,
  removeFriend,
  uploadSave,
  type AccountUser,
  type FriendCard,
} from "./account.ts";
import { Speaker } from "./audio.ts";
import { kindFromLabel, padIcon } from "./icons.ts";
import { startInstall } from "./install.ts";
import { KEYBOARD_GUIDE, connectedPads, padStatus, readPads, readSupers, setTouchBits } from "./input.ts";
import { paintManual } from "./manual.ts";
import { startTouch } from "./touch.ts";
import { controlGuide, keyboardScheme, padLabel } from "./pads.ts";
import { games, matchRom, type Game } from "./rom.ts";
import { OnlineSession, type ChatLine, type Role, type Seat } from "./session.ts";
import { FIGHTERS, LEFT, RIGHT, SELECT, fighterLabel, superSteps, type Fighter } from "./supers.ts";
import { conceal, reveal, shown } from "./motion.ts";
import { forgetRom, lastGame, loadRom, loadState, playerName, saveList, saveRom, saveSlots, saveState, setPlayerName, storedGames } from "./store.ts";
import { startTour } from "./tour.ts";

const pick = document.querySelector<HTMLElement>("#pick")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const panel = document.querySelector<HTMLElement>("#panel")!;
const roomOpen = document.querySelector<HTMLButtonElement>("#room-open")!;
const roomClose = document.querySelector<HTMLButtonElement>("#room-close")!;
const roomBackdrop = document.querySelector<HTMLButtonElement>("#room-backdrop")!;
const drop = document.querySelector<HTMLLabelElement>("#drop")!;
const dropText = drop.childNodes[0];
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const banner = document.querySelector<HTMLElement>("#banner")!;
const bannerText = document.querySelector<HTMLElement>("#banner-text")!;
const roomState = document.querySelector<HTMLElement>("#room-state")!;
const roomCode = document.querySelector<HTMLElement>("#room-code")!;
const roomTitle = document.querySelector<HTMLElement>("#room-title")!;
const chatPanel = document.querySelector<HTMLElement>(".chat")!;
const manual = document.querySelector<HTMLElement>("#manual")!;
const manualCard = manual.querySelector<HTMLElement>(".manual-card")!;
const manualTabs = document.querySelector<HTMLElement>("#manual-tabs")!;
const manualBody = document.querySelector<HTMLElement>("#manual-body")!;
const delayLabel = document.querySelector<HTMLElement>("#delay")!;
const codeInput = document.querySelector<HTMLInputElement>("#code")!;
const nickInput = document.querySelector<HTMLInputElement>("#nick")!;
const accountOut = document.querySelector<HTMLElement>("#account-out")!;
const accountIn = document.querySelector<HTMLElement>("#account-in")!;
const accountAvatar = document.querySelector<HTMLImageElement>("#account-avatar")!;
const accountName = document.querySelector<HTMLElement>("#account-name")!;
const accountCode = document.querySelector<HTMLButtonElement>("#account-code")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const friendsSection = document.querySelector<HTMLElement>("#friends")!;
const friendForm = document.querySelector<HTMLFormElement>("#friend-add")!;
const friendCodeInput = document.querySelector<HTMLInputElement>("#friend-code")!;
const friendList = document.querySelector<HTMLElement>("#friend-list")!;
const savesCloud = document.querySelector<HTMLElement>("#saves-cloud")!;
const people = document.querySelector<HTMLElement>("#players")!;
const log = document.querySelector<HTMLElement>("#log")!;
const chatForm = document.querySelector<HTMLFormElement>("#chat")!;
const chatInput = document.querySelector<HTMLInputElement>("#chat-text")!;
const chatButton = chatForm.querySelector("button")!;
const leaveButton = document.querySelector<HTMLButtonElement>("#leave")!;
const confirmBox = document.querySelector<HTMLElement>("#confirm")!;
const confirmText = document.querySelector<HTMLElement>("#confirm-text")!;
const confirmYes = document.querySelector<HTMLButtonElement>("#confirm-yes")!;
const confirmNo = document.querySelector<HTMLButtonElement>("#confirm-no")!;
const picture = document.querySelector<HTMLElement>("#picture")!;
const bubbles = [
  document.querySelector<HTMLElement>('.bubble[data-slot="0"]')!,
  document.querySelector<HTMLElement>('.bubble[data-slot="1"]')!,
] as const;
const savesModal = document.querySelector<HTMLElement>("#saves-modal")!;
const savesGrid = document.querySelector<HTMLElement>("#saves-grid")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy")!;
const volButton = document.querySelector<HTMLButtonElement>("#vol")!;
const volSlider = document.querySelector<HTMLInputElement>("#vol-slider")!;
const volReadout = document.querySelector<HTMLElement>("#vol-readout")!;

let screen = document.querySelector<HTMLCanvasElement>("#screen")!;
let transferred = false;
let zoom: "fit" | "2" | "3" | "4" = "fit";

let selected: Game = games[0];
let loadedGame: Game | null = null;
let ready = new Set<string>();
let session: OnlineSession | null = null;
let roster: { host: Seat; guest: Seat } | null = null;
let worker: Worker | null = null;
const speaker = new Speaker();
let sab: SharedArrayBuffer | null = null;
let pads: Uint16Array | null = null;
type ResetNet = { slot: 0 | 1; delay: number } | null;
let romBytes: Uint8Array | null = null;
let resetTimer = 0;
let relaunching = false;
let resetNet: ResetNet = null;
const localChecks = new Map<number, number>();
const remoteChecks = new Map<number, number>();
let checkpointWait: ((snapshot: { frame: number; state: Uint8Array; delay: number }) => void) | null = null;
let saveWait: ((saved: { state: Uint8Array; shot: Uint8Array | null }) => void) | null = null;
type AlertMode = "forget" | "reset-local" | "reset-ask" | "reset-wait" | "reset-in";
let alertMode: AlertMode | null = null;
let nick = "";
let account: AccountUser | null = null;
let hostedCode: string | null = null;
let roomChain: Promise<void> = Promise.resolve();
let roomWanted: string | null = null;

function queueRoom(code: string | null): Promise<void> {
  hostedCode = code;
  roomWanted = code;
  const run = roomChain.then(async () => {
    if (!account || roomWanted !== code) return;
    await publishOpenRoom(code);
  });
  roomChain = run.then(() => undefined, () => undefined);
  return run;
}
let sentProfile = "";
let peopleKey = "";
let booting: Promise<void> = Promise.resolve();

let bannerTimer = 0;

function setBanner(text: string) {
  window.clearTimeout(bannerTimer);
  if (text.length === 0) {
    conceal(banner, "up");
    return;
  }
  bannerText.textContent = text;
  reveal(banner, "up", true);
  bannerTimer = window.setTimeout(() => setBanner(""), 5000);
}

function setDelay(text: string) {
  delayLabel.textContent = text;
  if (!text) {
    delayLabel.classList.remove("arrive");
    return;
  }
  delayLabel.classList.remove("arrive");
  void delayLabel.offsetWidth;
  delayLabel.classList.add("arrive");
}

function coverOf(id: string) {
  if (id === "final-fight-3" || id === "pocky-rocky-2" || id === "mighty-morphin-power-rangers-the-movie" || id === "king-of-dragons") return `/covers/${id}.jpg`;
  return `/covers/${id}.svg`;
}

let gamesIntro = true;

function clipTitles() {
  for (const title of pick.querySelectorAll<HTMLElement>(".game strong")) {
    title.classList.toggle("clipped", title.scrollHeight > title.clientHeight + 1);
  }
}

new ResizeObserver(() => clipTitles()).observe(pick);
void document.fonts.ready.then(() => clipTitles());

function renderGames() {
  if (pick.childElementCount === games.length) {
    const buttons = pick.querySelectorAll<HTMLButtonElement>(".game");
    games.forEach((game, index) => {
      const button = buttons[index];
      if (!button) return;
      button.classList.toggle("selected", game.id === selected.id);
      const meta = button.querySelector("small");
      if (meta) meta.textContent = `${game.region} · ${ready.has(game.id) ? "ROM neste navegador" : "ROM ainda não gravada"}`;
    });
    clipTitles();
    return;
  }
  const intro = gamesIntro;
  gamesIntro = false;
  pick.replaceChildren();
  games.forEach((game, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game${game.id === selected.id ? " selected" : ""}`;
    if (intro) {
      button.classList.add("arrive");
      button.style.animationDelay = `${index * 50}ms`;
    }
    button.title = game.title;
    const image = document.createElement("img");
    image.src = coverOf(game.id);
    image.alt = "";
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = game.title;
    title.title = game.title;
    const meta = document.createElement("small");
    meta.textContent = `${game.region} · ${ready.has(game.id) ? "ROM neste navegador" : "ROM ainda não gravada"}`;
    text.append(title, meta);
    button.append(image, text);
    button.addEventListener("click", () => {
      selected = game;
      updateDrop();
      renderGames();
      button.scrollIntoView({ inline: "center", block: "nearest" });
      void openStored(game);
    });
    pick.append(button);
  });
  clipTitles();
}

function updateDrop() {
  if (dropText) dropText.textContent = `Solte a ROM de ${selected.title} aqui`;
}

function replaceScreen() {
  const next = document.createElement("canvas");
  next.id = "screen";
  next.width = 256;
  next.height = 224;
  next.hidden = screen.hidden;
  next.className = screen.className;
  screen.replaceWith(next);
  screen = next;
  transferred = false;
  applyZoom();
}

function stopPlay() {
  window.clearTimeout(resetTimer);
  relaunching = false;
  romBytes = null;
  worker?.terminate();
  worker = null;
  sab = null;
  pads = null;
  loadedGame = null;
  conceal(picture, "down");
  reveal(drop, "down");
  hideBubble(0);
  hideBubble(1);
  if (transferred) replaceScreen();
  renderSaves();
}

async function openStored(game: Game) {
  if (loadedGame?.id === game.id) return;
  const record = await loadRom(game.id);
  if (!record) {
    stopPlay();
    roomState.textContent = `${game.title}. Solte a ROM uma vez. Ela fica neste navegador.`;
    return;
  }
  const matched = await matchRom(record.bytes);
  if (!matched || matched.game.id !== game.id) {
    await forgetRom(game.id);
    ready.delete(game.id);
    renderGames();
    setBanner("A ROM gravada não confere mais. Solta o arquivo de novo.");
    return;
  }
  await boot(matched.game, matched.rom);
}

async function openFile(file: File) {
  if (!crossOriginIsolated) {
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
    return;
  }
  setBanner("Conferindo o arquivo…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const matched = await matchRom(bytes);
  if (!matched || matched.game.id !== selected.id) {
    setBanner(matched
      ? `Esse arquivo é ${matched.game.title}. Escolhe esse jogo na lista, ou solta a ROM de ${selected.title}.`
      : "Esse arquivo não é a versão USA esperada. Nada foi enviado.");
    return;
  }
  try {
    await saveRom(matched.game.id, matched.game.sha1, matched.rom);
    ready.add(matched.game.id);
    renderGames();
  } catch {
    setBanner("A ROM abriu, mas não ficou gravada neste navegador.");
  }
  await boot(matched.game, matched.rom);
}

async function boot(game: Game, rom: Uint8Array) {
  if (!crossOriginIsolated) {
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
    return;
  }
  if (loadedGame?.id === game.id && worker) {
    roomState.textContent = `${game.title} nesta máquina. Os dois teclados jogam aqui.`;
    return;
  }
  try { await speaker.resume(); } catch { /* o áudio espera um clique */ }
  stopPlay();
  romBytes = rom.slice();
  startWorker(romBytes);
  loadedGame = game;
  selected = game;
  screen.hidden = false;
  conceal(drop, "down");
  reveal(picture, "down");
  setBanner("");
  roomState.textContent = `${game.title} nesta máquina. Os dois teclados jogam aqui.`;
  renderGames();
  await renderSaves();
}

function startWorker(rom: Uint8Array, net: ResetNet = null) {
  sab = new SharedArrayBuffer(4);
  pads = new Uint16Array(sab);
  const canvas = screen.transferControlToOffscreen();
  transferred = true;
  worker?.terminate();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event) => onWorker(event.data);
  const copy = rom.slice();
  worker.postMessage(
    net ? { t: "load", rom: copy.buffer, canvas, sab, net } : { t: "load", rom: copy.buffer, canvas, sab },
    [copy.buffer, canvas],
  );
}

function kickReset(net: ResetNet) {
  window.clearTimeout(resetTimer);
  resetNet = net;
  if (!romBytes || !loadedGame) {
    setBanner("Solte a ROM antes de reiniciar.");
    return;
  }
  if (!worker || relaunching) {
    relaunch(net);
    return;
  }
  worker.postMessage(net ? { t: "reset", slot: net.slot, delay: net.delay } : { t: "reset" });
  resetTimer = window.setTimeout(() => relaunch(net), 700);
  setBanner(net ? "Jogo reiniciado nos dois." : "Jogo reiniciado.");
}

function relaunch(net: ResetNet) {
  if (!romBytes || !loadedGame) return;
  window.clearTimeout(resetTimer);
  resetNet = net;
  relaunching = true;
  const rom = romBytes;
  const game = loadedGame;
  worker?.terminate();
  worker = null;
  if (transferred) replaceScreen();
  startWorker(rom, net);
  loadedGame = game;
  setBanner(net ? "Jogo reiniciado nos dois." : "Jogo reiniciado.");
}

function onWorker(message: {
  t: string;
  rate?: number;
  samples?: Int16Array;
  w?: number;
  h?: number;
  frames?: { frame: number; buttons: number }[];
  frame?: number;
  hash?: number;
  state?: ArrayBuffer;
  shot?: ArrayBuffer;
  message?: string;
  spots?: { x: number; y: number }[];
}) {
  if (message.t === "loaded" && message.rate) {
    speaker.setRate(message.rate);
    relaunching = false;
    window.clearTimeout(resetTimer);
  }
  if (message.t === "reset-done") {
    relaunching = false;
    window.clearTimeout(resetTimer);
  }
  if (message.t === "audio" && message.samples && message.rate) {
    speaker.setRate(message.rate);
    speaker.push(message.samples);
  }
  if (message.t === "aspect" && message.w && message.h) {
    screen.style.aspectRatio = `${message.w} / ${message.h}`;
    picture.style.setProperty("--ratio", `${message.w} / ${message.h}`);
  }
  if (message.t === "local-input" && message.frames) session?.noteInputs(message.frames);
  if (message.t === "check" && message.frame !== undefined && message.hash !== undefined) {
    localChecks.set(message.frame, message.hash);
    session?.sendCheck(message.frame, message.hash);
    compare(message.frame);
  }
  if (message.t === "checkpoint" && message.state && message.frame !== undefined) {
    checkpointWait?.({ frame: message.frame, state: new Uint8Array(message.state), delay: 0 });
    checkpointWait = null;
  }
  if (message.t === "saved" && message.state) {
    saveWait?.({ state: new Uint8Array(message.state), shot: message.shot ? new Uint8Array(message.shot) : null });
    saveWait = null;
  }
  if (message.t === "restored") setBanner("Save carregado.");
  if (message.t === "places" && message.spots) placeBubbles(message.spots);
  if (message.t === "error") {
    if (message.message === "Não deu para reiniciar o jogo." && !relaunching) relaunch(resetNet);
    else setBanner(message.message ?? "Falha no núcleo.");
  }
}

function compare(frame: number) {
  if (!localChecks.has(frame) || !remoteChecks.has(frame)) return;
  if (localChecks.get(frame) !== remoteChecks.get(frame)) {
    worker?.postMessage({ t: "stop" });
    session?.close();
    setBanner("A partida dessincronizou e foi encerrada. Cria a sala de novo.");
  }
}

function askCheckpoint() {
  return new Promise<{ frame: number; state: Uint8Array; delay: number }>((resolve) => {
    checkpointWait = resolve;
    worker?.postMessage({ t: "checkpoint" });
    window.setTimeout(() => {
      if (checkpointWait === resolve) {
        checkpointWait = null;
        resolve({ frame: 0, state: new Uint8Array(), delay: 0 });
      }
    }, 1500);
  });
}

function askSave() {
  return new Promise<{ state: Uint8Array; shot: Uint8Array | null }>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (saveWait) {
        saveWait = null;
        reject(new Error("O save demorou."));
      }
    }, 2000);
    saveWait = (saved) => {
      window.clearTimeout(timer);
      resolve(saved);
    };
    worker?.postMessage({ t: "save" });
  });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function clearChat() {
  log.replaceChildren();
}

const anchor: [{ x: number; y: number }, { x: number; y: number }] = [
  { x: 0.32, y: 0.52 },
  { x: 0.68, y: 0.52 },
];
const bubbleMode: ("off" | "text" | "typing")[] = ["off", "off"];
const bubbleTimer = [0, 0];
const fighters: Fighter[] = ["haggar", "haggar"];
const facing: [number, number] = [RIGHT, RIGHT];
const superDown = [false, false];
let typingIdle = 0;
let typingSent = false;
type SaveDialog =
  | { kind: "offer"; state: Uint8Array; label: string }
  | { kind: "wait"; id: number; state: Uint8Array }
  | { kind: "incoming"; id: number; state: Uint8Array };
let saveDialog: SaveDialog | null = null;

function mix(from: { x: number; y: number }, to: { x: number; y: number }) {
  return { x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35 };
}

function placeBubbles(peaks: { x: number; y: number }[]) {
  const separated = peaks.filter((peak, index) => peaks.findIndex((other) => Math.abs(other.x - peak.x) < 0.12) === index);
  if (separated.length >= 2) {
    const ordered = [...separated].sort((a, b) => a.x - b.x).slice(0, 2);
    const direct = Math.hypot(ordered[0].x - anchor[0].x, ordered[0].y - anchor[0].y) + Math.hypot(ordered[1].x - anchor[1].x, ordered[1].y - anchor[1].y);
    const swapped = Math.hypot(ordered[1].x - anchor[0].x, ordered[1].y - anchor[0].y) + Math.hypot(ordered[0].x - anchor[1].x, ordered[0].y - anchor[1].y);
    const next = swapped + 0.08 < direct ? [ordered[1], ordered[0]] : ordered;
    anchor[0] = mix(anchor[0], next[0]);
    anchor[1] = mix(anchor[1], next[1]);
  } else if (separated.length === 1) {
    const slot = Math.abs(separated[0].x - anchor[0].x) <= Math.abs(separated[0].x - anchor[1].x) ? 0 : 1;
    anchor[slot] = mix(anchor[slot], separated[0]);
  }
  for (const slot of [0, 1] as const) {
    bubbles[slot].style.left = `${anchor[slot].x * 100}%`;
    bubbles[slot].style.top = `${anchor[slot].y * 100}%`;
  }
}

function hideBubble(slot: 0 | 1) {
  window.clearTimeout(bubbleTimer[slot]);
  bubbleMode[slot] = "off";
  const bubble = bubbles[slot];
  conceal(bubble, "up");
  const token = bubble.dataset.step;
  window.setTimeout(() => {
    if (bubble.dataset.step === token && bubble.hidden) bubble.replaceChildren();
  }, 34 * 4 + 50);
}

function showBubble(slot: 0 | 1, mode: "text" | "typing", text = "") {
  const bubble = bubbles[slot];
  window.clearTimeout(bubbleTimer[slot]);
  bubbleMode[slot] = mode;
  reveal(bubble, "up");
  bubble.replaceChildren();
  if (mode === "typing") {
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.setAttribute("aria-label", "digitando");
    for (let i = 0; i < 3; i++) dots.append(document.createElement("i"));
    bubble.append(dots);
    return;
  }
  bubble.textContent = text;
  bubbleTimer[slot] = window.setTimeout(() => hideBubble(slot), 4500);
}

function setTyping(slot: 0 | 1, on: boolean) {
  if (on) {
    showBubble(slot, "typing");
    return;
  }
  if (bubbleMode[slot] === "typing") hideBubble(slot);
}

function mySlot(): 0 | 1 {
  return session?.role === "guest" ? 1 : 0;
}

function localTyping(on: boolean) {
  if (!session) return;
  setTyping(mySlot(), on);
  if (typingSent === on) return;
  typingSent = on;
  session.sendTyping(on);
}

function pushChat(line: ChatLine) {
  const row = document.createElement("p");
  row.className = "chat-line";
  const who = document.createElement("b");
  const name = line.name?.trim();
  who.textContent = name || (line.from === "host" ? "Anfitrião" : "Convidado");
  row.classList.add("arrive");
  row.append(who, document.createTextNode(` ${line.text}`));
  log.append(row);
  log.scrollTop = log.scrollHeight;
}

function setChatEnabled(on: boolean) {
  shown(chatPanel, on, "down");
  chatInput.disabled = !on;
  chatButton.disabled = !on;
  chatInput.placeholder = on ? "Escreve para a sala" : "A conversa abre na sala";
}

function setRoomCode(code: string | null) {
  shown(roomCode, !!code, "up");
  shown(roomTitle, !code, "up");
  roomCode.textContent = code ?? "";
}

let shownPads = "";

function padKey(): string {
  const [first, second] = connectedPads();
  const who = session ? `sala:${mySlot()}` : "local";
  return `${who}:${selected.id}:${first?.id ?? ""}:${second?.id ?? ""}`;
}

function fillManual() {
  shownPads = padKey();
  const pads = connectedPads();
  const online = !!session;
  const mine = mySlot();
  const players = online
    ? [{ slot: mine, pad: pads[0], keys: 0 as const }]
    : ([0, 1] as const).map((index) => ({ slot: index, pad: pads[index], keys: keyboardScheme(index, pads) }));
  const note = [selected.title + "."];
  if (online) note.push("Na sala, este manual mostra só o controle desta máquina.");
  if (selected.id === "final-fight-3") {
    note.push("Select junto com o Super troca Haggar e Guy, Lucia ou Dean. Haggar, Guy e Dean precisam estar segurando o inimigo.");
  }
  if (selected.id === "king-of-dragons") {
    note.push("A magia do X gasta vida. O escudo no A só entra se for ligado no Option Mode.");
  }
  paintManual({
    root: manualBody,
    tabs: manualTabs,
    card: manualCard,
    gameId: selected.id,
    note: note.join(" "),
    players: players.map((player) => ({
      slot: player.slot + 1,
      device: player.pad ? padLabel(player.pad) : "Teclado",
      guide: player.pad ? controlGuide(player.pad) : null,
      keys: KEYBOARD_GUIDE[player.keys ?? 0],
      superKey: online ? "F" : player.keys === 0 ? "F" : player.keys === 1 ? ";" : null,
    })),
  });
}

function openManual() {
  fillManual();
  reveal(manual, "modal");
  document.querySelector<HTMLButtonElement>("#manual-close")?.focus();
}

function closeManual() {
  conceal(manual, "modal");
}

function playerLine(name: string, control: string, state: string, index: number, animate: boolean) {
  const item = document.createElement("li");
  if (animate) {
    item.classList.add("arrive");
    item.style.animationDelay = `${index * 40}ms`;
  }
  const kind = kindFromLabel(control);
  if (kind) item.append(padIcon(kind));
  const text = document.createElement("span");
  const who = document.createElement("b");
  who.textContent = name;
  const meta = document.createElement("small");
  meta.textContent = `${control} · ${state}`;
  text.append(who, meta);
  item.append(text);
  people.append(item);
}

let peoplePaints = 0;

function renderPeople() {
  const [first, second] = padStatus();
  const key = session && roster
    ? `sala:${session.role}:${roster.host.here}:${roster.host.control}:${roster.host.name}:${roster.guest.here}:${roster.guest.control}:${roster.guest.name}`
    : `local:${roomName()}:${first ?? ""}:${second ?? ""}`;
  if (key === peopleKey) return;
  peopleKey = key;
  const animate = peoplePaints >= 2;
  peoplePaints += 1;
  people.replaceChildren();
  if (!session || !roster) {
    playerLine(roomName() || "Jogador 1", first ?? "Teclado", "nesta máquina", 0, animate);
    playerLine("Jogador 2", second ?? "Teclado", "nesta máquina", 1, animate);
    return;
  }
  const you = session.role;
  playerLine(roster.host.name || "Anfitrião", roster.host.control, you === "host" ? "você" : roster.host.here ? "na sala" : "saiu", 0, animate);
  playerLine(
    roster.guest.name || "Convidado",
    roster.guest.here ? roster.guest.control : "—",
    you === "guest" ? "você" : roster.guest.here ? "na sala" : "aguardando",
    1,
    animate,
  );
}

function when(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const shotUrls: string[] = [];

function plusIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 5v14M5 12h14");
  svg.append(path);
  return svg;
}

function closeSaves(immediate = false) {
  if (immediate) {
    savesModal.hidden = true;
    return;
  }
  conceal(savesModal, "modal");
}

function paintSlots(game: Game, slots: Awaited<ReturnType<typeof saveList>>) {
  for (const url of shotUrls) URL.revokeObjectURL(url);
  shotUrls.length = 0;
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]));
  savesGrid.replaceChildren();
  for (const slot of saveSlots) {
    const record = bySlot.get(slot);
    if (!record) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "slot-empty";
      const caption = document.createElement("span");
      caption.textContent = "Adicionar slot";
      empty.append(plusIcon(), caption);
      empty.addEventListener("click", () => void writeSlot(game, slot));
      savesGrid.append(empty);
      continue;
    }
    const card = document.createElement("article");
    card.className = "slot-card";
    const shot = document.createElement("button");
    shot.type = "button";
    shot.className = "slot-shot";
    shot.setAttribute("aria-label", `Carregar o save ${slot}`);
    if (record.shot) {
      const image = document.createElement("img");
      const url = URL.createObjectURL(new Blob([record.shot.slice()], { type: "image/png" }));
      shotUrls.push(url);
      image.src = url;
      image.alt = "";
      shot.append(image);
    } else {
      const blank = document.createElement("span");
      blank.className = "slot-blank";
      blank.textContent = "Sem print";
      shot.append(blank);
    }
    shot.addEventListener("click", () => void readSlot(game, slot, record.savedAt));
    const meta = document.createElement("div");
    meta.className = "slot-meta";
    const dot = document.createElement("i");
    const online = record.origin === "online";
    dot.className = online ? "dot online" : "dot";
    dot.setAttribute("aria-hidden", "true");
    const place = document.createElement("span");
    place.textContent = online ? "Sala" : "Local";
    const time = document.createElement("span");
    time.textContent = when(record.savedAt);
    const again = document.createElement("button");
    again.type = "button";
    again.className = "slot-again";
    again.textContent = "Gravar";
    again.addEventListener("click", () => void writeSlot(game, slot));
    meta.append(dot, place, time, again);
    card.append(shot, meta);
    savesGrid.append(card);
  }
}

async function renderSaves() {
  if (!loadedGame) {
    if (!savesModal.hidden) closeSaves(true);
    return;
  }
  if (savesModal.hidden) return;
  paintSlots(loadedGame, await saveList(loadedGame.id));
}

async function slotsFor(game: Game) {
  if (!account || !cloudSaves) return saveList(game.id);
  try {
    return await syncSaves(game);
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "A nuvem não respondeu.");
    return saveList(game.id);
  }
}

async function pushSlot(game: Game, slot: number, record: { origin: "local" | "online"; shot: Uint8Array | null }) {
  const state = await loadState(game.id, slot);
  if (!state) return;
  const savedAt = await uploadSave(game.id, slot, game.sha1, state, record.shot);
  await saveState(game.id, slot, state, record.shot, record.origin, savedAt);
}

async function syncSaves(game: Game) {
  const remote = await listCloud(game.id);
  const local = await saveList(game.id);
  const localBy = new Map(local.map((slot) => [slot.slot, slot]));
  const remoteBy = new Map(remote.map((slot) => [slot.slot, slot]));
  for (const slot of saveSlots) {
    const here = localBy.get(slot);
    const there = remoteBy.get(slot);
    if (there && there.sha1 !== game.sha1) {
      if (here && here.savedAt > there.savedAt) await pushSlot(game, slot, here);
      continue;
    }
    if (there && (!here || there.savedAt > here.savedAt)) {
      const state = await downloadSave(game.id, slot);
      const shot = await downloadShot(game.id, slot);
      await saveState(game.id, slot, state, shot ?? here?.shot ?? null, here?.origin ?? "local", there.savedAt);
    } else if (here && (!there || here.savedAt > there.savedAt)) {
      await pushSlot(game, slot, here);
    }
  }
  return saveList(game.id);
}

async function openSaves() {
  if (!loadedGame || !worker) {
    setBanner("Solte a ROM antes de abrir os saves.");
    return;
  }
  paintSlots(loadedGame, await slotsFor(loadedGame));
  reveal(savesModal, "modal");
  document.querySelector<HTMLButtonElement>("#saves-close")?.focus();
}

async function writeSlot(game: Game, slot: number) {
  if (!worker || loadedGame?.id !== game.id) return;
  try {
    const saved = await askSave();
    const origin = session ? "online" : "local";
    await saveState(game.id, slot, saved.state, saved.shot, origin);
    let cloud = false;
    if (account && cloudSaves) {
      try {
        const savedAt = await uploadSave(game.id, slot, game.sha1, saved.state, saved.shot);
        await saveState(game.id, slot, saved.state, saved.shot, origin, savedAt);
        cloud = true;
      } catch (error) {
        if (error instanceof AccountError && error.status === 401) {
          account = null;
          paintAccount();
        }
      }
    }
    const shotNote = saved.shot ? "com o print da tela" : "sem o print da tela";
    if (cloud) setBanner(`Save ${slot} gravado na conta, ${shotNote}.`);
    else if (account && cloudSaves) setBanner(`Save ${slot} gravado neste navegador. A nuvem não respondeu.`);
    else setBanner(`Save ${slot} gravado, ${shotNote}.`);
    await renderSaves();
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Não deu para gravar o save.");
  }
}

function showConfirm(text: string, mode: "both" | "cancel") {
  confirmText.textContent = text;
  confirmYes.hidden = mode === "cancel";
  reveal(confirmBox, "modal");
}

function hideConfirm() {
  conceal(confirmBox, "modal");
  saveDialog = null;
}

async function readSlot(game: Game, slot: number, savedAt: number) {
  if (!worker || loadedGame?.id !== game.id) return;
  closeSaves(true);
  const state = await loadState(game.id, slot);
  if (!state) return;
  if (!session) {
    const copy = state.slice();
    worker.postMessage({ t: "restore", state: copy.buffer }, [copy.buffer]);
    return;
  }
  if (!session.linked()) {
    setBanner("O outro jogador ainda não entrou na partida.");
    return;
  }
  if (saveDialog) return;
  saveDialog = { kind: "offer", state, label: when(savedAt) };
  showConfirm(`Carregar o save de ${when(savedAt)} nos dois?`, "both");
}

async function connect(role: Role, code: string) {
  if (!account) {
    nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
    nickInput.value = nick;
    void setPlayerName(nick);
  }
  await booting;
  if (!loadedGame || loadedGame.id !== selected.id) {
    if (!session) roomState.textContent = "Partida local. A sala leva o outro controle para outra casa.";
    setBanner("Solte a ROM, ou escolha um jogo que já esteja neste navegador.");
    return;
  }
  const previous = session;
  session = null;
  previous?.close();
  localChecks.clear();
  remoteChecks.clear();
  roster = null;
  worker?.postMessage({ t: "net-arm" });
  clearChat();
  const mine = new OnlineSession({
    code,
    role,
    gameId: selected.id,
    sha1: selected.sha1,
    onStatus: (text) => {
      roomState.textContent = text;
    },
    onStart: (slot, delay) => {
      setDelay(`Atraso de input: ${delay} frames.`);
      worker?.postMessage({ t: "net-start", slot, delay });
    },
    onRemote: (frames) => worker?.postMessage({ t: "net-remote", frames }),
    onPause: () => worker?.postMessage({ t: "pause" }),
    onResume: (snapshot) => {
      for (const frame of [...localChecks.keys()]) {
        if (frame >= snapshot.frame) localChecks.delete(frame);
      }
      for (const frame of [...remoteChecks.keys()]) {
        if (frame >= snapshot.frame) remoteChecks.delete(frame);
      }
      setDelay(`Atraso de input: ${snapshot.delay} frames.`);
      const state = snapshot.state.slice();
      const slot = mine.role === "host" ? 0 : 1;
      worker?.postMessage(
        { t: "net-resume", slot, delay: snapshot.delay, frame: snapshot.frame, state: state.buffer },
        [state.buffer],
      );
      roomState.textContent = "No ar. Os dois estão no mesmo ponto.";
    },
    onCheck: (frame, hash) => {
      remoteChecks.set(frame, hash);
      compare(frame);
    },
    onReset: (net) => {
      if (alertMode?.startsWith("reset")) closeAlert();
      localChecks.clear();
      remoteChecks.clear();
      kickReset(net);
    },
    onResetAsk: (name) => {
      if (session !== mine || alertMode === "forget" || saveDialog) {
        mine.answerReset(false);
        return;
      }
      openAlert("reset-in", name);
    },
    onResetAnswer: (yes) => {
      if (session !== mine || yes) return;
      if (alertMode === "reset-wait" || alertMode === "reset-in") {
        closeAlert();
        setBanner("O outro jogador cancelou o reinício.");
      }
    },
    onClose: (reason) => {
      if (session !== mine) return;
      session = null;
      roster = null;
      setChatEnabled(false);
      setRoomCode(null);
      shown(leaveButton, false, "left");
      typingSent = false;
      hideConfirm();
      if (alertMode?.startsWith("reset")) closeAlert();
      hideBubble(0);
      hideBubble(1);
      renderPeople();
      worker?.postMessage({ t: "local" });
      dropHostedRoom();
      setBanner(reason);
    },
    onChat: (line) => {
      pushChat(line);
      showBubble(line.from === "host" ? 0 : 1, "text", line.text);
      if (line.from === mine.role) typingSent = false;
    },
    onTyping: (from, on) => setTyping(from === "host" ? 0 : 1, on),
    onChatLog: (lines) => {
      clearChat();
      for (const line of lines) pushChat(line);
    },
    onRoster: (next) => {
      roster = next;
      renderPeople();
    },
    onSaveOffer: (offer) => {
      if (session !== mine || saveDialog) {
        mine.answerSave(offer.id, false);
        return;
      }
      saveDialog = { kind: "incoming", id: offer.id, state: offer.state };
      showConfirm(`${offer.name} quer carregar o save de ${offer.label} nos dois.`, "both");
    },
    onSaveAnswer: (id, yes) => {
      if (session !== mine || !saveDialog || saveDialog.kind === "offer" || saveDialog.id !== id) return;
      if (saveDialog.kind === "incoming") {
        if (yes) return;
        hideConfirm();
        setBanner("O outro jogador cancelou o save.");
        return;
      }
      if (saveDialog.kind !== "wait") return;
      const state = saveDialog.state;
      hideConfirm();
      if (!yes) {
        setBanner("O outro jogador recusou o save.");
        return;
      }
      mine.acceptSave(state);
      setBanner("Save carregado nos dois.");
    },
    checkpoint: askCheckpoint,
  });
  session = mine;
  setRoomCode(code);
  shown(leaveButton, true, "left");
  const name = roomName();
  mine.setProfile(localControl(), name);
  setChatEnabled(true);
  sentProfile = `${localControl()}\n${name}`;
  const previousRoom = hostedCode;
  try {
    await session.open();
  } catch (error) {
    if (session === mine) session = null;
    shown(leaveButton, false, "left");
    setChatEnabled(false);
    setRoomCode(null);
    if (account && previousRoom) void queueRoom(null);
    setBanner(error instanceof Error ? error.message : "Não foi possível abrir a sala.");
    return;
  }
  if (!account) return;
  try {
    await queueRoom(role === "host" ? code : null);
  } catch {
    setBanner("A sala abriu, mas os amigos não viram o código.");
  }
}

const VOLUME_KEY = "snes-couch-volume";
const MUTE_KEY = "snes-couch-muted";

function readVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY);
  const value = raw === null ? 100 : Number(raw);
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

let volume = readVolume();
let muted = localStorage.getItem(MUTE_KEY) === "1" || volume === 0;
if (volume === 0) volume = 50;

function paintVolume() {
  const audible = muted ? 0 : volume;
  speaker.setVolume(audible / 100);
  volSlider.value = String(volume);
  volReadout.textContent = muted || volume === 0 ? "Mudo" : `${volume}%`;
  volButton.dataset.level = muted || volume === 0 ? "mute" : volume < 40 ? "low" : "high";
  volButton.setAttribute("aria-pressed", muted || volume === 0 ? "true" : "false");
  volButton.setAttribute("aria-label", muted || volume === 0 ? "Ativar som" : "Silenciar");
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTE_KEY, muted || volume === 0 ? "1" : "0");
  } catch { /* o nível vale só nesta visita */ }
}

function toggleMute() {
  muted = !(muted || volume === 0);
  if (!muted && volume === 0) volume = 50;
  paintVolume();
}

function applyZoom() {
  screen.classList.remove("fit", "z2", "z3", "z4");
  screen.classList.add(zoom === "fit" ? "fit" : `z${zoom}`);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
    button.classList.toggle("on", button.dataset.zoom === zoom);
  }
}

function localControl(): string {
  const [first] = padStatus();
  return first ?? "Teclado";
}

function roomName(): string {
  if (!account) return nick;
  return account.name.replace(/\s+/g, " ").trim().slice(0, 20);
}

function publishProfile() {
  if (!account) nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
  const name = roomName();
  if (account) nickInput.value = name;
  if (!session) return;
  const control = localControl();
  const next = `${control}\n${name}`;
  if (next === sentProfile) return;
  sentProfile = next;
  session.setProfile(control, name);
}

function dropHostedRoom() {
  if (!hostedCode || !account) {
    hostedCode = null;
    return;
  }
  void queueRoom(null);
}

function joinCode(raw: string) {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
    setBanner("O código tem 5 letras, sem I, O, 0 ou 1.");
    return;
  }
  codeInput.value = code;
  void connect("guest", code);
}

function paintAccount() {
  const logged = Boolean(account);
  accountOut.hidden = logged;
  accountIn.hidden = !logged;
  friendsSection.hidden = !logged;
  savesCloud.hidden = !logged || !cloudSaves;
  nickInput.disabled = logged;
  if (account) {
    accountName.textContent = account.name;
    accountCode.textContent = account.friendCode;
    nickInput.value = roomName();
    if (account.hasAvatar) {
      accountAvatar.hidden = false;
      accountAvatar.src = `/api/me/avatar?v=${encodeURIComponent(account.id)}`;
    } else {
      accountAvatar.hidden = true;
      accountAvatar.removeAttribute("src");
    }
  } else {
    nickInput.value = nick;
    friendList.replaceChildren();
  }
  peopleKey = "";
  renderPeople();
  if (session) publishProfile();
}

async function refreshAccount() {
  try {
    account = await fetchAccount();
  } catch {
    account = null;
  }
  paintAccount();
  const params = new URLSearchParams(location.search);
  if (params.get("login") === "falhou") {
    setBanner("Não deu para entrar. Tente de novo.");
    params.delete("login");
    const next = params.toString();
    history.replaceState(null, "", next ? `${location.pathname}?${next}` : location.pathname);
  }
}

function friendCard(friend: FriendCard, pending: "in" | "out" | null) {
  const card = document.createElement("article");
  card.className = "friend-card";
  const who = document.createElement("div");
  who.className = "friend-who";
  if (friend.hasAvatar) {
    const photo = document.createElement("img");
    photo.src = `/api/avatars/${friend.id}`;
    photo.alt = "";
    photo.width = 36;
    photo.height = 36;
    who.append(photo);
  }
  const text = document.createElement("span");
  const name = document.createElement("b");
  name.textContent = friend.name;
  const meta = document.createElement("small");
  meta.textContent = pending === "in" ? "quer ser seu amigo" : pending === "out" ? "pedido enviado" : friend.friendCode;
  text.append(name, meta);
  who.append(text);
  const actions = document.createElement("div");
  actions.className = "friend-actions";
  if (pending === "in") {
    const yes = document.createElement("button");
    yes.type = "button";
    yes.textContent = "Aceitar";
    yes.addEventListener("click", () => void changeFriend(() => acceptFriend(friend.id), "Pedido aceito."));
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "Recusar";
    no.addEventListener("click", () => void changeFriend(() => declineFriend(friend.id), "Pedido recusado."));
    actions.append(yes, no);
  } else if (pending === "out") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => void changeFriend(() => removeFriend(friend.id), "Pedido cancelado."));
    actions.append(cancel);
  } else {
    if (friend.roomCode) {
      const join = document.createElement("button");
      join.type = "button";
      join.textContent = `Sala ${friend.roomCode}`;
      join.addEventListener("click", () => joinCode(friend.roomCode!));
      actions.append(join);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remover";
    remove.addEventListener("click", () => void changeFriend(() => removeFriend(friend.id), `${friend.name} saiu da lista.`));
    actions.append(remove);
  }
  card.append(who, actions);
  return card;
}

async function changeFriend(action: () => Promise<void>, done: string) {
  try {
    await action();
    setBanner(done);
    await paintFriends();
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para atualizar os amigos.");
  }
}

async function paintFriends() {
  if (!account) {
    friendList.replaceChildren();
    return;
  }
  let lists;
  try {
    lists = await loadFriends();
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    return;
  }
  friendList.replaceChildren();
  const blocks = [
    ...lists.incoming.map((friend) => ({ friend, pending: "in" as const })),
    ...lists.outgoing.map((friend) => ({ friend, pending: "out" as const })),
    ...lists.friends.map((friend) => ({ friend, pending: null })),
  ];
  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nenhum amigo ainda. Manda o seu código.";
    friendList.append(empty);
    return;
  }
  for (const block of blocks) friendList.append(friendCard(block.friend, block.pending));
}

accountCode.addEventListener("click", () => {
  const code = account?.friendCode;
  if (!code) return;
  const done = () => setBanner("Código de amigo copiado.");
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(code).then(done, done);
  else done();
});

logoutButton.addEventListener("click", () => {
  void (async () => {
    try {
      await logoutAccount();
    } catch {
      /* o cookie pode já ter saído */
    }
    account = null;
    hostedCode = null;
    paintAccount();
    setBanner("Você saiu da conta. O nome da sala volta a ser o deste navegador.");
  })();
});

friendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = friendCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  friendCodeInput.value = code;
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    setBanner("O código de amigo tem 6 letras, sem I, O, 0 ou 1.");
    return;
  }
  void (async () => {
    try {
      const status = await askFriend(code);
      friendCodeInput.value = "";
      setBanner(status === "accepted" ? "Pedido aceito." : "Pedido enviado.");
      await paintFriends();
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) {
        account = null;
        paintAccount();
      }
      setBanner(error instanceof Error ? error.message : "Não deu para pedir amizade.");
    }
  })();
});

window.addEventListener("focus", () => {
  if (account) void paintFriends();
});

drop.addEventListener("dragover", (event) => event.preventDefault());
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) void openFile(file);
});

nickInput.addEventListener("input", () => {
  publishProfile();
  renderPeople();
});
nickInput.addEventListener("blur", () => {
  nickInput.value = nick;
  void setPlayerName(nick);
});

document.querySelector("#create")!.addEventListener("click", () => {
  const code = makeCode();
  codeInput.value = code;
  roomState.textContent = `Sala ${code}. Conectando…`;
  void connect("host", code);
});

copyButton.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (!code) {
    setBanner("Cria a sala, ou cola um código, antes de copiar.");
    return;
  }
  const done = () => {
    copyButton.setAttribute("aria-label", "Copiado");
    setBanner("Código copiado.");
    window.setTimeout(() => copyButton.setAttribute("aria-label", "Copiar"), 1200);
  };
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(code).then(done, () => {
      codeInput.select();
      document.execCommand("copy");
      done();
    });
    return;
  }
  codeInput.select();
  document.execCommand("copy");
  done();
});

document.querySelector("#join")!.addEventListener("click", () => joinCode(codeInput.value));

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value;
  chatInput.value = "";
  window.clearTimeout(typingIdle);
  localTyping(false);
  session?.sendChat(text);
});

chatInput.addEventListener("input", () => {
  if (!chatInput.value.trim()) {
    window.clearTimeout(typingIdle);
    localTyping(false);
    return;
  }
  localTyping(true);
  window.clearTimeout(typingIdle);
  typingIdle = window.setTimeout(() => localTyping(false), 800);
});

function leaveRoom() {
  const current = session;
  if (!current) return;
  session = null;
  current.close();
  roster = null;
  setChatEnabled(false);
  setRoomCode(null);
  shown(leaveButton, false, "left");
  typingSent = false;
  hideConfirm();
  clearChat();
  hideBubble(0);
  hideBubble(1);
  worker?.postMessage({ t: "local" });
  roomState.textContent = "Partida local. A sala leva o outro controle para outra casa.";
  setDelay("");
  dropHostedRoom();
  renderPeople();
  setBanner("Você saiu da sala.");
}

leaveButton.addEventListener("click", () => leaveRoom());

function roomDrawer(): boolean {
  return window.matchMedia("(max-width: 1080px)").matches;
}

function setRoom(open: boolean) {
  const visible = roomDrawer() && open;
  panel.classList.toggle("open", visible);
  panel.inert = roomDrawer() && !visible;
  roomBackdrop.hidden = !visible;
  roomOpen.setAttribute("aria-expanded", visible ? "true" : "false");
  if (visible) {
    roomClose.focus();
    if (account) void paintFriends();
  }
}

roomOpen.addEventListener("click", () => setRoom(true));
roomClose.addEventListener("click", () => {
  setRoom(false);
  roomOpen.focus();
});
roomBackdrop.addEventListener("click", () => {
  setRoom(false);
  roomOpen.focus();
});
window.addEventListener("resize", () => setRoom(panel.classList.contains("open")));
setRoom(false);

document.querySelector("#manual-open")!.addEventListener("click", () => openManual());
document.querySelector("#manual-close")!.addEventListener("click", () => closeManual());
manual.addEventListener("click", (event) => {
  if (event.target === manual) closeManual();
});
document.querySelector("#saves-open")!.addEventListener("click", () => void openSaves());
document.querySelector("#saves-close")!.addEventListener("click", () => closeSaves());
savesModal.addEventListener("click", (event) => {
  if (event.target === savesModal) closeSaves();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && !alertBox.hidden) dismissAlert();
  else if (event.code === "Escape" && !savesModal.hidden) closeSaves();
  else if (event.code === "Escape" && !manual.hidden) closeManual();
  else if (event.code === "Escape" && panel.classList.contains("open")) {
    event.preventDefault();
    setRoom(false);
    roomOpen.focus();
  }
});

confirmYes.addEventListener("click", () => {
  if (!saveDialog) return;
  if (saveDialog.kind === "offer") {
    if (!session?.linked()) {
      hideConfirm();
      setBanner("O outro jogador ainda não entrou na partida.");
      return;
    }
    const id = session.proposeSave(saveDialog.label, saveDialog.state);
    saveDialog = { kind: "wait", id, state: saveDialog.state };
    showConfirm("Esperando o outro jogador confirmar o save.", "cancel");
    return;
  }
  if (saveDialog.kind === "incoming") {
    const state = saveDialog.state;
    session?.answerSave(saveDialog.id, true);
    session?.acceptSave(state);
    hideConfirm();
    setBanner("Save carregado nos dois.");
  }
});

confirmNo.addEventListener("click", () => {
  if (saveDialog?.kind === "wait") session?.answerSave(saveDialog.id, false);
  if (saveDialog?.kind === "incoming") session?.answerSave(saveDialog.id, false);
  hideConfirm();
});

chatInput.addEventListener("keydown", (event) => {
  if (event.code !== "Enter" || event.repeat || event.shiftKey) return;
  event.preventDefault();
  chatForm.requestSubmit();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Enter" || event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || target.isContentEditable) return;
  }
  if (chatInput.disabled) return;
  event.preventDefault();
  chatInput.focus();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
  button.addEventListener("click", () => {
    const next = button.dataset.zoom;
    if (next === "fit" || next === "2" || next === "3" || next === "4") {
      zoom = next;
      applyZoom();
    }
  });
}

document.querySelector("#banner-close")!.addEventListener("click", () => setBanner(""));

document.querySelector("#reset")!.addEventListener("click", () => {
  if (!worker || !loadedGame) {
    setBanner("Solte a ROM antes de reiniciar.");
    return;
  }
  if (alertMode) return;
  openAlert(session?.linked() ? "reset-ask" : "reset-local");
});

volButton.addEventListener("click", () => toggleMute());
volSlider.addEventListener("input", () => {
  volume = Number(volSlider.value);
  muted = volume === 0;
  paintVolume();
});

function coarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function unlockOrientation() {
  try {
    window.screen.orientation?.unlock();
  } catch {
    /* already free, or the browser has no lock */
  }
}

async function enterFullscreen() {
  if (document.fullscreenElement) return;
  await stage.requestFullscreen();
  if (!coarsePointer()) return;
  const orientation = window.screen.orientation as ScreenOrientation & { lock?: (kind: "landscape") => Promise<void> };
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    /* iOS and desktop ignore the lock */
  }
}

async function leaveFullscreen() {
  unlockOrientation();
  if (document.fullscreenElement) await document.exitFullscreen();
}

document.querySelector("#fullscreen")!.addEventListener("click", () => {
  if (document.fullscreenElement) void leaveFullscreen();
  else void enterFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  stage.classList.toggle("play-full", document.fullscreenElement === stage && coarsePointer());
  if (!document.fullscreenElement) unlockOrientation();
});

startInstall(document.querySelector<HTMLButtonElement>("#install")!);
startTouch({
  stage,
  overlay: document.querySelector<HTMLElement>("#touch")!,
  setBits: setTouchBits,
  onExit: () => void leaveFullscreen(),
});

const alertBox = document.querySelector<HTMLElement>("#alert")!;
const alertText = document.querySelector<HTMLElement>("#alert-text")!;
const alertYes = document.querySelector<HTMLButtonElement>("#alert-yes")!;
const alertNo = document.querySelector<HTMLButtonElement>("#alert-no")!;

function openAlert(mode: AlertMode, name = "") {
  alertMode = mode;
  alertYes.hidden = mode === "reset-wait";
  if (mode === "forget") {
    alertText.textContent = `A ROM e os saves de ${selected.title} saem deste navegador. A partida para. Não tem como desfazer.`;
    alertYes.textContent = "Esquecer";
  } else if (mode === "reset-local") {
    alertText.textContent = "Reiniciar o jogo agora? Ele volta para o começo.";
    alertYes.textContent = "Reiniciar";
  } else if (mode === "reset-ask") {
    alertText.textContent = "Reiniciar nos dois? O outro jogador também precisa confirmar.";
    alertYes.textContent = "Reiniciar";
  } else if (mode === "reset-wait") {
    alertText.textContent = "Esperando o outro jogador confirmar o reinício.";
  } else {
    alertText.textContent = `${name} quer reiniciar o jogo. Confirme para os dois voltarem ao começo juntos.`;
    alertYes.textContent = "Confirmar";
  }
  if (alertBox.hidden) reveal(alertBox, "modal");
  (alertYes.hidden ? alertNo : alertYes).focus();
}

function closeAlert() {
  alertMode = null;
  alertYes.hidden = false;
  conceal(alertBox, "modal");
}

function dismissAlert() {
  const mode = alertMode;
  if (mode === "reset-wait") session?.cancelReset();
  if (mode === "reset-in") session?.answerReset(false);
  if (mode === "reset-wait" || mode === "reset-in") setBanner("Reinício cancelado.");
  closeAlert();
}

document.querySelector("#forget")!.addEventListener("click", () => {
  if (alertMode) return;
  if (!ready.has(selected.id)) {
    setBanner("Essa ROM não está neste navegador.");
    return;
  }
  openAlert("forget");
});

alertYes.addEventListener("click", () => {
  const mode = alertMode;
  if (mode === "forget") {
    closeAlert();
    void (async () => {
      const game = selected;
      await forgetRom(game.id);
      ready.delete(game.id);
      if (session && loadedGame?.id === game.id) leaveRoom();
      if (loadedGame?.id === game.id) stopPlay();
      renderGames();
      setBanner(`${game.title} saiu deste navegador.`);
    })();
    return;
  }
  if (mode === "reset-local") {
    closeAlert();
    kickReset(null);
    return;
  }
  if (mode === "reset-ask") {
    if (!session?.proposeReset()) {
      closeAlert();
      setBanner("O outro jogador ainda não entrou na partida.");
      return;
    }
    openAlert("reset-wait");
    return;
  }
  if (mode === "reset-in") {
    const host = session?.role === "host";
    session?.answerReset(true);
    if (host) closeAlert();
    else openAlert("reset-wait");
  }
});

alertNo.addEventListener("click", () => dismissAlert());
alertBox.addEventListener("click", (event) => {
  if (event.target === alertBox) dismissAlert();
});

window.addEventListener("pointerdown", () => {
  void speaker.resume();
});

function writePads(p0: number, p1: number) {
  if (!pads) return;
  pads[0] = p0;
  pads[1] = p1;
}

function pollSupers(padsNow: [number, number], mode: "local" | "online") {
  if (loadedGame?.id !== "final-fight-3" || !worker) return;
  const [first, second] = readSupers(mode);
  const pressed: [boolean, boolean] = session ? [first, false] : [first, second];
  for (const port of [0, 1] as const) {
    if (padsNow[port] & LEFT) facing[port] = LEFT;
    else if (padsNow[port] & RIGHT) facing[port] = RIGHT;
    if (pressed[port] && !superDown[port]) {
      if (padsNow[port] & SELECT) {
        const next = (FIGHTERS.indexOf(fighters[port]) + 1) % FIGHTERS.length;
        fighters[port] = FIGHTERS[next];
        setBanner(`Super do jogador ${port + 1}: ${fighterLabel(fighters[port])}.`);
      } else {
        const forward = padsNow[port] & LEFT ? LEFT : padsNow[port] & RIGHT ? RIGHT : facing[port];
        worker.postMessage({ t: "super", port, steps: superSteps(fighters[port], forward) });
      }
    }
    superDown[port] = pressed[port];
  }
}

window.addEventListener("blur", () => writePads(0, 0));

async function loadCoffee() {
  const link = document.querySelector<HTMLAnchorElement>("#coffee");
  if (!link) return;
  try {
    const response = await fetch("/api/coffee");
    if (!response.ok) return;
    const body = await response.json() as { url?: unknown };
    if (typeof body.url !== "string") return;
    const target = new URL(body.url);
    if (target.protocol !== "https:") return;
    link.href = target.href;
    link.hidden = false;
  } catch {
    // Sem a variável, o botão fica escondido.
  }
}

function pump() {
  const mode = session ? "online" : "local";
  const padsNow = readPads(mode);
  writePads(padsNow[0], padsNow[1]);
  pollSupers(padsNow, mode);
  if (session) publishProfile();
  renderPeople();
  if (!manual.hidden && padKey() !== shownPads) fillManual();
  requestAnimationFrame(pump);
}

if (!crossOriginIsolated) {
  setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
}

applyZoom();
void loadCoffee();
paintVolume();
updateDrop();
renderGames();
renderPeople();
requestAnimationFrame(pump);
startTour();

booting = (async () => {
  try {
    ready = new Set(await storedGames());
    nick = await playerName();
    nickInput.value = nick;
    await refreshAccount();
    if (account) {
      try {
        await queueRoom(null);
      } catch {
        /* a sala antiga deixa de aparecer na próxima visita */
      }
      void paintFriends();
    }
    peopleKey = "";
    renderPeople();
    const last = await lastGame();
    const game = games.find((entry) => entry.id === last) ?? games.find((entry) => ready.has(entry.id));
    if (game) {
      selected = game;
      updateDrop();
    }
    renderGames();
    if (game && ready.has(game.id)) await openStored(game);
  } catch {
    setBanner("Não deu para abrir o banco deste navegador. A ROM vale só nesta visita.");
  }
})();
