import { useState, useCallback, useEffect } from "react";
import { Sun, Moon, PanelLeftClose, PanelLeft, Maximize2, Minimize2 } from "lucide-react";
import { GenerationForm, type GenerationFormValues } from "@/components/GenerationForm";
import { ResultsTable } from "@/components/ResultsTable";
import { ResultsTableSkeleton } from "@/components/ResultsTableSkeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateTestCases } from "@/api/client";
import type { ApiProvider, ModelProfile, TestCaseItem } from "@/api/types";

const THEME_KEY = "ai-tc-gen-theme";
const PANEL_KEY = "ai-tc-gen-panel-collapsed";

function getStoredTheme(): "light" | "dark" {
  try {
    const s = localStorage.getItem(THEME_KEY);
    if (s === "dark" || s === "light") return s;
  } catch {}
  return "light";
}

function getStoredPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === "true";
  } catch {}
  return false;
}

function modelProfileToProvider(profile: ModelProfile): ApiProvider {
  return profile === "private" ? "ollama" : "openai";
}

function buildFeatureDescription(values: GenerationFormValues): string {
  let text = values.featureDescription.trim();
  const allowed = values.allowedActions
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const excluded = values.excludedFeatures
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length > 0) {
    text += "\n\nAllowed actions: " + allowed.join(", ");
  }
  if (excluded.length > 0) {
    text += "\n\nExcluded features: " + excluded.join(", ");
  }
  return text;
}

export default function App() {
  const [items, setItems] = useState<TestCaseItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastValues, setLastValues] = useState<GenerationFormValues | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getStoredTheme);
  const [panelCollapsed, setPanelCollapsed] = useState(getStoredPanelCollapsed);
  const [resultsFullscreen, setResultsFullscreen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, String(panelCollapsed));
    } catch {}
  }, [panelCollapsed]);

  const runGeneration = useCallback(async (values: GenerationFormValues) => {
    setError(null);
    setLastValues(values);
    setIsGenerating(true);
    try {
      const feature_description = buildFeatureDescription(values);
      const res = await generateTestCases({
        feature_name: values.featureName.trim(),
        feature_description,
        coverage_level: values.coverageLevel,
        provider: modelProfileToProvider(values.modelProfile),
      });
      setItems(res.items);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800 shrink-0">
        <div className="flex items-center justify-between gap-4 max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPanelCollapsed((c) => !c)}
              title={panelCollapsed ? "Expand configuration" : "Collapse configuration"}
              className="shrink-0 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              {panelCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 truncate">
                AI Test Case Generator
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                Configure parameters and generate test cases.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="shrink-0 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex min-h-0">
        <aside
          className={`
            shrink-0 overflow-hidden border-r border-neutral-200 dark:border-neutral-700
            bg-white dark:bg-neutral-800/50
            transition-[width] duration-300 ease-out
            ${panelCollapsed ? "w-0 border-r-0" : "w-[360px] lg:w-[30%] xl:max-w-[420px]"}
          `}
        >
          <div className="h-full overflow-y-auto p-4 w-[360px] lg:w-full">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 p-4">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Configuration
              </h2>
              <GenerationForm isGenerating={isGenerating} onSubmit={runGeneration} />
            </div>
          </div>
        </aside>

        <section
          className={`
            flex-1 flex flex-col min-w-0
            transition-[max-width] duration-300 ease-out
            ${resultsFullscreen ? "fixed top-14 left-0 right-0 bottom-0 z-40 bg-neutral-50 dark:bg-neutral-900" : ""}
          `}
        >
          <div className="flex-1 flex flex-col min-h-0 p-4 max-w-[1800px] w-full mx-auto">
            <div className="flex items-center justify-between gap-4 mb-3 shrink-0">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Test Case Results
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setResultsFullscreen((f) => !f)}
                  title={resultsFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  className="shrink-0 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {resultsFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4 rounded-xl">
                <AlertTitle>Generation failed</AlertTitle>
                <AlertDescription className="mt-2 flex flex-wrap items-center gap-2">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setError(null)}
                    className="border-red-200 bg-white text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      if (lastValues) runGeneration(lastValues);
                    }}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">
              {isGenerating ? (
                <ResultsTableSkeleton />
              ) : (
                <ResultsTable
                  items={items}
                  onExportCsv={() => {}}
                  className="animate-fade-in"
                />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
