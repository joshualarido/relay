import { describe, expect, it } from "vitest";
import { SCREENS, direction, neighbor, screenIndex } from "@/lib/screens";

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
  it("finds neighbors without wrapping", () => {
    expect(neighbor("/", "right")).toBe("/projects");
    expect(neighbor("/projects/abc", "left")).toBe("/");
    expect(neighbor("/", "left")).toBeNull();
    expect(neighbor("/calendar", "right")).toBeNull();
    expect(neighbor("/settings", "right")).toBeNull();
  });
  it("derives slide direction", () => {
    expect(direction("/", "/calendar")).toBe("right");
    expect(direction("/calendar", "/projects/x")).toBe("left");
    expect(direction("/projects", "/projects/x")).toBeNull();
    expect(direction("/settings", "/")).toBeNull();
  });
});
