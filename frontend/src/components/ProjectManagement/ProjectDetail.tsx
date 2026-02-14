import { useEffect, useState, useRef, useCallback } from "react";
import {
  createModule,
  getProject,
  getTestCasesByModule,
  type ModuleResponse,
  type ModuleTestCaseWithLatestExecution,
} from "@/api/client";
import type { LeaveConfirmResult } from "@/components/TestExecution/ExecutionTable";
import { ImportModal } from "./ImportModal";
import { ModuleTree } from "./ModuleTree";
import { ExecutionTable } from "@/components/TestExecution/ExecutionTable";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: number;
}

export function ProjectDetail({ projectId }: Props) {
  const [modules, setModules] = useState<ModuleResponse[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [testCases, setTestCases] = useState<ModuleTestCaseWithLatestExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashType, setFlashType] = useState<"success" | "error">("success");
  const executionTableResolverRef = useRef<{
    confirmLeave: () => Promise<LeaveConfirmResult>;
    hasUnsavedChanges: () => boolean;
  } | null>(null);

  const loadProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProject(projectId);
      setTitle(data.project.name);
      setModules(data.modules);
      if (data.modules.length > 0 && selectedModuleId == null) {
        setSelectedModuleId(data.modules[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  const loadModuleCases = async (moduleId: number) => {
    try {
      const cases = await getTestCasesByModule(moduleId);
      setTestCases(cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load test cases");
    }
  };

  useEffect(() => {
    void loadProject();
  }, [projectId]);

  useEffect(() => {
    if (selectedModuleId != null) {
      void loadModuleCases(selectedModuleId);
    } else {
      setTestCases([]);
    }
  }, [selectedModuleId]);

  const handleModuleSelect = useCallback(async (id: number) => {
    if (id === selectedModuleId) return;
    const resolver = executionTableResolverRef.current;
    if (resolver?.hasUnsavedChanges?.()) {
      const choice = await resolver.confirmLeave();
      if (choice === "cancel") return;
    }
    setSelectedModuleId(id);
  }, [selectedModuleId]);

  const handleExecutionsSaved = () => {
    void loadProject(); // refresh module tree (execution_status icons)
    if (selectedModuleId != null) {
      void loadModuleCases(selectedModuleId);
    }
  };

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-72 shrink-0 border-r border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/40">
        <div className="px-4 py-4 border-b border-neutral-200 dark:border-neutral-700 space-y-3">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
              {title || "Project"}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Module hierarchy and test case counts.
            </p>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              className="w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-neutral-100 border border-neutral-300 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={() => setImportModalOpen(true)}
            >
              Import
            </button>
            <button
              type="button"
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              onClick={() => setModuleModalOpen(true)}
            >
              + New Module
            </button>
          </div>
        </div>
        <div className="p-4">
        {loading && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
        )}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>
        )}
        {flashMessage && (
          <p
            className={`text-xs mb-2 ${
              flashType === "error"
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {flashMessage}
          </p>
        )}
        <ModuleTree
          modules={modules}
          selectedId={selectedModuleId}
          onSelect={handleModuleSelect}
          onModuleDeleted={() => {
            void loadProject();
            setSelectedModuleId(null);
          }}
        />
        </div>
      </aside>
      <section className="flex-1 min-w-0 p-4">
        {selectedModuleId == null ? (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
            Select a module to view test cases.
          </div>
        ) : (
          <ExecutionTable
            moduleId={selectedModuleId}
            testCases={testCases}
            moduleStatus={flattenModules(modules).find((m) => m.id === selectedModuleId)?.status ?? "to do"}
            onModuleStatusChange={() => void loadProject()}
            onSaved={handleExecutionsSaved}
            onTestCaseDeleted={() => {
              if (selectedModuleId != null) void loadModuleCases(selectedModuleId);
            }}
            onUnsavedChangesChange={() => {}}
            registerLeaveResolver={(resolver) => {
              executionTableResolverRef.current = resolver;
            }}
            projectId={projectId}
            projectName={title}
            moduleName={flattenModules(modules).find((m) => m.id === selectedModuleId)?.name ?? ""}
            modules={modules}
          />
        )}
      </section>

      <ImportModal
        open={importModalOpen}
        projectId={projectId}
        onClose={() => setImportModalOpen(false)}
        onImported={() => void loadProject()}
        onToast={(msg, type) => {
          setFlashMessage(msg);
          setFlashType(type);
          setTimeout(() => setFlashMessage(null), type === "error" ? 5000 : 3000);
        }}
      />
      <NewModuleModal
        open={moduleModalOpen}
        projectId={projectId}
        modules={modules}
        onClose={() => setModuleModalOpen(false)}
        onCreated={async () => {
          await loadProject();
          setFlashMessage("Module created successfully.");
          setTimeout(() => setFlashMessage(null), 3000);
        }}
      />
    </div>
  );
}

interface NewModuleModalProps {
  open: boolean;
  projectId: number;
  modules: ModuleResponse[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

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

function NewModuleModal({ open, projectId, modules, onClose, onCreated }: NewModuleModalProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setParentId(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Module name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createModule(projectId, { name: name.trim(), parent_id: parentId ?? undefined });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create module");
    } finally {
      setSaving(false);
    }
  };

  const flatModules = flattenModules(modules);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
          New Module
        </h2>
        {error && (
          <div className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Module name
            </label>
            <input
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Parent module (optional)
            </label>
            <select
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
              value={parentId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setParentId(v ? Number(v) : null);
              }}
            >
              <option value="">(No parent)</option>
              {flatModules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

