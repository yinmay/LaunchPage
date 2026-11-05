import { useCallback, useEffect, useState } from "react";
import type {
  AgentInfo,
  AgentKind,
  ChatItem,
  CreateProjectInput,
  PickedElement,
  Project,
  ProjectSnapshot,
  ServerEvent,
} from "../../shared/types.ts";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    // 写操作必须带 JSON content-type，服务端靠它挡掉跨站请求
    headers: body !== undefined || method !== "GET" ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== "GET" ? "{}" : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `请求失败（${res.status}）`);
  return data as T;
}

export const api = {
  health: () => request<{ landingSkill: string; landingSkillFound: boolean }>("GET", "/api/health"),
  agents: () => request<AgentInfo[]>("GET", "/api/agents"),
  projects: () => request<Project[]>("GET", "/api/projects"),
  create: (input: CreateProjectInput) => request<Project>("POST", "/api/projects", input),
  snapshot: (id: string) => request<ProjectSnapshot>("GET", `/api/projects/${id}`),
  send: (id: string, text: string, picks?: PickedElement[]) =>
    request("POST", `/api/projects/${id}/messages`, { text, picks }),
  stop: (id: string) => request("POST", `/api/projects/${id}/stop`),
  setAgent: (id: string, agent: AgentKind) => request("POST", `/api/projects/${id}/agent`, { agent }),
  restartPreview: (id: string) => request("POST", `/api/projects/${id}/preview/restart`),
};

/** 订阅一个项目的实时状态：先拉快照，再通过 SSE 增量更新；断线重连后重新拉快照补齐 */
export function useProject(id: string) {
  const [snap, setSnap] = useState<ProjectSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .snapshot(id)
      .then((s) => {
        setSnap(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setSnap(null);
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onerror = () => setError("连接暂时中断，正在自动重连…");
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as ServerEvent;
      setError(null);
      setSnap((prev) => ev.type === "snapshot" ? ev.snapshot : (prev ? applyEvent(prev, ev) : prev));
    };
    return () => es.close();
  }, [id, refresh]);

  return { snap, error, refresh };
}

function applyEvent(s: ProjectSnapshot, ev: ServerEvent): ProjectSnapshot {
  switch (ev.type) {
    case "snapshot":
      return ev.snapshot;
    case "item":
      return { ...s, items: upsert(s.items, ev.item) };
    case "turn":
      return { ...s, running: ev.running };
    case "preview":
      return { ...s, preview: ev.preview };
    case "project":
      return { ...s, project: ev.project };
  }
}

function upsert(items: ChatItem[], item: ChatItem): ChatItem[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i < 0) return [...items, item];
  const next = items.slice();
  next[i] = item;
  return next;
}
