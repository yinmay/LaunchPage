import { useState } from "react";
import type { PickedElement } from "../../../shared/types.ts";
import { api, useProject } from "../api.ts";
import { Chat } from "./Chat.tsx";
import { Preview } from "./Preview.tsx";

export function Workspace({ projectId }: { projectId: string }) {
  const { snap, error } = useProject(projectId);
  const [picks, setPicks] = useState<PickedElement[]>([]);
  // 递增即通知预览清除框选高亮
  const [clearToken, setClearToken] = useState(0);

  if (error && !snap) {
    return (
      <div className="center-state" role="alert">
        <p>Failed to load project: {error}</p>
        <a className="btn btn-ghost" href="#/">
          Back
        </a>
      </div>
    );
  }
  if (!snap) return <div className="center-state muted">Loading…</div>;

  const clearPicks = () => {
    setPicks([]);
    setClearToken((t) => t + 1);
  };

  return (
    <div className="workspace">
      <Chat
        snap={snap}
        picks={picks}
        onRemovePick={(i) => {
          const next = picks.filter((_, j) => j !== i);
          if (next.length === 0) clearPicks();
          else setPicks(next);
        }}
        onSend={async (text) => {
          await api.send(projectId, text, picks);
          clearPicks();
        }}
        onStop={() => api.stop(projectId)}
        onSwitchAgent={(a) => api.setAgent(projectId, a)}
      />
      <Preview
        projectId={projectId}
        preview={snap.preview}
        running={snap.running}
        clearToken={clearToken}
        onPick={(el, additive) => setPicks((prev) => additive ? [...prev, el].slice(-10) : [el])}
      />
    </div>
  );
}
