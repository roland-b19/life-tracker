"use client";

import { useSyncExternalStore } from "react";
import { Card } from "./blocks";
import { Segmented } from "./segmented";
import { fadeTheme, THEME_STORAGE } from "./theme";
import { undoWith, useToast } from "./toast";

type Theme = "auto" | "light" | "dark";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

let theme: Theme | null = null; // read from storage on first use in the browser
const listeners = new Set<() => void>();

const loadTheme = (): Theme => {
  if (!theme) {
    try {
      const stored = localStorage.getItem(THEME_STORAGE);
      theme = stored === "light" || stored === "dark" ? stored : "auto";
    } catch {
      theme = "auto"; // storage blocked: the page follows the system
    }
  }
  return theme;
};

const setTheme = (next: Theme) => {
  theme = next;
  fadeTheme();
  const root = document.documentElement;
  if (next === "auto") delete root.dataset.theme;
  else root.dataset.theme = next;
  try {
    if (next === "auto") localStorage.removeItem(THEME_STORAGE);
    else localStorage.setItem(THEME_STORAGE, next);
  } catch {} // storage blocked: the choice lasts until the page reloads
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Auto (follow the system), Light or Dark for this device; the script in the root layout applies it on every load. */
export function AppearanceCard() {
  const value = useSyncExternalStore(subscribe, loadTheme, () => "auto" as const);
  const { showToast } = useToast();

  const pick = (next: Theme) => {
    if (next === value) return;
    const before = value;
    setTheme(next);
    showToast({
      message: `Appearance set to ${OPTIONS.find((o) => o.value === next)!.label}`,
      type: "success",
      onUndo: undoWith(showToast, async () => (setTheme(before), true)),
    });
  };

  return (
    <Card id="appearance-title" title="Appearance">
      <Segmented label="Appearance" value={value} options={OPTIONS} onChange={pick} />
    </Card>
  );
}
