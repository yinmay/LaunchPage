import { useCallback, useEffect, useState } from "react";
import type { Project } from "../../shared/types.ts";
import { api } from "./api.ts";
import { NewProject } from "./components/NewProject.tsx";
import { Workspace } from "./components/Workspace.tsx";

// 极简 hash 路由：#/ 新建项目，#/p/<id> 项目工作台
function useRoute(): [string | null, (id: string | null) => void] {
  const read = () => location.hash.match(/^#\/p\/([a-z0-9-]+)/)?.[1] ?? null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const onHash = () => setId(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((next: string | null) => {
    location.hash = next ? `#/p/${next}` : "#/";
  }, []);
  return [id, go];
}

export function App() {
  const [projectId, go] = useRoute();
  const [projects, setProjects] = useState<Project[]>([]);

  const loadProjects = useCallback(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换项目时也刷新列表
  useEffect(loadProjects, [loadProjects, projectId]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="launchPage home">
          <span className="brand-mark" aria-hidden>
            ▶
          </span>
          launchPage
        </a>
        <div className="topbar-right">
          {projects.length > 0 && (
            <label className="project-switch">
              <span className="sr-only">Switch project</span>
              <select
                value={projectId ?? ""}
                onChange={(e) => go(e.target.value || null)}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => go(null)}>
            + New project
          </button>
        </div>
      </header>
      <main className="main">
        {projectId ? (
          <Workspace key={projectId} projectId={projectId} />
        ) : (
          <NewProject
            onCreated={(p) => {
              loadProjects();
              go(p.id);
            }}
          />
        )}
      </main>
    </div>
  );
}
