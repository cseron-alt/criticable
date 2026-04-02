"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function detectInstallHint() {
  if (typeof window === "undefined") {
    return {
      steps: [
        "Abre el menú del navegador y añade Criticable a tu pantalla o escritorio.",
      ],
      title: "Crear marcador",
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIphone = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome|android/.test(userAgent);
  const isMac = /macintosh|mac os x/.test(userAgent);

  if (isIphone) {
    return {
      steps: [
        "Pulsa el botón Compartir de Safari.",
        "Elige “Añadir a pantalla de inicio”.",
        "Confirma para crear el acceso directo.",
      ],
      title: "Añadir a iPhone",
    };
  }

  if (isAndroid) {
    return {
      steps: [
        "Abre el menú del navegador.",
        "Pulsa “Instalar app” o “Añadir a pantalla de inicio”.",
        "Confirma para guardar el acceso directo.",
      ],
      title: "Añadir a Android",
    };
  }

  if (isSafari && isMac) {
    return {
      steps: [
        "En Safari, abre el menú Archivo.",
        "Pulsa “Añadir al Dock”.",
        "Confirma para crear el acceso directo de Criticable.",
      ],
      title: "Añadir al Mac",
    };
  }

  return {
    steps: [
      "Abre el menú del navegador.",
      "Pulsa “Instalar” o “Crear acceso directo”.",
      "Confirma para guardar Criticable en tu dispositivo.",
    ],
    title: "Crear acceso directo",
  };
}

export function InstallShortcutButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const hint = useMemo(() => detectInstallHint(), []);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        return;
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setFeedback("Acceso directo creado.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isInstalled) {
      setFeedback("Criticable ya está añadido en este dispositivo.");
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setFeedback("Acceso directo creado.");
      } else {
        setFeedback("Instalación cancelada.");
      }

      setDeferredPrompt(null);
      return;
    }

    setFeedback(null);
    setIsOpen(true);
  };

  return (
    <>
      <button
        className="profile-nav__link profile-nav__link--button"
        onClick={handleInstall}
        type="button"
      >
        Crear marcador
      </button>

      {feedback ? <span className="profile-nav__feedback">{feedback}</span> : null}

      {isOpen ? (
        <div className="install-modal" role="dialog" aria-modal="true" aria-label={hint.title}>
          <div className="install-modal__card">
            <div className="install-modal__copy">
              <span className="profile-card__eyebrow">Crear marcador</span>
              <h2>{hint.title}</h2>
              <p>Tu navegador no puede hacerlo sin confirmación manual. Sigue estos pasos.</p>
            </div>

            <ol className="install-modal__steps">
              {hint.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <div className="install-modal__actions">
              <button
                className="profile-inline-action"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
