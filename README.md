# launchPage

> 产品首发素材 Agent：把产品资料交给你本机的 Coding Agent，得到首发用的 Landing Page。

launchPage 是一个纯本地运行的网站，它本身不带模型。它调度你本机已经装好的 **Claude Code** 或 **Codex**，
让 Agent 用 内置的 [`product-demo-site`](skills/product-demo-site/SKILL.md) skill 生成产品演示官网，
并提供一个「左边对话、右边实时预览」的工作台：

1. **选 Agent**：自动检测本机的 `claude` / `codex`。
2. **给资料**：代码库路径、产品网址、补充说明，至少填一项。
3. **生成**：Agent 研究产品、起草 brief。到了人工闸门会在对话里问你，你回答后它继续。
4. **实时预览**：站点一生成，launchPage 就自动把它跑起来，显示在右侧。
5. **框选微调**：点「框选」，在预览里单击选中元素，或拖一个框选中区域，再写下修改意见发给 Agent。
6. **自动刷新**：Agent 改完文件后，预览通过 Vite HMR 自动更新，形成闭环。

## 快速开始

```bash
pnpm install
pnpm start          # 构建前端，并在 http://127.0.0.1:4710 启动
```

开发模式（前后端热更新）：`pnpm dev`，然后打开 http://127.0.0.1:4711。

前置条件：Node ≥ 22.12、pnpm，以及至少一个已登录的 `claude` 或 `codex`。如果 pnpm 使用了旧版本 Node，先运行 `nvm use 22`。

skill 会用 Playwright 截取产品页面、校验生成的站点，首次使用前请装好浏览器：

```bash
npx playwright install chromium
```

### 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LAUNCHPAGE_PORT` | `4710` | 服务端口 |
| `LAUNCHPAGE_HOME` | `项目内 `.local/`` | 项目数据目录 |
| `LAUNCHPAGE_LANDING_SKILL` | 仓库内的 `skills/product-demo-site` | Landing Page skill 目录（调试 skill 时可指向别处） |

## 工作原理

```
浏览器 (web/)  ──HTTP + SSE──▶  launchPage 服务 (server/)  ──spawn──▶  claude -p / codex exec --json
     │                                │                                      │ 在项目目录里工作
     │ iframe                         │ 托管 site/ 的 vite dev server         ▼
     └──────── 预览代理（注入框选脚本，透传 HMR）◀───────────────  项目内 `.local/`/projects/<id>/site/
```

- **一轮对话启动一个 Agent 进程**，用会话 id 续接：Claude 用 `--resume`，Codex 用 `exec resume`。
  会话保存在 Agent 自己的历史里，所以随时可以在终端用 `claude --resume <id>` 接手同一段对话。
- **项目约定写在 `AGENTS.md` / `CLAUDE.md` 里**，不只放在首轮 prompt 中。这样每一轮都生效，切换 Agent 后新会话也能读到。
- **预览由 launchPage 托管**：Agent 被约定不要自己起 dev server。站点装好依赖后，launchPage 启动它的 vite，
  再在前面挂一个反向代理。代理往 HTML 里注入框选脚本，并原样透传 WebSocket，所以 HMR 照常工作。
  用户站点的代码和配置都不会被改动。
- **框选**：脚本通过 `postMessage` 把元素的选择器、HTML 片段、可见文字和当时的滚动进度交给宿主页。
  这些信息和你的修改意见一起拼成给 Agent 的消息（见 `server/prompts.ts`）。

## 安全

Codex 使用 `workspace-write` 沙箱并允许联网获取产品资料与安装依赖；Claude 使用 `acceptEdits`，
预先允许读取、编辑和生成站点所需的构建命令，不关闭全部权限检查。源码资料应只读使用。
服务限制：

- 服务只监听 `127.0.0.1`；
- API 只接受 localhost 的 Host，用来防 DNS rebinding；有 Origin 头时必须来自本机，用来防 CSRF；
- 写操作必须是 `application/json`，跨站请求会被迫先走 CORS 预检，而服务端不返回 CORS 头。

请只把你信任的代码库和网址交给它。

## 目录

```
server/          Node 服务（Hono）
  agents/        Claude Code / Codex 适配：参数拼装 + 事件流 → 对话条目
  session.ts     每个项目的会话：轮次、广播、落盘、预览轮询
  preview.ts     托管站点的 vite dev server
  preview-proxy.ts  注入框选脚本 + 透传 HMR 的反向代理
  picker/picker.js  注入到预览里的框选脚本
  prompts.ts     AGENTS.md 与给 Agent 的消息模板
shared/types.ts  前后端契约
skills/product-demo-site/  内置的 Landing Page skill（SKILL.md + references + 站点模板）
web/             React 前端
test/            单测 + 替身 Agent（回放真实录制的事件流）
```

## 测试

```bash
pnpm test        # 适配层、会话层、预览代理
pnpm typecheck
pnpm test:e2e    # Google Chrome：两个 Agent 协议替身的完整交互闭环
```

`test/fake-bin/` 里的替身 `claude` / `codex` 会回放从真实 CLI 录下的事件流（claude 2.1.316、codex-cli 0.157），
不调用模型。`test/e2e-bin/` 里是一个「剧本 Agent」，用于在浏览器里端到端走一遍完整的 GUI 闭环：

```bash
PATH="$PWD/test/e2e-bin:$PATH" LAUNCHPAGE_HOME=/tmp/lp-e2e pnpm start
```

## 已知限制 / 下一步

- 宣传视频：只在界面上预留了入口（可接 `code-cinema` skill）。
- 每轮起一个新进程：Agent 在某一轮里启动的后台进程，会在这一轮结束时被一起回收。
- 框选只给出元素信息，不附截图。如果 Agent 定位不准，可以在修改意见里多描述一句。

## 实现来源

基于本机 LaunchReel 原型复用 Agent 协议适配、预览代理及内置 Skill，参考 CanvasAgents 的本地 Agent GUI 调度方式。launchPage 独立运行，数据默认保存在本项目 `.local/`，不影响原项目。
