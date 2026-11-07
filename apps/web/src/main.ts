import { Speaker } from "./audio.ts";
import { kindFromLabel, padIcon } from "./icons.ts";
import { padStatus, readPads } from "./input.ts";
import { games, matchRom, type Game } from "./rom.ts";
import { OnlineSession, type ChatLine, type Role, type Seat } from "./session.ts";
import { forgetRom, lastGame, loadRom, loadState, playerName, saveList, saveRom, saveSlots, saveState, setPlayerName, storedGames } from "./store.ts";

const pick = document.querySelector<HTMLElement>("#pick")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const drop = document.querySelector<HTMLLabelElement>("#drop")!;
const dropText = drop.childNodes[0];
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const banner = document.querySelector<HTMLElement>("#banner")!;
const bannerText = document.querySelector<HTMLElement>("#banner-text")!;
const roomState = document.querySelector<HTMLElement>("#room-state")!;
const delayLabel = document.querySelector<HTMLElement>("#delay")!;
const codeInput = document.querySelector<HTMLInputElement>("#code")!;
const nickInput = document.querySelector<HTMLInputElement>("#nick")!;
const people = document.querySelector<HTMLElement>("#players")!;
const log = document.querySelector<HTMLElement>("#log")!;
const chatForm = document.querySelector<HTMLFormElement>("#chat")!;
const chatInput = document.querySelector<HTMLInputElement>("#chat-text")!;
const chatButton = chatForm.querySelector("button")!;
const saves = document.querySelector<HTMLElement>("#saves")!;
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
const localChecks = new Map<number, number>();
const remoteChecks = new Map<number, number>();
let checkpointWait: ((snapshot: { frame: number; state: Uint8Array; delay: number }) => void) | null = null;
let saveWait: ((state: Uint8Array) => void) | null = null;
let nick = "";
let sentProfile = "";
let peopleKey = "";
let booting: Promise<void> = Promise.resolve();

let bannerTimer = 0;

function setBanner(text: string) {
  window.clearTimeout(bannerTimer);
  bannerText.textContent = text;
  banner.hidden = text.length === 0;
  if (text.length > 0) bannerTimer = window.setTimeout(() => setBanner(""), 5000);
}

function coverOf(id: string) {
  if (id === "final-fight-3") return "/covers/final-fight-3.jpg";
  return `/covers/${id}.svg`;
}

function renderGames() {
  pick.replaceChildren();
  for (const game of games) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game${game.id === selected.id ? " selected" : ""}`;
    button.title = `SHA-1 ${game.sha1}`;
    const image = document.createElement("img");
    image.src = coverOf(game.id);
    image.alt = "";
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = game.title;
    const meta = document.createElement("small");
    meta.textContent = `${game.region} · ${ready.has(game.id) ? "ROM neste navegador" : "ROM ainda não gravada"}`;
    text.append(title, meta);
    button.append(image, text);
    button.addEventListener("click", () => {
      selected = game;
      updateDrop();
      renderGames();
      void openStored(game);
    });
    pick.append(button);
  }
}

function updateDrop() {
  if (dropText) dropText.textContent = `Solte a ROM de ${selected.title} aqui`;
}

function replaceScreen() {
  const next = document.createElement("canvas");
  next.id = "screen";
  next.width = 256;
  next.height = 224;
  next.hidden = true;
  next.className = screen.className;
  screen.replaceWith(next);
  screen = next;
  transferred = false;
  applyZoom();
}

function stopPlay() {
  worker?.terminate();
  worker = null;
  sab = null;
  pads = null;
  loadedGame = null;
  screen.hidden = true;
  drop.hidden = false;
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
  startWorker(rom);
  loadedGame = game;
  selected = game;
  drop.hidden = true;
  screen.hidden = false;
  setBanner("");
  roomState.textContent = `${game.title} nesta máquina. Os dois teclados jogam aqui.`;
  renderGames();
  await renderSaves();
}

function startWorker(rom: Uint8Array) {
  sab = new SharedArrayBuffer(4);
  pads = new Uint16Array(sab);
  const canvas = screen.transferControlToOffscreen();
  transferred = true;
  worker?.terminate();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event) => onWorker(event.data);
  const copy = rom.slice();
  worker.postMessage({ t: "load", rom: copy.buffer, canvas, sab }, [copy.buffer, canvas]);
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
  message?: string;
}) {
  if (message.t === "loaded" && message.rate) speaker.setRate(message.rate);
  if (message.t === "audio" && message.samples && message.rate) {
    speaker.setRate(message.rate);
    speaker.push(message.samples);
  }
  if (message.t === "aspect" && message.w && message.h) {
    screen.style.aspectRatio = `${message.w} / ${message.h}`;
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
    saveWait?.(new Uint8Array(message.state));
    saveWait = null;
  }
  if (message.t === "restored") setBanner("Save carregado.");
  if (message.t === "error") setBanner(message.message ?? "Falha no núcleo.");
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
  return new Promise<Uint8Array>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (saveWait) {
        saveWait = null;
        reject(new Error("O save demorou."));
      }
    }, 2000);
    saveWait = (state) => {
      window.clearTimeout(timer);
      resolve(state);
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

function pushChat(line: ChatLine) {
  const row = document.createElement("p");
  row.className = "chat-line";
  const who = document.createElement("b");
  who.textContent = line.name || (line.from === "host" ? "Anfitrião" : "Convidado");
  row.append(who, document.createTextNode(` ${line.text}`));
  log.append(row);
  log.scrollTop = log.scrollHeight;
}

function setChatEnabled(on: boolean) {
  chatInput.disabled = !on;
  chatButton.disabled = !on;
  chatInput.placeholder = on ? "Escreve para a sala" : "A conversa abre na sala";
}

function playerLine(name: string, control: string, state: string) {
  const item = document.createElement("li");
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

function renderPeople() {
  const [first, second] = padStatus();
  const key = session && roster
    ? `sala:${session.role}:${roster.host.here}:${roster.host.control}:${roster.host.name}:${roster.guest.here}:${roster.guest.control}:${roster.guest.name}`
    : `local:${nick}:${first ?? ""}:${second ?? ""}`;
  if (key === peopleKey) return;
  peopleKey = key;
  people.replaceChildren();
  if (!session || !roster) {
    playerLine(nick || "Jogador 1", first ?? "Teclado", "nesta máquina");
    playerLine("Jogador 2", second ?? "Teclado", "nesta máquina");
    return;
  }
  const you = session.role;
  playerLine(roster.host.name || "Anfitrião", roster.host.control, you === "host" ? "você" : roster.host.here ? "na sala" : "saiu");
  playerLine(
    roster.guest.name || "Convidado",
    roster.guest.here ? roster.guest.control : "—",
    you === "guest" ? "você" : roster.guest.here ? "na sala" : "aguardando",
  );
}

function when(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function renderSaves() {
  saves.replaceChildren();
  if (!loadedGame) return;
  const game = loadedGame;
  const slots = await saveList(game.id);
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot.savedAt]));
  for (const slot of saveSlots) {
    const savedAt = bySlot.get(slot);
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = savedAt ? `Gravar ${slot}` : `Slot ${slot}`;
    save.addEventListener("click", () => void writeSlot(game, slot));
    saves.append(save);
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = savedAt ? `Carregar ${when(savedAt)}` : "Vazio";
    load.disabled = !savedAt;
    load.addEventListener("click", () => void readSlot(game, slot));
    saves.append(load);
  }
}

async function writeSlot(game: Game, slot: number) {
  if (!worker || loadedGame?.id !== game.id) return;
  try {
    const state = await askSave();
    await saveState(game.id, slot, state);
    setBanner(`Save ${slot} gravado neste navegador.`);
    await renderSaves();
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Não deu para gravar o save.");
  }
}

async function readSlot(game: Game, slot: number) {
  if (!worker || session) {
    setBanner("O save local abre fora da sala.");
    return;
  }
  const state = await loadState(game.id, slot);
  if (!state) return;
  const copy = state.slice();
  worker.postMessage({ t: "restore", state: copy.buffer }, [copy.buffer]);
}

async function connect(role: Role, code: string) {
  nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
  nickInput.value = nick;
  void setPlayerName(nick);
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
      delayLabel.textContent = `Atraso de input: ${delay} frames.`;
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
      delayLabel.textContent = `Atraso de input: ${snapshot.delay} frames.`;
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
      localChecks.clear();
      remoteChecks.clear();
      if (net) worker?.postMessage({ t: "reset", slot: net.slot, delay: net.delay });
      else worker?.postMessage({ t: "reset" });
      setBanner(net ? "Jogo reiniciado nos dois." : "Jogo reiniciado.");
    },
    onClose: (reason) => {
      if (session !== mine) return;
      session = null;
      roster = null;
      setChatEnabled(false);
      renderPeople();
      worker?.postMessage({ t: "local" });
      setBanner(reason);
    },
    onChat: (line) => pushChat(line),
    onChatLog: (lines) => {
      clearChat();
      for (const line of lines) pushChat(line);
    },
    onRoster: (next) => {
      roster = next;
      renderPeople();
    },
    checkpoint: askCheckpoint,
  });
  session = mine;
  mine.setProfile(localControl(), nick);
  setChatEnabled(true);
  sentProfile = `${localControl()}\n${nick}`;
  try {
    await session.open();
  } catch (error) {
    if (session === mine) session = null;
    setChatEnabled(false);
    setBanner(error instanceof Error ? error.message : "Não foi possível abrir a sala.");
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

function publishProfile() {
  nick = nickInput.value.replace(/\s+/g, " ").trim().slice(0, 20);
  if (!session) return;
  const control = localControl();
  const next = `${control}\n${nick}`;
  if (next === sentProfile) return;
  sentProfile = next;
  session.setProfile(control, nick);
}

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
    const previous = copyButton.textContent;
    copyButton.textContent = "Copiado";
    window.setTimeout(() => {
      copyButton.textContent = previous;
    }, 1200);
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

document.querySelector("#join")!.addEventListener("click", () => {
  const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
    setBanner("O código tem 5 letras, sem I, O, 0 ou 1.");
    return;
  }
  void connect("guest", code);
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value;
  chatInput.value = "";
  session?.sendChat(text);
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
  if (session) session.requestReset();
  else {
    worker.postMessage({ t: "reset" });
    setBanner("Jogo reiniciado.");
  }
});

volButton.addEventListener("click", () => toggleMute());
volSlider.addEventListener("input", () => {
  volume = Number(volSlider.value);
  muted = volume === 0;
  paintVolume();
});

document.querySelector("#fullscreen")!.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.requestFullscreen();
});

document.querySelector("#forget")!.addEventListener("click", () => {
  void (async () => {
    await forgetRom(selected.id);
    ready.delete(selected.id);
    if (loadedGame?.id === selected.id) stopPlay();
    renderGames();
    setBanner(`${selected.title} saiu deste navegador.`);
  })();
});

window.addEventListener("pointerdown", () => {
  void speaker.resume();
});

function writePads(p0: number, p1: number) {
  if (!pads) return;
  pads[0] = p0;
  pads[1] = p1;
}

window.addEventListener("blur", () => writePads(0, 0));

function pump() {
  const [p0, p1] = readPads();
  writePads(p0, p1);
  if (session) publishProfile();
  renderPeople();
  requestAnimationFrame(pump);
}

if (!crossOriginIsolated) {
  setBanner("O navegador não isolou a página. Abre pelo servidor do projeto, com os cabeçalhos COOP e COEP.");
}

applyZoom();
paintVolume();
updateDrop();
renderGames();
renderPeople();
requestAnimationFrame(pump);

booting = (async () => {
  try {
    ready = new Set(await storedGames());
    nick = await playerName();
    nickInput.value = nick;
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
