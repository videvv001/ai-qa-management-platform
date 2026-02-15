import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModuleResponse } from "@/api/client";
import {
  exportModuleToCsv,
  exportCombinedModulesToCsv,
  exportAllModulesAsZip,
  exportModuleToExcelTemplate,
  exportCombinedModulesToExcelTemplate,
} from "@/api/client";

interface ExportMenuProps {
  moduleId: number;
  moduleName: string;
  projectId: number;
  projectName: string;
  modules: ModuleResponse[];
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
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

export function ExportMenu({
  moduleId,
  moduleName: _moduleName,
  projectId,
  projectName: _projectName,
  modules,
  onSuccess,
  onError,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [moduleSelectOpen, setModuleSelectOpen] = useState(false);
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<number>>(new Set([moduleId]));
  const [excelExportOpen, setExcelExportOpen] = useState(false);
  const [excelExportTemplate, setExcelExportTemplate] = useState<File | null>(null);
  const [excelExportInputKey, setExcelExportInputKey] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const flatModules = flattenModules(modules);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setModuleSelectOpen(false);
        setExcelExportOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const runExport = async (
    label: string,
    fn: () => Promise<void>
  ) => {
    setLoading(label);
    setOpen(false);
    try {
      await fn();
      onSuccess?.(`${label} completed.`);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : `${label} failed.`);
    } finally {
      setLoading(null);
    }
  };

  const handleExportThisModule = () => {
    runExport("Export CSV (This Module)", () => exportModuleToCsv(moduleId));
  };

  const handleExportSelectModules = () => {
    setModuleSelectOpen(true);
  };

  const handleConfirmSelectModules = () => {
    if (selectedModuleIds.size === 0) {
      onError?.("Select at least one module.");
      return;
    }
    setModuleSelectOpen(false);
    runExport("Export CSV (Selected Modules)", () =>
      exportCombinedModulesToCsv(Array.from(selectedModuleIds))
    );
  };

  const handleExportAllZip = () => {
    runExport("Export All Modules (ZIP)", () => exportAllModulesAsZip(projectId));
  };

  const handleExportExcel = () => {
    document.getElementById(`export-excel-file-input-${moduleId}`)?.click();
  };

  const handleExportExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError?.("Only .xlsx files are allowed.");
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError?.("File must be under 10MB.");
      e.target.value = "";
      return;
    }
    setOpen(false);
    runExport("Export to Excel", () => exportModuleToExcelTemplate(moduleId, file));
    e.target.value = "";
    setExcelExportInputKey((k) => k + 1);
  };

  const handleExcelExportTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError?.("Only .xlsx files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError?.("File must be under 10MB.");
      return;
    }
    setExcelExportTemplate(file);
    e.target.value = "";
    setExcelExportInputKey((k) => k + 1);
  };

  const handleExportExcelSelectModules = () => {
    if (!excelExportTemplate) {
      onError?.("Please select an Excel file.");
      return;
    }
    if (selectedModuleIds.size === 0) {
      onError?.("Select at least one module.");
      return;
    }
    setExcelExportOpen(false);
    const file = excelExportTemplate;
    setExcelExportTemplate(null);
    runExport("Export to Excel (Select Modules)", () =>
      exportCombinedModulesToExcelTemplate(file, Array.from(selectedModuleIds))
    );
  };

  const toggleModule = (id: number) => {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={menuRef}>
      <input
        id={`export-excel-file-input-${moduleId}`}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleExportExcelFileChange}
        key={excelExportInputKey}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        disabled={loading !== null}
        className="gap-1.5"
      >
        {loading ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Exporting…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Export
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </>
        )}
      </Button>

      {open && !moduleSelectOpen && !excelExportOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleExportThisModule}
          >
            <FileText className="h-4 w-4 shrink-0" />
            Export CSV (This Module)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleExportSelectModules}
          >
            <FileText className="h-4 w-4 shrink-0" />
            Export CSV (Select Modules)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleExportAllZip}
          >
            <FolderArchive className="h-4 w-4 shrink-0" />
            Export All Modules (ZIP)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Export to Excel
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={() => {
              setExcelExportOpen(true);
              setModuleSelectOpen(false);
            }}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Export to Excel (Select Modules)
          </button>
        </div>
      )}

      {excelExportOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Export to Excel (Select Modules)
          </p>
          <input
            type="file"
            accept=".xlsx"
            className="mb-2 block w-full text-xs"
            onChange={handleExcelExportTemplateChange}
            key={excelExportInputKey}
          />
          {excelExportTemplate && (
            <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              File: {excelExportTemplate.name}
            </p>
          )}
          <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Select modules to combine:
          </p>
          <div className="max-h-40 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 p-2 mb-2">
            {flatModules.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded px-2 -mx-2"
              >
                <input
                  type="checkbox"
                  checked={selectedModuleIds.has(m.id)}
                  onChange={() => toggleModule(m.id)}
                  className="rounded border-neutral-300"
                />
                <span className="text-neutral-800 dark:text-neutral-200">{m.name}</span>
                <span className="text-xs text-neutral-500">({m.test_cases_count})</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setExcelExportOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExportExcelSelectModules}
              disabled={!excelExportTemplate || selectedModuleIds.size === 0}
            >
              Export
            </Button>
          </div>
        </div>
      )}

      {moduleSelectOpen && !excelExportOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Select modules to combine into one CSV
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 p-2">
            {flatModules.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded px-2 -mx-2"
              >
                <input
                  type="checkbox"
                  checked={selectedModuleIds.has(m.id)}
                  onChange={() => toggleModule(m.id)}
                  className="rounded border-neutral-300"
                />
                <span className="text-neutral-800 dark:text-neutral-200">{m.name}</span>
                <span className="text-xs text-neutral-500">({m.test_cases_count})</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModuleSelectOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmSelectModules}>
              Export
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
