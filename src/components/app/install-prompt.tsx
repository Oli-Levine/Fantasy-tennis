"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { LogoMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "install-prompt-dismissed";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Mode = { kind: "android"; event: InstallEvent } | { kind: "ios" } | null;

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Add to Home Screen" card. Chrome/Android gets a real Install button;
 * iPhone/iPad (no install API) gets the Share → Add to Home Screen steps.
 * Hidden once installed or dismissed.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    if (isInstalled() || wasDismissed()) return;
    // Decided after mount: the server can't know the device, so render nothing until then.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIos()) setMode({ kind: "ios" });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setMode({ kind: "android", event: e as InstallEvent });
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // private mode: just hide it for now
    }
    setMode(null);
  }

  async function install() {
    if (mode?.kind !== "android") return;
    await mode.event.prompt();
    await mode.event.userChoice;
    setMode(null);
  }

  return (
    <section className="relative flex gap-3 rounded-panel bg-card p-4 pr-11 shadow-soft" aria-label="Install the app">
      <LogoMark className="h-11" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-heading font-semibold">Add UOB Tennis Fantasy to your home screen</p>
        {mode.kind === "android" ? (
          <>
            <p className="mt-0.5 text-muted-foreground">Open it like an app, full screen, in one tap.</p>
            <Button size="sm" className="mt-3" onClick={install}>
              Install
            </Button>
          </>
        ) : (
          <ol className="mt-1.5 space-y-1 text-muted-foreground">
            <li className="flex items-center gap-1.5">
              1. Tap <Share className="size-4 text-foreground" aria-label="Share" /> <strong className="text-foreground">Share</strong>
            </li>
            <li className="flex items-center gap-1.5">
              2. Tap <SquarePlus className="size-4 text-foreground" aria-hidden="true" />
              <strong className="text-foreground">Add to Home Screen</strong>
            </li>
          </ol>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
