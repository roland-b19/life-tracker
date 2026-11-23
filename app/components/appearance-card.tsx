"use client";

import { Card } from "./blocks";
import { useDeviceState } from "./device-state";
import { Segmented } from "./segmented";
import { THEME_STORAGE } from "./theme";
import { undoWith, useToast } from "./toast";

type Theme = "auto" | "light" | "dark";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * The Appearance choice of this device (D-024, D-047), kept like a view control: `[theme, set]`. Every tab of the
 * browser follows a change; `ShellListeners` applies it to the page.
 */
export function useTheme() {
  const [stored, set] = useDeviceState<string>(THEME_STORAGE, "auto");
  const theme: Theme = stored === "light" || stored === "dark" ? stored : "auto";
  return [theme, set as (next: Theme) => void] as const;
}

/** Auto (follow the system), Light or Dark for this device; the script in the root layout applies it on every load. */
export function AppearanceCard() {
  const [value, setTheme] = useTheme();
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
