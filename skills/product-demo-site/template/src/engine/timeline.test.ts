// Invariants every storyboard must keep. These run against YOUR script.ts, so a broken
// edit (unsorted shots, a beat outside its scene) fails before anyone scrolls the page.
import { describe, expect, it } from "vitest";
import { STORY_CHATS } from "../story/chat.ts";
import { SCENES, SHOTS, TIMELINE } from "../story/script.ts";
import { cameraRect, fitCamera } from "./timeline.ts";

describe("timeline", () => {
  it("spans cover 0..1 without gaps, in order", () => {
    expect(TIMELINE.spans[0][0]).toBe(0);
    expect(TIMELINE.spans.at(-1)?.[1]).toBeCloseTo(1, 10);
    for (let i = 1; i < TIMELINE.spans.length; i += 1) {
      expect(TIMELINE.spans[i][0]).toBeCloseTo(TIMELINE.spans[i - 1][1], 10);
    }
  });

  it("beat() stays inside its scene and sceneAt() inverts it", () => {
    SCENES.forEach((_, i) => {
      expect(TIMELINE.sceneAt(TIMELINE.beat(i, 0.5))).toBe(i);
      expect(TIMELINE.sceneAt(TIMELINE.settledProgress(i))).toBe(i);
    });
    expect(TIMELINE.sceneAt(1)).toBe(SCENES.length - 1);
  });

  it("nextStop walks forward and ends after the last scene", () => {
    let p = 0;
    let hops = 0;
    for (let stop = TIMELINE.nextStop(p); stop !== null; stop = TIMELINE.nextStop(p)) {
      expect(stop).toBeGreaterThan(p);
      p = stop;
      hops += 1;
    }
    expect(hops).toBe(SCENES.length);
  });
});

describe("storyboard", () => {
  it("every scene has a caption title and hook, and keys are unique", () => {
    const keys = new Set(SCENES.map((s) => s.key));
    expect(keys.size).toBe(SCENES.length);
    SCENES.forEach((s) => {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.hook.length).toBeGreaterThan(0);
    });
  });

  it("captions stay short enough to read at a glance", () => {
    SCENES.forEach((s) => {
      expect(s.title.length, s.key).toBeLessThanOrEqual(30);
      expect(s.hook.length, s.key).toBeLessThanOrEqual(40);
    });
  });

  it("shots are sorted, start at 0 and end at 1", () => {
    expect(SHOTS[0].at).toBe(0);
    expect(SHOTS.at(-1)?.at).toBe(1);
    for (let i = 1; i < SHOTS.length; i += 1) expect(SHOTS[i].at).toBeGreaterThanOrEqual(SHOTS[i - 1].at);
  });

  it("there is one chat entry per scene, with rows in time order", () => {
    expect(STORY_CHATS.length).toBe(SCENES.length);
    STORY_CHATS.forEach((chat) => {
      for (let i = 1; i < chat.rows.length; i += 1) expect(chat.rows[i].at).toBeGreaterThanOrEqual(chat.rows[i - 1].at);
    });
  });
});

describe("camera", () => {
  it("never zooms past the legibility cap", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      const cam = fitCamera(cameraRect(SHOTS, p), { x: 0, y: 0, w: 1440, h: 800 });
      expect(cam.zoom).toBeLessThanOrEqual(1.25);
      expect(cam.zoom).toBeGreaterThan(0.1);
    }
  });
});
