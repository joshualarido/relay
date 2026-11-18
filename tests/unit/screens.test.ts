import { describe, expect, it } from "vitest";
import { SCREENS, clearDirectionHint, direction, hintDirection, neighbor, peekDirectionHint, screenIndex } from "@/lib/screens";

describe("screens", () => {
  it("has a fixed order", () => expect(SCREENS).toEqual(["/", "/projects", "/calendar"]));
  it("indexes screens, nested paths and unknown paths", () => {
    expect(screenIndex("/")).toBe(0);
    expect(screenIndex("/projects")).toBe(1);
    expect(screenIndex("/projects/abc")).toBe(1);
    expect(screenIndex("/calendar")).toBe(2);
    expect(screenIndex("/settings")).toBe(-1);
    expect(screenIndex("/projectsx")).toBe(-1);
  });
  it("finds neighbors, looping at both ends", () => {
    expect(neighbor("/", "right")).toBe("/projects");
    expect(neighbor("/projects/abc", "left")).toBe("/");
    expect(neighbor("/", "left")).toBe("/calendar");
    expect(neighbor("/calendar", "right")).toBe("/");
    expect(neighbor("/settings", "right")).toBeNull();
  });
  it("derives slide direction", () => {
    expect(direction("/", "/calendar")).toBe("right");
    expect(direction("/calendar", "/projects/x")).toBe("left");
    expect(direction("/projects", "/projects/x")).toBeNull();
    expect(direction("/settings", "/")).toBeNull();
  });
  it("uses the key direction only for the hinted destination, as a pure read", () => {
    const hint = { to: "/", side: "right" as const };
    expect(direction("/calendar", "/", hint)).toBe("right");
    expect(direction("/calendar", "/", hint)).toBe("right");
    expect(direction("/", "/calendar", { to: "/calendar", side: "left" })).toBe("left");
    expect(direction("/calendar", "/")).toBe("left");
    expect(direction("/", "/calendar")).toBe("right");
    expect(direction("/projects", "/calendar", hint)).toBe("right");
    expect(direction("/", "/projects", { to: "/calendar", side: "left" })).toBe("right");
  });
  it("stores, peeks and clears the hint", () => {
    hintDirection("right", "/");
    expect(peekDirectionHint()).toEqual({ to: "/", side: "right" });
    expect(peekDirectionHint()).toEqual({ to: "/", side: "right" });
    clearDirectionHint();
    expect(peekDirectionHint()).toBeNull();
  });
});
