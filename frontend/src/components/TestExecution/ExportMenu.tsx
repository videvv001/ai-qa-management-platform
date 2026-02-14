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
  const [excelCombinedOpen, setExcelCombinedOpen] = useState(false);
  const [excelCombinedTemplate, setExcelCombinedTemplate] = useState<File | null>(null);
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<number>>(new Set([moduleId]));
  const [excelInputKey, setExcelInputKey] = useState(0);
  const [excelCombinedInputKey, setExcelCombinedInputKey] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const flatModules = flattenModules(modules);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setModuleSelectOpen(false);
        setExcelCombinedOpen(false);
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

  const handleExcelTemplateClick = () => {
    document.getElementById(`export-excel-input-${moduleId}`)?.click();
  };

  const handleExcelCombinedTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError?.("Only .xlsx files are allowed.");
      return;
    }
    setExcelCombinedTemplate(file);
    e.target.value = "";
    setExcelCombinedInputKey((k) => k + 1);
  };

  const handleExcelCombinedExport = () => {
    if (!excelCombinedTemplate) {
      onError?.("Please select a template file.");
      return;
    }
    if (selectedModuleIds.size === 0) {
      onError?.("Select at least one module.");
      return;
    }
    setExcelCombinedOpen(false);
    setExcelCombinedTemplate(null);
    runExport("Export to Excel Template (Select Modules)", () =>
      exportCombinedModulesToExcelTemplate(excelCombinedTemplate!, Array.from(selectedModuleIds))
    );
  };

  const handleExcelTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError?.("Only .xlsx files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError?.("Template must be under 10MB.");
      return;
    }
    setOpen(false);
    runExport("Export to Excel Template", () =>
      exportModuleToExcelTemplate(moduleId, file)
    );
    e.target.value = "";
    setExcelInputKey((k) => k + 1);
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
        id={`export-excel-input-${moduleId}`}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleExcelTemplateChange}
        key={excelInputKey}
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

      {open && !moduleSelectOpen && (
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
            onClick={handleExcelTemplateClick}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Export to Excel Template
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={() => {
              setExcelCombinedOpen(true);
              setModuleSelectOpen(false);
              setExcelCombinedTemplate(null);
            }}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Export to Excel Template (Select Modules)
          </button>
        </div>
      )}

      {excelCombinedOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Export to Excel Template (Select Modules)
          </p>
          <input
            type="file"
            accept=".xlsx"
            className="mb-2 block w-full text-xs"
            onChange={handleExcelCombinedTemplateChange}
            key={excelCombinedInputKey}
          />
          {excelCombinedTemplate && (
            <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              Template: {excelCombinedTemplate.name}
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
            <Button variant="outline" size="sm" onClick={() => setExcelCombinedOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExcelCombinedExport}
              disabled={!excelCombinedTemplate || selectedModuleIds.size === 0}
            >
              Export
            </Button>
          </div>
        </div>
      )}

      {moduleSelectOpen && !excelCombinedOpen && (
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
