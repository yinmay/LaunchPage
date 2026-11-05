// 托管 Agent 生成的站点预览：site/ 就绪后由 launchPage 启动它的 vite dev server，
// 再在前面挂一个注入框选脚本的代理。Agent 不需要（也被约定不要）自己起 dev server。

import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type http from "node:http";
import { join } from "node:path";
import type { PreviewState } from "../shared/types.ts";
import { TailBuffer } from "./agents/types.ts";
import { createInjectingProxy } from "./preview-proxy.ts";
import { freePort, killGroup, onLines, spawnGroup } from "./proc.ts";

const READY_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;

export class SitePreview {
  state: PreviewState = { status: "none" };
  private vite?: ChildProcess;
  private proxy?: http.Server;
  private busy = false;

  constructor(
    private siteDir: string,
    private onChange: (s: PreviewState) => void,
  ) {}

  /**
   * 站点就绪就启动预览。
   * allowInstall=false 用于 Agent 正在跑的时候：没有 node_modules 说明 Agent 多半正在装依赖，不去抢。
   */
  async ensure({ allowInstall }: { allowInstall: boolean }): Promise<void> {
    if (this.busy) return;
    if (this.state.status === "ready" && this.vite?.exitCode === null) return;
    if (!existsSync(join(this.siteDir, "package.json"))) return this.set({ status: "none" });

    const hasDeps = existsSync(join(this.siteDir, "node_modules", ".bin", "vite"));
    if (!hasDeps && !allowInstall) return;

    this.busy = true;
    try {
      if (!hasDeps) {
        this.set({ status: "installing" });
        await this.install();
      }
      this.set({ status: "starting" });
      await this.startVite();
    } catch (err) {
      this.stop();
      this.set({ status: "error", error: (err as Error).message });
    } finally {
      this.busy = false;
    }
  }

  async restart(): Promise<void> {
    this.stop();
    this.set({ status: "none" });
    await this.ensure({ allowInstall: true });
  }

  stop(): void {
    if (this.vite) killGroup(this.vite);
    this.vite = undefined;
    this.proxy?.close();
    this.proxy?.closeAllConnections();
    this.proxy = undefined;
  }

  private set(s: PreviewState) {
    this.state = s;
    this.onChange(s);
  }

  private install(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tail = new TailBuffer(15);
      const child = spawnGroup("pnpm", ["install"], { cwd: this.siteDir, env: { CI: "true" } });
      onLines(child.stdout!, (l) => tail.push(l));
      onLines(child.stderr!, (l) => tail.push(l));
      const timer = setTimeout(() => {
        killGroup(child);
        reject(new Error("pnpm install timed out"));
      }, INSTALL_TIMEOUT_MS);
      child.on("error", (e) => reject(new Error(`Could not run pnpm: ${e.message}`)));
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`pnpm install failed: \n${tail}`));
      });
    });
  }

  private async startVite(): Promise<void> {
    const vitePort = await freePort();
    const tail = new TailBuffer(15);
    const vite = spawnGroup(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"],
      { cwd: this.siteDir, env: { BROWSER: "none", FORCE_COLOR: "0" } },
    );
    this.vite = vite;
    onLines(vite.stdout!, (l) => tail.push(l));
    onLines(vite.stderr!, (l) => tail.push(l));
    vite.on("exit", (code) => {
      // 只有当前这一个 vite 意外退出才报错；stop()/restart() 主动杀掉的不算
      if (this.vite === vite && this.state.status === "ready") {
        this.stop();
        this.set({ status: "error", error: `Preview server exited (${code}): \n${tail}` });
      }
    });

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!(await responds(vitePort))) {
      if (vite.exitCode !== null) throw new Error(`Vite failed to start: \n${tail}`);
      if (Date.now() > deadline) throw new Error(`Vite startup timed out: \n${tail}`);
      await new Promise((r) => setTimeout(r, 400));
    }

    const proxyPort = await freePort();
    const proxy = createInjectingProxy(vitePort);
    await new Promise<void>((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(proxyPort, "127.0.0.1", () => resolve());
    });
    this.proxy = proxy;
    this.set({ status: "ready", url: `http://127.0.0.1:${proxyPort}/` });
  }
}

async function responds(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}
