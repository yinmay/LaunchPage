// The page: hero → scroll story (or its static twin) → CTA → footer.
// Layout only. No data fetching: a marketing page that queried an API would go down with
// the API, and would show an anonymous visitor an empty list. Everything is fixtures.

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SITE } from "./content/site.ts";
import { StaticStory } from "./engine/StaticStory.tsx";
import { Story } from "./engine/Story.tsx";
import { useStableViewportHeight } from "./engine/viewport.ts";
import { CtaSection } from "./sections/CtaSection.tsx";
import { HeroSection } from "./sections/HeroSection.tsx";
import { SiteFooter } from "./sections/SiteFooter.tsx";
import { STORY_CHATS } from "./story/chat.ts";
import { SCENES, SHOTS, TIMELINE, TRACK_VH } from "./story/script.ts";
import { World } from "./story/World.tsx";

export function App() {
  // Read after mount: the choice is whether to MOUNT the scroll story at all. CSS could
  // hide it, but not stop it measuring scroll — and hiding it would hide the scenes.
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && prefersReducedMotion;

  const root = useRef<HTMLDivElement>(null);
  useStableViewportHeight(root);

  const story = {
    scenes: SCENES,
    timeline: TIMELINE,
    shots: SHOTS,
    World,
    chats: STORY_CHATS,
    trackVh: TRACK_VH,
    outlineTitle: SITE.story.outlineTitle,
  };

  return (
    <div ref={root} className="min-h-dvh">
      <HeroSection />
      {reduced ? <StaticStory {...story} /> : <Story {...story} />}
      <CtaSection />
      <SiteFooter />
    </div>
  );
}
