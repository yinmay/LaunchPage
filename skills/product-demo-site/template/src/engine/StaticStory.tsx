// The same scenes for visitors who asked for reduced motion: ordinary stacked sections,
// each one the stage frozen at the moment its scene has fully played. Same stage, same
// canvas — only the progress no longer comes from scrolling. The reduced-motion visitor
// sees every scene, not a cut-down summary.

import { useMotionValue } from "motion/react";
import { Stage } from "./Stage.tsx";
import type { StoryProps } from "./Story.tsx";

function FrozenScene({ index, scenes, ...stage }: Omit<StoryProps, "trackVh" | "outlineTitle"> & { index: number }) {
  const scene = scenes[index];
  const progress = useMotionValue(stage.timeline.settledProgress(index));
  return (
    <section data-testid="story-static-scene" className="flex flex-col gap-4">
      <div>
        <h3 className="text-ink flex items-baseline gap-3 text-[clamp(1.2rem,2.6vw,1.8rem)] leading-tight font-medium">
          <span className="text-primary font-mono text-[0.6em] font-normal">{scene.index}</span>
          {scene.title}
        </h3>
        <p className="text-muted mt-1.5 text-sm">{scene.hook}</p>
      </div>
      <div className="border-line h-[34rem] overflow-hidden rounded-2xl border">
        <Stage progress={progress} {...stage} />
      </div>
    </section>
  );
}

export function StaticStory({ trackVh: _trackVh, outlineTitle, ...props }: StoryProps) {
  return (
    <section id="story" aria-label={outlineTitle} className="border-line border-t px-4 py-16 sm:px-8">
      <h2 className="sr-only">{outlineTitle}</h2>
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-16">
        {props.scenes.map((s, i) => (
          <FrozenScene key={s.key} index={i} {...props} />
        ))}
      </div>
    </section>
  );
}
