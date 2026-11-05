// The close: back to a nearly empty stage, so the last thing on screen is the button.
// The facts under it are there to be quoted — one line each, none of them a claim the
// page has not already shown happening.

import { motion } from "motion/react";
import { SITE } from "../content/site.ts";

export function CtaSection() {
  const { cta } = SITE;
  return (
    <section id="cta" className="border-line border-t px-5 py-24 text-center sm:px-8 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
        className="mx-auto flex w-full max-w-[38rem] flex-col items-center gap-7"
      >
        <h2 className="text-ink text-[clamp(1.8rem,6vw,3.2rem)] leading-[1.15] font-medium">
          {cta.title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h2>
        <a
          href={cta.button.href}
          className="bg-primary text-surface focus-visible:outline-primary inline-flex items-center rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {cta.button.label}
        </a>
        <ul className="text-subtle flex flex-col items-center gap-1.5 font-mono text-[11px]">
          {cta.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
