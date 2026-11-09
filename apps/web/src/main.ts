import {
  acceptFriend,
  acceptInvite,
  AccountError,
  askFriend,
  cloudSaves,
  declineFriend,
  declineInvite,
  downloadSave,
  downloadShot,
  fetchAccount,
  inviteFriend,
  listCloud,
  loadFriends,
  loadInvites,
  logoutAccount,
  publishOpenRoom,
  removeFriend,
  uploadSave,
  type AccountUser,
  type FriendCard,
  type FriendLists,
  type RoomInvite,
} from "./account.ts";
import cartUrl from "./assets/snes-cart.png";
import marioUrl from "./assets/mario.png";
import luigiUrl from "./assets/luigi.png";
import inviteYesUrl from "./assets/invite-yes.png";
import inviteNoUrl from "./assets/invite-no.png";
import saveIconUrl from "./assets/save-floppy.png";
import { Speaker } from "./audio.ts";
import { kindFromLabel, padIcon } from "./icons.ts";
import { startInstall } from "./install.ts";
import { KEYBOARD_GUIDE, connectedPads, padStatus, readPads, readSupers, setTouchBits } from "./input.ts";
import { paintManual } from "./manual.ts";
import { startTouch } from "./touch.ts";
import { controlGuide, keyboardScheme, padLabel } from "./pads.ts";
import { games, isLibraryGame, localGame, localRomId, looksLikeSnesRom, matchRom, sha1Of, titleFromFile, type Game, type LibraryGame } from "./rom.ts";
import { decodeSaveFile, encodeSaveFile } from "./save-file.ts";
import { OnlineSession, type ChatLine, type Role, type Seat } from "./session.ts";
import { FIGHTERS, LEFT, RIGHT, SELECT, fighterLabel, superSteps, type Fighter } from "./supers.ts";
import { bindScreen, setCrt, whenCrtDrops } from "./crt.ts";
import { conceal, reveal, shown } from "./motion.ts";
import { forgetRom, forgetSlot, lastGame, listLibrary, loadRom, loadState, playerName, renameRom, saveList, saveRom, saveSlots, saveState, setPlayerName, setRomCover, storedGames } from "./store.ts";
import { startTour } from "./tour.ts";

const pick = document.querySelector<HTMLElement>("#pick")!;
const tabOnline = document.querySelector<HTMLButtonElement>("#tab-online")!;
const tabLocal = document.querySelector<HTMLButtonElement>("#tab-local")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const panel = document.querySelector<HTMLElement>("#panel")!;
const roomOpen = document.querySelector<HTMLButtonElement>("#room-open")!;
const roomClose = document.querySelector<HTMLButtonElement>("#room-close")!;
const roomBackdrop = document.querySelector<HTMLButtonElement>("#room-backdrop")!;
const drop = document.querySelector<HTMLLabelElement>("#drop")!;
const dropText = drop.childNodes[0];
const dropHint = drop.querySelector("small");
const welcome = document.querySelector<HTMLElement>("#welcome")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const banner = document.querySelector<HTMLElement>("#banner")!;
const bannerText = document.querySelector<HTMLElement>("#banner-text")!;
const roomState = document.querySelector<HTMLElement>("#room-state")!;
const roomCode = document.querySelector<HTMLElement>("#room-code")!;
const roomTitle = document.querySelector<HTMLElement>("#room-title")!;
const playChat = document.querySelector<HTMLElement>("#play-chat")!;
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
const invitesSection = document.querySelector<HTMLElement>("#invites")!;
const roomInvitesBox = document.querySelector<HTMLElement>("#room-invites")!;
const friendInvitesBox = document.querySelector<HTMLElement>("#friend-invites")!;
const roomInviteList = document.querySelector<HTMLElement>("#room-invite-list")!;
const friendInviteList = document.querySelector<HTMLElement>("#friend-invite-list")!;
const savesCloud = document.querySelector<HTMLElement>("#saves-cloud")!;
const people = document.querySelector<HTMLElement>("#players")!;
const log = document.querySelector<HTMLElement>("#log")!;
const chatForm = document.querySelector<HTMLFormElement>("#chat")!;
const chatInput = document.querySelector<HTMLInputElement>("#chat-text")!;
const leaveButton = document.querySelector<HTMLButtonElement>("#leave")!;
const swapButton = document.querySelector<HTMLButtonElement>("#swap")!;
const confirmBox = document.querySelector<HTMLElement>("#confirm")!;
const confirmText = document.querySelector<HTMLElement>("#confirm-text")!;
const confirmYes = document.querySelector<HTMLButtonElement>("#confirm-yes")!;
const confirmNo = document.querySelector<HTMLButtonElement>("#confirm-no")!;
const picture = document.querySelector<HTMLElement>("#picture")!;
const viewport = document.querySelector<HTMLElement>("#viewport")!;
const savesOpen = document.querySelector<HTMLButtonElement>("#saves-open")!;
const savesModal = document.querySelector<HTMLElement>("#saves-modal")!;
const savesGrid = document.querySelector<HTMLElement>("#saves-grid")!;
const saveImport = document.querySelector<HTMLInputElement>("#save-import")!;
const savesMark = document.createElement("img");
savesMark.src = saveIconUrl;
savesMark.alt = "";
savesMark.draggable = false;
if (!savesOpen.querySelector("img")) savesOpen.prepend(savesMark);
const libraryEdit = document.querySelector<HTMLElement>("#library-edit")!;
const libraryName = document.querySelector<HTMLInputElement>("#library-name")!;
const libraryFile = document.querySelector<HTMLInputElement>("#library-file")!;
const libraryPreview = document.querySelector<HTMLImageElement>("#library-preview")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy")!;
const createButton = document.querySelector<HTMLButtonElement>("#create")!;
const joinButton = document.querySelector<HTMLButtonElement>("#join")!;
let screen = document.querySelector<HTMLCanvasElement>("#screen")!;
let transferred = false;
let zoom: "fit" | "2" | "3" | "4" = "fit";
const FRAME_KEY = "snes-couch-frame";
const CRT_KEY = "snes-couch-crt";

function storedFrame(): "fit" | "fill" {
  try { return localStorage.getItem(FRAME_KEY) === "fill" ? "fill" : "fit"; }
  catch { return "fit"; }
}

let frame: "fit" | "fill" = storedFrame();

function storedCrt(): boolean {
  try { return localStorage.getItem(CRT_KEY) === "1"; }
  catch { return false; }
}

let crtOn = storedCrt();

type ShelfTab = "online" | "local";

let shelfTab: ShelfTab = "online";
let library: LibraryGame[] = [];
const coverUrls = new Map<string, string>();
let paintedShelf = "";

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
type AlertMode = "forget" | "reset-local" | "reset-ask" | "reset-wait" | "reset-in" | "drop-slot";
let alertMode: AlertMode | null = null;
let dropTarget: { gameId: string; slot: number } | null = null;
let importSlot: number | null = null;
let inviteTimer = 0;
let inviteTick = 0;
let liveSocket: WebSocket | null = null;
let liveRetry = 0;
let liveWait = 0;
let liveBeat = 0;
let inviteGen = 0;
let friendGen = 0;
let friendKey = "";
const goneInvites = new Set<string>();
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

const photoCovers = new Set([
  "final-fight-3",
  "pocky-rocky-2",
  "mighty-morphin-power-rangers-the-movie",
  "king-of-dragons",
  "super-mario-world",
  "donkey-kong-country",
  "donkey-kong-country-3",
]);

function coverOf(id: string) {
  return `/covers/${id}.${photoCovers.has(id) ? "jpg" : "svg"}`;
}

function plainGame(game: Game = selected): boolean {
  return game.id === localGame.id || isLibraryGame(game);
}

function visibleShelf(): Game[] {
  return shelfTab === "online" ? [...games] : [localGame, ...library];
}

function findGame(id: string | null): Game | undefined {
  if (!id) return;
  if (id === localGame.id) return localGame;
  return games.find((game) => game.id === id) ?? library.find((game) => game.id === id);
}

function paintTabs() {
  const online = shelfTab === "online";
  tabOnline.setAttribute("aria-selected", online ? "true" : "false");
  tabLocal.setAttribute("aria-selected", online ? "false" : "true");
  tabOnline.classList.toggle("on", online);
  tabLocal.classList.toggle("on", !online);
}

function showTab(tab: ShelfTab) {
  if (shelfTab === tab) return;
  shelfTab = tab;
  paintTabs();
  renderGames();
}

function coverBlob(bytes: Uint8Array, type: string): string {
  const copy = new Uint8Array(bytes);
  return URL.createObjectURL(new Blob([copy], { type }));
}

function applyLibrary(rows: Awaited<ReturnType<typeof listLibrary>>) {
  const next = new Map<string, string>();
  library = rows.map((row) => {
    let coverUrl: string | null = null;
    if (row.cover && row.coverType) {
      coverUrl = coverBlob(row.cover, row.coverType);
      next.set(row.id, coverUrl);
    }
    return {
      id: row.id,
      title: row.title,
      region: "Local" as const,
      sha1: row.sha1,
      bytes: 0,
      players: 2 as const,
      coverUrl,
    };
  });
  for (const [id, url] of coverUrls) {
    if (next.get(id) !== url) URL.revokeObjectURL(url);
  }
  coverUrls.clear();
  for (const [id, url] of next) coverUrls.set(id, url);
  const fresh = library.find((game) => game.id === selected.id);
  if (fresh) selected = fresh;
  if (loadedGame) {
    const loaded = library.find((game) => game.id === loadedGame?.id);
    if (loaded) {
      loadedGame = loaded;
      if (!session) roomState.textContent = playingLine(loaded);
    }
  }
}

async function refreshLibrary() {
  applyLibrary(await listLibrary());
  renderGames();
}

function idleRoom(): string {
  return plainGame()
    ? "Só nesta máquina. Sem sala."
    : "Partida local. A sala leva o outro controle para outra casa.";
}

function playingLine(game: Game): string {
  if (game.id === localGame.id) return "Outro jogo nesta máquina. Os controles ligados jogam aqui.";
  if (plainGame(game)) return `${game.title} nesta máquina. Os controles ligados jogam aqui.`;
  return `${game.title} nesta máquina. Os dois teclados jogam aqui.`;
}

function gameMeta(game: Game): string {
  if (game.id === localGame.id) return "Solte uma ROM de Super Nintendo";
  if (plainGame(game)) return "Só nesta máquina";
  return `${game.region} · ${ready.has(game.id) ? "ROM neste navegador" : "ROM ainda não gravada"}`;
}

function cartridgeFace(): HTMLElement {
  const face = document.createElement("span");
  face.className = "cartridge";
  const icon = document.createElement("img");
  icon.src = cartUrl;
  icon.alt = "";
  face.append(icon);
  return face;
}

function gameFace(game: Game): HTMLElement {
  if (isLibraryGame(game) && game.coverUrl) {
    const image = document.createElement("img");
    image.src = game.coverUrl;
    image.alt = "";
    return image;
  }
  if (!plainGame(game)) {
    const image = document.createElement("img");
    image.src = coverOf(game.id);
    image.alt = "";
    return image;
  }
  return cartridgeFace();
}

let gamesIntro = true;

function clipTitles() {
  for (const title of pick.querySelectorAll<HTMLElement>(".game strong")) {
    title.classList.toggle("clipped", title.scrollHeight > title.clientHeight + 1);
  }
}

new ResizeObserver(() => clipTitles()).observe(pick);
void document.fonts.ready.then(() => clipTitles());

function faceKey(game: Game): string {
  if (isLibraryGame(game)) return game.coverUrl ?? "";
  if (plainGame(game)) return "";
  return coverOf(game.id);
}

function renderGames() {
  const shelf = visibleShelf();
  const key = shelf.map((game) => `${game.id}\t${game.title}\t${faceKey(game)}`).join("\n");
  const buttons = pick.querySelectorAll<HTMLButtonElement>(":scope > .game, :scope > .game-item > .game");
  if (key === paintedShelf && buttons.length === shelf.length) {
    shelf.forEach((game, index) => {
      const button = buttons[index];
      if (!button) return;
      button.classList.toggle("selected", game.id === selected.id);
      const meta = button.querySelector("small");
      if (meta) meta.textContent = gameMeta(game);
    });
    clipTitles();
    return;
  }
  const intro = gamesIntro;
  gamesIntro = false;
  paintedShelf = key;
  pick.replaceChildren();
  shelf.forEach((game, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game${game.id === selected.id ? " selected" : ""}`;
    if (intro) {
      button.classList.add("arrive");
      button.style.animationDelay = `${index * 50}ms`;
    }
    button.title = game.title;
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = game.title;
    title.title = game.title;
    const meta = document.createElement("small");
    meta.textContent = gameMeta(game);
    text.append(title, meta);
    button.append(gameFace(game), text);
    button.addEventListener("click", () => {
      const enteringPlain = plainGame(game) && !plainGame();
      selected = game;
      if (enteringPlain && session) leaveRoom();
      updateDrop();
      renderGames();
      button.scrollIntoView({ inline: "center", block: "nearest" });
      void openStored(game);
    });
    if (!isLibraryGame(game)) {
      pick.append(button);
      return;
    }
    const item = document.createElement("div");
    item.className = "game-item";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "game-edit";
    edit.textContent = "Editar";
    edit.setAttribute("aria-label", `Editar ${game.title}`);
    edit.addEventListener("click", () => openLibraryEdit(game));
    item.append(button, edit);
    pick.append(item);
  });
  clipTitles();
}

function syncPlainRoom() {
  const plain = plainGame();
  createButton.disabled = plain;
  joinButton.disabled = plain;
  codeInput.disabled = plain;
  copyButton.disabled = plain;
  if (!plain || session || (loadedGame && plainGame(loadedGame))) return;
  roomState.textContent = idleRoom();
}

function updateDrop() {
  if (plainGame()) {
    if (dropText) dropText.textContent = "Solte a ROM de Super Nintendo aqui";
    if (dropHint) dropHint.textContent = "O arquivo fica neste navegador. Qualquer ROM, só nesta máquina.";
  } else {
    if (dropText) dropText.textContent = `Solte a ROM de ${selected.title} aqui`;
    if (dropHint) dropHint.textContent = "O arquivo fica neste navegador. Só entra se o SHA-1 for o da versão USA.";
  }
  syncPlainRoom();
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
  bindScreen(screen);
  applyZoom();
}

function stopPlay(next: "drop" | "welcome" = "drop") {
  window.clearTimeout(resetTimer);
  relaunching = false;
  romBytes = null;
  worker?.terminate();
  worker = null;
  sab = null;
  pads = null;
  loadedGame = null;
  conceal(picture, "down");
  if (next === "welcome") {
    conceal(drop, "down");
    reveal(welcome, "down");
    roomState.textContent = idleRoom();
  } else {
    conceal(welcome, "down");
    reveal(drop, "down");
  }
  hideOverlay();
  if (transferred) replaceScreen();
  renderSaves();
}

async function openStored(game: Game) {
  if (game.id === localGame.id) {
    if (loadedGame) stopPlay();
    roomState.textContent = "Emule seu jogo. Solte uma ROM de Super Nintendo. Ela fica neste navegador.";
    return;
  }
  if (loadedGame?.id === game.id) return;
  const record = await loadRom(game.id);
  if (!record) {
    stopPlay();
    roomState.textContent = `${game.title}. Solte a ROM uma vez. Ela fica neste navegador.`;
    return;
  }
  if (isLibraryGame(game)) {
    if (!looksLikeSnesRom(record.bytes.length)) {
      await forgetRom(game.id);
      ready.delete(game.id);
      if (selected.id === game.id) selected = localGame;
      await refreshLibrary();
      setBanner("A ROM gravada não parece de Super Nintendo. Solta o arquivo de novo.");
      return;
    }
    await boot(game, record.bytes);
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

async function keepCatalog(game: Game, rom: Uint8Array) {
  try {
    await saveRom(game.id, game.sha1, rom);
    ready.add(game.id);
  } catch {
    setBanner("A ROM abriu, mas não ficou gravada neste navegador.");
  }
  shelfTab = "online";
  paintTabs();
  await boot(game, rom);
}

async function keepLibrary(bytes: Uint8Array, sha1: string, fileName: string) {
  const id = localRomId(sha1);
  const existing = library.find((game) => game.id === id);
  const title = existing?.title ?? titleFromFile(fileName);
  try {
    await saveRom(id, sha1, bytes, existing ? undefined : title);
    ready.add(id);
    await refreshLibrary();
  } catch {
    setBanner("A ROM abriu, mas não ficou gravada neste navegador.");
  }
  const game = library.find((entry) => entry.id === id) ?? {
    id,
    title,
    region: "Local" as const,
    sha1,
    bytes: 0,
    players: 2 as const,
    coverUrl: null,
  };
  shelfTab = "local";
  paintTabs();
  await boot(game, bytes);
}

async function openFile(file: File) {
  if (!crossOriginIsolated) {
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
    return;
  }
  setBanner("Conferindo o arquivo…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (plainGame()) {
    if (!looksLikeSnesRom(bytes.length)) {
      setBanner("Esse arquivo não parece uma ROM de Super Nintendo. Nada foi enviado.");
      return;
    }
    const matched = await matchRom(bytes);
    if (matched) {
      await keepCatalog(matched.game, matched.rom);
      setBanner(`${matched.game.title} entrou nos jogos online.`);
      return;
    }
    await keepLibrary(bytes, await sha1Of(bytes), file.name);
    return;
  }
  const matched = await matchRom(bytes);
  if (!matched || matched.game.id !== selected.id) {
    setBanner(matched
      ? `Esse arquivo é ${matched.game.title}. Escolhe esse jogo na lista, ou solta a ROM de ${selected.title}.`
      : "Esse arquivo não é a versão USA esperada. Nada foi enviado.");
    return;
  }
  await keepCatalog(matched.game, matched.rom);
}

async function boot(game: Game, rom: Uint8Array) {
  if (!crossOriginIsolated) {
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
    return;
  }
  if (loadedGame?.id === game.id && worker) {
    roomState.textContent = playingLine(game);
    return;
  }
  try { await speaker.resume(); } catch { /* o áudio espera um clique */ }
  stopPlay();
  romBytes = rom.slice();
  startWorker(romBytes, null, plainGame(game));
  loadedGame = game;
  selected = game;
  screen.hidden = false;
  conceal(drop, "down");
  conceal(welcome, "down");
  reveal(picture, "down");
  setBanner("");
  roomState.textContent = playingLine(game);
  renderGames();
  await renderSaves();
}

function startWorker(rom: Uint8Array, net: ResetNet = null, plain = false) {
  sab = new SharedArrayBuffer(4);
  pads = new Uint16Array(sab);
  const canvas = screen.transferControlToOffscreen();
  transferred = true;
  worker?.terminate();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event) => onWorker(event.data);
  const copy = rom.slice();
  worker.postMessage(
    { t: "load", rom: copy.buffer, canvas, sab, plain, ...(net ? { net } : {}) },
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
  startWorker(rom, plainGame(game) ? null : net, plainGame(game));
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
    viewport.style.setProperty("--rw", String(message.w));
    viewport.style.setProperty("--rh", String(message.h));
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
  if (message.t === "error") {
    if (message.message === "O núcleo não aceitou essa ROM." && loadedGame && isLibraryGame(loadedGame)) {
      void dropRejectedLocal();
      return;
    }
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
    }, 4000);
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
  stopBlink();
  log.replaceChildren();
}

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

let chatTimer = 0;
let peeking = false;
let peekedMessage = false;

function composing() {
  return document.activeElement === chatInput;
}

function bumpChat() {
  window.clearTimeout(chatTimer);
  if (peeking) return;
  chatTimer = window.setTimeout(() => {
    if (peeking) return;
    hideOverlay();
  }, 10000);
}

function showOverlay(mode: "flash" | "history" | "compose") {
  if (picture.hidden || chatInput.disabled) return;
  playChat.hidden = false;
  const writing = mode === "compose" || composing();
  chatForm.hidden = mode === "history" ? true : !writing;
  if (mode === "history") {
    window.clearTimeout(chatTimer);
    return;
  }
  bumpChat();
}

function hideOverlay() {
  peeking = false;
  peekedMessage = false;
  window.clearTimeout(chatTimer);
  chatForm.hidden = true;
  playChat.hidden = true;
  if (composing()) {
    chatInput.blur();
    localTyping(false);
  }
}

function holdHistory() {
  if (!playChat.hidden || picture.hidden || chatInput.disabled || composing()) return;
  peeking = true;
  peekedMessage = false;
  showOverlay("history");
}

function releaseHistory() {
  if (!peeking) return;
  const saw = peekedMessage;
  peeking = false;
  peekedMessage = false;
  if (composing()) {
    bumpChat();
    return;
  }
  if (saw) {
    showOverlay("flash");
    return;
  }
  window.clearTimeout(chatTimer);
  chatForm.hidden = true;
  playChat.hidden = true;
}

function openComposer() {
  if (picture.hidden || chatInput.disabled) return;
  showOverlay("compose");
  chatInput.focus();
}

function leaveComposer() {
  if (!composing()) return;
  window.clearTimeout(typingIdle);
  localTyping(false);
  chatForm.hidden = true;
  chatInput.blur();
}

function mySlot(): 0 | 1 {
  return session?.playSlot() ?? 0;
}

function localTyping(on: boolean) {
  if (!session) return;
  if (typingSent === on) return;
  typingSent = on;
  session.sendTyping(on);
}

let blinkTimer = 0;

function stopBlink() {
  window.clearTimeout(blinkTimer);
  for (const line of log.querySelectorAll(".play-line.blink")) line.classList.remove("blink");
}

function blinkLine(row: HTMLElement) {
  stopBlink();
  row.classList.add("blink");
  blinkTimer = window.setTimeout(() => row.classList.remove("blink"), 3000);
}

function pushChat(line: ChatLine, live = false) {
  const row = document.createElement("p");
  row.className = "play-line";
  const who = document.createElement("b");
  const name = line.name?.trim();
  who.textContent = name || (line.from === "host" ? "Anfitrião" : "Convidado");
  row.append(who, document.createTextNode(` ${line.text}`));
  log.append(row);
  if (!live) return;
  if (line.from !== session?.role) blinkLine(row);
  else stopBlink();
  if (peeking) peekedMessage = true;
  showOverlay(composing() ? "compose" : peeking ? "history" : "flash");
}

function setChatEnabled(on: boolean) {
  chatInput.disabled = !on;
  chatInput.placeholder = on ? "Escreve para a sala" : "A conversa abre na sala";
  if (!on) hideOverlay();
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
  if (plainGame()) note.push("Partida só nesta máquina. Os controles ligados entram nos dois jogadores.");
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
      superKey: plainGame() ? null : online ? "F" : player.keys === 0 ? "F" : player.keys === 1 ? ";" : null,
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
    ? `sala:${session.role}:${session.playSlot()}:${roster.host.here}:${roster.host.control}:${roster.host.name}:${roster.guest.here}:${roster.guest.control}:${roster.guest.name}`
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
  const mine = session.playSlot();
  const hostSlot: 0 | 1 = you === "host" ? mine : (mine === 0 ? 1 : 0);
  const seats = [
    { slot: hostSlot, seat: roster.host, mine: you === "host", fallback: "Anfitrião", absent: "saiu" },
    { slot: (hostSlot === 0 ? 1 : 0) as 0 | 1, seat: roster.guest, mine: you === "guest", fallback: "Convidado", absent: "aguardando" },
  ].sort((a, b) => a.slot - b.slot);
  seats.forEach((row, index) => {
    const present = row.mine || row.seat.here;
    const state = row.mine ? "você" : row.seat.here ? "na sala" : row.absent;
    playerLine(
      row.seat.name || row.fallback,
      present ? row.seat.control || "Teclado" : "—",
      `Jogador ${row.slot + 1} · ${state}`,
      index,
      animate,
    );
  });
}

function when(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const shotUrls: string[] = [];

function slotButton(className: string, label: string, kind: "save" | "down" | "up") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  if (kind === "save") {
    const image = document.createElement("img");
    image.src = saveIconUrl;
    image.alt = "";
    image.draggable = false;
    image.className = "pixel";
    button.append(image);
  } else {
    const mark = document.createElement("i");
    mark.className = kind;
    mark.setAttribute("aria-hidden", "true");
    button.append(mark);
  }
  const text = document.createElement("span");
  text.textContent = label;
  button.append(text);
  return button;
}

function saveDownloadName(title: string, slot: number) {
  const clean = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return `${clean || "jogo"}-save-${slot}.couchsave`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
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
    const card = document.createElement("article");
    card.className = "slot-card";
    if (!record) {
      const empty = document.createElement("div");
      empty.className = "slot-empty";
      const caption = document.createElement("span");
      caption.textContent = "Vazio";
      empty.append(caption);
      const save = slotButton("slot-save", "Salvar", "save");
      save.setAttribute("aria-label", `Salvar no slot ${slot}`);
      save.addEventListener("click", () => void writeSlot(game, slot));
      const bring = slotButton("slot-import", "Importar", "up");
      bring.setAttribute("aria-label", `Importar um save no slot ${slot}`);
      bring.addEventListener("click", () => pickImport(slot));
      const actions = document.createElement("div");
      actions.className = "slot-actions";
      actions.append(save, bring);
      card.append(empty, actions);
      savesGrid.append(card);
      continue;
    }
    const frame = document.createElement("div");
    frame.className = "slot-frame";
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
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "slot-drop";
    drop.setAttribute("aria-label", `Apagar o save ${slot}`);
    const bin = document.createElement("i");
    bin.setAttribute("aria-hidden", "true");
    drop.append(bin);
    drop.addEventListener("click", () => askDropSlot(game, slot));
    frame.append(shot, drop);
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
    meta.append(dot, place, time);
    const save = slotButton("slot-save", "Salvar", "save");
    save.setAttribute("aria-label", `Salvar no slot ${slot}`);
    save.addEventListener("click", () => void writeSlot(game, slot));
    const down = slotButton("slot-down", "Baixar", "down");
    down.setAttribute("aria-label", `Baixar o save ${slot}`);
    down.addEventListener("click", () => void downloadSlot(game, slot, record.savedAt, record.shot));
    const actions = document.createElement("div");
    actions.className = "slot-actions";
    actions.append(save, down);
    card.append(frame, meta, actions);
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

async function downloadSlot(game: Game, slot: number, savedAt: number, shot: Uint8Array | null) {
  const state = await loadState(game.id, slot);
  if (!state) {
    setBanner("Esse save não está mais neste navegador.");
    await renderSaves();
    return;
  }
  const text = encodeSaveFile({ sha1: game.sha1, title: game.title, savedAt, state, shot });
  downloadBlob(new Blob([text], { type: "application/json" }), saveDownloadName(game.title, slot));
}

function pickImport(slot: number) {
  importSlot = slot;
  saveImport.value = "";
  saveImport.click();
}

async function importSave(game: Game, slot: number, file: File) {
  if (file.size > 12 * 1024 * 1024) {
    setBanner("Esse arquivo é grande demais para ser um save.");
    return;
  }
  let parsed: ReturnType<typeof decodeSaveFile>;
  try {
    parsed = decodeSaveFile(await file.text());
  } catch {
    setBanner("Não deu para ler esse arquivo.");
    return;
  }
  if (!parsed) {
    setBanner("Esse arquivo não é um save deste emulador.");
    return;
  }
  if (!game.sha1 || parsed.sha1 !== game.sha1) {
    setBanner(parsed.title ? `Esse save é de ${parsed.title}.` : "Esse save é de outra ROM.");
    return;
  }
  const taken = (await saveList(game.id)).some((item) => item.slot === slot);
  if (taken) {
    setBanner(`O slot ${slot} já tem um save.`);
    await renderSaves();
    return;
  }
  try {
    await saveState(game.id, slot, parsed.state, parsed.shot, "local", parsed.savedAt);
    setBanner(`Save ${slot} importado.`);
    await renderSaves();
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Não deu para importar o save.");
  }
}

function askDropSlot(game: Game, slot: number) {
  if (alertMode) return;
  dropTarget = { gameId: game.id, slot };
  openAlert("drop-slot");
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
    setBanner("A partida ainda não ligou.");
    return;
  }
  if (saveDialog) return;
  saveDialog = { kind: "offer", state, label: when(savedAt) };
  showConfirm(`Carregar o save de ${when(savedAt)} nos dois?`, "both");
}

async function dropRejectedLocal() {
  const game = loadedGame;
  if (!game || !isLibraryGame(game)) return;
  await forgetRom(game.id);
  ready.delete(game.id);
  if (loadedGame?.id === game.id) stopPlay();
  if (editingId === game.id) closeLibraryEdit();
  if (selected.id === game.id) selected = localGame;
  await refreshLibrary();
  updateDrop();
  setBanner("O núcleo não aceitou essa ROM.");
}

async function connect(role: Role, code: string) {
  if (plainGame()) {
    setBanner("Este jogo só roda nesta máquina.");
    return;
  }
  if (!account) {
    nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
    nickInput.value = nick;
    void setPlayerName(nick);
  }
  await booting;
  if (!loadedGame || loadedGame.id !== selected.id) {
    if (!session) roomState.textContent = idleRoom();
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
      const slot = mine.playSlot();
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
      shown(swapButton, false, "left");
      typingSent = false;
      hideConfirm();
      if (alertMode?.startsWith("reset")) closeAlert();
      hideOverlay();
      renderPeople();
      worker?.postMessage({ t: "local" });
      dropHostedRoom();
      roomState.textContent = idleRoom();
      setBanner(reason);
    },
    onChat: (line) => {
      pushChat(line, true);
      if (line.from === mine.role) typingSent = false;
    },
    onTyping: () => {},
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
    onSwap: () => {
      peopleKey = "";
      renderPeople();
      if (!manual.hidden) fillManual();
      setBanner(mine.playSlot() === 0 ? "Você agora é o jogador 1." : "Você agora é o jogador 2.");
    },
    onSwapBusy: () => setBanner("A troca já está indo."),
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
  shown(swapButton, true, "left");
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
    shown(swapButton, false, "left");
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
  const quiet = muted || volume === 0;
  const level = quiet ? "mute" : volume < 40 ? "low" : "high";
  speaker.setVolume(audible / 100);
  for (const slider of document.querySelectorAll<HTMLInputElement>("[data-volume]")) {
    slider.value = String(volume);
  }
  for (const readout of document.querySelectorAll<HTMLElement>("[data-vol-readout]")) {
    readout.textContent = quiet ? "Mudo" : `${volume}%`;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mute]")) {
    button.dataset.level = level;
    button.setAttribute("aria-pressed", quiet ? "true" : "false");
    button.setAttribute("aria-label", quiet ? "Ativar som" : "Silenciar");
  }
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTE_KEY, quiet ? "1" : "0");
  } catch { /* o nível vale só nesta visita */ }
}

function toggleMute() {
  muted = !(muted || volume === 0);
  if (!muted && volume === 0) volume = 50;
  paintVolume();
}

function applyZoom() {
  const stretch = frame === "fill";
  screen.classList.remove("fit", "z2", "z3", "z4");
  screen.classList.add(!stretch && zoom !== "fit" ? `z${zoom}` : "fit");
  picture.classList.toggle("fill", stretch);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
    button.classList.toggle("on", button.dataset.zoom === zoom);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-frame]")) {
    button.classList.toggle("on", button.dataset.frame === frame);
  }
}

function rememberFrame() {
  try { localStorage.setItem(FRAME_KEY, frame); }
  catch { /* a escolha vale só nesta visita */ }
}

function paintCrt() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-crt]")) {
    button.classList.toggle("on", crtOn);
    button.setAttribute("aria-pressed", crtOn ? "true" : "false");
  }
}

function rememberCrt() {
  try { localStorage.setItem(CRT_KEY, crtOn ? "1" : "0"); }
  catch { /* a escolha vale só nesta visita */ }
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
  watchInvites();
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

function friendCard(friend: FriendCard, pending: "out" | null) {
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
  meta.textContent = pending === "out" ? "pedido enviado" : friend.friendCode;
  text.append(name, meta);
  who.append(text);
  const actions = document.createElement("div");
  actions.className = "friend-actions";
  if (pending === "out") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => void changeFriend(() => removeFriend(friend.id), "Pedido cancelado."));
    actions.append(cancel);
  } else {
    who.append(friendOptions(friend));
    const call = document.createElement("button");
    call.type = "button";
    call.className = "friend-call";
    const plus = document.createElement("i");
    plus.setAttribute("aria-hidden", "true");
    call.append(plus, document.createTextNode("Convidar"));
    call.addEventListener("click", () => void callFriend(friend));
    actions.append(call);
    if (friend.roomCode) {
      const join = document.createElement("button");
      join.type = "button";
      join.textContent = `Sala ${friend.roomCode}`;
      join.addEventListener("click", () => joinCode(friend.roomCode!));
      actions.append(join);
    }
  }
  card.append(who, actions);
  return card;
}

let openFriendMenu: HTMLElement | null = null;

function closeFriendMenu(focusBack = false) {
  const menu = openFriendMenu;
  if (!menu) return;
  const button = menu.parentElement?.querySelector(".friend-more");
  menu.hidden = true;
  menu.classList.remove("up");
  if (button instanceof HTMLButtonElement) button.setAttribute("aria-expanded", "false");
  openFriendMenu = null;
  if (focusBack && button instanceof HTMLButtonElement) button.focus();
}

function placeFriendMenu(menu: HTMLElement) {
  menu.classList.remove("up");
  const limit = panel.getBoundingClientRect().bottom;
  if (menu.getBoundingClientRect().bottom > limit) menu.classList.add("up");
}

function friendOptions(friend: FriendCard) {
  const options = document.createElement("div");
  options.className = "friend-options";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "friend-more";
  more.setAttribute("aria-label", "Opções");
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", "false");
  const dots = document.createElement("i");
  dots.setAttribute("aria-hidden", "true");
  more.append(dots);
  const menu = document.createElement("div");
  menu.className = "friend-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "friend-remove";
  remove.setAttribute("role", "menuitem");
  const bin = document.createElement("i");
  bin.setAttribute("aria-hidden", "true");
  remove.append(bin, document.createTextNode("Remover"));
  remove.addEventListener("click", () => {
    closeFriendMenu();
    void changeFriend(() => removeFriend(friend.id), `${friend.name} saiu da lista.`);
  });
  menu.append(remove);
  more.addEventListener("click", () => {
    const willOpen = menu.hidden;
    closeFriendMenu();
    if (!willOpen) return;
    menu.hidden = false;
    more.setAttribute("aria-expanded", "true");
    openFriendMenu = menu;
    placeFriendMenu(menu);
  });
  options.append(more, menu);
  return options;
}

async function callFriend(friend: FriendCard) {
  if (!hostedCode) {
    setBanner("Crie a sala antes de chamar alguém.");
    return;
  }
  try {
    await roomChain;
    if (!hostedCode) {
      setBanner("Crie a sala antes de chamar alguém.");
      return;
    }
    await inviteFriend(friend.id);
    setBanner(`Convite enviado para ${friend.name}.`);
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para chamar.");
  }
}

function closeLive() {
  window.clearTimeout(liveWait);
  window.clearInterval(liveBeat);
  liveWait = 0;
  liveBeat = 0;
  const socket = liveSocket;
  liveSocket = null;
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.close();
}

function fallbackPoll() {
  if (inviteTimer || !account) return;
  inviteTimer = window.setInterval(() => {
    void pullInvites();
    void paintFriends();
  }, 8000);
}

function openLive() {
  if (!account || liveSocket) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${proto}//${location.host}/api/live`);
  liveSocket = socket;
  socket.onopen = () => {
    if (liveSocket !== socket) return;
    liveRetry = 0;
    window.clearInterval(inviteTimer);
    inviteTimer = 0;
    window.clearInterval(liveBeat);
    liveBeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 25000);
    void pullInvites();
    void paintFriends();
  };
  socket.onmessage = (event) => {
    if (event.data === "pong") return;
    void pullInvites();
    void paintFriends();
  };
  socket.onclose = () => {
    if (liveSocket !== socket) return;
    liveSocket = null;
    window.clearInterval(liveBeat);
    liveBeat = 0;
    if (!account) return;
    fallbackPoll();
    const delay = Math.min(8000, 400 * 2 ** liveRetry);
    liveRetry += 1;
    liveWait = window.setTimeout(() => {
      liveWait = 0;
      if (account) openLive();
    }, delay);
  };
}

function watchInvites() {
  window.clearInterval(inviteTimer);
  inviteTimer = 0;
  closeLive();
  if (!account) {
    friendKey = "";
    goneInvites.clear();
    window.clearInterval(inviteTick);
    inviteTick = 0;
    roomInviteList.replaceChildren();
    friendInviteList.replaceChildren();
    syncInviteVisibility();
    return;
  }
  openLive();
  void pullInvites();
  void paintFriends();
}

function cardById(list: HTMLElement, id: string): HTMLElement | null {
  for (const node of list.children) {
    if (node instanceof HTMLElement && node.dataset.id === id) return node;
  }
  return null;
}

function setBusy(card: HTMLElement | null, busy: boolean) {
  if (!card) return;
  for (const button of card.querySelectorAll("button")) button.disabled = busy;
}

function syncList<T extends { id: string }>(list: HTMLElement, items: T[], render: (item: T) => HTMLElement) {
  const ids = new Set(items.map((item) => item.id));
  for (const item of items) list.append(cardById(list, item.id) ?? render(item));
  for (const node of [...list.children]) {
    if (node instanceof HTMLElement && !ids.has(node.dataset.id ?? "")) node.remove();
  }
}

function syncInviteVisibility() {
  const roomEmpty = roomInviteList.childElementCount === 0;
  const friendEmpty = friendInviteList.childElementCount === 0;
  roomInvitesBox.hidden = roomEmpty;
  friendInvitesBox.hidden = friendEmpty;
  invitesSection.hidden = roomEmpty && friendEmpty;
}

function inviteClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function paintInviteMeters() {
  const now = Date.now();
  for (const card of [...roomInviteList.querySelectorAll<HTMLElement>(".invite-card")]) {
    const expires = Number(card.dataset.expires);
    const created = Number(card.dataset.created);
    const total = Math.max(1, expires - created);
    const left = expires - now;
    const fill = card.querySelector<HTMLElement>(".invite-meter i span");
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, left / total)) * 100}%`;
    const count = card.querySelector(".invite-count");
    if (count) count.textContent = inviteClock(left);
    if (left <= 0 && card.dataset.id) {
      goneInvites.add(card.dataset.id);
      card.remove();
    }
  }
  if (roomInviteList.childElementCount === 0) {
    window.clearInterval(inviteTick);
    inviteTick = 0;
  }
  syncInviteVisibility();
}

function ensureInviteTick() {
  paintInviteMeters();
  if (inviteTick || roomInviteList.childElementCount === 0) return;
  inviteTick = window.setInterval(paintInviteMeters, 250);
}

function inviteActions(onYes: () => void, onNo: () => void) {
  const actions = document.createElement("div");
  actions.className = "invite-actions";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "invite-yes";
  yes.setAttribute("aria-label", "Aceitar");
  const yesIcon = document.createElement("img");
  yesIcon.src = inviteYesUrl;
  yesIcon.alt = "";
  yes.append(yesIcon);
  const no = document.createElement("button");
  no.type = "button";
  no.className = "invite-no";
  no.setAttribute("aria-label", "Recusar");
  const noIcon = document.createElement("img");
  noIcon.src = inviteNoUrl;
  noIcon.alt = "";
  no.append(noIcon);
  yes.addEventListener("click", onYes);
  no.addEventListener("click", onNo);
  actions.append(yes, no);
  return actions;
}

function roomInviteCard(invite: RoomInvite) {
  const card = document.createElement("article");
  card.className = "invite-card";
  card.dataset.id = invite.id;
  card.dataset.created = String(invite.createdAt);
  card.dataset.expires = String(invite.expiresAt);
  const top = document.createElement("div");
  top.className = "invite-top";
  const mark = document.createElement("i");
  mark.className = "invite-enter";
  mark.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  copy.className = "invite-copy";
  const name = document.createElement("b");
  name.textContent = invite.fromName;
  const meta = document.createElement("small");
  meta.textContent = `Sala ${invite.roomCode}`;
  copy.append(name, meta);
  top.append(mark, copy);
  const meter = document.createElement("p");
  meter.className = "invite-meter";
  const track = document.createElement("i");
  track.setAttribute("aria-hidden", "true");
  track.append(document.createElement("span"));
  const count = document.createElement("span");
  count.className = "invite-count";
  meter.append(track, count);
  card.append(top, meter, inviteActions(() => void takeRoomInvite(invite), () => void dropRoomInvite(invite.id)));
  return card;
}

function friendInviteCard(friend: FriendCard) {
  const card = document.createElement("article");
  card.className = "invite-card";
  card.dataset.id = friend.id;
  const top = document.createElement("div");
  top.className = "invite-top";
  if (friend.hasAvatar) {
    const photo = document.createElement("img");
    photo.className = "invite-photo";
    photo.src = `/api/avatars/${friend.id}`;
    photo.alt = "";
    photo.width = 36;
    photo.height = 36;
    top.append(photo);
  }
  const copy = document.createElement("div");
  copy.className = "invite-copy";
  const name = document.createElement("b");
  name.textContent = friend.name;
  copy.append(name);
  const pals = document.createElement("span");
  pals.className = "invite-pals";
  pals.setAttribute("aria-hidden", "true");
  for (const src of [marioUrl, luigiUrl]) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    pals.append(img);
  }
  top.append(copy, pals);
  card.append(top, inviteActions(() => void answerFriendInvite(friend, true), () => void answerFriendInvite(friend, false)));
  return card;
}

async function takeRoomInvite(invite: RoomInvite) {
  const card = cardById(roomInviteList, invite.id);
  setBusy(card, true);
  try {
    const code = await acceptInvite(invite.id);
    goneInvites.add(invite.id);
    card?.remove();
    syncInviteVisibility();
    joinCode(code);
  } catch (error) {
    setBusy(card, false);
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para entrar na sala.");
  }
}

async function dropRoomInvite(id: string) {
  goneInvites.add(id);
  cardById(roomInviteList, id)?.remove();
  syncInviteVisibility();
  try {
    await declineInvite(id);
  } catch (error) {
    goneInvites.delete(id);
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
      return;
    }
    setBanner(error instanceof Error ? error.message : "Não deu para recusar.");
    void pullInvites();
  }
}

async function answerFriendInvite(friend: FriendCard, accept: boolean) {
  const card = cardById(friendInviteList, friend.id);
  setBusy(card, true);
  try {
    if (accept) await acceptFriend(friend.id);
    else await declineFriend(friend.id);
    setBanner(accept ? "Pedido aceito." : "Pedido recusado.");
    friendKey = "";
    await paintFriends();
  } catch (error) {
    setBusy(card, false);
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para atualizar os amigos.");
  }
}

async function pullInvites() {
  if (!account || document.visibilityState === "hidden") return;
  const gen = ++inviteGen;
  let invites: RoomInvite[];
  try {
    invites = await loadInvites();
  } catch (error) {
    if (gen !== inviteGen) return;
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    return;
  }
  if (gen !== inviteGen || !account) return;
  for (const id of [...goneInvites]) {
    if (!invites.some((item) => item.id === id)) goneInvites.delete(id);
  }
  const here = session ? roomCode.textContent : "";
  for (const item of invites) {
    if (here && here === item.roomCode) {
      goneInvites.add(item.id);
      void declineInvite(item.id).catch(() => undefined);
    }
  }
  const now = Date.now();
  const open = invites.filter((item) => item.expiresAt > now && !goneInvites.has(item.id));
  syncList(roomInviteList, open, roomInviteCard);
  ensureInviteTick();
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

function friendSignature(lists: FriendLists): string {
  const part = (items: FriendCard[], tag: string) => items.map((item) => (
    `${tag}:${item.id}:${item.name}:${item.roomCode ?? ""}:${item.hasAvatar ? 1 : 0}`
  )).join("|");
  return `${part(lists.incoming, "in")}\n${part(lists.outgoing, "out")}\n${part(lists.friends, "ok")}`;
}

async function paintFriends() {
  if (!account) {
    closeFriendMenu();
    friendKey = "";
    friendGen += 1;
    friendList.replaceChildren();
    friendInviteList.replaceChildren();
    syncInviteVisibility();
    return;
  }
  const gen = ++friendGen;
  let lists: FriendLists;
  try {
    lists = await loadFriends();
  } catch (error) {
    if (gen !== friendGen) return;
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    return;
  }
  if (gen !== friendGen || !account) return;
  const next = friendSignature(lists);
  if (next === friendKey) return;
  closeFriendMenu();
  friendKey = next;
  friendList.replaceChildren();
  const blocks = [
    ...lists.outgoing.map((friend) => ({ friend, pending: "out" as const })),
    ...lists.friends.map((friend) => ({ friend, pending: null })),
  ];
  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nenhum amigo ainda. Manda o seu código.";
    friendList.append(empty);
  } else {
    for (const block of blocks) friendList.append(friendCard(block.friend, block.pending));
  }
  syncList(friendInviteList, lists.incoming, friendInviteCard);
  syncInviteVisibility();
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
  if (!account) return;
  void paintFriends();
  void pullInvites();
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
  bumpChat();
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
  shown(swapButton, false, "left");
  typingSent = false;
  hideConfirm();
  clearChat();
  hideOverlay();
  worker?.postMessage({ t: "local" });
  roomState.textContent = idleRoom();
  setDelay("");
  dropHostedRoom();
  renderPeople();
  setBanner("Você saiu da sala.");
}

leaveButton.addEventListener("click", () => leaveRoom());

swapButton.addEventListener("click", () => {
  if (!session?.linked()) {
    setBanner("A partida ainda não ligou.");
    return;
  }
  if (!session.requestSwap()) {
    setBanner("A troca já está indo.");
    return;
  }
  if (session.role === "guest") setBanner("Pedindo a troca de jogadores…");
});

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
savesOpen.addEventListener("click", () => void openSaves());
saveImport.addEventListener("change", () => {
  const file = saveImport.files?.[0];
  const slot = importSlot;
  importSlot = null;
  if (!file || slot === null || !loadedGame) return;
  void importSave(loadedGame, slot, file);
});
document.querySelector("#saves-close")!.addEventListener("click", () => closeSaves());
savesModal.addEventListener("click", (event) => {
  if (event.target === savesModal) closeSaves();
});

document.addEventListener("click", (event) => {
  if (!openFriendMenu) return;
  const home = openFriendMenu.parentElement;
  if (event.target instanceof Node && home?.contains(event.target)) return;
  closeFriendMenu();
});
panel.addEventListener("scroll", () => closeFriendMenu(), { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && openFriendMenu) {
    closeFriendMenu(true);
    return;
  }
  if (event.code === "Escape" && !alertBox.hidden) dismissAlert();
  else if (event.code === "Escape" && !libraryEdit.hidden) closeLibraryEdit();
  else if (event.code === "Escape" && !savesModal.hidden) closeSaves();
  else if (event.code === "Escape" && !manual.hidden) closeManual();
  else if (event.code === "Escape" && !playChat.hidden) {
    event.preventDefault();
    hideOverlay();
  }
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
      setBanner("A partida ainda não ligou.");
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

chatInput.addEventListener("blur", () => {
  window.clearTimeout(typingIdle);
  localTyping(false);
  chatForm.hidden = true;
});

document.addEventListener("pointerdown", (event) => {
  if (!composing()) return;
  if (event.target instanceof Node && chatForm.contains(event.target)) return;
  leaveComposer();
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || target.isContentEditable) return;
  }
  if (!manual.hidden || !alertBox.hidden || !savesModal.hidden || !libraryEdit.hidden) return;
  const tour = document.querySelector("#tour");
  if (tour instanceof HTMLElement && !tour.hidden) return;
  if (event.code === "KeyC") {
    if (event.repeat || !playChat.hidden) return;
    event.preventDefault();
    holdHistory();
    return;
  }
  if (event.repeat) return;
  if (event.code !== "Enter") return;
  event.preventDefault();
  openComposer();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyC") releaseHistory();
});
window.addEventListener("blur", () => releaseHistory());

whenCrtDrops(() => {
  crtOn = false;
  paintCrt();
  rememberCrt();
});
bindScreen(screen);
if (crtOn && !setCrt(true)) crtOn = false;
paintCrt();

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
  button.addEventListener("click", () => {
    const next = button.dataset.zoom;
    if (next === "fit" || next === "2" || next === "3" || next === "4") {
      zoom = next;
      applyZoom();
    }
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-frame]")) {
  button.addEventListener("click", () => {
    const next = button.dataset.frame;
    if (next !== "fit" && next !== "fill") return;
    if (next === frame) return;
    frame = next;
    applyZoom();
    rememberFrame();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-crt]")) {
  button.addEventListener("click", () => {
    crtOn = !crtOn;
    if (crtOn && !setCrt(true)) crtOn = false;
    if (!crtOn) setCrt(false);
    paintCrt();
    rememberCrt();
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

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mute]")) {
  button.addEventListener("click", () => toggleMute());
}
for (const slider of document.querySelectorAll<HTMLInputElement>("[data-volume]")) {
  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    muted = volume === 0;
    paintVolume();
  });
}

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

const playMenu = document.querySelector<HTMLElement>("#play-menu")!;
const playMenuPanel = document.querySelector<HTMLElement>("#play-menu-panel")!;
const playMenuOpen = document.querySelector<HTMLButtonElement>("#play-menu-open")!;

function setPlayMenu(open: boolean) {
  playMenuPanel.hidden = !open;
  playMenuOpen.setAttribute("aria-expanded", open ? "true" : "false");
}

playMenuOpen.addEventListener("click", (event) => {
  event.stopPropagation();
  setPlayMenu(playMenuPanel.hidden);
});

document.addEventListener("pointerdown", (event) => {
  if (playMenuPanel.hidden) return;
  const target = event.target;
  if (target instanceof Node && playMenu.contains(target)) return;
  setPlayMenu(false);
});

document.addEventListener("fullscreenchange", () => {
  stage.classList.toggle("play-full", document.fullscreenElement === stage && coarsePointer());
  if (!document.fullscreenElement) {
    unlockOrientation();
    setPlayMenu(false);
  }
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
  if (mode !== "drop-slot") dropTarget = null;
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
  } else if (mode === "drop-slot") {
    alertText.textContent = `Apagar o save ${dropTarget?.slot ?? ""}? Ele sai deste navegador. Não tem como desfazer.`;
    alertYes.textContent = "Apagar";
  } else {
    alertText.textContent = `${name} quer reiniciar o jogo. Confirme para os dois voltarem ao começo juntos.`;
    alertYes.textContent = "Confirmar";
  }
  if (alertBox.hidden) reveal(alertBox, "modal");
  (alertYes.hidden ? alertNo : alertYes).focus();
}

function closeAlert() {
  alertMode = null;
  dropTarget = null;
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

const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const COVER_MAX = Math.floor(1.5 * 1024 * 1024);

let editingId: string | null = null;
let pendingCover: { bytes: Uint8Array; type: string } | null = null;
let draftCoverUrl: string | null = null;

function clearDraftCover() {
  if (!draftCoverUrl) return;
  URL.revokeObjectURL(draftCoverUrl);
  draftCoverUrl = null;
}

function showCoverPreview(url: string | null) {
  if (!url) {
    libraryPreview.removeAttribute("src");
    libraryPreview.hidden = true;
    return;
  }
  libraryPreview.src = url;
  libraryPreview.hidden = false;
}

function openLibraryEdit(game: LibraryGame) {
  editingId = game.id;
  pendingCover = null;
  clearDraftCover();
  libraryName.value = game.title;
  libraryFile.value = "";
  showCoverPreview(game.coverUrl);
  reveal(libraryEdit, "modal");
  libraryName.focus();
}

function closeLibraryEdit() {
  editingId = null;
  pendingCover = null;
  clearDraftCover();
  conceal(libraryEdit, "modal");
}

async function saveLibraryEdit() {
  const id = editingId;
  if (!id) return;
  const title = libraryName.value.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!title) {
    setBanner("O jogo precisa de um nome.");
    return;
  }
  try {
    await renameRom(id, title);
    if (pendingCover) await setRomCover(id, pendingCover.bytes, pendingCover.type);
  } catch {
    setBanner("Não deu para guardar o nome ou a capa.");
    return;
  }
  closeLibraryEdit();
  await refreshLibrary();
  setBanner("Jogo atualizado.");
}

tabOnline.addEventListener("click", () => showTab("online"));
tabLocal.addEventListener("click", () => showTab("local"));

libraryFile.addEventListener("change", () => {
  const file = libraryFile.files?.[0];
  if (!file) return;
  if (!COVER_TYPES.has(file.type) || file.size > COVER_MAX) {
    libraryFile.value = "";
    setBanner("A capa precisa ser uma imagem de até 1,5 MB.");
    return;
  }
  void file.arrayBuffer().then((buffer) => {
    if (editingId === null) return;
    pendingCover = { bytes: new Uint8Array(buffer), type: file.type };
    clearDraftCover();
    draftCoverUrl = URL.createObjectURL(file);
    showCoverPreview(draftCoverUrl);
  });
});

document.querySelector("#library-close")!.addEventListener("click", () => closeLibraryEdit());
document.querySelector("#library-cancel")!.addEventListener("click", () => closeLibraryEdit());
document.querySelector("#library-save")!.addEventListener("click", () => void saveLibraryEdit());
libraryEdit.addEventListener("click", (event) => {
  if (event.target === libraryEdit) closeLibraryEdit();
});
libraryName.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void saveLibraryEdit();
});

document.querySelector("#close-play")!.addEventListener("click", () => {
  if (!loadedGame) return;
  if (session) leaveRoom();
  stopPlay("welcome");
  setBanner("");
});

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
  if (mode === "drop-slot") {
    const target = dropTarget;
    closeAlert();
    if (!target) return;
    void (async () => {
      try {
        await forgetSlot(target.gameId, target.slot);
        setBanner(`Save ${target.slot} apagado deste navegador.`);
        await renderSaves();
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Não deu para apagar o save.");
      }
    })();
    return;
  }
  if (mode === "forget") {
    closeAlert();
    void (async () => {
      const game = selected;
      await forgetRom(game.id);
      ready.delete(game.id);
      if (session && loadedGame?.id === game.id) leaveRoom();
      if (loadedGame?.id === game.id) stopPlay();
      if (isLibraryGame(game)) {
        if (editingId === game.id) closeLibraryEdit();
        if (selected.id === game.id) selected = localGame;
        await refreshLibrary();
      } else renderGames();
      updateDrop();
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
      setBanner("A partida ainda não ligou.");
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
        const player = session && port === 0 ? mySlot() + 1 : port + 1;
        setBanner(`Super do jogador ${player}: ${fighterLabel(fighters[port])}.`);
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

let heldControls = 0;

function pump() {
  const mode = session ? "online" : "local";
  const padsNow = readPads(mode);
  const supers = readSupers(mode);
  const bits = padsNow[0] | padsNow[1] | (supers[0] ? 1 << 14 : 0) | (supers[1] ? 1 << 15 : 0);
  const fresh = bits & ~heldControls;
  heldControls = bits;
  if (fresh && composing()) leaveComposer();
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
paintTabs();
renderGames();
renderPeople();
requestAnimationFrame(pump);
startTour();

booting = (async () => {
  try {
    ready = new Set(await storedGames());
    applyLibrary(await listLibrary());
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
    const game = findGame(last) ?? games.find((entry) => ready.has(entry.id));
    if (game && !plainGame(game)) {
      selected = game;
      updateDrop();
    }
    paintTabs();
    renderGames();
    if (game && game.id !== localGame.id && ready.has(game.id)) await openStored(game);
  } catch {
    setBanner("Não deu para abrir o banco deste navegador. A ROM vale só nesta visita.");
  }
})();
