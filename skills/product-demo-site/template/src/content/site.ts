// Every word on the page outside the story lives here. Fill it from the brief
// (references/brief-template.md); `pnpm verify` fails while any TODO(brief) remains.

export const SITE = {
  name: "TODO(brief): 产品名",
  nav: [
    { label: "TODO(brief): 导航 1", href: "#story" },
    { label: "TODO(brief): 导航 2", href: "#cta" },
  ],
  hero: {
    eyebrow: "TODO(brief): 一句话定位（给谁 · 解决什么）",
    /** Two short lines beat one long one. */
    title: ["TODO(brief): 承诺第一行", "TODO(brief): 承诺第二行"],
    promise: "TODO(brief): 一句话展开承诺，不超过 40 字",
    primary: { label: "TODO(brief): 主按钮", href: "#cta" },
    secondary: { label: "看它怎么工作", href: "#story" },
    /** A REAL screenshot of the product (from `pnpm capture`), shown under the promise. */
    image: "" as string,
    imageAlt: "TODO(brief): 截图里是产品的哪个界面",
  },
  story: {
    outlineTitle: "TODO(brief): 故事总标题，例如「从一句话需求到上线的 N 个场景」",
  },
  cta: {
    title: ["TODO(brief): 收尾第一行", "TODO(brief): 收尾第二行"],
    button: { label: "TODO(brief): 收尾按钮", href: "#" },
    /** Three one-liners a visitor would repeat to a colleague. Each already shown above. */
    facts: ["TODO(brief): 事实 1", "TODO(brief): 事实 2", "TODO(brief): 事实 3"],
  },
  footer: {
    note: "TODO(brief): 版权 / 一句话",
    links: [{ label: "TODO(brief): 链接", href: "#" }],
  },
} as const;
