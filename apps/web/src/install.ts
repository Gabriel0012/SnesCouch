interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function installed(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
}

function phone(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 1080px)").matches;
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return "prompt" in event && typeof (event as InstallPrompt).prompt === "function";
}

/** Chrome install shortcut. The button stays hidden on desktop and after the app is installed. */
export function startInstall(button: HTMLButtonElement) {
  if (installed()) return;

  let promptEvent: InstallPrompt | null = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    if (!phone() || !isInstallPrompt(event)) return;
    event.preventDefault();
    promptEvent = event;
    button.hidden = false;
  });

  button.addEventListener("click", () => {
    const pending = promptEvent;
    if (!pending) return;
    promptEvent = null;
    button.hidden = true;
    void pending.prompt();
  });

  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    button.hidden = true;
  });
}
