import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  FolderTree,
  Trash2,
} from "lucide-react";
import { deleteModule, type ModuleResponse } from "@/api/client";
import { Button } from "@/components/ui/button";

function StatusIcon({
  status,
  className = "h-4 w-4 shrink-0",
}: {
  status?: string;
  className?: string;
}) {
  const s = (status || "not-started").toLowerCase();
  switch (s) {
    case "not-started":
      return <Circle className={`${className} text-neutral-500`} />;
    case "in-progress":
      return <PlayCircle className={`${className} text-blue-500`} />;
    case "passed":
      return <CheckCircle className={`${className} text-emerald-500`} />;
    case "failed":
      return <XCircle className={`${className} text-red-500`} />;
    case "blocked":
      return <AlertCircle className={`${className} text-amber-500`} />;
    case "completed":
      return <CheckCircle className={`${className} text-neutral-400`} />;
    default:
      return <Circle className={`${className} text-neutral-500`} />;
  }
}

interface ModuleTreeProps {
  modules: ModuleResponse[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onModuleDeleted?: () => void;
}

export function ModuleTree({ modules, selectedId, onSelect, onModuleDeleted }: ModuleTreeProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleDeleteConfirm = async (moduleId: number) => {
    setDeleting(true);
    try {
      await deleteModule(moduleId);
      setDeleteConfirmId(null);
      onModuleDeleted?.();
      setToast({ message: "Module deleted.", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "Failed to delete module.",
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setDeleting(false);
    }
  };

  if (modules.length === 0) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
        <FolderTree className="h-4 w-4" />
        No modules yet.
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div
          className={`mb-2 rounded-lg border px-3 py-1.5 text-xs ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}
      <div className="space-y-1 text-sm">
        {modules.map((m) => (
          <ModuleNode
            key={m.id}
            node={m}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleteRequest={(id) => setDeleteConfirmId(id)}
          />
        ))}
      </div>
      {deleteConfirmId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-neutral-900 dark:text-neutral-100 mb-4">
              Delete this module? All child modules and test cases will be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDeleteConfirm(deleteConfirmId)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ModuleNodeProps {
  node: ModuleResponse;
  level: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleteRequest: (moduleId: number) => void;
}

function ModuleNode({ node, level, selectedId, onSelect, onDeleteRequest }: ModuleNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 group ${
          isSelected ? "bg-neutral-100 dark:bg-neutral-800 font-medium" : ""
        }`}
        style={{ paddingLeft: 8 + level * 14 }}
      >
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-2"
          onClick={() => onSelect(node.id)}
          title={
            node.execution_stats
              ? `Passed: ${node.execution_stats.passed}, Failed: ${node.execution_stats.failed}, Blocked: ${node.execution_stats.blocked}, Not Executed: ${node.execution_stats.not_executed}`
              : `${node.test_cases_count} test cases`
          }
        >
          {hasChildren ? (
            <span
              className="shrink-0 text-neutral-500 dark:text-neutral-400"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <StatusIcon status={node.execution_status} />
          <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {node.name}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-300">
            {node.test_cases_count}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest(node.id);
          }}
          className="shrink-0 p-1 rounded text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete module"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((c) => (
            <ModuleNode
              key={c.id}
              node={c}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDeleteRequest={onDeleteRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

