import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Eye, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executeBatch, deletePersistedTestCase, updateModuleStatus, type ModuleTestCaseWithLatestExecution, type ModuleResponse } from "@/api/client";
import { TestCaseDetailModal } from "./TestCaseDetailModal";
import { AddTestCaseModal } from "./AddTestCaseModal";
import { ExportMenu } from "./ExportMenu";

type StatusState = "Not Executed" | "Passed" | "Failed" | "Blocked";

const STATUS_ORDER: StatusState[] = ["Not Executed", "Passed", "Failed", "Blocked"];

function nextStatus(current: StatusState): StatusState {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return STATUS_ORDER[0];
  return STATUS_ORDER[idx + 1];
}

function statusClasses(status: StatusState): string {
  switch (status) {
    case "Passed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800";
    case "Failed":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800";
    case "Blocked":
      return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700";
  }
}

export type LeaveConfirmResult = "save" | "discard" | "cancel";

const MODULE_STATUS_ORDER = ["to do", "in progress", "completed"] as const;
type ModuleStatusType = (typeof MODULE_STATUS_ORDER)[number];

function nextModuleStatus(current: string): ModuleStatusType {
  const idx = MODULE_STATUS_ORDER.indexOf(current as ModuleStatusType);
  if (idx === -1 || idx === MODULE_STATUS_ORDER.length - 1) return "to do";
  return MODULE_STATUS_ORDER[idx + 1];
}

function moduleStatusClasses(s: string): string {
  switch (s) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700";
    case "in progress":
      return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-600";
  }
}

function moduleStatusLabel(s: string): string {
  switch (s) {
    case "completed": return "Completed";
    case "in progress": return "In Progress";
    default: return "To Do";
  }
}

interface ExecutionTableProps {
  moduleId: number;
  testCases: ModuleTestCaseWithLatestExecution[];
  moduleStatus?: string;
  onModuleStatusChange?: (status: string) => void;
  onSaved?: () => void;
  onTestCaseDeleted?: () => void;
  onUnsavedChangesChange?: (has: boolean) => void;
  registerLeaveResolver?: (resolver: {
    confirmLeave: () => Promise<LeaveConfirmResult>;
    hasUnsavedChanges: () => boolean;
  }) => void;
  /** Required for export: project and module context */
  projectId?: number;
  projectName?: string;
  moduleName?: string;
  modules?: ModuleResponse[];
}

interface EditableExecution {
  status: StatusState;
  actualResult: string;
  notes: string;
}

export function ExecutionTable({
  moduleId,
  testCases,
  moduleStatus = "to do",
  onModuleStatusChange,
  onSaved,
  onTestCaseDeleted,
  onUnsavedChangesChange,
  registerLeaveResolver,
  projectId,
  projectName,
  moduleName,
  modules = [],
}: ExecutionTableProps) {
  const initial: Record<number, EditableExecution> = useMemo(() => {
    const map: Record<number, EditableExecution> = {};
    for (const tc of testCases) {
      const latest = tc.latest_execution;
      const status = (latest?.status as StatusState) || "Not Executed";
      map[tc.id] = {
        status,
        actualResult: latest?.actual_result ?? "",
        notes: latest?.notes ?? "",
      };
    }
    return map;
  }, [testCases]);

  const [rows, setRows] = useState<Record<number, EditableExecution>>(initial);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const leaveResolveRef = useRef<((r: LeaveConfirmResult) => void) | null>(null);
  const [selected, setSelected] = useState<ModuleTestCaseWithLatestExecution | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Sync rows from latest_execution when testCases change (e.g. after refetch or load)
  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleToggleStatus = (id: number) => {
    setHasUnsavedChanges(true);
    setRows((prev) => {
      const prevRow = prev[id] ?? { status: "Not Executed", actualResult: "", notes: "" };
      return {
        ...prev,
        [id]: {
          ...prevRow,
          status: nextStatus(prevRow.status),
        },
      };
    });
  };

  const handleChangeActual = (id: number, value: string) => {
    setHasUnsavedChanges(true);
    setRows((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { status: "Not Executed", actualResult: "", notes: "" }),
        actualResult: value,
      },
    }));
  };

  const handleSaveAll = useCallback(async () => {
    if (testCases.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const executions = testCases.map((tc) => {
        const row = rows[tc.id];
        if (!row) {
          return {
            testCaseId: tc.id,
            status: "Not Executed",
            actualResult: "",
            notes: "",
          };
        }
        return {
          testCaseId: tc.id,
          status: row.status,
          actualResult: row.actualResult,
          notes: row.notes,
        };
      });
      await executeBatch(moduleId, executions);
      setHasUnsavedChanges(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save executions");
    } finally {
      setSaving(false);
    }
  }, [moduleId, testCases, rows, onSaved]);

  useEffect(() => {
    setHasUnsavedChanges(false);
  }, [moduleId]);

  const confirmLeave = useCallback(() => {
    return new Promise<LeaveConfirmResult>((resolve) => {
      leaveResolveRef.current = resolve;
      setShowLeaveConfirm(true);
    });
  }, []);

  useEffect(() => {
    registerLeaveResolver?.({
      confirmLeave,
      hasUnsavedChanges: () => hasUnsavedChanges,
    });
  }, [registerLeaveResolver, confirmLeave, hasUnsavedChanges]);

  const handleLeaveChoice = useCallback(
    async (choice: "save" | "discard" | "cancel") => {
      if (choice === "save") {
        await handleSaveAll();
      }
      if (choice !== "cancel") {
        setHasUnsavedChanges(false);
      }
      leaveResolveRef.current?.(choice);
      leaveResolveRef.current = null;
      setShowLeaveConfirm(false);
    },
    [handleSaveAll]
  );

  const handleDeleteConfirm = async (testCaseId: number) => {
    setDeletingId(testCaseId);
    setError(null);
    try {
      await deletePersistedTestCase(testCaseId);
      setDeleteConfirmId(null);
      onTestCaseDeleted?.();
      setToast({ message: "Test case deleted.", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "Failed to delete test case.",
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Test Execution
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {testCases.length} test case{testCases.length !== 1 ? "s" : ""} in this module
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Test Case
          </Button>
          {projectId != null && projectName != null && moduleName != null && (
            <ExportMenu
              moduleId={moduleId}
              moduleName={moduleName}
              projectId={projectId}
              projectName={projectName}
              modules={modules}
              onSuccess={(msg) => {
                setToast({ message: msg, type: "success" });
                setTimeout(() => setToast(null), 3000);
              }}
              onError={(msg) => {
                setToast({ message: msg, type: "error" });
                setTimeout(() => setToast(null), 5000);
              }}
            />
          )}
          {onModuleStatusChange && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const next = nextModuleStatus(moduleStatus);
                setUpdatingStatus(true);
                try {
                  await updateModuleStatus(moduleId, next);
                  onModuleStatusChange(next);
                  setToast({ message: `Module status: ${moduleStatusLabel(next)}`, type: "success" });
                  setTimeout(() => setToast(null), 2000);
                } catch (e) {
                  setToast({ message: e instanceof Error ? e.message : "Failed to update status", type: "error" });
                  setTimeout(() => setToast(null), 3000);
                } finally {
                  setUpdatingStatus(false);
                }
              }}
              disabled={updatingStatus}
              className={`${moduleStatusClasses(moduleStatus)} border w-28 justify-center shrink-0`}
            >
              {updatingStatus ? "Updating…" : moduleStatusLabel(moduleStatus)}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={saving || testCases.length === 0}
          >
            {saving ? "Saving…" : "Save All Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

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

      <div className="flex-1 overflow-auto border rounded-lg border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800">
            <tr className="text-xs text-neutral-500 dark:text-neutral-400">
              <th className="px-3 py-2 text-left w-32">Status</th>
              <th className="px-3 py-2 text-left w-32">Test ID</th>
              <th className="px-3 py-2 text-left">Scenario</th>
              <th className="px-3 py-2 text-left min-w-[140px] max-w-[200px]">Expected Result</th>
              <th className="px-3 py-2 text-left w-72">Actual Result</th>
              <th className="px-3 py-2 text-center w-16">View</th>
              <th className="px-3 py-2 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {testCases.map((tc) => {
              const row = rows[tc.id] ?? {
                status: "Not Executed" as StatusState,
                actualResult: "",
                notes: "",
              };
              return (
                <tr
                  key={tc.id}
                  className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <td className="px-3 py-2 align-top">
                    <button
                      type="button"
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${statusClasses(
                        row.status
                      )}`}
                      onClick={() => handleToggleStatus(tc.id)}
                    >
                      {row.status}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top text-xs font-mono text-neutral-700 dark:text-neutral-300">
                    {tc.test_id}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-neutral-900 dark:text-neutral-50">
                      {tc.scenario}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                      {tc.description}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div
                      className="text-xs text-neutral-700 dark:text-neutral-300 max-w-[200px] truncate"
                      title={tc.expected_result || ""}
                    >
                      {tc.expected_result || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                      value={row.actualResult}
                      onChange={(e) => handleChangeActual(tc.id, e.target.value)}
                      placeholder="Enter observed result…"
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      onClick={() => setSelected(tc)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      onClick={() => setDeleteConfirmId(tc.id)}
                      title="Delete test case"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {testCases.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400"
                >
                  No test cases in this module yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TestCaseDetailModal
        open={selected != null}
        onClose={() => setSelected(null)}
        testCase={selected}
      />

      <AddTestCaseModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setToast({ message: "Test case created successfully", type: "success" });
          setTimeout(() => setToast(null), 3000);
          onTestCaseDeleted?.(); // Reuse to trigger refetch
        }}
        moduleId={moduleId}
      />

      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-neutral-900 dark:text-neutral-100 mb-4">
              You have unsaved changes. Do you want to save before leaving?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLeaveChoice("cancel")}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLeaveChoice("discard")}
              >
                Leave Without Saving
              </Button>
              <Button size="sm" onClick={() => handleLeaveChoice("save")} disabled={saving}>
                {saving ? "Saving…" : "Save and Leave"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-neutral-900 dark:text-neutral-100 mb-4">
              Delete this test case permanently?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deletingId !== null}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDeleteConfirm(deleteConfirmId)}
                disabled={deletingId !== null}
              >
                {deletingId === deleteConfirmId ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

