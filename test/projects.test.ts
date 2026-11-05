// 立项校验：代码库 / 资料目录是选填的，写成文字说明不应报错
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let projects: typeof import("../server/projects.ts");
beforeAll(async () => {
  process.env.LAUNCHPAGE_HOME = mkdtempSync(join(tmpdir(), "lr-proj-"));
  projects = await import("../server/projects.ts");
});

const base = { name: "v0", agent: "claude" as const };

describe("createProject 资料校验", () => {
  it("代码库一栏写的是文字说明时不报错，而是并入补充说明", async () => {
    const p = await projects.createProject({
      ...base,
      materials: { repoPaths: ["没有对应的代码库"], urls: ["https://v0.app/"], notes: "看看官网素材" },
    });
    expect(p.materials.repoPaths).toEqual([]);
    expect(p.materials.notes).toBe("看看官网素材\n\nRepository notes: 没有对应的代码库");
  });

  it("支持 ~/ 开头的路径", async () => {
    const p = await projects.createProject({
      ...base,
      materials: { repoPaths: ["~/"], urls: [], notes: "" },
    });
    expect(p.materials.repoPaths).toEqual([join(homedir(), "")]);
  });

  it("明确写了路径但目录不存在时仍然提示（多半是手误）", async () => {
    await expect(
      projects.createProject({ ...base, materials: { repoPaths: ["/no/such/dir"], urls: [], notes: "" } }),
    ).rejects.toThrow("Directory not found");
  });

  it("只在代码库一栏写了文字也算提供了资料", async () => {
    const p = await projects.createProject({
      ...base,
      materials: { repoPaths: ["产品还没开源，参考官网即可"], urls: [], notes: "" },
    });
    expect(p.materials.notes).toContain("产品还没开源");
  });
});
