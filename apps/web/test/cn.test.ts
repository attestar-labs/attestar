import { describe, it, expect } from "vitest";
import { cn } from "../lib/cn";

describe("cn", () => {
  it("drops falsy inputs", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("lets a later conflicting utility win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-slate", "text-proven")).toBe("text-proven");
  });

  it("keeps non-conflicting utilities", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("flattens conditional objects and nested arrays", () => {
    expect(cn("a", { b: true, c: false }, ["d", ["e", null]])).toBe("a b d e");
  });

  it("resolves conflicts that arrive through nested inputs", () => {
    expect(cn(["p-2", { "p-6": true }])).toBe("p-6");
  });

  it("returns an empty string for only-falsy input", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});
