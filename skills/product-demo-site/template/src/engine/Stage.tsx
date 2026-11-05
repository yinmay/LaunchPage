// The stage: a camera over the canvas world, with the agent panel floating beside it.
//
// The world is rendered ONCE at world scale; the camera is a single transform on it. On
// desktop the panel takes a column on the right and the camera re-frames into what is
// left; on a phone the panel becomes a strip along the bottom.

import { type MotionValue, motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from "motion/react";
import { type ComponentType, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentPanel, isOpen, type SceneChat } from "./AgentPanel.tsx";
import { StoryProgress } from "./parts.tsx";
import { cameraRect, fitCamera, type Shot, type Timeline } from "./timeline.ts";

/** Below this width the panel cannot sit beside the canvas. */
const DESKTOP_MIN = 760;
const MARGIN = 16;
const STRIP_H = 150;

/** Re-render granularity for the panel: 1/1000 of the track (~10px of scroll). */
const quantize = (v: number) => Math.round(v * 1000) / 1000;

export interface StageProps {
  progress: MotionValue<number>;
  timeline: Timeline;
  shots: readonly Shot[];
  World: ComponentType;
  chats?: readonly SceneChat[];
}

export function Stage({ progress, timeline, shots, World, chats }: StageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const width = useMotionValue(0);
  const height = useMotionValue(0);

  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => {
      const { width: w, height: h } = node.getBoundingClientRect();
      width.set(w);
      height.set(h);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width, height]);

  const [tick, setTick] = useState(() => quantize(progress.get()));
  useMotionValueEvent(progress, "change", (v) => setTick(quantize(v)));

  const scene = timeline.sceneAt(tick);
  const local = timeline.localProgress(tick, scene);
  const chat = chats?.[scene];
  const open = chat ? isOpen(chat, local) : false;
  const desktop = size.w >= DESKTOP_MIN;
  const panelW = Math.min(380, Math.max(300, size.w * 0.3));

  // The panel's footprint is sprung so the camera re-frames smoothly when it opens/closes.
  const coverTarget = open ? (desktop ? panelW + MARGIN * 2 : STRIP_H) : 0;
  const cover = useSpring(coverTarget, { stiffness: 120, damping: 24 });
  useEffect(() => cover.set(coverTarget), [cover, coverTarget]);

  const transform = useTransform(() => {
    const w = width.get();
    const h = height.get();
    const c = cover.get();
    const view = desktop
      ? { x: 0, y: 0, w: Math.max(1, w - c), h: Math.max(1, h) }
      : { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h - c) };
    const cam = fitCamera(cameraRect(shots, progress.get()), view);
    return `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.zoom})`;
  });

  return (
    <StoryProgress.Provider value={progress}>
      <div ref={stage} data-testid="story-stage" data-scene={scene} className="story-stage relative h-full w-full overflow-hidden">
        <motion.div aria-hidden="true" style={{ transform }} className="absolute top-0 left-0 origin-top-left will-change-transform">
          <World />
        </motion.div>
        {chat && open && size.w > 0 ? (
          <div
            aria-hidden="true"
            className="animate-panel absolute"
            style={
              desktop
                ? { right: MARGIN, top: MARGIN, bottom: MARGIN, width: panelW }
                : { left: 8, right: 8, bottom: 8, height: STRIP_H - 16 }
            }
          >
            <AgentPanel chat={chat} local={local} compact={!desktop} />
          </div>
        ) : null}
      </div>
    </StoryProgress.Provider>
  );
}
