import { describe, it, expect, beforeEach } from "vitest";
import { loadDisclosure, DISCLOSURE_KEY, type DisclosurePayload } from "../lib/disclosure";

describe("loadDisclosure", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    window.localStorage.setItem(DISCLOSURE_KEY, "{oops");
    expect(loadDisclosure()).toBeNull();
  });

  it("returns null when ct or iv is missing", () => {
    window.localStorage.setItem(
      DISCLOSURE_KEY,
      JSON.stringify({ salt: "s", iv: "i", epoch: "1" }),
    );
    expect(loadDisclosure()).toBeNull();

    window.localStorage.setItem(
      DISCLOSURE_KEY,
      JSON.stringify({ salt: "s", ct: "c", epoch: "1" }),
    );
    expect(loadDisclosure()).toBeNull();
  });

  it("round-trips a valid payload unchanged", () => {
    const valid: DisclosurePayload = { salt: "s", iv: "i", ct: "c", epoch: "7" };
    window.localStorage.setItem(DISCLOSURE_KEY, JSON.stringify(valid));
    expect(loadDisclosure()).toEqual(valid);
  });
});
