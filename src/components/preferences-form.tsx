"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "./ui/button";

export function PreferencesForm({ initial }: { initial: { timezone: string; weekStart: number; revision: number } }) {
  const [revision, setRevision] = useState(initial.revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const reducedMotion = useReducedMotion();
  return <form className="stack" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setMessage(""); setErrors({});
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: form.get("timezone"), weekStart: Number(form.get("weekStart")), expectedRevision: revision }),
      });
      const result = await response.json();
      if (!response.ok) { setErrors(result.fields || {}); throw new Error(result.error || "Could not save preferences."); }
      setRevision(result.revision);
      setMessage("Preferences saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect. Your input is preserved."); }
    finally { setPending(false); }
  }}>
<fieldset disabled={pending} className="contents">
    <div className="field">
      <label htmlFor="timezone">Timezone</label>
      <input id="timezone" name="timezone" defaultValue={initial.timezone} required list="timezones"
        aria-invalid={Boolean(errors.timezone)} aria-describedby="timezone-help" />
      <datalist id="timezones">{["Asia/Jakarta", "America/Los_Angeles", "Europe/London", "UTC"].map((zone) => <option key={zone} value={zone} />)}</datalist>
      <p id="timezone-help" className={errors.timezone ? "error-message" : "muted"}>{errors.timezone?.join(" ") || "Use an IANA timezone, such as Asia/Jakarta."}</p>
    </div>
    <div className="field">
      <label htmlFor="weekStart">Week starts on</label>
      <select id="weekStart" name="weekStart" defaultValue={initial.weekStart}>
        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}
      </select>
    </div>
    <div><Button disabled={pending} type="submit">{pending ? "Saving..." : "Save preferences"}</Button></div>
    {message && <motion.p role={message === "Preferences saved." ? "status" : "alert"}
      initial={{ y: reducedMotion ? 0 : 4 }} animate={{ y: 0 }} transition={{ duration: .15 }}>{message}</motion.p>}
  </fieldset>
</form>;
}
