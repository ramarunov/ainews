import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins plain class strings", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  it("drops falsy values", () => {
    expect(cn("flex", false && "hidden", undefined, null, "gap-2")).toBe("flex gap-2");
  });

  it("resolves conflicting Tailwind classes to the last one, not just concatenating", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("supports conditional object syntax", () => {
    expect(cn({ flex: true, hidden: false })).toBe("flex");
  });
});
