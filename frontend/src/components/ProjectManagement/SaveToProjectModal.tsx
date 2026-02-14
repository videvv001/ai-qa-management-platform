import { useEffect, useState } from "react";
import type { BatchFeatureResult } from "@/api/types";
import {
  getProjects,
  getModules,
  createProject,
  createModule,
  type ProjectResponse,
  type ModuleResponse,
} from "@/api/client";
import { Button } from "@/components/ui/button";

function flattenModules(list: ModuleResponse[]): ModuleResponse[] {
  const result: ModuleResponse[] = [];
  const walk = (nodes: ModuleResponse[]) => {
    for (const n of nodes) {
      result.push(n);
      if (n.children?.length) {
        walk(n.children);
      }
    }
  };
  walk(list);
  return result;
}

interface Props {
  open: boolean;
  feature: BatchFeatureResult | null;
  onClose: () => void;
  onSave: (moduleId: number, feature: BatchFeatureResult) => Promise<void>;
  onSuccess?: (message: string) => void;
}

export function SaveToProjectModal({
  open,
  feature,
  onClose,
  onSave,
  onSuccess,
}: Props) {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [modules, setModules] = useState<ModuleResponse[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newModuleName, setNewModuleName] = useState("");
  const [newModuleParentId, setNewModuleParentId] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingModule, setCreatingModule] = useState(false);

  const flatModules = flattenModules(modules);
  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedModule = flatModules.find((m) => m.id === moduleId);

  const loadProjects = async () => {
    try {
      const ps = await getProjects();
      setProjects(ps);
      return ps;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
      return [];
    }
  };

  const loadModulesForProject = async (pid: number) => {
    try {
      const ms = await getModules(pid);
      setModules(ms);
      return ms;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load modules");
      return [];
    }
  };

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      setShowCreateProject(false);
      setShowCreateModule(false);
      try {
        const ps = await loadProjects();
        if (ps.length > 0) {
          setProjectId(ps[0].id);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open]);

  useEffect(() => {
    if (!projectId) {
      setModules([]);
      setModuleId(null);
      return;
    }
    const load = async () => {
      const ms = await loadModulesForProject(projectId);
      const flat = flattenModules(ms);
      setModuleId(flat[0]?.id ?? null);
    };
    void load();
  }, [projectId]);

  if (!open || !feature) return null;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setError("Project name is required");
      return;
    }
    setCreatingProject(true);
    setError(null);
    try {
      const created = await createProject({
        name: newProjectName.trim(),
        description: newProjectDesc.trim() || undefined,
      });
      await loadProjects();
      setProjectId(created.id);
      setModules([]);
      setModuleId(null);
      setNewProjectName("");
      setNewProjectDesc("");
      setShowCreateProject(false);
      onSuccess?.(`Project '${created.name}' created successfully`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newModuleName.trim()) {
      setError("Module name is required");
      return;
    }
    setCreatingModule(true);
    setError(null);
    try {
      const created = await createModule(projectId, {
        name: newModuleName.trim(),
        parent_id: newModuleParentId ?? undefined,
      });
      await loadModulesForProject(projectId);
      setModuleId(created.id);
      setNewModuleName("");
      setNewModuleParentId(null);
      setShowCreateModule(false);
      onSuccess?.(`Module '${created.name}' created successfully`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create module");
    } finally {
      setCreatingModule(false);
    }
  };

  const handleSave = async () => {
    if (!moduleId) {
      setError("Please select a module");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(moduleId, feature);
      const count = feature.items?.length ?? 0;
      const projectName = selectedProject?.name ?? "Project";
      const moduleName = selectedModule?.name ?? "Module";
      onSuccess?.(`Successfully saved ${count} test case${count !== 1 ? "s" : ""} to ${projectName} > ${moduleName}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save test cases");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5 max-h-[90vh] overflow-auto">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
          Save to Project
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Save generated test cases for <strong>{feature.feature_name}</strong> into an existing project and module.
        </p>
        {error && (
          <div className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</div>
        )}
        {loading ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Project
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                  value={projectId ?? ""}
                  onChange={(e) => {
                    setProjectId(Number(e.target.value) || null);
                    setShowCreateProject(false);
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreateProject(!showCreateProject);
                    setShowCreateModule(false);
                  }}
                  className="shrink-0"
                >
                  + Create New
                </Button>
              </div>
              {showCreateProject && (
                <form onSubmit={handleCreateProject} className="mt-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 space-y-2">
                  <input
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                    placeholder="Project name (required)"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                    placeholder="Description (optional)"
                    rows={2}
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCreateProject(false);
                        setNewProjectName("");
                        setNewProjectDesc("");
                      }}
                      disabled={creatingProject}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={creatingProject || !newProjectName.trim()}>
                      {creatingProject ? "Creating…" : "Create Project"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
            {projectId && (
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Module
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                    value={moduleId ?? ""}
                    onChange={(e) => {
                      setModuleId(Number(e.target.value) || null);
                      setShowCreateModule(false);
                    }}
                  >
                    {flatModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {flatModules.length === 0 && (
                      <option value="">(No modules yet)</option>
                    )}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCreateModule(!showCreateModule);
                      setShowCreateProject(false);
                    }}
                    className="shrink-0"
                  >
                    + Create New
                  </Button>
                </div>
                {showCreateModule && (
                  <form onSubmit={handleCreateModule} className="mt-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 space-y-2">
                    <input
                      className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                      placeholder="Module name (required)"
                      value={newModuleName}
                      onChange={(e) => setNewModuleName(e.target.value)}
                    />
                    <div>
                      <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-0.5">
                        Parent module (optional)
                      </label>
                      <select
                        className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                        value={newModuleParentId ?? ""}
                        onChange={(e) => setNewModuleParentId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">(No parent)</option>
                        {flatModules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowCreateModule(false);
                          setNewModuleName("");
                          setNewModuleParentId(null);
                        }}
                        disabled={creatingModule}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={creatingModule || !newModuleName.trim()}>
                        {creatingModule ? "Creating…" : "Create Module"}
                      </Button>
                    </div>
                  </form>
                )}
                {flatModules.length === 0 && !showCreateModule && (
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    This project has no modules yet. Create one above.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !moduleId || projects.length === 0}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
