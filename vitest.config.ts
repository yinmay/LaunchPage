import { defineConfig } from "vitest/config";

// 与前端的 vite.config.ts（root=web）分开：测试跑在仓库根目录、Node 环境
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
