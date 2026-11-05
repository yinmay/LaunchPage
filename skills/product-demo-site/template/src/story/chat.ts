// What the agent panel shows, scene by scene. Every `at` is SCENE-LOCAL 0..1.
import type { SceneChat } from "../engine/AgentPanel.tsx";

export const STORY_CHATS: readonly SceneChat[] = [
  {
    label: "TODO(brief): Agent · 窗口名",
    open: [0.3, 1],
    rows: [
      { kind: "user", at: 0.32, text: "TODO(brief): 用户的一句话需求" },
      { kind: "agent", at: 0.4, text: "TODO(brief): Agent 的回应", points: ["TODO(brief): 要点"] },
    ],
  },
  {
    label: "TODO(brief): Agent · 窗口名",
    open: [0.2, 1],
    rows: [
      { kind: "tool", at: 0.25, doneAt: 0.5, text: "TODO(brief): 工具调用" },
      { kind: "notice", at: 0.6, tone: "done", text: "TODO(brief): 完成提示" },
    ],
  },
  { label: "", open: null, rows: [] },
];
