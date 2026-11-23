"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const options: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const EVENT = "relay-theme-change";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("relay-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("relay-theme");
    else localStorage.setItem("relay-theme", theme);
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}

/** Light / Dark / System. Saved in this browser; "System" follows the device setting. */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  return (
    <div className="stack">
      <p className="muted">Choose a color theme. Saved in this browser.</p>
      <div className="view-switch" role="group" aria-label="Color theme">
        {options.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={theme === value} onClick={() => applyTheme(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
