interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function installed(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return "prompt" in event && typeof (event as InstallPrompt).prompt === "function";
}

/** Show the install button when the browser offers its native install prompt. */
export function startInstall(button: HTMLButtonElement) {
  if (installed()) return;

  let promptEvent: InstallPrompt | null = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    promptEvent = event;
    button.hidden = false;
  });

  button.addEventListener("click", () => {
    const pending = promptEvent;
    if (!pending) return;
    promptEvent = null;
    button.hidden = true;
    void (async () => {
      try {
        await pending.prompt();
        const choice = await pending.userChoice;
        if (choice.outcome === "dismissed") button.hidden = false;
      } catch {
        button.hidden = false;
      }
    })();
  });

  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    button.hidden = true;
  });
}
