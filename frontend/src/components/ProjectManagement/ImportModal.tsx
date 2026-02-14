import { useState, useCallback, useRef } from "react";
import { Upload, X, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importFromFile, importPreview, type ImportResult, type ImportPreviewResult } from "@/api/client";

interface FileEntry {
  file: File;
  moduleName: string;
  headerRowOverride?: number; // 1 or 2 when user selected
  preview?: {
    test_cases_count: number;
    column_map: Record<string, string>;
    sheet_used?: string;
    header_format?: string;
    warnings: string[];
  } | null;
  previewError?: string;
  needsHeaderSelect?: {
    row1_preview: string[];
    row2_preview: string[];
    row3_preview: string[];
  };
}

interface Props {
  open: boolean;
  projectId: number;
  onClose: () => void;
  onImported: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

export function ImportModal({
  open,
  projectId,
  onClose,
  onImported,
  onToast,
}: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const valid = arr.filter(
      (f) =>
        f.name.toLowerCase().endsWith(".xlsx") ||
        f.name.toLowerCase().endsWith(".xls") ||
        f.name.toLowerCase().endsWith(".csv")
    );
    const entries: FileEntry[] = valid.map((f) => ({
      file: f,
      moduleName: f.name.replace(/\.(xlsx|xls|csv)$/i, ""),
    }));
    setFiles((prev) => [...prev, ...entries]);
    setResult(null);
    setError(null);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  }, []);

  const setModuleName = useCallback((idx: number, name: string) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, moduleName: name.trim() || f.file.name.replace(/\.(xlsx|xls|csv)$/i, "") } : f))
    );
  }, []);

  const confirmHeaderRow = useCallback(async (idx: number, row: 1 | 2) => {
    setPreviewing(true);
    setError(null);
    const entry = files[idx];
    if (!entry) return;
    try {
      const data: ImportPreviewResult = await importPreview(entry.file, row);
      if (data.needs_user_input) {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === idx
              ? { ...f, needsHeaderSelect: { row1_preview: data.row1_preview || [], row2_preview: data.row2_preview || [], row3_preview: data.row3_preview || [] } }
              : f
          )
        );
      } else {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === idx
              ? {
                  ...f,
                  headerRowOverride: row,
                  preview: {
                    test_cases_count: data.test_cases_count ?? 0,
                    column_map: data.column_map || {},
                    sheet_used: data.sheet_used,
                    header_format: "user-selected",
                    warnings: data.warnings || [],
                  },
                  needsHeaderSelect: undefined,
                }
              : f
          )
        );
      }
    } catch (e) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx ? { ...f, previewError: e instanceof Error ? e.message : "Preview failed" } : f
        )
      );
    } finally {
      setPreviewing(false);
    }
  }, [files]);

  const hasUnresolvedHeader = files.some((f) => f.needsHeaderSelect);

  const handlePreview = useCallback(async () => {
    if (files.length === 0) return;
    setPreviewing(true);
    setError(null);
    const updated: FileEntry[] = [];
    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      try {
        const data: ImportPreviewResult = await importPreview(entry.file, entry.headerRowOverride);
        if (data.needs_user_input) {
          updated.push({
            ...entry,
            preview: undefined,
            previewError: undefined,
            needsHeaderSelect: {
              row1_preview: data.row1_preview || [],
              row2_preview: data.row2_preview || [],
              row3_preview: data.row3_preview || [],
            },
          });
        } else {
          updated.push({
            ...entry,
            preview: {
              test_cases_count: data.test_cases_count ?? 0,
              column_map: data.column_map || {},
              sheet_used: data.sheet_used,
              header_format: data.header_format,
              warnings: data.warnings || [],
            },
            previewError: undefined,
            needsHeaderSelect: undefined,
          });
        }
      } catch (e) {
        updated.push({
          ...entry,
          preview: undefined,
          previewError: e instanceof Error ? e.message : "Preview failed",
          needsHeaderSelect: undefined,
        });
      }
    }
    setFiles(updated);
    setPreviewing(false);
  }, [files]);

  const handleImport = useCallback(async () => {
    if (files.length === 0) {
      setError("Select at least one file.");
      return;
    }
    const invalid = files.filter((f) => !f.moduleName.trim());
    if (invalid.length > 0) {
      setError("Module name is required for each file.");
      return;
    }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const moduleNames: Record<string, string> = {};
      const headerRows: Record<string, number> = {};
      for (const { file, moduleName, headerRowOverride } of files) {
        moduleNames[file.name] = moduleName.trim();
        if (headerRowOverride != null) {
          headerRows[file.name] = headerRowOverride;
        }
      }
      const res = await importFromFile(
        projectId,
        files.map((f) => f.file),
        moduleNames,
        headerRows
      );
      setResult(res);
      if (res.imported_modules.length > 0) {
        const total = res.total_imported ?? res.imported_modules.reduce((s, m) => s + m.test_cases_count, 0);
        onToast(
          `Imported ${res.imported_modules.length} module(s) with ${total} test case(s).`,
          "success"
        );
        onImported();
        if (res.errors.length === 0) {
          onClose();
          setFiles([]);
          setResult(null);
        }
      }
      if (res.errors.length > 0) {
        onToast(`${res.errors.length} file(s) had errors.`, "error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      onToast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }, [files, projectId, onImported, onClose, onToast]);

  const handleClose = useCallback(() => {
    if (!importing) {
      setFiles([]);
      setResult(null);
      setError(null);
      onClose();
    }
  }, [importing, onClose]);

  const downloadErrorReport = useCallback(() => {
    if (!result?.errors?.length) return;
    const csv = [
      "file,error",
      ...result.errors.map((e) => `"${(e.file || "").replace(/"/g, '""')}","${(e.error || "").replace(/"/g, '""')}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [result?.errors]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Test Cases
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="p-1 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Upload CSV or Excel (.xlsx, .xls) files. Each file becomes a new module.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = e.target.files;
                if (fs?.length) addFiles(fs);
                e.target.value = "";
              }}
            />
            <Upload className="h-10 w-10 mx-auto text-neutral-400 dark:text-neutral-500 mb-2" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Drag and drop files here or click to browse
            </p>
            <p className="text-xs text-neutral-500 mt-1">CSV, .xlsx, .xls</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Files ({files.length})
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-2 rounded border border-neutral-200 dark:border-neutral-700 p-2">
                {files.map((entry, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2">
                      <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate flex-1 min-w-0">
                        {entry.file.name}
                      </span>
                      <input
                        type="text"
                        className="flex-1 min-w-0 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-sm"
                        placeholder="Module name"
                        value={entry.moduleName}
                        onChange={(e) => setModuleName(idx, e.target.value)}
                      />
                      {entry.preview && (
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            {entry.preview.test_cases_count} rows
                          </span>
                          {entry.preview.header_format && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                entry.preview.header_format === "user-selected"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                              }`}
                              title={
                                entry.preview.header_format === "user-selected"
                                  ? "User-confirmed header row"
                                  : entry.preview.header_format === "csv-standard"
                                    ? "CSV format"
                                    : "Auto-detected"
                              }
                            >
                              {entry.preview.header_format === "user-selected"
                                ? "User"
                                : entry.preview.header_format === "csv-standard"
                                  ? "CSV"
                                  : "Auto"}
                            </span>
                          )}
                        </span>
                      )}
                      {entry.previewError && (
                        <span className="text-xs text-red-600 dark:text-red-400 shrink-0 truncate max-w-24" title={entry.previewError}>
                          Error
                        </span>
                      )}
                      {entry.needsHeaderSelect && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">Confirm header</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {entry.needsHeaderSelect && (
                      <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-3 text-sm">
                        <p className="text-amber-800 dark:text-amber-200 font-medium mb-2">Please confirm header row</p>
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3 max-h-24 overflow-auto">
                          <div>
                            <span className="font-medium text-neutral-600 dark:text-neutral-400">Row 1:</span>
                            <span className="ml-1 truncate block">{entry.needsHeaderSelect.row1_preview.slice(0, 5).join(", ")}</span>
                          </div>
                          <div>
                            <span className="font-medium text-neutral-600 dark:text-neutral-400">Row 2:</span>
                            <span className="ml-1 truncate block">{entry.needsHeaderSelect.row2_preview.slice(0, 5).join(", ")}</span>
                          </div>
                          <div>
                            <span className="font-medium text-neutral-600 dark:text-neutral-400">Row 3:</span>
                            <span className="ml-1 truncate block">{entry.needsHeaderSelect.row3_preview.slice(0, 5).join(", ")}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => confirmHeaderRow(idx, 1)}
                            disabled={previewing}
                          >
                            Row 1 is headers
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => confirmHeaderRow(idx, 2)}
                            disabled={previewing}
                          >
                            Row 2 is headers
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
              {result.imported_modules.length > 0 && (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Imported {result.imported_modules.length} module(s),{" "}
                    {result.total_imported ?? result.imported_modules.reduce((s, m) => s + m.test_cases_count, 0)}{" "}
                    test case(s)
                  </span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600 dark:text-red-400">
                      {result.errors.length} file(s) failed
                    </span>
                    <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                      Download error report
                    </Button>
                  </div>
                  <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5 max-h-24 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        {e.file}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={files.length === 0 || previewing}
            >
              {previewing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Validating…
                </>
              ) : (
                "Preview"
              )}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={importing}>
              {result && result.imported_modules.length > 0 ? "Close" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || files.length === 0 || hasUnresolvedHeader}
              title={hasUnresolvedHeader ? "Resolve header selection for all files first" : undefined}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Import All
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
