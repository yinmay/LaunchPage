// The canvas vocabulary: things drawn on the boards. Each part is positioned in BOARD
// coordinates (px at zoom 1) and appears at a GLOBAL progress `at` (use timeline.beat()).
// Once drawn, a part stays — the canvas accumulating the whole delivery IS the story, and
// the finale pulls back to show all of it.
//
// Progress comes from context, not props: a board has dozens of parts, and threading the
// same MotionValue through each would bury what they draw.

import { type MotionValue, motion, useTransform } from "motion/react";
import { createContext, type ReactNode, useContext } from "react";

export const StoryProgress = createContext<MotionValue<number> | null>(null);

export function useStoryProgress(): MotionValue<number> {
  const progress = useContext(StoryProgress);
  if (!progress) throw new Error("canvas parts must render inside <StoryProgress.Provider>");
  return progress;
}

/** How long (in global progress) an element takes to pop in. */
const POP = 0.004;

export function useAppear(at: number, span = POP) {
  const progress = useStoryProgress();
  const opacity = useTransform(progress, [at, at + span], [0, 1]);
  const scale = useTransform(progress, [at, at + span], [0.94, 1]);
  return { opacity, scale };
}

/** A 0→1 value over [from, to] — strokes being drawn, bars filling. */
export function useDraw(from: number, to: number) {
  const progress = useStoryProgress();
  return useTransform(progress, [from, to], [0, 1]);
}

/** `before` until `at`, then `after` — a state change on the canvas (☐ → ✓, 失败 → 通过). */
export function useSwap(at: number) {
  const progress = useStoryProgress();
  const after = useTransform(progress, [at, at + POP], [0, 1]);
  const before = useTransform(progress, [at, at + POP], [1, 0]);
  return { before, after };
}

export interface Placed {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** Anything, absolutely placed, appearing at `at`. */
export function Drawn({
  at,
  x,
  y,
  w,
  h,
  className = "",
  children,
}: Placed & { at: number; className?: string; children?: ReactNode }) {
  const { opacity, scale } = useAppear(at);
  return (
    <motion.div
      style={{ left: x, top: y, width: w, height: h, opacity, scale }}
      className={`absolute ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** A board: a large label above a dashed outline. The label must read at finale zoom. */
export function Board({
  rect,
  at,
  index,
  title,
  children,
}: {
  rect: { x: number; y: number; w: number; h: number };
  at: number;
  index: string;
  title: string;
  children?: ReactNode;
}) {
  const { opacity } = useAppear(at, 0.01);
  return (
    <div className="absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <motion.div style={{ opacity }} className="absolute inset-0">
        <p className="text-muted absolute -top-12 left-0 flex items-baseline gap-3 text-[26px] whitespace-nowrap">
          <span className="text-primary font-mono text-[22px]">{index}</span>
          {title}
        </p>
        <div className="border-line absolute inset-0 rounded-[18px] border-2 border-dashed" />
      </motion.div>
      {children}
    </div>
  );
}

// Notes take their colour from the brand tokens, never from hard-coded hex: the page must
// look like the product, whatever its palette.
const STICKY_TONE = {
  yellow: "bg-surface border-warn text-ink border-l-[6px]",
  green: "bg-surface border-primary text-ink border-l-[6px]",
  violet: "bg-surface border-secondary text-ink border-l-[6px]",
} as const;

/** A sticky note — thoughts, questions, decisions. */
export function Sticky({
  at,
  x,
  y,
  w = 220,
  tone = "yellow",
  rotate = 0,
  children,
}: Placed & {
  at: number;
  tone?: keyof typeof STICKY_TONE;
  rotate?: number;
  children: ReactNode;
}) {
  const { opacity, scale } = useAppear(at);
  return (
    <motion.div
      style={{ left: x, top: y, width: w, opacity, scale, rotate }}
      className={`absolute rounded-md border p-4 text-[17px] leading-snug shadow-lg ${STICKY_TONE[tone]}`}
    >
      {children}
    </motion.div>
  );
}

/** A card with a title bar — a document, a design, a screen. */
export function Card({
  at,
  x,
  y,
  w,
  h,
  title,
  accent = false,
  children,
}: Placed & { at: number; title?: string; accent?: boolean; children?: ReactNode }) {
  const { opacity, scale } = useAppear(at);
  return (
    <motion.div
      style={{ left: x, top: y, width: w, height: h, opacity, scale }}
      className={`bg-surface absolute flex flex-col overflow-hidden rounded-xl border shadow-xl ${
        accent ? "border-primary" : "border-line"
      }`}
    >
      {title ? (
        <p className="border-line text-muted shrink-0 border-b px-4 py-2 font-mono text-[14px]">
          {title}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1 p-4">{children}</div>
    </motion.div>
  );
}

/** A checklist row that appears unchecked at `at` and ticks at `doneAt`. */
export function CheckRow({
  at,
  doneAt,
  x,
  y,
  w = 560,
  code,
  children,
}: Placed & { at: number; doneAt?: number; code?: string; children: ReactNode }) {
  const { opacity, scale } = useAppear(at);
  const swap = useSwap(doneAt ?? 2);
  return (
    <motion.div
      style={{ left: x, top: y, width: w, opacity, scale }}
      className="border-line bg-surface absolute flex items-center gap-3 rounded-lg border px-4 py-2.5 text-[17px]"
    >
      <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
        <motion.span style={{ opacity: swap.before }} className="border-subtle absolute size-5 rounded border-2" />
        <motion.span
          style={{ opacity: swap.after }}
          className="bg-primary text-surface absolute flex size-6 items-center justify-center rounded text-[15px] font-bold"
        >
          ✓
        </motion.span>
      </span>
      {code ? <span className="text-primary font-mono text-[14px]">{code}</span> : null}
      <span className="text-ink">{children}</span>
    </motion.div>
  );
}

const LOG_TONE = {
  plain: "text-muted",
  ok: "text-primary",
  fail: "text-danger",
  warn: "text-warn",
  cmd: "text-ink",
} as const;

/** One line of a terminal log. */
export function LogLine({
  at,
  x,
  y,
  tone = "plain",
  children,
}: Placed & { at: number; tone?: keyof typeof LOG_TONE; children: ReactNode }) {
  const { opacity } = useAppear(at, 0.002);
  return (
    <motion.p
      style={{ left: x, top: y, opacity }}
      className={`absolute font-mono text-[16px] whitespace-nowrap ${LOG_TONE[tone]}`}
    >
      {children}
    </motion.p>
  );
}

/** A stamp — a decision made by a human (通过 / 已回滚). */
export function Stamp({
  at,
  x,
  y,
  tone = "primary",
  children,
}: Placed & { at: number; tone?: "primary" | "warn" | "danger"; children: ReactNode }) {
  const progress = useStoryProgress();
  const opacity = useTransform(progress, [at, at + POP], [0, 1]);
  const scale = useTransform(progress, [at, at + POP * 1.5], [1.6, 1]);
  const color = { primary: "border-primary text-primary", warn: "border-warn text-warn", danger: "border-danger text-danger" }[tone];
  return (
    <motion.div
      style={{ left: x, top: y, opacity, scale, rotate: -8 }}
      className={`absolute rounded-lg border-[3px] px-4 py-1 text-[24px] font-bold tracking-widest ${color}`}
    >
      {children}
    </motion.div>
  );
}

/** A hand-drawn circle around something — a problem being pointed at. */
export function HandCircle({ at, x, y, w, h }: Placed & { at: number; w: number; h: number }) {
  const length = useDraw(at, at + 0.01);
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: x, top: y }} width={w} height={h}>
      <motion.ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2}
        ry={h / 2}
        fill="none"
        stroke="var(--color-danger)"
        strokeWidth={4}
        style={{ pathLength: length }}
      />
    </svg>
  );
}

/** An arrow drawn between two WORLD points at `at` — chains boards into one path. */
export function Arrow({
  at,
  from,
  to,
  span = 0.006,
}: {
  at: number;
  from: readonly [number, number];
  to: readonly [number, number];
  span?: number;
}) {
  const length = useDraw(at, at + span);
  // A zero-length line with round caps still paints a dot, so the stroke stays hidden
  // until it has started drawing.
  const visible = useTransform(length, [0, 0.02], [0, 1]);
  const head = useTransform(length, [0.9, 1], [0, 1]);
  const left = Math.min(from[0], to[0]) - 20;
  const top = Math.min(from[1], to[1]) - 20;
  const a = [from[0] - left, from[1] - top];
  const b = [to[0] - left, to[1] - top];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const tip = (d: number, turn: number) =>
    `${b[0] - d * Math.cos(angle + turn)},${b[1] - d * Math.sin(angle + turn)}`;
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left, top }}
      width={Math.abs(to[0] - from[0]) + 40}
      height={Math.abs(to[1] - from[1]) + 40}
    >
      <motion.line
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="var(--color-primary)"
        strokeWidth={4}
        strokeLinecap="round"
        style={{ pathLength: length, opacity: visible }}
      />
      <motion.polyline
        points={`${tip(18, 0.5)} ${b[0]},${b[1]} ${tip(18, -0.5)}`}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: head }}
      />
    </svg>
  );
}

// ── Real product UI ─────────────────────────────────────────────────────────
// The point of the page is to show the product's REAL interface. A Screen is a real
// screenshot (captured with `pnpm capture`, see scripts/capture.mjs) or a real component,
// placed on the stage at world scale, inside a light browser / phone chrome.

/** A real screen of the product. `src` is a captured screenshot; `children` a real component. */
export function Screen({
  at,
  x,
  y,
  w,
  h,
  src,
  alt,
  device = "browser",
  label,
  children,
}: Placed & {
  at: number;
  w: number;
  h: number;
  src?: string;
  alt?: string;
  device?: "browser" | "phone";
  label?: string;
  children?: ReactNode;
}) {
  const { opacity, scale } = useAppear(at, 0.008);
  const chrome = device === "browser" ? 36 : 0;
  return (
    <motion.figure
      style={{ left: x, top: y, width: w, height: h, opacity, scale }}
      className={`border-line bg-surface absolute m-0 overflow-hidden border shadow-2xl ${
        device === "phone" ? "rounded-[36px] border-[10px]" : "rounded-xl"
      }`}
    >
      {device === "browser" ? (
        <div className="border-line bg-elevated flex items-center gap-2 border-b px-4" style={{ height: chrome }}>
          <span className="bg-line size-3 rounded-full" />
          <span className="bg-line size-3 rounded-full" />
          <span className="bg-line size-3 rounded-full" />
          {label ? <span className="text-subtle ml-3 truncate font-mono text-[13px]">{label}</span> : null}
        </div>
      ) : null}
      <div className="relative overflow-hidden" style={{ height: h - chrome }}>
        {src ? <img src={src} alt={alt ?? ""} className="block w-full" draggable={false} /> : children}
      </div>
    </motion.figure>
  );
}

/** A box drawn around a real UI element — "look here". Coordinates in world px. */
export function Highlight({ at, x, y, w, h }: Placed & { at: number; w: number; h: number }) {
  const length = useDraw(at, at + 0.01);
  const visible = useTransform(length, [0, 0.02], [0, 1]);
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: x, top: y }} width={w} height={h}>
      <motion.rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={12}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={5}
        style={{ pathLength: length, opacity: visible }}
      />
    </svg>
  );
}

/** A short note pinned next to the UI — what this part of the product does. */
export function Callout({
  at,
  x,
  y,
  w = 320,
  children,
}: Placed & { at: number; children: ReactNode }) {
  const { opacity, scale } = useAppear(at);
  return (
    <motion.div
      style={{ left: x, top: y, width: w, opacity, scale }}
      className="bg-primary text-surface absolute rounded-xl px-5 py-4 text-[22px] leading-snug font-medium shadow-xl"
    >
      {children}
    </motion.div>
  );
}
