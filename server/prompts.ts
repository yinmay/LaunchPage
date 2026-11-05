import type { Materials, PickedElement, Project } from "../shared/types.ts";
import { LANDING_SKILL_DIR, SITE_DIRNAME, SERVER_PORT } from "./config.ts";

/**
 * 写进项目目录的 AGENTS.md（Codex 读）与 CLAUDE.md（Claude Code 读）。
 * 放在文件里而不是只放在首轮 prompt 里，是因为：每轮都会生效、切换 Agent 后新会话也能读到。
 */
export function agentsMd(project: Project): string {
  return `# launchPage 项目：${project.name}

你在 launchPage 里工作。launchPage 是一个运营素材 Agent 产品：用户提供产品资料，你负责生成产品的 Landing Page，
用户在 launchPage 的界面里实时预览并框选元素让你修改。

## 任务与方法

- 用 skill 生成 Landing Page：先完整阅读 \`${LANDING_SKILL_DIR}/SKILL.md\`，严格按它的工作流执行。
- 站点**必须**放在当前目录下的 \`./${SITE_DIRNAME}\`（即 \`cp -R ${LANDING_SKILL_DIR}/template ./${SITE_DIRNAME}\`），用 pnpm 安装依赖。
- 若沙箱无法启动浏览器，调用本地服务代为采集资料网址的真实截图与品牌：
  \`curl -fsS -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:${SERVER_PORT}/api/projects/${project.id}/capture\`。
  返回图片路径和品牌数据，文件位于当前项目的 captures/，可复制到站点 public/shots/ 使用。仅采集下面已提供的产品网址。

## 产品资料

${materialsMd(project.materials)}

## launchPage 的约定（必须遵守）

- 提供的代码库、资料目录和 skill 为只读参考；只在当前生成项目目录中写入文件。

1. **不要启动长期运行的开发服务器**（\`pnpm dev\`、\`vite\`、\`vite preview\` 等）来预览站点。
   launchPage 会自己托管 \`./${SITE_DIRNAME}\` 的预览，并在你改文件后自动热更新。
   \`pnpm capture\` / \`pnpm test\` / \`pnpm build\` / \`pnpm verify\` 这类会自行结束的命令可以正常跑。
   如果为了截图需要临时把用户的产品跑起来，用完必须关掉。
2. **需要用户确认时（例如 skill 里的人工闸门），把问题直接写在回复里，然后结束本轮。**
   用户会在 launchPage 的对话框里回答，下一轮你会收到答案。不要使用任何交互式提问工具。
3. 用户框选预览中的元素时，你会收到元素的 CSS 选择器、HTML 片段和当时页面的滚动进度。
   请据此在 \`./${SITE_DIRNAME}/src\` 里定位源码再修改；只改用户指出的部分，不要顺手重做其他地方。
4. Reply in English. Briefly explain what you did and what comes next.
`;
}

function materialsMd(m: Materials): string {
  const lines: string[] = [];
  if (m.repoPaths.length) {
    lines.push("代码库 / 资料目录（本机路径）：", ...m.repoPaths.map((p) => `- ${p}`), "");
  }
  if (m.urls.length) lines.push("产品网址：", ...m.urls.map((u) => `- ${u}`), "");
  if (m.notes.trim()) lines.push("用户补充说明：", "", m.notes.trim(), "");
  return lines.length ? lines.join("\n") : "（用户没有提供资料，请在第一轮回复里向用户索要。）";
}

export function kickoffPrompt(project: Project): string {
  return `请为「${project.name}」生成产品演示 Landing Page。
项目说明、产品资料和工作约定都在当前目录的 AGENTS.md 里，先读它，再读 skill 的 SKILL.md，然后开始。
到了需要我审 brief 的人工闸门时，把 brief 的要点发给我并停下来等我确认。`;
}

/** 把用户的修改意见和框选的元素拼成一条给 Agent 的消息 */
export function editPrompt(text: string, picks: PickedElement[] | undefined): string {
  if (!picks?.length) return text;
  const blocks = picks.map((p, i) => {
    const pct = Math.round(p.scrollProgress * 100);
    return `### 元素 ${i + 1}
- 选择器：\`${p.selector}\`
- 标签：<${p.tag}>
- 可见文字：${p.text ? `“${p.text}”` : "（无）"}
- 位置：页面滚动到 ${pct}% 时，位于视口 (${Math.round(p.rect.x)}, ${Math.round(p.rect.y)})，尺寸 ${Math.round(p.rect.width)}×${Math.round(p.rect.height)}
- HTML 片段：
\`\`\`html
${p.html}
\`\`\``;
  });
  return `我在 Landing Page 预览里框选了 ${picks.length} 个元素：

${blocks.join("\n\n")}

我的修改意见：
${text}

请在 ./${SITE_DIRNAME}/src 里找到对应源码完成修改。预览由 launchPage 托管，会自动刷新，不需要你启动 dev server。`;
}
