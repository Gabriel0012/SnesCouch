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
  postPresence,
  publishOpenRoom,
  removeFriend,
  uploadSave,
  type AccountUser,
  type DeviceKind,
  type FriendCard,
  type FriendLists,
  type PresenceMode,
  type RoomInvite,
} from "./account.ts";
import cartUrl from "./assets/snes-cart.png";
import marioUrl from "./assets/mario.png";
import luigiUrl from "./assets/luigi.png";
import inviteYesUrl from "./assets/invite-yes.png";
import inviteNoUrl from "./assets/invite-no.png";
import phoneUrl from "./assets/device-phone.png";
import desktopUrl from "./assets/device-desktop.png";
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
import { decodeReplay, encodeReplay, replayFileName } from "./replay-file.ts";
import { canPickRomFolder, chooseRomFolder, findRomInFolder, romFolder } from "./rom-folder.ts";
import {
  canPickFolder,
  chooseFolder,
  deleteReplay,
  ensurePermission,
  listReplays,
  readReplay,
  replayFolder,
  writeReplay,
  type ReplayFolder,
} from "./replay-folder.ts";
import { OnlineSession, SEAT_TAKEN, type Ban, type ChatLine, type Role, type Roster } from "./session.ts";
import { FIGHTERS, LEFT, RIGHT, SELECT, X, fighterLabel, specialSteps, superSteps, type Fighter } from "./supers.ts";
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
const accountCode = document.querySelector<HTMLElement>("#account-code")!;
const copyCode = document.querySelector<HTMLButtonElement>("#copy-code")!;
const myDevice = document.querySelector<HTMLImageElement>("#my-device")!;
const myStatus = document.querySelector<HTMLButtonElement>("#my-status")!;
const myStatusText = myStatus.querySelector("span")!;
const myStatusPick = document.querySelector<HTMLSelectElement>("#my-status-pick")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const foldFriends = document.querySelector<HTMLDetailsElement>("#fold-friends")!;
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
const roomSetup = document.querySelector<HTMLElement>("#room-setup")!;
const roomHost = document.querySelector<HTMLElement>("#room-host")!;
const confirmBox = document.querySelector<HTMLElement>("#confirm")!;
const confirmText = document.querySelector<HTMLElement>("#confirm-text")!;
const confirmYes = document.querySelector<HTMLButtonElement>("#confirm-yes")!;
const confirmNo = document.querySelector<HTMLButtonElement>("#confirm-no")!;
const picture = document.querySelector<HTMLElement>("#picture")!;
const viewport = document.querySelector<HTMLElement>("#viewport")!;
const FRAME_COLORS = [
  { edge: "#1f5bff", ink: "#f4f7ff" },
  { edge: "#e10600", ink: "#fff6f4" },
  { edge: "#f5c518", ink: "#12141a" },
  { edge: "#00a34a", ink: "#06210f" },
];

function paintFrame() {
  const color = FRAME_COLORS[Math.floor(Math.random() * FRAME_COLORS.length)] ?? FRAME_COLORS[0];
  viewport.style.setProperty("--frame", color.edge);
  viewport.style.setProperty("--frame-ink", color.ink);
}
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

const FPS_KEY = "snes-couch-fps";
const fpsBadge = document.querySelector<HTMLElement>("#fps")!;

function storedFps(): boolean {
  try { return localStorage.getItem(FPS_KEY) === "1"; }
  catch { return false; }
}

let fpsOn = storedFps();

const PING_KEY = "snes-couch-ping";
const pingBadge = document.querySelector<HTMLElement>("#ping")!;

function storedPing(): boolean {
  try { return localStorage.getItem(PING_KEY) === "1"; }
  catch { return false; }
}

let pingOn = storedPing();
let pingMs: number | null = null;
let pingDirect = false;

type ShelfTab = "online" | "local";

let shelfTab: ShelfTab = "online";
let library: LibraryGame[] = [];
const coverUrls = new Map<string, string>();
let paintedShelf = "";

let selected: Game = games[0];
let loadedGame: Game | null = null;
let ready = new Set<string>();
let session: OnlineSession | null = null;
let roster: Roster | null = null;
let hostWatching = false;
let bans: Ban[] = [];
let kickTarget: { id: string; name: string } | null = null;
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
type AlertMode = "forget" | "reset-local" | "reset-ask" | "reset-wait" | "reset-in" | "drop-slot" | "drop-replay" | "kick";
const E2E = import.meta.env.VITE_E2E === "1";
const probeWaits: ((ring: [number, number][]) => void)[] = [];

if (E2E) {
  (window as unknown as { __snesTest: unknown }).__snesTest = {
    probe: () => new Promise<[number, number][]>((resolve) => {
      if (!worker) {
        resolve([]);
        return;
      }
      probeWaits.push(resolve);
      worker.postMessage({ t: "probe" });
    }),
  };
}

const CID_KEY = "snes-couch-cid";
const JOIN_KEY = "snes-couch-join-as";
type JoinAs = "play" | "watch";

function clientId(): string {
  try {
    const saved = localStorage.getItem(CID_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(CID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

const cid = clientId();

function storedJoin(): JoinAs | null {
  try {
    const value = localStorage.getItem(JOIN_KEY);
    return value === "play" || value === "watch" ? value : null;
  } catch {
    return null;
  }
}

function rememberJoin(choice: JoinAs) {
  try { localStorage.setItem(JOIN_KEY, choice); }
  catch { /* a escolha vale só nesta visita */ }
}
let alertMode: AlertMode | null = null;
let dropTarget: { gameId: string; slot: number } | null = null;
let importSlot: number | null = null;
let inviteTimer = 0;
let inviteTick = 0;
const IDLE_MS = 15 * 60 * 1000;
let lastInput = Date.now();
let presenceTimer = 0;
let lastBeatAt = 0;
let lastBeatKind = "";
let myMode: PresenceMode = "auto";
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

/** Cores do controle do SNES: amarelo alerta, vermelho erro, azul informa, verde sucesso. */
type BannerTone = "warn" | "error" | "info" | "success";

function clearBanner() {
  window.clearTimeout(bannerTimer);
  conceal(banner, "up");
}

function setBanner(text: string, tone: BannerTone) {
  if (text.length === 0) {
    clearBanner();
    return;
  }
  window.clearTimeout(bannerTimer);
  bannerText.textContent = text;
  banner.dataset.tone = tone;
  reveal(banner, "up", true);
  bannerTimer = window.setTimeout(clearBanner, 5000);
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

const coverExtensions: Record<string, string> = {
  "final-fight-3": "jpg",
  "pocky-rocky-2": "jpg",
  "mighty-morphin-power-rangers-the-movie": "jpg",
  "king-of-dragons": "jpg",
  "super-mario-world": "jpg",
  "donkey-kong-country": "jpg",
  "donkey-kong-country-3": "jpg",
  "contra-iv-the-alien-wars": "jpg",
  "legend-of-the-mystical-ninja": "jpg",
  "new-super-mario-land": "jpg",
  "run-saber": "jpg",
  "secret-of-mana": "jpg",
  "super-double-dragon": "jpg",
  "teenage-mutant-ninja-turtles-iv-turtles-in-time": "jpg",
};

function coverOf(id: string) {
  return `/covers/${id}.${coverExtensions[id] ?? "svg"}`;
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
  void stopRecording(false);
  dropReplay();
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
  fpsBadge.textContent = "";
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
  if (record && isLibraryGame(game)) {
    if (!looksLikeSnesRom(record.bytes.length)) {
      await forgetRom(game.id);
      ready.delete(game.id);
      if (selected.id === game.id) selected = localGame;
      await refreshLibrary();
      setBanner("A ROM gravada n?o parece de Super Nintendo. Solta o arquivo de novo.", "error");
      return;
    }
    await boot(game, record.bytes);
    return;
  }
  if (record) {
    const matched = await matchRom(record.bytes);
    if (matched?.game.id === game.id) {
      await boot(matched.game, matched.rom);
      return;
    }
    await forgetRom(game.id);
    ready.delete(game.id);
    renderGames();
  }
  roomState.textContent = game.title + ". Procurando a ROM na pasta escolhida?";
  const fromFolder = await findRomInFolder(game);
  if (fromFolder) {
    await boot(game, fromFolder);
    return;
  }
  stopPlay();
  const folder = await romFolder();
  roomState.textContent = folder
    ? game.title + ". N?o encontrei uma ROM com o SHA-1 correto na pasta escolhida. Solte o arquivo para abrir."
    : game.title + ". Solte a ROM uma vez, ou escolha uma pasta nas configura??es.";
}

async function keepCatalog(game: Game, rom: Uint8Array) {
  try {
    await saveRom(game.id, game.sha1, rom);
    ready.add(game.id);
  } catch {
    setBanner("A ROM abriu, mas não ficou gravada neste navegador.", "warn");
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
    setBanner("A ROM abriu, mas não ficou gravada neste navegador.", "warn");
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
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.", "error");
    return;
  }
  setBanner("Conferindo o arquivo…", "info");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (plainGame()) {
    if (!looksLikeSnesRom(bytes.length)) {
      setBanner("Esse arquivo não parece uma ROM de Super Nintendo. Nada foi enviado.", "error");
      return;
    }
    const matched = await matchRom(bytes);
    if (matched) {
      await keepCatalog(matched.game, matched.rom);
      setBanner(`${matched.game.title} entrou nos jogos online.`, "success");
      return;
    }
    await keepLibrary(bytes, await sha1Of(bytes), file.name);
    return;
  }
  const matched = await matchRom(bytes);
  if (!matched || matched.game.id !== selected.id) {
    if (matched) setBanner(`Esse arquivo é ${matched.game.title}. Escolhe esse jogo na lista, ou solta a ROM de ${selected.title}.`, "warn");
    else setBanner("Esse arquivo não é a versão USA esperada. Nada foi enviado.", "error");
    return;
  }
  await keepCatalog(matched.game, matched.rom);
}

async function boot(game: Game, rom: Uint8Array) {
  if (!crossOriginIsolated) {
    setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.", "error");
    return;
  }
  if (loadedGame?.id === game.id && worker) {
    roomState.textContent = playingLine(game);
    return;
  }
  try { await speaker.resume(); } catch { /* o áudio espera um clique */ }
  stopPlay();
  romBytes = rom.slice();
  startWorker(romBytes, game);
  loadedGame = game;
  selected = game;
  screen.hidden = false;
  conceal(drop, "down");
  conceal(welcome, "down");
  reveal(picture, "down");
  clearBanner();
  roomState.textContent = playingLine(game);
  renderGames();
  await renderSaves();
}

function startWorker(rom: Uint8Array, game: Game, net: ResetNet = null) {
  const plain = plainGame(game);
  const fight = game.id === "final-fight-3";
  sab = new SharedArrayBuffer(4);
  pads = new Uint16Array(sab);
  const canvas = screen.transferControlToOffscreen();
  transferred = true;
  worker?.terminate();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event) => onWorker(event.data);
  const copy = rom.slice();
  worker.postMessage(
    { t: "load", rom: copy.buffer, canvas, sab, plain, fight, probe: E2E, ...(net && !plain ? { net } : {}) },
    [copy.buffer, canvas],
  );
}

function kickReset(net: ResetNet) {
  window.clearTimeout(resetTimer);
  resetNet = net;
  if (!romBytes || !loadedGame) {
    setBanner("Solte a ROM antes de reiniciar.", "warn");
    return;
  }
  if (!worker || relaunching) {
    relaunch(net);
    return;
  }
  worker.postMessage(net ? { t: "reset", slot: net.slot, delay: net.delay } : { t: "reset" });
  resetTimer = window.setTimeout(() => relaunch(net), 700);
  setBanner(net ? "Jogo reiniciado nos dois." : "Jogo reiniciado.", "success");
}

function relaunch(net: ResetNet) {
  if (!romBytes || !loadedGame) return;
  window.clearTimeout(resetTimer);
  resetNet = net;
  relaunching = true;
  const rom = romBytes;
  const game = loadedGame;
  void stopRecording(false);
  dropReplay();
  worker?.terminate();
  worker = null;
  if (transferred) replaceScreen();
  startWorker(rom, game, net);
  loadedGame = game;
  setBanner(net ? "Jogo reiniciado nos dois." : "Jogo reiniciado.", "success");
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
  fps?: number;
}) {
  if (message.t === "fps" && message.fps !== undefined) {
    if (fpsOn) fpsBadge.textContent = `${Math.round(message.fps)} FPS`;
    return;
  }
  if (message.t.startsWith("rec-") || message.t.startsWith("replay-")) {
    onReplayMessage(message as unknown as ReplayMessage);
    return;
  }
  if (message.t === "probe") {
    const ring = (message as unknown as { ring?: [number, number][] }).ring ?? [];
    for (const wait of probeWaits.splice(0)) wait(ring);
    return;
  }
  if (message.t === "watch-state" && message.state && message.frame !== undefined) {
    if (hostWatching) session?.sendWatchState(message.frame, new Uint8Array(message.state));
    return;
  }
  if (message.t === "watch-frames" && Array.isArray(message.frames)) {
    if (hostWatching) session?.sendWatchFrames(message.frames as unknown as number[]);
    return;
  }
  if (message.t === "loaded" && message.rate) {
    if (session?.role === "spectator") worker?.postMessage({ t: "watch-mode" });
    hostWatching = false;
    syncHostWatch();
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
  if (message.t === "restored") {
    if (replayLeaving) {
      replayLeaving = false;
      setBanner("Replay fechado. O jogo voltou de onde parou.", "info");
    } else setBanner("Save carregado.", "success");
  }
  if (message.t === "error") {
    if (message.message === "O núcleo não aceitou essa ROM." && loadedGame && isLibraryGame(loadedGame)) {
      void dropRejectedLocal();
      return;
    }
    if (message.message === "Não deu para reiniciar o jogo." && !relaunching) relaunch(resetNet);
    else setBanner(message.message ?? "Falha no núcleo.", "error");
  }
}

function compare(frame: number) {
  if (!localChecks.has(frame) || !remoteChecks.has(frame)) return;
  if (localChecks.get(frame) !== remoteChecks.get(frame)) {
    worker?.postMessage({ t: "stop" });
    session?.close();
    setBanner("A partida dessincronizou e foi encerrada. Cria a sala de novo.", "error");
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
const specialDown = [false, false];
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
let touchChrome = false;

function composing() {
  return document.activeElement === chatInput;
}

function chatDocked() {
  return touchChrome && !picture.hidden && !chatInput.disabled;
}

function syncChatDock() {
  const dock = chatDocked();
  playChat.classList.toggle("docked", dock);
  if (!dock) return;
  playChat.hidden = false;
  if (!peeking) chatForm.hidden = false;
}

function setTouchChrome(open: boolean) {
  touchChrome = open;
  if (chatDocked() || (composing() && !picture.hidden && !chatInput.disabled)) {
    playChat.classList.add("docked");
    playChat.hidden = false;
    if (!peeking) chatForm.hidden = false;
    return;
  }
  playChat.classList.remove("docked");
  if (peeking || chatTimer) return;
  chatForm.hidden = true;
  playChat.hidden = true;
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
  const dock = chatDocked();
  const writing = mode === "compose" || composing() || dock;
  chatForm.hidden = mode === "history" && !dock ? true : !writing;
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
  if (chatDocked()) {
    playChat.hidden = false;
    chatForm.hidden = false;
    playChat.classList.add("docked");
    if (composing()) {
      chatInput.blur();
      localTyping(false);
    }
    return;
  }
  chatForm.hidden = true;
  playChat.hidden = true;
  playChat.classList.remove("docked");
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
  if (chatDocked()) {
    chatForm.hidden = false;
    playChat.hidden = false;
    return;
  }
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
  if (!chatDocked()) chatForm.hidden = true;
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
  if (line.from === "spectator") {
    row.classList.add("from-watcher");
    const eye = document.createElement("i");
    eye.className = "chat-eye";
    eye.title = "Assistindo";
    row.append(eye);
  } else if (line.slot === 0 || line.slot === 1) {
    const chip = document.createElement("i");
    chip.className = `chat-slot p${line.slot + 1}`;
    chip.textContent = `P${line.slot + 1}`;
    row.append(chip);
  }
  const who = document.createElement("b");
  const name = line.name?.trim();
  who.textContent = name || (line.from === "host" ? "Anfitrião" : line.from === "guest" ? "Convidado" : "Espectador");
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
  if (!on) {
    playChat.classList.remove("docked");
    hideOverlay();
    return;
  }
  syncChatDock();
}

function setRoomCode(code: string | null) {
  shown(roomCode, !!code, "up");
  shown(roomTitle, !code, "up");
  roomCode.textContent = code ?? "";
}

function ownerMark(): string {
  if (!session) return "";
  const code = roomCode.textContent?.trim() || "";
  const name = session.role === "host" ? roomName().trim() : (roster?.host.name ?? "").trim();
  return name || code;
}

function paintHostMark() {
  const label = ownerMark();
  roomHost.textContent = label;
  roomHost.hidden = !label;
}

function stopHostWatch() {
  if (!hostWatching) return;
  hostWatching = false;
  worker?.postMessage({ t: "watch-stop" });
}

function syncHostWatch() {
  const want = session?.role === "host" && !!roster && roster.spectators.length > 0;
  if (want === hostWatching) return;
  if (!want) {
    stopHostWatch();
    return;
  }
  hostWatching = true;
  worker?.postMessage({ t: "watch-start" });
}

const seatMode = document.querySelector<HTMLElement>("#seat-mode")!;
const bansOpen = document.querySelector<HTMLButtonElement>("#bans-open")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

function watchingRoom(): boolean {
  return session?.role === "spectator";
}

function paintRoomRole() {
  const role = session?.role ?? null;
  shown(seatMode, role === "guest" || role === "spectator", "left");
  for (const button of seatMode.querySelectorAll<HTMLButtonElement>("[data-seat-mode]")) {
    const on = button.dataset.seatMode === (role === "spectator" ? "watch" : "play");
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  bansOpen.hidden = role !== "host";
  resetButton.disabled = role === "spectator";
  swapButton.hidden = role === "spectator";
  peopleKey = "";
  renderPeople();
}

function switchSeat(choice: JoinAs) {
  if (!session || session.role === "host") return;
  const now: JoinAs = session.role === "spectator" ? "watch" : "play";
  if (choice === now) return;
  const code = roomCode.textContent?.trim() || "";
  if (!code) return;
  rememberJoin(choice);
  void connect(choice === "watch" ? "spectator" : "guest", code);
}

function paintBans() {
  bansOpen.textContent = bans.length ? `Bloqueados (${bans.length})` : "Bloqueados";
  const list = document.querySelector<HTMLElement>("#bans-list")!;
  list.replaceChildren();
  if (bans.length === 0) {
    const empty = document.createElement("li");
    empty.className = "bans-empty";
    empty.textContent = "Ninguém bloqueado.";
    list.append(empty);
    return;
  }
  for (const ban of bans) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = ban.name;
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "Desbloquear";
    undo.addEventListener("click", () => session?.unban(ban.cid));
    item.append(name, undo);
    list.append(item);
  }
}

function setRoomChrome(on: boolean) {
  if (on) paintFrame();
  else {
    viewport.style.removeProperty("--frame");
    viewport.style.removeProperty("--frame-ink");
  }
  viewport.classList.toggle("in-room", on);
  shown(roomSetup, !on, "left");
  shown(leaveButton, on, "left");
  paintHostMark();
}

let shownPads = "";

function padKey(): string {
  const [first, second] = connectedPads();
  const who = session ? `sala:${mySlot()}` : `local:${localSwap}`;
  return `${who}:${selected.id}:${first?.id ?? ""}:${second?.id ?? ""}`;
}

function fillManual() {
  shownPads = padKey();
  const pads = connectedPads();
  const online = !!session;
  const mine = mySlot();
  const players = online
    ? [{ slot: mine, pad: pads[0], keys: 0 as const }]
    : ([0, 1] as const)
      .map((index) => ({ slot: (localSwap ? 1 - index : index) as 0 | 1, pad: pads[index], keys: keyboardScheme(index, pads) }))
      .sort((a, b) => a.slot - b.slot);
  const note = [selected.title + "."];
  if (plainGame()) note.push("Partida só nesta máquina. Os controles ligados entram nos dois jogadores.");
  if (online) note.push("Na sala, este manual mostra só o controle desta máquina.");
  if (selected.id === "final-fight-3") {
    note.push("Select junto com o Super troca Haggar e Guy, Lucia ou Dean. Haggar, Guy e Dean precisam estar segurando o inimigo.");
    note.push("O X faz o golpe. No Dean, Baixo junto puxa de longe. Na Lucia, Cima junto é o chute de fogo.");
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

function kickButton(id: string, name: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "kick-btn";
  button.title = "Remover da sala";
  button.setAttribute("aria-label", `Remover ${name} da sala`);
  button.textContent = "×";
  button.addEventListener("click", () => {
    if (alertMode) return;
    kickTarget = { id, name };
    openAlert("kick", name);
  });
  return button;
}

function playerLine(seat: string, name: string, control: string, state: string, slot: 0 | 1, kickId = "") {
  const item = document.createElement("li");
  item.dataset.seat = seat;
  const kind = kindFromLabel(control);
  if (kind) item.append(padIcon(kind));
  const chip = document.createElement("span");
  chip.className = `slot-chip p${slot + 1}`;
  chip.textContent = `P${slot + 1}`;
  item.append(chip);
  const text = document.createElement("span");
  const who = document.createElement("b");
  who.textContent = name;
  const meta = document.createElement("small");
  meta.textContent = `${control} · ${state}`;
  text.append(who, meta);
  item.append(text);
  if (kickId) item.append(kickButton(kickId, name));
  return item;
}

const watchersBox = document.querySelector<HTMLElement>("#watchers-box")!;
const watchersList = document.querySelector<HTMLElement>("#watchers")!;

function renderWatchers() {
  const list = session && roster ? roster.spectators : [];
  watchersBox.hidden = list.length === 0;
  watchersList.replaceChildren();
  const host = session?.role === "host";
  for (const watcher of list) {
    const item = document.createElement("li");
    const chip = document.createElement("span");
    chip.className = "eye-chip";
    chip.title = "Assistindo";
    chip.setAttribute("aria-label", "Assistindo");
    const who = document.createElement("b");
    const fallback = "Espectador";
    who.textContent = watcher.name || fallback;
    item.append(chip, who);
    if (host) item.append(kickButton(watcher.id, watcher.name || fallback));
    watchersList.append(item);
  }
}

const swapItem = document.createElement("li");
swapItem.className = "swap-line";
const swapButton = document.createElement("button");
swapButton.type = "button";
swapButton.className = "swap-btn";
swapButton.title = "Trocar jogadores";
swapButton.setAttribute("aria-label", "Trocar jogadores");
swapButton.addEventListener("click", () => askSwap());
swapItem.append(swapButton);

let localSwap = false;

interface Lineup {
  room: boolean;
  slots: string;
  present: number;
}

let lineup: Lineup | null = null;
let fadingOut = false;

function hostSlotNow(): 0 | 1 {
  if (!session || !roster) return 0;
  const mine = session.playSlot();
  if (session.role === "host") return mine;
  if (session.role === "guest") return mine === 0 ? 1 : 0;
  return roster.hostSlot;
}

function currentLineup(): Lineup {
  if (!session || !roster) return { room: false, slots: `local:${localSwap}`, present: 2 };
  const present = Number(session.role === "host" || roster.host.here) + Number(session.role === "guest" || roster.guest.here);
  return { room: true, slots: `sala:${hostSlotNow()}`, present };
}

/** Animate only on the first paint, a swap, or someone arriving; any other update repaints in place. */
function lineupChanged(next: Lineup): boolean {
  const prev = lineup;
  lineup = next;
  if (!prev) return true;
  if (!prev.room && next.room) return true;
  if (prev.room !== next.room) return false;
  return prev.slots !== next.slots || next.present > prev.present;
}

function seatRows(): [HTMLLIElement, HTMLLIElement] {
  if (!session || !roster) {
    const [first, second] = padStatus();
    const slotA: 0 | 1 = localSwap ? 1 : 0;
    const slotB: 0 | 1 = localSwap ? 0 : 1;
    const a = playerLine("a", roomName() || `Jogador ${slotA + 1}`, first ?? "Teclado", "nesta máquina", slotA);
    const b = playerLine("b", `Jogador ${slotB + 1}`, second ?? "Teclado", "nesta máquina", slotB);
    return localSwap ? [b, a] : [a, b];
  }
  const you = session.role;
  const hostSlot = hostSlotNow();
  const guestKick = you === "host" && roster.guest.here && roster.guest.id ? roster.guest.id : "";
  const seats = [
    { id: "host", slot: hostSlot, seat: roster.host, mine: you === "host", fallback: "Anfitrião", absent: "saiu", kick: "" },
    { id: "guest", slot: (hostSlot === 0 ? 1 : 0) as 0 | 1, seat: roster.guest, mine: you === "guest", fallback: "Convidado", absent: "aguardando", kick: guestKick },
  ].sort((a, b) => a.slot - b.slot);
  const [top, bottom] = seats.map((row) => {
    const present = row.mine || row.seat.here;
    const state = row.mine ? "você" : row.seat.here ? "na sala" : row.absent;
    return playerLine(
      row.id,
      row.seat.name || row.fallback,
      present ? row.seat.control || "Teclado" : "—",
      state,
      row.slot,
      row.kick,
    );
  });
  return [top, bottom];
}

function renderPeople() {
  const [first, second] = padStatus();
  const watchers = roster?.spectators.map((watcher) => `${watcher.id}=${watcher.name}`).join(",") ?? "";
  const key = session && roster
    ? `sala:${session.role}:${session.playSlot()}:${roster.hostSlot}:${roster.host.here}:${roster.host.control}:${roster.host.name}:${roster.guest.here}:${roster.guest.control}:${roster.guest.name}:${roster.guest.id ?? ""}:${watchers}`
    : `local:${localSwap}:${roomName()}:${first ?? ""}:${second ?? ""}`;
  if (key === peopleKey) return;
  peopleKey = key;
  renderWatchers();
  const fade = lineupChanged(currentLineup()) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (fadingOut) return;
  const old = [...people.querySelectorAll<HTMLElement>("li[data-seat]")];
  if (!fade || old.length === 0) {
    paintSeats(fade);
    return;
  }
  fadingOut = true;
  const outs = old.map((row) => row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" }));
  void Promise.all(outs.map((anim) => anim.finished)).catch(() => undefined).then(() => {
    fadingOut = false;
    paintSeats(true);
  });
}

/** Reads the seats when it runs, so updates that land during the fade-out show up in this paint. */
function paintSeats(fade: boolean) {
  const rows = seatRows();
  for (const child of [...people.children]) {
    if (child !== swapItem) child.remove();
  }
  if (swapItem.parentElement !== people) people.append(swapItem);
  people.insertBefore(rows[0], swapItem);
  people.append(rows[1]);
  if (!fade) return;
  for (const row of rows) row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
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
    setBanner(error instanceof Error ? error.message : "A nuvem não respondeu.", "error");
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
    setBanner("Solte a ROM antes de abrir os saves.", "warn");
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
    if (cloud) setBanner(`Save ${slot} gravado na conta, ${shotNote}.`, "success");
    else if (account && cloudSaves) setBanner(`Save ${slot} gravado neste navegador. A nuvem não respondeu.`, "warn");
    else setBanner(`Save ${slot} gravado, ${shotNote}.`, "success");
    await renderSaves();
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Não deu para gravar o save.", "error");
  }
}

async function downloadSlot(game: Game, slot: number, savedAt: number, shot: Uint8Array | null) {
  const state = await loadState(game.id, slot);
  if (!state) {
    setBanner("Esse save não está mais neste navegador.", "error");
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
    setBanner("Esse arquivo é grande demais para ser um save.", "error");
    return;
  }
  let parsed: ReturnType<typeof decodeSaveFile>;
  try {
    parsed = decodeSaveFile(await file.text());
  } catch {
    setBanner("Não deu para ler esse arquivo.", "error");
    return;
  }
  if (!parsed) {
    setBanner("Esse arquivo não é um save deste emulador.", "error");
    return;
  }
  if (!game.sha1 || parsed.sha1 !== game.sha1) {
    setBanner(parsed.title ? `Esse save é de ${parsed.title}.` : "Esse save é de outra ROM.", "error");
    return;
  }
  const taken = (await saveList(game.id)).some((item) => item.slot === slot);
  if (taken) {
    setBanner(`O slot ${slot} já tem um save.`, "warn");
    await renderSaves();
    return;
  }
  try {
    await saveState(game.id, slot, parsed.state, parsed.shot, "local", parsed.savedAt);
    setBanner(`Save ${slot} importado.`, "success");
    await renderSaves();
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Não deu para importar o save.", "error");
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
  if (watchingRoom()) {
    setBanner("Quem assiste não carrega save na partida.", "warn");
    return;
  }
  closeSaves(true);
  const state = await loadState(game.id, slot);
  if (!state) return;
  if (!session) {
    const copy = state.slice();
    worker.postMessage({ t: "restore", state: copy.buffer }, [copy.buffer]);
    return;
  }
  if (!session.linked()) {
    setBanner("A partida ainda não ligou.", "warn");
    return;
  }
  if (saveDialog) return;
  saveDialog = { kind: "offer", state, label: when(savedAt) };
  showConfirm(`Carregar o save de ${when(savedAt)} nos dois?`, "both");
}

interface ReplayMessage {
  t: string;
  at?: number;
  frame?: number;
  fight?: boolean;
  state?: ArrayBuffer;
  pads?: number[];
  hashes?: number[];
  pos?: number;
  total?: number;
  indexed?: number;
  playing?: boolean;
  busy?: boolean;
}

interface Recording {
  game: Game;
  folder: ReplayFolder;
  startedAt: number;
  firstFrame: number;
  fight: boolean;
  pads: number[];
  segments: { at: number; state: Uint8Array }[];
  hashes: number[];
  stopping: boolean;
}

const SNES_FPS = 60.0988;
const recButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-rec]")];
const replaysModal = document.querySelector<HTMLElement>("#replays-modal")!;
const replaysList = document.querySelector<HTMLElement>("#replays-list")!;
const replaysWhere = document.querySelector<HTMLElement>("#replays-where")!;
const replaysFolderLabel = document.querySelector<HTMLElement>("#replays-folder")!;
const replaysOpen = document.querySelector<HTMLButtonElement>("#replays-open")!;
const replayBar = document.querySelector<HTMLElement>("#replay-bar")!;
const replayToggle = document.querySelector<HTMLButtonElement>("#replay-toggle")!;
const replaySeek = document.querySelector<HTMLInputElement>("#replay-seek")!;
const replayClock = document.querySelector<HTMLElement>("#replay-clock")!;
let rec: Recording | null = null;
let recDone: (() => void) | null = null;
let replayOn = false;
let replayLeaving = false;
let replayCheckpoint: Uint8Array | null = null;
let replayPos = 0;
let replayTotal = 0;
let replayPlaying = false;
let replayScrubbing = false;
let replaySeekSent = 0;
let replaySeekTimer = 0;
let dropReplayName: string | null = null;

function clock(frames: number): string {
  const seconds = Math.max(0, Math.floor(frames / SNES_FPS));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  if (hours) return `${hours}:${String(minutes % 60).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

function recFrames(recording: Recording): number {
  return recording.pads.length >> 1;
}

function paintRec() {
  const can = canPickFolder();
  const live = !!rec && !rec.stopping;
  for (const button of recButtons) {
    button.hidden = !can;
    button.disabled = replayOn || !!rec?.stopping;
    button.classList.toggle("on", live);
    button.setAttribute("aria-pressed", live ? "true" : "false");
    const label = button.querySelector("span");
    if (label) label.textContent = live && rec ? `Parar · ${clock(recFrames(rec))}` : "Gravar";
  }
}

async function paintReplayFolder() {
  if (!canPickFolder()) {
    replaysFolderLabel.textContent = "Este navegador não grava replays. Use o Chrome ou o Edge no computador.";
    replaysOpen.textContent = "Replays";
    replaysOpen.disabled = true;
    return;
  }
  const folder = await replayFolder();
  replaysFolderLabel.textContent = folder ? folder.name : "Nenhuma pasta escolhida";
  replaysOpen.textContent = folder ? "Replays" : "Escolher pasta";
  replaysOpen.disabled = false;
}

/** Runs inside the click, so the browser can ask for the folder. */
async function readyFolder(): Promise<ReplayFolder | null> {
  let folder = await replayFolder();
  if (folder && !(await ensurePermission(folder))) folder = null;
  if (!folder) folder = await chooseFolder();
  if (folder && !(await ensurePermission(folder))) folder = null;
  await paintReplayFolder();
  return folder;
}

async function toggleRec() {
  setPlayMenu(false);
  if (rec) {
    if (!rec.stopping) await stopRecording(true);
    return;
  }
  const game = loadedGame;
  if (!worker || !game) {
    setBanner("Solte a ROM antes de gravar.", "warn");
    return;
  }
  if (replayOn) return;
  const folder = await readyFolder();
  if (!folder) {
    setBanner("Escolha uma pasta para guardar os replays.", "warn");
    return;
  }
  if (!worker || loadedGame?.id !== game.id || rec) return;
  rec = { game, folder, startedAt: Date.now(), firstFrame: 0, fight: false, pads: [], segments: [], hashes: [], stopping: false };
  worker.postMessage({ t: "rec-start" });
  paintRec();
  setBanner(`Gravando o replay na pasta ${folder.name}.`, "info");
}

/** `flush` waits for the frames still inside the worker; without it, what arrived so far is saved. */
async function stopRecording(flush: boolean) {
  const recording = rec;
  if (!recording || recording.stopping) return;
  recording.stopping = true;
  paintRec();
  if (flush && worker) {
    const target = worker;
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 1500);
      recDone = () => {
        window.clearTimeout(timer);
        resolve();
      };
      target.postMessage({ t: "rec-stop" });
    });
    recDone = null;
  } else worker?.postMessage({ t: "rec-stop" });
  if (rec === recording) rec = null;
  paintRec();
  await saveRecording(recording);
}

async function saveRecording(recording: Recording) {
  const frames = recFrames(recording);
  const segments = recording.segments.filter((segment) => segment.at < frames);
  if (frames < 2 || segments.length === 0 || segments[0].at !== 0) {
    setBanner("O replay ficou vazio e não foi gravado.", "warn");
    return;
  }
  const { game, folder } = recording;
  try {
    const file = await encodeReplay({
      header: {
        v: 1,
        gameId: game.id,
        title: game.title,
        sha1: game.sha1,
        fight: recording.fight,
        startedAt: recording.startedAt,
        firstFrame: recording.firstFrame,
        frames,
      },
      pads: Uint16Array.from(recording.pads),
      segments,
      hashes: Uint32Array.from(recording.hashes),
    });
    await writeReplay(folder, replayFileName(game.title, recording.startedAt), file);
    setBanner(`Replay de ${clock(frames)} gravado na pasta ${folder.name}.`, "success");
  } catch {
    setBanner(`Não deu para gravar o replay na pasta ${folder.name}.`, "error");
  }
  if (!replaysModal.hidden) await paintReplays();
}

function onReplayMessage(message: ReplayMessage) {
  if (message.t === "rec-state" && message.state && rec) {
    const at = message.at ?? 0;
    const state = new Uint8Array(message.state);
    if (rec.segments.length === 0) {
      rec.firstFrame = message.frame ?? 0;
      rec.fight = message.fight === true;
    }
    const last = rec.segments[rec.segments.length - 1];
    if (last && last.at === at) last.state = state;
    else rec.segments.push({ at, state });
    return;
  }
  if (message.t === "rec-frames" && rec) {
    for (const value of message.pads ?? []) rec.pads.push(value & 0xffff);
    for (const value of message.hashes ?? []) rec.hashes.push(value >>> 0);
    if (!rec.stopping) paintRec();
    return;
  }
  if (message.t === "rec-done") {
    recDone?.();
    return;
  }
  if (message.t === "replay-pos" && replayOn) {
    replayPos = message.pos ?? 0;
    replayTotal = message.total ?? replayTotal;
    replayPlaying = message.playing === true;
    paintReplayBar(message.indexed ?? 0, message.busy === true);
    return;
  }
  if (message.t === "replay-desync" && replayOn) {
    setBanner("Esse replay saiu do sincronismo. Ele pode ter sido gravado com outra versão do emulador.", "warn");
  }
}

function paintReplayBar(indexed = 0, busy = false) {
  replayBar.hidden = !replayOn;
  paintRec();
  if (!replayOn) return;
  replayToggle.textContent = replayPlaying ? "Pausar" : "Tocar";
  replaySeek.max = String(Math.max(1, replayTotal));
  if (!replayScrubbing) replaySeek.value = String(Math.max(1, replayPos));
  replaySeek.style.setProperty("--indexed", `${replayTotal ? Math.min(100, (indexed / replayTotal) * 100) : 0}%`);
  replaySeek.classList.toggle("busy", busy);
  const shown = replayScrubbing ? Number(replaySeek.value) : replayPos;
  replayClock.textContent = `${clock(shown)} / ${clock(replayTotal)}`;
}

function closeReplays(immediate = false) {
  if (immediate) replaysModal.hidden = true;
  else conceal(replaysModal, "modal");
}

async function openReplays() {
  closeSettings(true);
  if (!canPickFolder()) return;
  const folder = await readyFolder();
  if (!folder) {
    setBanner("Escolha uma pasta para guardar os replays.", "warn");
    return;
  }
  reveal(replaysModal, "modal");
  document.querySelector<HTMLButtonElement>("#replays-close")?.focus();
  await paintReplays();
}

function replayRow(text: string): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "replays-empty";
  row.textContent = text;
  return row;
}

async function paintReplays() {
  const folder = await replayFolder();
  replaysWhere.textContent = folder ? `Pasta: ${folder.name}` : "Nenhuma pasta escolhida";
  if (!folder) {
    replaysList.replaceChildren();
    return;
  }
  const game = loadedGame;
  if (!game) {
    replaysList.replaceChildren(replayRow("Abra um jogo para ver os replays dele."));
    return;
  }
  let entries: Awaited<ReturnType<typeof listReplays>>;
  try {
    entries = await listReplays(folder, game.sha1);
  } catch {
    replaysList.replaceChildren(replayRow("Não deu para ler a pasta."));
    return;
  }
  if (entries.length === 0) {
    replaysList.replaceChildren(replayRow(`Nenhum replay de ${game.title} nesta pasta.`));
    return;
  }
  replaysList.replaceChildren(
    ...entries.map((entry) => {
      const row = document.createElement("li");
      row.dataset.replay = entry.name;
      const text = document.createElement("span");
      const title = document.createElement("b");
      title.textContent = entry.header.startedAt ? when(entry.header.startedAt) : entry.name;
      const meta = document.createElement("small");
      meta.textContent = `${clock(entry.header.frames)} · ${(entry.size / 1024).toFixed(0)} KB`;
      text.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "replay-actions";
      const play = document.createElement("button");
      play.type = "button";
      play.className = "replay-play";
      play.textContent = "Assistir";
      play.addEventListener("click", () => void playReplay(entry.name));
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "replay-drop";
      drop.textContent = "Apagar";
      drop.addEventListener("click", () => askDropReplay(entry.name));
      actions.append(play, drop);
      row.append(text, actions);
      return row;
    }),
  );
}

function askDropReplay(name: string) {
  if (alertMode) return;
  dropReplayName = name;
  openAlert("drop-replay");
}

async function removeReplay(name: string) {
  const folder = await replayFolder();
  if (!folder) return;
  try {
    await deleteReplay(folder, name);
    setBanner("Replay apagado da pasta.", "success");
  } catch {
    setBanner("Não deu para apagar o replay.", "error");
  }
  await paintReplays();
}

async function playReplay(name: string) {
  const game = loadedGame;
  if (!game || !worker) {
    setBanner("Abra o jogo antes de assistir o replay.", "warn");
    return;
  }
  if (session) {
    setBanner("Saia da sala para assistir um replay.", "warn");
    return;
  }
  if (rec) {
    setBanner("Pare a gravação antes de assistir um replay.", "warn");
    return;
  }
  const folder = await replayFolder();
  if (!folder) return;
  let replay: Awaited<ReturnType<typeof decodeReplay>> = null;
  try {
    replay = await decodeReplay(await readReplay(folder, name));
  } catch {
    replay = null;
  }
  if (!replay) {
    setBanner("Esse arquivo não é um replay deste emulador.", "error");
    return;
  }
  if (replay.header.sha1 !== game.sha1) {
    setBanner(replay.header.title ? `Esse replay é de ${replay.header.title}.` : "Esse replay é de outra ROM.", "error");
    return;
  }
  closeReplays(true);
  if (!replayOn) {
    const snapshot = await askCheckpoint();
    if (loadedGame?.id !== game.id || !worker) return;
    replayCheckpoint = snapshot.state.length ? snapshot.state : null;
  }
  replayOn = true;
  replayPos = 0;
  replayTotal = replay.header.frames;
  replayPlaying = true;
  replayScrubbing = false;
  paintSpeed(1);
  const segments = replay.segments.map((segment) => ({ at: segment.at, state: segment.state.buffer as ArrayBuffer }));
  worker.postMessage(
    {
      t: "replay-load",
      pads: replay.pads.buffer,
      segments,
      hashes: replay.hashes.buffer,
      firstFrame: replay.header.firstFrame,
      fight: replay.header.fight,
    },
    [replay.pads.buffer as ArrayBuffer, replay.hashes.buffer as ArrayBuffer, ...segments.map((segment) => segment.state)],
  );
  paintReplayBar();
  setBanner(`Replay de ${when(replay.header.startedAt || Date.now())}.`, "info");
}

/** The worker is gone or about to go: just forget the replay. */
function dropReplay() {
  replayOn = false;
  replayLeaving = false;
  replayCheckpoint = null;
  window.clearTimeout(replaySeekTimer);
  paintReplayBar();
}

function exitReplay() {
  if (!replayOn) return;
  const checkpoint = replayCheckpoint;
  dropReplay();
  worker?.postMessage({ t: "replay-exit" });
  if (checkpoint) {
    replayLeaving = true;
    const copy = checkpoint.slice();
    worker?.postMessage({ t: "restore", state: copy.buffer }, [copy.buffer]);
  } else worker?.postMessage({ t: "local" });
}

function paintSpeed(speed: number) {
  for (const button of replayBar.querySelectorAll<HTMLButtonElement>("[data-replay-speed]")) {
    button.classList.toggle("on", Number(button.dataset.replaySpeed) === speed);
  }
}

function sendSeek() {
  window.clearTimeout(replaySeekTimer);
  replaySeekSent = performance.now();
  worker?.postMessage({ t: "replay-seek", pos: Number(replaySeek.value) });
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
  setBanner("O núcleo não aceitou essa ROM.", "error");
}

async function connect(role: Role, code: string) {
  if (plainGame()) {
    setBanner("Este jogo só roda nesta máquina.", "warn");
    return;
  }
  exitReplay();
  if (!account) {
    nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
    nickInput.value = nick;
    void setPlayerName(nick);
  }
  await booting;
  if (!loadedGame || loadedGame.id !== selected.id) {
    if (!session) roomState.textContent = idleRoom();
    setBanner("Solte a ROM, ou escolha um jogo que já esteja neste navegador.", "warn");
    return;
  }
  const previous = session;
  session = null;
  previous?.close();
  localChecks.clear();
  remoteChecks.clear();
  roster = null;
  bans = [];
  stopHostWatch();
  worker?.postMessage({ t: role === "spectator" ? "watch-mode" : "net-arm" });
  clearChat();
  const mine = new OnlineSession({
    code,
    role,
    gameId: selected.id,
    sha1: selected.sha1,
    cid,
    onWatchState: (frame, state) => {
      if (session !== mine) return;
      const copy = state.slice();
      worker?.postMessage({ t: "watch-load", frame, state: copy.buffer }, [copy.buffer]);
    },
    onWatchFrames: (frames) => {
      if (session === mine) worker?.postMessage({ t: "watch-frames", frames });
    },
    onSpectatorJoined: () => {
      if (session === mine) worker?.postMessage({ t: "watch-snapshot" });
    },
    onBans: (list) => {
      if (session !== mine) return;
      bans = list;
      paintBans();
    },
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
        setBanner("O outro jogador cancelou o reinício.", "warn");
      }
    },
    onClose: (reason, closeCode) => {
      if (session !== mine) return;
      if (closeCode === SEAT_TAKEN && role === "guest") {
        setBanner("O lugar de jogador está ocupado. Você entrou para assistir.", "warn");
        void connect("spectator", code);
        return;
      }
      session = null;
      roster = null;
      stopHostWatch();
      paintRoomRole();
      setChatEnabled(false);
      setRoomCode(null);
      setRoomChrome(false);
      typingSent = false;
      hideConfirm();
      if (alertMode?.startsWith("reset")) closeAlert();
      hideOverlay();
      renderPeople();
      worker?.postMessage({ t: "local" });
      dropHostedRoom();
      roomState.textContent = idleRoom();
      setBanner(reason, "error");
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
      paintHostMark();
      syncHostWatch();
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
      setBanner(mine.playSlot() === 0 ? "Você agora é o jogador 1." : "Você agora é o jogador 2.", "info");
    },
    onSwapBusy: () => setBanner("A troca já está indo.", "info"),
    onPing: (ms) => {
      if (ms !== null && session !== mine) return;
      pingMs = ms;
      if (ms === null) pingDirect = false;
      paintPing();
    },
    onDirect: (on) => {
      if (session !== mine) return;
      pingDirect = on;
      paintPing();
      if (on) setBanner("Ligação direta com o outro jogador.", "success");
      else setBanner("A ligação direta caiu. A partida segue pelo servidor.", "warn");
    },
    onSaveAnswer: (id, yes) => {
      if (session !== mine || !saveDialog || saveDialog.kind === "offer" || saveDialog.id !== id) return;
      if (saveDialog.kind === "incoming") {
        if (yes) return;
        hideConfirm();
        setBanner("O outro jogador cancelou o save.", "warn");
        return;
      }
      if (saveDialog.kind !== "wait") return;
      const state = saveDialog.state;
      hideConfirm();
      if (!yes) {
        setBanner("O outro jogador recusou o save.", "warn");
        return;
      }
      mine.acceptSave(state);
      setBanner("Save carregado nos dois.", "success");
    },
    checkpoint: askCheckpoint,
  });
  session = mine;
  setRoomCode(code);
  setRoomChrome(true);
  paintRoomRole();
  const name = roomName();
  mine.setProfile(localControl(), name);
  setChatEnabled(true);
  sentProfile = `${localControl()}\n${name}`;
  const previousRoom = hostedCode;
  try {
    await session.open();
  } catch (error) {
    if (session === mine) session = null;
    paintRoomRole();
    setRoomChrome(false);
    setChatEnabled(false);
    setRoomCode(null);
    if (account && previousRoom) void queueRoom(null);
    setBanner(error instanceof Error ? error.message : "Não foi possível abrir a sala.", "error");
    return;
  }
  if (!account) return;
  try {
    await queueRoom(role === "host" ? code : null);
  } catch {
    setBanner("A sala abriu, mas os amigos não viram o código.", "warn");
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
    slider.parentElement?.style.setProperty("--value", String(volume));
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
    button.classList.toggle("on", !stretch && button.dataset.zoom === zoom);
    button.disabled = stretch;
  }
  document.querySelector("#zoom-row")?.classList.toggle("off", stretch);
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

function paintFps() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fps]")) {
    button.classList.toggle("on", fpsOn);
    button.setAttribute("aria-pressed", fpsOn ? "true" : "false");
  }
  fpsBadge.hidden = !fpsOn;
}

function rememberFps() {
  try { localStorage.setItem(FPS_KEY, fpsOn ? "1" : "0"); }
  catch { /* a escolha vale só nesta visita */ }
}

function paintPing() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-ping]")) {
    button.classList.toggle("on", pingOn);
    button.setAttribute("aria-pressed", pingOn ? "true" : "false");
  }
  pingBadge.hidden = !pingOn || pingMs === null;
  if (pingMs === null) return;
  const ms = Math.round(pingMs);
  pingBadge.textContent = `${ms} ms`;
  pingBadge.title = pingDirect ? "Ligação direta com o outro jogador" : "Pelo servidor da sala";
  pingBadge.classList.toggle("good", ms <= 80);
  pingBadge.classList.toggle("mid", ms > 80 && ms <= 110);
  pingBadge.classList.toggle("bad", ms > 110);
}

function rememberPing() {
  try { localStorage.setItem(PING_KEY, pingOn ? "1" : "0"); }
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
  paintHostMark();
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
  void queueRoom(null).finally(() => {
    void paintFriends();
  });
}

function joinCode(raw: string) {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
    setBanner("O código tem 5 letras, sem I, O, 0 ou 1.", "warn");
    return;
  }
  codeInput.value = code;
  const choice = storedJoin();
  if (choice) {
    void connect(choice === "watch" ? "spectator" : "guest", code);
    return;
  }
  openJoinChoice(code);
}

const joinChoice = document.querySelector<HTMLElement>("#join-choice")!;
let joinChoiceCode = "";

function openJoinChoice(code: string) {
  joinChoiceCode = code;
  document.querySelector("#join-choice-text")!.textContent = `Como você quer entrar na sala ${code}?`;
  reveal(joinChoice, "modal");
  document.querySelector<HTMLButtonElement>("#join-play")?.focus();
}

function closeJoinChoice() {
  joinChoiceCode = "";
  conceal(joinChoice, "modal");
}

function pickJoin(choice: JoinAs) {
  const code = joinChoiceCode;
  closeJoinChoice();
  if (!code) return;
  rememberJoin(choice);
  void connect(choice === "watch" ? "spectator" : "guest", code);
}

document.querySelector("#join-play")!.addEventListener("click", () => pickJoin("play"));
document.querySelector("#join-watch")!.addEventListener("click", () => pickJoin("watch"));
document.querySelector("#join-choice-close")!.addEventListener("click", () => closeJoinChoice());
joinChoice.addEventListener("click", (event) => {
  if (event.target === joinChoice) closeJoinChoice();
});

function paintAccount() {
  const logged = Boolean(account);
  accountOut.hidden = logged;
  accountIn.hidden = !logged;
  foldFriends.hidden = !logged;
  friendsSection.hidden = !logged;
  savesCloud.hidden = !logged || !cloudSaves;
  nickInput.disabled = logged;
  if (account) {
    accountName.textContent = account.name;
    accountCode.textContent = account.friendCode;
    myMode = account.presence;
    paintMyDevice();
    paintMyStatus();
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
  watchPresence();
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
    setBanner("Não deu para entrar. Tente de novo.", "error");
    params.delete("login");
    const next = params.toString();
    history.replaceState(null, "", next ? `${location.pathname}?${next}` : location.pathname);
  }
}

function thisDevice(): DeviceKind {
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const mobile = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  return mobile || (narrow && coarse) ? "phone" : "desktop";
}

function deviceIcon(kind: DeviceKind): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "device-icon";
  img.src = kind === "phone" ? phoneUrl : desktopUrl;
  img.alt = kind === "phone" ? "Celular" : "Computador";
  img.width = 28;
  img.height = 28;
  return img;
}

function friendStatus(status: FriendCard["status"]): HTMLElement {
  const line = document.createElement("span");
  line.className = `status-line ${status}`;
  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = status === "online" ? "online" : status === "away" ? "ausente" : "offline";
  line.append(dot, label);
  return line;
}

function paintMyDevice() {
  const kind = thisDevice();
  myDevice.src = kind === "phone" ? phoneUrl : desktopUrl;
  myDevice.alt = kind === "phone" ? "Celular" : "Computador";
}

function myShownStatus(): FriendCard["status"] {
  if (myMode === "offline") return "offline";
  if (myMode === "away") return "away";
  if (Date.now() - lastInput < IDLE_MS) return "online";
  return "away";
}

function paintMyStatus() {
  const status = myShownStatus();
  myStatus.className = `status-line ${status}`;
  myStatusText.textContent = status === "online" ? "online" : status === "away" ? "ausente" : "offline";
}

function closeStatusPick(focusBack = false) {
  myStatusPick.hidden = true;
  myStatus.hidden = false;
  if (focusBack) myStatus.focus();
}

async function beat(kind: "active" | "live" | "gone") {
  if (!account) return;
  const now = Date.now();
  if (kind !== "gone" && kind === lastBeatKind && now - lastBeatAt < 15_000) return;
  lastBeatAt = now;
  lastBeatKind = kind;
  try {
    await postPresence({ beat: kind, device: kind === "gone" ? undefined : thisDevice() });
  } catch {
    /* o próximo pulso tenta de novo */
  }
}

function noteActivity() {
  const idle = Date.now() - lastInput >= IDLE_MS;
  lastInput = Date.now();
  if (account && myStatusPick.hidden) paintMyStatus();
  if (idle && account) void beat("active");
}

function watchPresence() {
  if (!account) {
    window.clearInterval(presenceTimer);
    presenceTimer = 0;
    return;
  }
  if (presenceTimer) {
    paintMyStatus();
    return;
  }
  lastInput = Date.now();
  void beat("active");
  presenceTimer = window.setInterval(() => {
    if (!account) return;
    void beat(Date.now() - lastInput < IDLE_MS ? "active" : "live");
    if (myStatusPick.hidden) paintMyStatus();
  }, 20_000);
  paintMyStatus();
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
  text.append(name, friendStatus(friend.status));
  if (pending === "out") {
    const meta = document.createElement("small");
    meta.textContent = "pedido enviado";
    text.append(meta);
  } else {
    const meta = document.createElement("span");
    meta.className = "friend-meta";
    const call = document.createElement("button");
    call.type = "button";
    call.className = "friend-call";
    const plus = document.createElement("i");
    plus.setAttribute("aria-hidden", "true");
    call.append(plus, document.createTextNode("Convidar"));
    call.addEventListener("click", () => void callFriend(friend));
    meta.append(call);
    if (friend.inviteExpiresAt !== null && friend.inviteExpiresAt > Date.now()) {
      const chip = document.createElement("span");
      chip.className = "invite-chip";
      chip.dataset.expires = String(friend.inviteExpiresAt);
      chip.textContent = "Convite enviado";
      meta.append(chip);
    }
    text.append(meta);
  }
  who.append(text);
  const side = document.createElement("div");
  side.className = "friend-side";
  if (friend.device) side.append(deviceIcon(friend.device));
  if (pending !== "out") side.append(friendOptions(friend));
  if (side.childElementCount) who.append(side);
  const actions = document.createElement("div");
  actions.className = "friend-actions";
  if (pending === "out") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => void changeFriend(() => removeFriend(friend.id), "Pedido cancelado."));
    actions.append(cancel);
  } else if (friend.roomCode) {
    const join = document.createElement("button");
    join.type = "button";
    join.textContent = `Sala ${friend.roomCode}`;
    join.addEventListener("click", () => joinCode(friend.roomCode!));
    actions.append(join);
  }
  card.append(who);
  if (actions.childElementCount) card.append(actions);
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
    setBanner("Crie a sala antes de chamar alguém.", "warn");
    return;
  }
  try {
    await roomChain;
    if (!hostedCode) {
      setBanner("Crie a sala antes de chamar alguém.", "warn");
      return;
    }
    await inviteFriend(friend.id);
    setBanner(`Convite enviado para ${friend.name}.`, "success");
    await paintFriends();
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para chamar.", "error");
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

function syncList<T extends { id: string }>(
  list: HTMLElement,
  items: T[],
  render: (item: T) => HTMLElement,
  patch?: (card: HTMLElement, item: T) => void,
) {
  const ids = new Set(items.map((item) => item.id));
  for (const item of items) {
    const have = cardById(list, item.id);
    if (have) {
      patch?.(have, item);
      list.append(have);
    } else {
      list.append(render(item));
    }
  }
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
  if (!roomEmpty || !friendEmpty) foldFriends.open = true;
}

function inviteClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function pendingChips(): HTMLElement[] {
  return [...friendList.querySelectorAll<HTMLElement>(".invite-chip")];
}

function paintInviteMeters() {
  const now = Date.now();
  for (const chip of pendingChips()) {
    if (Number(chip.dataset.expires) <= now) chip.remove();
  }
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
  if (roomInviteList.childElementCount === 0 && pendingChips().length === 0) {
    window.clearInterval(inviteTick);
    inviteTick = 0;
  }
  syncInviteVisibility();
}

function ensureInviteTick() {
  paintInviteMeters();
  if (inviteTick || (roomInviteList.childElementCount === 0 && pendingChips().length === 0)) return;
  inviteTick = window.setInterval(paintInviteMeters, 250);
}

function patchRoomInvite(card: HTMLElement, invite: RoomInvite) {
  card.dataset.created = String(invite.createdAt);
  card.dataset.expires = String(invite.expiresAt);
  const meta = card.querySelector(".invite-copy small");
  if (meta) meta.textContent = `Sala ${invite.roomCode}`;
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
    setBanner(error instanceof Error ? error.message : "Não deu para entrar na sala.", "error");
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
    setBanner(error instanceof Error ? error.message : "Não deu para recusar.", "error");
    void pullInvites();
  }
}

async function answerFriendInvite(friend: FriendCard, accept: boolean) {
  const card = cardById(friendInviteList, friend.id);
  setBusy(card, true);
  try {
    if (accept) await acceptFriend(friend.id);
    else await declineFriend(friend.id);
    setBanner(accept ? "Pedido aceito." : "Pedido recusado.", "success");
    friendKey = "";
    await paintFriends();
  } catch (error) {
    setBusy(card, false);
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para atualizar os amigos.", "error");
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
  syncList(roomInviteList, open, roomInviteCard, patchRoomInvite);
  ensureInviteTick();
}

async function changeFriend(action: () => Promise<void>, done: string) {
  try {
    await action();
    setBanner(done, "success");
    await paintFriends();
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      account = null;
      paintAccount();
    }
    setBanner(error instanceof Error ? error.message : "Não deu para atualizar os amigos.", "error");
  }
}

function friendSignature(lists: FriendLists): string {
  const part = (items: FriendCard[], tag: string) => items.map((item) => (
    `${tag}:${item.id}:${item.name}:${item.roomCode ?? ""}:${item.hasAvatar ? 1 : 0}:${item.status}:${item.device ?? ""}:${item.inviteExpiresAt ?? ""}`
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
  ensureInviteTick();
}

copyCode.addEventListener("click", () => {
  const code = account?.friendCode;
  if (!code) return;
  const done = () => setBanner("Código de amigo copiado.", "success");
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(code).then(done, done);
  else done();
});

myStatus.addEventListener("click", () => {
  myStatus.hidden = true;
  myStatusPick.hidden = false;
  myStatusPick.value = myMode;
  myStatusPick.focus();
});

myStatusPick.addEventListener("change", () => {
  const value = myStatusPick.value;
  myMode = value === "away" || value === "offline" ? value : "auto";
  if (account) account.presence = myMode;
  paintMyStatus();
  closeStatusPick(true);
  void postPresence({ mode: myMode }).catch((error) => {
    setBanner(error instanceof Error ? error.message : "Não deu para mudar o status.", "error");
  });
});

myStatusPick.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeStatusPick(true);
});

myStatusPick.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (document.activeElement === myStatusPick || myStatusPick.hidden) return;
    closeStatusPick();
  }, 0);
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
    setBanner("Você saiu da conta. O nome da sala volta a ser o deste navegador.", "info");
  })();
});

friendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = friendCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  friendCodeInput.value = code;
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    setBanner("O código de amigo tem 6 letras, sem I, O, 0 ou 1.", "warn");
    return;
  }
  void (async () => {
    try {
      const status = await askFriend(code);
      friendCodeInput.value = "";
      setBanner(status === "accepted" ? "Pedido aceito." : "Pedido enviado.", "success");
      await paintFriends();
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) {
        account = null;
        paintAccount();
      }
      setBanner(error instanceof Error ? error.message : "Não deu para pedir amizade.", "error");
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
    setBanner("Cria a sala, ou cola um código, antes de copiar.", "warn");
    return;
  }
  const done = () => {
    copyButton.setAttribute("aria-label", "Copiado");
    setBanner("Código copiado.", "success");
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
  stopHostWatch();
  paintRoomRole();
  setChatEnabled(false);
  setRoomCode(null);
  setRoomChrome(false);
  typingSent = false;
  hideConfirm();
  clearChat();
  hideOverlay();
  worker?.postMessage({ t: "local" });
  roomState.textContent = idleRoom();
  setDelay("");
  dropHostedRoom();
  renderPeople();
  setBanner("Você saiu da sala.", "info");
}

leaveButton.addEventListener("click", () => leaveRoom());

function askSwap() {
  if (!session) {
    localSwap = !localSwap;
    renderPeople();
    return;
  }
  if (!session.requestSwap()) {
    if (session.linked()) setBanner("A troca já está indo.", "info");
    else if (session.role === "guest") setBanner("Só o anfitrião troca enquanto o outro lado não está na sala.", "warn");
    else setBanner("A partida ainda não ligou.", "warn");
    return;
  }
  if (session.role === "guest" && session.linked()) setBanner("Pedindo a troca de jogadores…", "info");
}

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
roomClose.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
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
  else if (event.code === "Escape" && !settings.hidden) closeSettings();
  else if (event.code === "Escape" && !replaysModal.hidden) closeReplays();
  else if (event.code === "Escape" && !bansModal.hidden) closeBans();
  else if (event.code === "Escape" && !joinChoice.hidden) closeJoinChoice();
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
      setBanner("A partida ainda não ligou.", "warn");
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
    setBanner("Save carregado nos dois.", "success");
  }
});

confirmNo.addEventListener("click", () => {
  if (saveDialog?.kind === "wait") session?.answerSave(saveDialog.id, false);
  if (saveDialog?.kind === "incoming") session?.answerSave(saveDialog.id, false);
  hideConfirm();
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.repeat || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  chatForm.requestSubmit();
});

chatInput.addEventListener("blur", () => {
  window.clearTimeout(typingIdle);
  localTyping(false);
  if (chatDocked()) return;
  playChat.classList.remove("docked");
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
  if (!manual.hidden || !alertBox.hidden || !savesModal.hidden || !settings.hidden || !replaysModal.hidden || !libraryEdit.hidden || !bansModal.hidden || !joinChoice.hidden) return;
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

paintFps();
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fps]")) {
  button.addEventListener("click", () => {
    fpsOn = !fpsOn;
    paintFps();
    rememberFps();
  });
}

paintPing();
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-ping]")) {
  button.addEventListener("click", () => {
    pingOn = !pingOn;
    paintPing();
    rememberPing();
  });
}

const settings = document.querySelector<HTMLElement>("#settings")!;

function openSettings() {
  setPlayMenu(false);
  void paintRomFolder();
  reveal(settings, "modal");
  document.querySelector<HTMLButtonElement>("#settings-close")?.focus();
}

function closeSettings(immediate = false) {
  if (immediate) settings.hidden = true;
  else conceal(settings, "modal");
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-settings-open]")) {
  button.addEventListener("click", () => openSettings());
}
const romFolderLabel = document.querySelector<HTMLElement>("#rom-folder")!;
const romFolderOpen = document.querySelector<HTMLButtonElement>("#rom-folder-open")!;

async function paintRomFolder() {
  const supported = canPickRomFolder();
  romFolderOpen.disabled = !supported;
  if (!supported) {
    romFolderLabel.textContent = "Escolha de pasta disponível no Chrome e Edge para computador.";
    return;
  }
  const folder = await romFolder();
  romFolderLabel.textContent = folder
    ? `${folder.name}. A busca inclui subpastas.`
    : "Nenhuma pasta escolhida. A busca inclui subpastas.";
}

romFolderOpen.addEventListener("click", () => {
  void (async () => {
    const folder = await chooseRomFolder();
    await paintRomFolder();
    if (!folder) setBanner("Não foi possível acessar essa pasta. Escolha uma pasta e permita a leitura.", "warn");
  })();
});

const bansModal = document.querySelector<HTMLElement>("#bans-modal")!;

function closeBans() {
  conceal(bansModal, "modal");
}

bansOpen.addEventListener("click", () => {
  if (session?.role !== "host") return;
  paintBans();
  session.requestBans();
  reveal(bansModal, "modal");
  document.querySelector<HTMLButtonElement>("#bans-close")?.focus();
});
document.querySelector("#bans-close")!.addEventListener("click", () => closeBans());
bansModal.addEventListener("click", (event) => {
  if (event.target === bansModal) closeBans();
});

for (const button of seatMode.querySelectorAll<HTMLButtonElement>("[data-seat-mode]")) {
  button.addEventListener("click", () => switchSeat(button.dataset.seatMode === "watch" ? "watch" : "play"));
}

document.querySelector("#settings-close")!.addEventListener("click", () => closeSettings());
settings.addEventListener("click", (event) => {
  if (event.target === settings) closeSettings();
});

for (const button of recButtons) button.addEventListener("click", () => void toggleRec());
replaysOpen.addEventListener("click", () => void openReplays());
document.querySelector("#replays-close")!.addEventListener("click", () => closeReplays());
replaysModal.addEventListener("click", (event) => {
  if (event.target === replaysModal) closeReplays();
});
document.querySelector("#replays-change")!.addEventListener("click", () => {
  void (async () => {
    if (!(await chooseFolder())) return;
    await paintReplayFolder();
    await paintReplays();
  })();
});
replayToggle.addEventListener("click", () => {
  worker?.postMessage({ t: replayPlaying ? "replay-pause" : "replay-play" });
});
document.querySelector("#replay-back")!.addEventListener("click", () => {
  worker?.postMessage({ t: "replay-seek", pos: Math.max(1, replayPos - Math.round(5 * SNES_FPS)) });
});
document.querySelector("#replay-step")!.addEventListener("click", () => worker?.postMessage({ t: "replay-step" }));
document.querySelector("#replay-exit")!.addEventListener("click", () => exitReplay());
replaySeek.addEventListener("input", () => {
  replayScrubbing = true;
  replayClock.textContent = `${clock(Number(replaySeek.value))} / ${clock(replayTotal)}`;
  const wait = 90 - (performance.now() - replaySeekSent);
  window.clearTimeout(replaySeekTimer);
  if (wait <= 0) sendSeek();
  else replaySeekTimer = window.setTimeout(sendSeek, wait);
});
replaySeek.addEventListener("change", () => {
  replayScrubbing = false;
  sendSeek();
});
for (const button of replayBar.querySelectorAll<HTMLButtonElement>("[data-replay-speed]")) {
  button.addEventListener("click", () => {
    const speed = Number(button.dataset.replaySpeed);
    paintSpeed(speed);
    worker?.postMessage({ t: "replay-speed", speed });
  });
}
paintRec();
void paintReplayFolder();

banner.addEventListener("click", () => clearBanner());

const pageHeader = document.querySelector<HTMLElement>("body > header")!;
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--header-h", `${pageHeader.offsetHeight}px`);
}).observe(pageHeader);

document.querySelector("#reset")!.addEventListener("click", () => {
  if (watchingRoom()) return;
  if (!worker || !loadedGame) {
    setBanner("Solte a ROM antes de reiniciar.", "warn");
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

const stageModals = ["#banner", "#library-edit", "#alert", "#saves-modal", "#settings", "#replays-modal", "#join-choice", "#bans-modal", "#manual"].map((selector) => {
  const node = document.querySelector<HTMLElement>(selector)!;
  return { node, parent: node.parentElement!, next: node.nextSibling };
});

function placeStageModals(on: boolean) {
  for (const modal of stageModals) {
    if (on) stage.append(modal.node);
    else modal.parent.insertBefore(modal.node, modal.next);
  }
}

document.addEventListener("fullscreenchange", () => {
  const on = document.fullscreenElement === stage;
  const coarse = coarsePointer();
  stage.classList.toggle("play-full", on && coarse);
  stage.classList.toggle("fs-dock", on && !coarse);
  placeStageModals(on);
  const focused = document.activeElement;
  if (on && focused instanceof HTMLElement && focused.closest("#screen-dock")) focused.blur();
  if (!on) {
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
  onChrome: setTouchChrome,
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
  } else if (mode === "drop-replay") {
    alertText.textContent = "Apagar esse replay? O arquivo sai da pasta. Não tem como desfazer.";
    alertYes.textContent = "Apagar";
  } else if (mode === "kick") {
    alertText.textContent = `Remover ${name} da sala? A pessoa fica bloqueada enquanto a sala existir. Dá para desbloquear em Bloqueados.`;
    alertYes.textContent = "Remover";
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
  dropReplayName = null;
  kickTarget = null;
  alertYes.hidden = false;
  conceal(alertBox, "modal");
}

function dismissAlert() {
  const mode = alertMode;
  if (mode === "reset-wait") session?.cancelReset();
  if (mode === "reset-in") session?.answerReset(false);
  if (mode === "reset-wait" || mode === "reset-in") setBanner("Reinício cancelado.", "info");
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
    setBanner("O jogo precisa de um nome.", "warn");
    return;
  }
  try {
    await renameRom(id, title);
    if (pendingCover) await setRomCover(id, pendingCover.bytes, pendingCover.type);
  } catch {
    setBanner("Não deu para guardar o nome ou a capa.", "error");
    return;
  }
  closeLibraryEdit();
  await refreshLibrary();
  setBanner("Jogo atualizado.", "success");
}

tabOnline.addEventListener("click", () => showTab("online"));
tabLocal.addEventListener("click", () => showTab("local"));

libraryFile.addEventListener("change", () => {
  const file = libraryFile.files?.[0];
  if (!file) return;
  if (!COVER_TYPES.has(file.type) || file.size > COVER_MAX) {
    libraryFile.value = "";
    setBanner("A capa precisa ser uma imagem de até 1,5 MB.", "warn");
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

function closePlay() {
  if (!loadedGame) return;
  if (session) leaveRoom();
  stopPlay("welcome");
  clearBanner();
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-close-play]")) {
  button.addEventListener("click", () => {
    setPlayMenu(false);
    closePlay();
    void leaveFullscreen();
  });
}

document.querySelector("#forget")!.addEventListener("click", () => {
  if (alertMode) return;
  closeSettings(true);
  if (!ready.has(selected.id)) {
    setBanner("Essa ROM não está neste navegador.", "error");
    return;
  }
  openAlert("forget");
});

alertYes.addEventListener("click", () => {
  const mode = alertMode;
  if (mode === "kick") {
    const target = kickTarget;
    closeAlert();
    if (!target || session?.role !== "host") return;
    session.kick(target.id);
    setBanner(`${target.name} saiu da sala e ficou bloqueado.`, "success");
    return;
  }
  if (mode === "drop-replay") {
    const name = dropReplayName;
    closeAlert();
    if (name) void removeReplay(name);
    return;
  }
  if (mode === "drop-slot") {
    const target = dropTarget;
    closeAlert();
    if (!target) return;
    void (async () => {
      try {
        await forgetSlot(target.gameId, target.slot);
        setBanner(`Save ${target.slot} apagado deste navegador.`, "success");
        await renderSaves();
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Não deu para apagar o save.", "error");
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
      setBanner(`${game.title} saiu deste navegador.`, "success");
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
      setBanner("A partida ainda não ligou.", "warn");
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

function pollSupers(padsNow: [number, number], pressed: [boolean, boolean]) {
  if (loadedGame?.id !== "final-fight-3" || !worker) return;
  for (const port of [0, 1] as const) {
    if (padsNow[port] & LEFT) facing[port] = LEFT;
    else if (padsNow[port] & RIGHT) facing[port] = RIGHT;
    if (pressed[port] && !superDown[port]) {
      if (padsNow[port] & SELECT) {
        const next = (FIGHTERS.indexOf(fighters[port]) + 1) % FIGHTERS.length;
        fighters[port] = FIGHTERS[next];
        const player = session?.linked() ? mySlot() + 1 : port + 1;
        setBanner(`Super do jogador ${player}: ${fighterLabel(fighters[port])}.`, "info");
      } else {
        const forward = padsNow[port] & LEFT ? LEFT : padsNow[port] & RIGHT ? RIGHT : facing[port];
        worker.postMessage({ t: "super", port, steps: superSteps(fighters[port], forward) });
      }
    }
    superDown[port] = pressed[port];
  }
}

function pollSpecials(padsNow: [number, number]) {
  if (loadedGame?.id !== "final-fight-3" || !worker) return;
  const pressed: [boolean, boolean] = [(padsNow[0] & X) !== 0, (padsNow[1] & X) !== 0];
  for (const port of [0, 1] as const) {
    if (pressed[port] && !specialDown[port]) {
      const forward = padsNow[port] & LEFT ? LEFT : padsNow[port] & RIGHT ? RIGHT : facing[port];
      worker.postMessage({ t: "special", port, held: padsNow[port], steps: specialSteps(fighters[port], forward, padsNow[port]) });
    }
    specialDown[port] = pressed[port];
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
  let padsNow = readPads(mode, loadedGame?.id ?? "");
  let supers = readSupers(mode);
  const swapped = session ? !session.linked() && session.playSlot() === 1 : localSwap;
  if (swapped) {
    padsNow = [padsNow[1], padsNow[0]];
    supers = [supers[1], supers[0]];
  }
  const bits = padsNow[0] | padsNow[1] | (supers[0] ? 1 << 14 : 0) | (supers[1] ? 1 << 15 : 0);
  const fresh = bits & ~heldControls;
  heldControls = bits;
  if (fresh) noteActivity();
  if (fresh && composing()) leaveComposer();
  const fight = loadedGame?.id === "final-fight-3";
  if (watchingRoom()) writePads(0, 0);
  else {
    writePads(fight ? padsNow[0] & ~X : padsNow[0], fight ? padsNow[1] & ~X : padsNow[1]);
    pollSupers(padsNow, supers);
    pollSpecials(padsNow);
  }
  if (session) publishProfile();
  renderPeople();
  if (!manual.hidden && padKey() !== shownPads) fillManual();
  requestAnimationFrame(pump);
}

if (!crossOriginIsolated) {
  setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.", "error");
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
document.addEventListener("pointerdown", noteActivity, { capture: true });
document.addEventListener("keydown", noteActivity, { capture: true });
window.addEventListener("touchstart", noteActivity, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!account || document.visibilityState !== "visible") return;
  void beat(Date.now() - lastInput < IDLE_MS ? "active" : "live");
});
window.addEventListener("pagehide", () => {
  if (!account) return;
  void postPresence({ beat: "gone" });
});
window.matchMedia("(max-width: 720px)").addEventListener("change", () => {
  if (account) paintMyDevice();
});

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
    setBanner("Não deu para abrir o banco deste navegador. A ROM vale só nesta visita.", "error");
  }
})();
