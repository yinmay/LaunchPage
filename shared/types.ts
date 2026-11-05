// 前后端共享的契约。只放两端都需要的类型，保持零运行时依赖。

export type AgentKind = "claude" | "codex";

export interface AgentInfo {
  kind: AgentKind;
  label: string;
  available: boolean;
  version?: string;
}

export interface Materials {
  /** 本机代码库 / 资料目录的绝对路径 */
  repoPaths: string[];
  /** 线上或预发布环境的网址 */
  urls: string[];
  /** 想强调的卖点、目标用户等补充说明 */
  notes: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  agent: AgentKind;
  materials: Materials;
  /** 每种 Agent 各自的会话 id，切换 Agent 时互不覆盖 */
  sessions: Partial<Record<AgentKind, string>>;
  dir: string;
}

/** 用户在预览里框选的元素 */
export interface PickedElement {
  selector: string;
  tag: string;
  text: string;
  html: string;
  rect: { x: number; y: number; width: number; height: number };
  /** 选中时页面的滚动进度（0–1）。产品演示官网由滚动驱动，同一元素在不同进度下表现不同 */
  scrollProgress: number;
}

export type ChatItem =
  | { id: string; kind: "user"; text: string; picks?: PickedElement[]; at: string }
  | { id: string; kind: "assistant"; text: string; at: string }
  | {
      id: string;
      kind: "tool";
      title: string;
      detail?: string;
      status: "running" | "done" | "error";
      at: string;
    }
  | { id: string; kind: "system"; text: string; level: "info" | "error"; at: string };

export type PreviewStatus = "none" | "installing" | "starting" | "ready" | "error";

export interface PreviewState {
  status: PreviewStatus;
  url?: string;
  error?: string;
}

export interface ProjectSnapshot {
  project: Project;
  items: ChatItem[];
  running: boolean;
  preview: PreviewState;
}

export type ServerEvent =
  | { type: "snapshot"; snapshot: ProjectSnapshot }
  | { type: "item"; item: ChatItem }
  | { type: "turn"; running: boolean }
  | { type: "preview"; preview: PreviewState }
  | { type: "project"; project: Project };

export interface CreateProjectInput {
  name: string;
  agent: AgentKind;
  materials: Materials;
}

export interface SendMessageInput {
  text: string;
  picks?: PickedElement[];
}

/** 预览 iframe → 宿主页 的 postMessage 消息 */
export type PickerToHost =
  | { source: "launchpage-preview"; type: "ready" }
  | { source: "launchpage-preview"; type: "picked"; element: PickedElement }
  | { source: "launchpage-preview"; type: "pick-mode-off" };

/** 宿主页 → 预览 iframe 的 postMessage 消息 */
export type HostToPicker =
  | { source: "launchpage-host"; type: "pick-mode"; on: boolean }
  | { source: "launchpage-host"; type: "clear" };
