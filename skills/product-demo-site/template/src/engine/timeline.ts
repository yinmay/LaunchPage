// The story engine's clock. Everything the visitor sees is a function of ONE 0..1 scroll
// progress value. This file turns that value into "which scene", "how far into it" and
// "where the camera is" — pure functions over data, so the timing can be unit-tested and
// reviewed in one place. Components never invent a beat of their own.
//
// Three kinds of timing:
// - a SCENE owns a slice of the track, proportional to its weight;
// - a BEAT is a moment inside a scene, written scene-local 0..1 and converted with beat();
// - a SHOT is a camera keyframe (a world rect to frame). Two shots with one rect = a hold.

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneSpec {
  key: string;
  /** "01", "02"… shown in the caption. */
  index: string;
  /** Short stage name — used in the screen-reader outline. */
  chapter: string;
  /** Caption line 1: what the canvas does in this scene. */
  title: string;
  /** Caption line 2: the pain the visitor recognises BEFORE they see the fix. */
  hook: string;
  /** Not shown; written out for search engines and screen readers. */
  summary: string;
  /** Relative length of the scene on the scroll track. */
  weight: number;
}

export interface Shot {
  at: number;
  rect: WorldRect;
}

export interface Timeline {
  spans: readonly (readonly [number, number])[];
  beat: (scene: number, local: number) => number;
  sceneAt: (progress: number) => number;
  localProgress: (progress: number, scene: number) => number;
  /** A progress at which a scene has fully played — what the static story renders. */
  settledProgress: (scene: number) => number;
  /** Where "next" takes the visitor: each scene's opening after the camera move. */
  nextStop: (progress: number) => number | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The share of each scene spent moving the camera in from the previous board. */
export const CAMERA_MOVE = 0.16;

export function createTimeline(scenes: readonly SceneSpec[]): Timeline {
  const total = scenes.reduce((sum, s) => sum + s.weight, 0);
  let cursor = 0;
  const spans = scenes.map((s) => {
    const start = cursor;
    cursor += s.weight / total;
    return [start, cursor] as const;
  });

  const beat = (scene: number, local: number) => {
    const [start, end] = spans[scene];
    return start + (end - start) * clamp01(local);
  };

  const sceneAt = (progress: number) => {
    const p = clamp01(progress);
    const found = spans.findIndex(([start, end]) => p >= start && p < end);
    return found === -1 ? scenes.length - 1 : found;
  };

  const localProgress = (progress: number, scene: number) => {
    const [start, end] = spans[scene];
    return clamp01((progress - start) / (end - start));
  };

  const nextStop = (progress: number) => {
    const stops = scenes.map((_, i) => beat(i, i === 0 ? 0.12 : CAMERA_MOVE + 0.04));
    return stops.find((s) => s > progress + 0.002) ?? null;
  };

  return {
    spans,
    beat,
    sceneAt,
    localProgress,
    settledProgress: (scene) => beat(scene, 0.985),
    nextStop,
  };
}

// ── Camera ──────────────────────────────────────────────────────────────────

/** Smoothstep: camera moves start and land gently instead of at constant speed. */
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The world rect the camera frames at this progress. Shots must be sorted by `at`. */
export function cameraRect(shots: readonly Shot[], progress: number): WorldRect {
  const p = clamp01(progress);
  if (p <= shots[0].at) return shots[0].rect;
  for (let i = 1; i < shots.length; i += 1) {
    const from = shots[i - 1];
    const to = shots[i];
    if (p <= to.at) {
      const t = ease((p - from.at) / Math.max(1e-6, to.at - from.at));
      return {
        x: lerp(from.rect.x, to.rect.x, t),
        y: lerp(from.rect.y, to.rect.y, t),
        w: lerp(from.rect.w, to.rect.w, t),
        h: lerp(from.rect.h, to.rect.h, t),
      };
    }
  }
  return shots[shots.length - 1].rect;
}

export interface CameraTransform {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Fit `rect` into `view`, centred. Zoom is capped: past ~1.25× the world's 1px strokes
 * start to look like an upscaled screenshot.
 */
export function fitCamera(rect: WorldRect, view: WorldRect, maxZoom = 1.25): CameraTransform {
  const zoom = Math.min(maxZoom, view.w / rect.w, view.h / rect.h);
  return {
    zoom,
    x: view.x + (view.w - rect.w * zoom) / 2 - rect.x * zoom,
    y: view.y + (view.h - rect.h * zoom) / 2 - rect.y * zoom,
  };
}

// ── World helpers ───────────────────────────────────────────────────────────

/** A rect grown by `pad` on every side. */
export function padded(rect: WorldRect, pad: number): WorldRect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

/** A board framed together with its title label (which sits ~50px above the board). */
export function framed(board: WorldRect): WorldRect {
  return { x: board.x - 30, y: board.y - 84, w: board.w + 60, h: board.h + 114 };
}

/** A sub-rect of a board, in board-relative coordinates — for close-ups. */
export function within(board: WorldRect, x: number, y: number, w: number, h: number): WorldRect {
  return { x: board.x + x, y: board.y + y, w, h };
}

/** The smallest rect containing every board — what the finale pulls back to. */
export function bounds(rects: readonly WorldRect[]): WorldRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}
