// The scroll-driven story: a tall track with a pinned stage that films one canvas while
// the visitor scrolls, and a two-line caption above it.
//
// The caption is deliberately two lines and nothing else — the scene's number + title,
// then its HOOK (the pain the visitor recognises). The canvas is where the detail lives;
// a step bar and a paragraph up here only compete with it.
//
// The caption swaps with scroll, so prerendered HTML would hold only scene 01. The whole
// story is therefore ALSO written out as a visually hidden outline: search engines and
// screen readers get every scene.

import { type MotionValue, useMotionValueEvent } from "motion/react";
import { useRef, useState } from "react";
import { Stage, type StageProps } from "./Stage.tsx";
import type { SceneSpec } from "./timeline.ts";
import { usePinnedProgress, STABLE_VH } from "./viewport.ts";

export interface StoryProps extends Omit<StageProps, "progress"> {
  scenes: readonly SceneSpec[];
  /** Track height in stable-vh units. ~150 per scene reads unhurried. */
  trackVh: number;
  /** Heading of the hidden outline, e.g. "从一句话的需求到发布上线的六个场景". */
  outlineTitle: string;
}

function Caption({ scene, scenes }: { scene: number; scenes: readonly SceneSpec[] }) {
  const item = scenes[scene];
  return (
    <div key={item.key} aria-hidden="true" data-testid="story-caption" data-scene-key={item.key} className="animate-caption min-w-0">
      <p className="text-ink flex items-baseline gap-3 text-[clamp(1.25rem,2.6vw,2rem)] leading-tight font-medium">
        <span className="text-primary shrink-0 font-mono text-[0.6em] font-normal whitespace-nowrap">
          {item.index}
          <span className="text-subtle"> / {String(scenes.length).padStart(2, "0")}</span>
        </span>
        {item.title}
      </p>
      <p className="text-muted mt-1.5 text-[13px] sm:text-sm">{item.hook}</p>
    </div>
  );
}

export function StoryOutline({ scenes, title }: { scenes: readonly SceneSpec[]; title: string }) {
  return (
    <div className="sr-only">
      <h2>{title}</h2>
      <ol>
        {scenes.map((s) => (
          <li key={s.key}>
            <h3>
              {s.index} {s.chapter}：{s.title}
            </h3>
            <p>{s.hook}</p>
            <p>{s.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function useActiveScene(progress: MotionValue<number>, sceneAt: (p: number) => number) {
  const [scene, setScene] = useState(() => sceneAt(progress.get()));
  useMotionValueEvent(progress, "change", (v) => setScene(sceneAt(v)));
  return scene;
}

export function Story({ scenes, trackVh, outlineTitle, ...stage }: StoryProps) {
  const track = useRef<HTMLElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const progress = usePinnedProgress(track, pinned);
  const scene = useActiveScene(progress, stage.timeline.sceneAt);

  // "Next scene": smooth-scroll to the next stop, or past the story after the last one.
  const next = () => {
    const t = track.current;
    const v = pinned.current;
    if (!t || !v) return;
    const top = t.getBoundingClientRect().top + window.scrollY;
    const stop = stage.timeline.nextStop(progress.get());
    const y = stop === null ? top + t.offsetHeight : top + stop * (t.offsetHeight - v.offsetHeight) + 1;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <section
      id="story"
      ref={track}
      aria-label={outlineTitle}
      data-testid="story-track"
      // Read by e2e/verify.mjs: where each scene has fully played, and which key it has.
      data-stops={scenes.map((_, i) => stage.timeline.settledProgress(i).toFixed(4)).join(",")}
      data-keys={scenes.map((s) => s.key).join(",")}
      className="border-line relative border-t"
      style={{ height: `calc(var(${STABLE_VH}, 1vh) * ${trackVh})` }}
    >
      <StoryOutline scenes={scenes} title={outlineTitle} />
      <div
        ref={pinned}
        data-testid="story-viewport"
        className="sticky top-0 flex flex-col gap-3 overflow-hidden px-3 pt-4 pb-3 sm:px-6 sm:pt-6"
        style={{ height: `calc(var(${STABLE_VH}, 1vh) * 100)` }}
      >
        <div className="mx-auto flex w-full max-w-[88rem] shrink-0 items-start justify-between gap-4">
          <div className="min-h-[4.5rem] sm:min-h-[5rem]">
            <Caption scene={scene} scenes={scenes} />
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="下一幕"
            className="border-line text-muted hover:border-primary hover:text-primary focus-visible:outline-primary shrink-0 rounded-full border px-4 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="hidden sm:inline">下一幕 </span>↓
          </button>
        </div>
        <div className="border-line mx-auto min-h-0 w-full max-w-[88rem] flex-1 overflow-hidden rounded-2xl border shadow-[0_28px_100px_rgba(0,0,0,0.32)]">
          <Stage progress={progress} {...stage} />
        </div>
      </div>
    </section>
  );
}
