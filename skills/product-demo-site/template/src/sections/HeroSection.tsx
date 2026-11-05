// The hero: the promise, then the product's REAL interface right under it, so the first
// screen already shows what the product is. Stacked and centred by default — deliberately
// not the left-text / right-screenshot split every AI landing page reaches for. If the
// product suggests a better composition, change it (references/visual-rules.md).

import { motion } from "motion/react";
import { SITE } from "../content/site.ts";

const RISE = { hidden: { opacity: 0, y: 24 }, shown: { opacity: 1, y: 0 } };
const GUTTER = "mx-auto w-full max-w-[72rem] px-5 sm:px-8";

export function HeroSection() {
  const { hero } = SITE;
  return (
    <header className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
      <nav className={`${GUTTER} flex items-center justify-between py-5`}>
        <span className="text-ink font-display text-base font-semibold">{SITE.name}</span>
        <ul className="text-muted hidden gap-6 text-sm sm:flex">
          {SITE.nav.map((item) => (
            <li key={item.label}>
              <a href={item.href} className="hover:text-primary transition-colors">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <motion.div
        initial="hidden"
        animate="shown"
        transition={{ staggerChildren: 0.12 }}
        className={`${GUTTER} flex flex-col items-center pt-[9vh] text-center`}
      >
        <motion.p variants={RISE} className="text-primary text-sm font-medium tracking-[0.2em]">
          {hero.eyebrow}
        </motion.p>
        <motion.h1
          variants={RISE}
          className="text-ink font-display mt-5 text-[clamp(1.9rem,6vw,4.4rem)] leading-[1.12] font-semibold"
        >
          {hero.title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </motion.h1>
        <motion.p variants={RISE} className="text-muted mt-6 max-w-[36rem] text-base sm:text-lg">
          {hero.promise}
        </motion.p>
        <motion.div variants={RISE} className="mt-9 flex flex-wrap justify-center gap-3">
          <a
            href={hero.primary.href}
            className="bg-primary text-surface focus-visible:outline-primary rounded-full px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {hero.primary.label}
          </a>
          <a
            href={hero.secondary.href}
            className="border-line text-ink hover:border-primary focus-visible:outline-primary rounded-full border px-7 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {hero.secondary.label} ↓
          </a>
        </motion.div>
        {hero.image ? (
          <motion.figure
            variants={RISE}
            className="border-line bg-surface mt-14 mb-0 w-full max-w-[64rem] overflow-hidden rounded-t-xl border border-b-0 shadow-2xl"
          >
            <div className="border-line bg-elevated flex h-8 items-center gap-1.5 border-b px-3">
              <span className="bg-line size-2.5 rounded-full" />
              <span className="bg-line size-2.5 rounded-full" />
              <span className="bg-line size-2.5 rounded-full" />
            </div>
            <img src={hero.image} alt={hero.imageAlt} className="block max-h-[46vh] w-full object-cover object-top" />
          </motion.figure>
        ) : null}
      </motion.div>
    </header>
  );
}
