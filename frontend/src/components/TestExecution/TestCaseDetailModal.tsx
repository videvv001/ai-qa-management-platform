import { useEffect, useState } from "react";
import { getExecutionHistory, type ModuleTestCaseWithLatestExecution, type TestExecutionResponse } from "@/api/client";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  testCase: ModuleTestCaseWithLatestExecution | null;
}

export function TestCaseDetailModal({ open, onClose, testCase }: Props) {
  const [history, setHistory] = useState<TestExecutionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !testCase) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getExecutionHistory(testCase.id);
        setHistory(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, testCase]);

  if (!open || !testCase) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {testCase.test_id} — {testCase.scenario}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Detailed test case and execution history.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Description
            </h3>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {testCase.description}
            </p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Preconditions
            </h3>
            <p className="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">
              {testCase.preconditions}
            </p>
          </section>
          {testCase.test_data != null && testCase.test_data !== "" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
                Test Data
              </h3>
              <p className="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">
                {testCase.test_data}
              </p>
            </section>
          )}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Steps
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-neutral-900 dark:text-neutral-100">
              {testCase.steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Expected Result
            </h3>
            <p className="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">
              {testCase.expected_result}
            </p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Execution History
            </h3>
            {loading && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            {!loading && history.length === 0 && !error && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                No executions recorded yet.
              </p>
            )}
            {history.length > 0 && (
              <ul className="space-y-2 text-xs">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50">
                        {h.status}
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {new Date(h.executed_at).toLocaleString()}
                      </span>
                    </div>
                    {h.actual_result && (
                      <p className="text-neutral-800 dark:text-neutral-100">
                        {h.actual_result}
                      </p>
                    )}
                    {h.notes && (
                      <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                        Notes: {h.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

