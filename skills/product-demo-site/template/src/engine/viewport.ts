// Scroll progress of the pinned story, and a viewport height that does not jitter.
//
// Why not `100vh` / `useScroll({ target })`: on phones the browser toolbar hides and
// reappears while scrolling, which changes the window height. A track measured against
// the window then scrubs by the toolbar's height on every change — a visible jump at the
// exact moment the visitor is watching. So the page measures its height ONCE (and again
// only when the WIDTH changes, i.e. rotation), stores it in a CSS variable, and progress
// is measured against the pinned box instead of the window.

import { type MotionValue, useMotionValue, useMotionValueEvent, useScroll } from "motion/react";
import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

/** CSS variable holding 1% of the stable viewport height, in px. */
export const STABLE_VH = "--stable-vh";

export function useStableViewportHeight(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let width = window.innerWidth;
    const apply = () => node.style.setProperty(STABLE_VH, `${window.innerHeight / 100}px`);
    apply();
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      apply();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [root]);
}

export function usePinnedProgress(
  track: RefObject<HTMLElement | null>,
  pinned: RefObject<HTMLElement | null>,
): MotionValue<number> {
  const { scrollY } = useScroll();
  const progress = useMotionValue(0);
  const geometry = useRef({ top: 0, span: 1 });

  const update = useCallback(() => {
    const { top, span } = geometry.current;
    progress.set(Math.min(1, Math.max(0, (scrollY.get() - top) / span)));
  }, [progress, scrollY]);

  useMotionValueEvent(scrollY, "change", update);

  useLayoutEffect(() => {
    const trackNode = track.current;
    const pinnedNode = pinned.current;
    if (!trackNode || !pinnedNode) return;
    const measure = () => {
      geometry.current = {
        top: trackNode.getBoundingClientRect().top + window.scrollY,
        span: Math.max(1, trackNode.offsetHeight - pinnedNode.offsetHeight),
      };
      update();
    };
    measure();
    // The document too: anything above the track (the hero) changing height moves its top.
    const observer = new ResizeObserver(measure);
    observer.observe(trackNode);
    observer.observe(pinnedNode);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [track, pinned, update]);

  return progress;
}
