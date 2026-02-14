import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { deleteProject, getProjects, type ProjectResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "./ProjectForm";

function StatusBadge({ status }: { status?: string }) {
  const s = (status || "to do").toLowerCase();
  const label = s === "completed" ? "Completed" : s === "in progress" ? "In Progress" : "To Do";
  const classes =
    s === "completed"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
      : s === "in progress"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectResponse | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreatedOrUpdated = () => {
    setShowForm(false);
    setEditing(null);
    void load();
  };

  const handleDeleteConfirm = async (projectId: number) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(projectId);
      setDeleteConfirmId(null);
      void load();
      setToast({ message: "Project deleted successfully.", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "Failed to delete project.",
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            Projects
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Projects and organize modules with test cases into personal QA projects.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed rounded-xl border-neutral-300 dark:border-neutral-700 p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No projects yet. Create your first project to start organizing test cases.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 p-4 flex flex-col hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-medium text-neutral-900 dark:text-neutral-50 truncate flex-1 min-w-0">
                  {p.name}
                </h2>
                <StatusBadge status={p.status} />
              </div>
              {p.description && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-3">
                  {p.description}
                </p>
              )}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                {p.modules_count} module{p.modules_count !== 1 ? "s" : ""}
                {" · "}
                {(p.test_cases_count ?? 0)} test case{(p.test_cases_count ?? 0) !== 1 ? "s" : ""}
              </div>
              <div className="mt-auto flex items-center gap-2 flex-wrap">
                <Link
                  to={`/projects/${p.id}`}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setEditing(p);
                    setShowForm(true);
                  }}
                >
                  Edit
                </Button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteConfirmId(p.id);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        initial={editing ?? undefined}
        onSaved={handleCreatedOrUpdated}
      />

      {deleteConfirmId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-neutral-900 dark:text-neutral-100 mb-4">
              Are you sure you want to delete this project? This will also delete all modules and test cases.
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
    </div>
  );
}
