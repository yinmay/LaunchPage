// THE STORYBOARD, as data. Scenes, boards and camera shots — every number that decides
// what is on screen at a given scroll progress lives here (or in chat.ts). Components only
// read it. Write this file from the scene table in the brief (references/story-model.md).
//
// This template ships a 3-scene skeleton. Replace it; keep the shape.

import { bounds, CAMERA_MOVE, createTimeline, framed, padded, type SceneSpec, type Shot, type WorldRect, within } from "../engine/timeline.ts";

export const SCENES = [
  {
    key: "before",
    index: "01",
    chapter: "TODO(brief): 阶段名",
    title: "TODO(brief): 这一幕画布上发生了什么",
    hook: "TODO(brief): 访客认得出的痛点（一句话）",
    summary: "TODO(brief): 给搜索引擎和读屏器的一句话描述",
    weight: 1,
  },
  {
    key: "during",
    index: "02",
    chapter: "TODO(brief): 阶段名",
    title: "TODO(brief): 这一幕画布上发生了什么",
    hook: "TODO(brief): 访客认得出的痛点（一句话）",
    summary: "TODO(brief): 给搜索引擎和读屏器的一句话描述",
    weight: 1,
  },
  {
    key: "finale",
    index: "03",
    chapter: "TODO(brief): 完整闭环",
    title: "TODO(brief): 收束的一句话",
    hook: "TODO(brief): 从……到……",
    summary: "TODO(brief): 给搜索引擎和读屏器的一句话描述",
    weight: 0.8,
  },
] as const satisfies readonly SceneSpec[];

export const TIMELINE = createTimeline(SCENES);
const { beat } = TIMELINE;

/** ~150 stable-vh of scroll per scene. */
export const TRACK_VH = 150 * SCENES.length;

// World units are CSS px at zoom 1. Lay boards out so each camera move goes to a neighbour.
export const BOARDS = {
  before: { x: 0, y: 0, w: 1200, h: 700 },
  during: { x: 1300, y: 0, w: 1200, h: 700 },
} satisfies Record<string, WorldRect>;

export const WORLD = bounds(Object.values(BOARDS));

const B = BOARDS;

export const SHOTS: readonly Shot[] = [
  { at: beat(0, 0), rect: within(B.before, 0, 0, 640, 560) },
  { at: beat(0, 0.4), rect: within(B.before, 0, 0, 640, 560) },
  { at: beat(0, 0.8), rect: framed(B.before) },
  { at: beat(1, CAMERA_MOVE), rect: framed(B.during) },
  { at: beat(1, 0.98), rect: framed(B.during) },
  { at: beat(2, 0.3), rect: padded(WORLD, 80) },
  { at: 1, rect: padded(WORLD, 80) },
];
