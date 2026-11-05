import { SITE } from "../content/site.ts";

export function SiteFooter() {
  return (
    <footer className="border-line text-subtle border-t px-5 py-8 text-xs sm:px-8">
      <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-4">
        <p>{SITE.footer.note}</p>
        <ul className="flex gap-5">
          {SITE.footer.links.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="hover:text-primary transition-colors">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
