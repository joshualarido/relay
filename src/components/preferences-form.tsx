"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { TaskTypeMinutes, WeekdayKey, WeeklyWorkingHours } from "@/lib/capacity";
import type { UserPreferences } from "@/lib/preferences";
import { Button } from "./ui/button";

const WEEKDAY_ORDER: Array<{ key: WeekdayKey; label: string }> = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
];

export function PreferencesForm({ initial }: { initial: UserPreferences }) {
  const [revision, setRevision] = useState(initial.revision);
  const [workingHours, setWorkingHours] = useState<WeeklyWorkingHours>(initial.workingHours);
  const [taskTypeMinutes, setTaskTypeMinutes] = useState<TaskTypeMinutes>(initial.taskTypeMinutes);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const reducedMotion = useReducedMotion();

  function updateDay(key: WeekdayKey, patch: Partial<WeeklyWorkingHours[WeekdayKey]>) {
    setWorkingHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setMessage("");
        setErrors({});
        try {
          const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: form.get("timezone"),
              weekStart: Number(form.get("weekStart")),
              workingHours,
              taskTypeMinutes,
              expectedRevision: revision,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            setErrors(result.fields || {});
            throw new Error(result.error || "Could not save preferences.");
          }
          setRevision(result.revision);
          setWorkingHours(result.workingHours);
          setTaskTypeMinutes(result.taskTypeMinutes);
          setMessage("Preferences saved.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not connect. Your input is preserved.");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="contents">
        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <input
            id="timezone"
            name="timezone"
            defaultValue={initial.timezone}
            required
            list="timezones"
            aria-invalid={Boolean(errors.timezone)}
            aria-describedby="timezone-help"
          />
          <datalist id="timezones">
            {["Asia/Jakarta", "America/Los_Angeles", "Europe/London", "UTC"].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p id="timezone-help" className={errors.timezone ? "error-message" : "muted"}>
            {errors.timezone?.join(" ") || "Use an IANA timezone, such as Asia/Jakarta."}
          </p>
        </div>

        <div className="field">
          <label htmlFor="weekStart">Week starts on</label>
          <select id="weekStart" name="weekStart" defaultValue={initial.weekStart}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option value={index} key={day}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="settings-subhead">Default working hours</span>
          <div className="working-hours-grid">
            {WEEKDAY_ORDER.map(({ key, label }) => {
              const day = workingHours[key];
              return (
                <div key={key} className="working-hours-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                    />
                    <span>{label}</span>
                  </label>
                  {day.enabled ? (
                    <div className="working-hours-range">
                      <input
                        type="time"
                        aria-label={`${label} start`}
                        value={day.start}
                        onChange={(e) => updateDay(key, { start: e.target.value })}
                        required
                      />
                      <span className="muted">–</span>
                      <input
                        type="time"
                        aria-label={`${label} end`}
                        value={day.end}
                        onChange={(e) => updateDay(key, { end: e.target.value })}
                        required
                      />
                    </div>
                  ) : (
                    <span className="muted text-sm">Day off</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="settings-subhead">Task type durations (minutes)</span>
          <div className="task-type-weights-grid">
            {(["Instant", "Medium", "Deep"] as const).map((type) => (
              <label key={type} className="field">
                <span>{type}</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={taskTypeMinutes[type]}
                  onChange={(e) =>
                    setTaskTypeMinutes((prev) => ({
                      ...prev,
                      [type]: Math.max(5, Math.min(480, Number(e.target.value) || 5)),
                    }))
                  }
                  required
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <Button disabled={pending} type="submit">
            {pending ? "Saving..." : "Save preferences"}
          </Button>
        </div>
        {message && (
          <motion.p
            role={message === "Preferences saved." ? "status" : "alert"}
            initial={{ y: reducedMotion ? 0 : 4 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {message}
          </motion.p>
        )}
      </fieldset>
    </form>
  );
}
