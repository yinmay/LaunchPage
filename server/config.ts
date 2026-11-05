import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** launchPage 的数据目录：每个项目一个子目录，Agent 就在里面干活 */
export const LAUNCHPAGE_HOME = process.env.LAUNCHPAGE_HOME ?? fileURLToPath(new URL("../.local", import.meta.url));
export const PROJECTS_DIR = join(LAUNCHPAGE_HOME, "projects");

/**
 * 生成 Landing Page 用的 skill。默认用仓库内置的 skills/product-demo-site（clone 下来即可用），
 * 调试 skill 时可用环境变量指向别处的副本。
 */
export const LANDING_SKILL_DIR =
  process.env.LAUNCHPAGE_LANDING_SKILL ??
  fileURLToPath(new URL("../skills/product-demo-site", import.meta.url));

export const SERVER_PORT = Number(process.env.LAUNCHPAGE_PORT ?? 4710);
export const IS_PROD = process.env.NODE_ENV === "production";

/** Agent 生成的站点固定放在项目目录下的 site/（与 skill 的约定一致） */
export const SITE_DIRNAME = "site";
