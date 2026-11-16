import { describe, expect, it } from "vitest";
import { advanceGuide, beginGuide, guideStep, skipGuide, type GuideStore } from "./onboarding";

function store(): GuideStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe("the guided start", () => {
  it("takes a device's first tournament through two steps, then never shows again", () => {
    const s = store();
    expect(guideStep(s, "t1")).toBeNull();
    beginGuide(s, "t1");
    expect(guideStep(s, "t1")).toBe(1);
    expect(advanceGuide(s, "t1")).toBe(2);
    // Remembered on the device: a refresh comes back to the same step.
    expect(guideStep(s, "t1")).toBe(2);
    expect(advanceGuide(s, "t1")).toBeNull();
    expect(guideStep(s, "t1")).toBeNull();
    // Done for good: a later tournament opens in full.
    beginGuide(s, "t2");
    expect(guideStep(s, "t2")).toBeNull();
  });

  it("is only for the tournament it began with", () => {
    const s = store();
    beginGuide(s, "t1");
    expect(guideStep(s, "t2")).toBeNull();
    expect(advanceGuide(s, "t2")).toBeNull();
    expect(guideStep(s, "t1")).toBe(1);
    // A second tournament made meanwhile doesn't restart it.
    beginGuide(s, "t2");
    expect(guideStep(s, "t2")).toBeNull();
  });

  it("never starts on a device that already has tournaments", () => {
    const s = store();
    skipGuide(s);
    beginGuide(s, "t1");
    expect(guideStep(s, "t1")).toBeNull();
  });

  it("reads anything it doesn't understand as done", () => {
    const s = store();
    s.data.set("badminton:onboarding:v1", "{broken");
    expect(guideStep(s, "t1")).toBeNull();
    beginGuide(s, "t1");
    expect(guideStep(s, "t1")).toBeNull();
  });
});
