import { useState, useCallback } from "react";
import { Eraser, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { CoverageLevel, ModelProfile } from "@/api/types";

/** Per-feature config (no model profile). */
export interface SingleFeatureValues {
  featureName: string;
  featureDescription: string;
  allowedActions: string;
  excludedFeatures: string;
  coverageLevel: CoverageLevel;
}

/** Batch form: multiple features + single model profile. */
export interface BatchFormValues {
  features: SingleFeatureValues[];
  modelProfile: ModelProfile;
}

/** Legacy single-feature shape including model profile. */
export interface GenerationFormValues extends SingleFeatureValues {
  modelProfile: ModelProfile;
}

const COVERAGE_OPTIONS: { value: CoverageLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "comprehensive", label: "Comprehensive" },
];

const MODEL_PROFILE_OPTIONS: { value: ModelProfile; label: string }[] = [
  { value: "fast", label: "⚡ Fast (Recommended)" },
  { value: "smart", label: "🧠 Smart" },
  { value: "private", label: "🔒 Private (Local)" },
];

const defaultSingleFeature: SingleFeatureValues = {
  featureName: "",
  featureDescription: "",
  allowedActions: "",
  excludedFeatures: "",
  coverageLevel: "medium",
};

interface GenerationFormProps {
  isGenerating: boolean;
  onSubmit: (values: BatchFormValues) => void;
}

const CONFIRM_REMOVE_MESSAGE =
  "Remove this feature? Its configuration will be deleted. You must have at least one feature.";

export function GenerationForm({ isGenerating, onSubmit }: GenerationFormProps) {
  const [features, setFeatures] = useState<SingleFeatureValues[]>([
    { ...defaultSingleFeature },
  ]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [modelProfile, setModelProfile] = useState<ModelProfile>("fast");

  const updateFeature = useCallback((index: number, patch: Partial<SingleFeatureValues>) => {
    setFeatures((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );
  }, []);

  const addFeature = useCallback(() => {
    setFeatures((prev) => [...prev, { ...defaultSingleFeature }]);
    setActiveTabIndex((prev) => prev + 1);
  }, []);

  const removeFeature = useCallback((index: number) => {
    if (features.length <= 1) return;
    if (!window.confirm(CONFIRM_REMOVE_MESSAGE)) return;
    setFeatures((prev) => prev.filter((_, i) => i !== index));
    setActiveTabIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, [features.length]);

  const clearAll = useCallback(() => {
    setFeatures([{ ...defaultSingleFeature }]);
    setActiveTabIndex(0);
    setModelProfile("fast");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = features.every(
      (f) => f.featureName.trim() && f.featureDescription.trim()
    );
    if (!valid) return;
    onSubmit({ features, modelProfile });
  };

  const safeIndex = Math.min(activeTabIndex, Math.max(0, features.length - 1));
  const activeFeature = features[safeIndex];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      {/* Horizontal scrollable tab row */}
      <div className="flex-shrink-0 overflow-x-auto overflow-y-hidden -mx-1 px-1">
        <div className="flex items-end gap-0.5 min-w-max border-b border-neutral-200 dark:border-neutral-700 pb-0">
          {features.map((_, index) => {
            const isActive = index === safeIndex;
            const label = `F${index + 1}`;
            return (
              <div
                key={index}
                role="tab"
                aria-selected={isActive}
                aria-label={`Feature ${index + 1}`}
                tabIndex={0}
                onClick={() => setActiveTabIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTabIndex(index);
                  }
                }}
                className={`
                  flex items-center gap-1 shrink-0 px-3 py-2 rounded-t-lg border border-b-0 cursor-pointer
                  transition-colors select-none
                  ${
                    isActive
                      ? "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 font-medium -mb-px"
                      : "bg-neutral-50 dark:bg-neutral-800/50 border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
                  }
                `}
              >
                <span className="text-sm">{label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFeature(index);
                  }}
                  disabled={isGenerating || features.length <= 1}
                  className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            aria-label="Add feature"
            onClick={addFeature}
            disabled={isGenerating}
            className="flex items-center justify-center shrink-0 w-9 h-9 rounded-t-lg border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50 disabled:pointer-events-none -mb-px ml-0.5"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Single form panel for active feature — state lives in features[activeTabIndex] */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-4 space-y-4 border border-t-0 border-neutral-200 dark:border-neutral-700 rounded-b-xl rounded-t-none bg-white dark:bg-neutral-800/50 p-4">
        {activeFeature && (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Feature Name</Label>
                <Input
                  value={activeFeature.featureName}
                  onChange={(e) =>
                    updateFeature(safeIndex, { featureName: e.target.value })
                  }
                  placeholder="e.g. User login"
                  required
                  disabled={isGenerating}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Feature Description</Label>
                <Textarea
                  value={activeFeature.featureDescription}
                  onChange={(e) =>
                    updateFeature(safeIndex, {
                      featureDescription: e.target.value,
                    })
                  }
                  placeholder="Describe the feature and expected behaviour..."
                  rows={3}
                  required
                  disabled={isGenerating}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Allowed Actions</Label>
                <Textarea
                  value={activeFeature.allowedActions}
                  onChange={(e) =>
                    updateFeature(safeIndex, { allowedActions: e.target.value })
                  }
                  placeholder="One per line (e.g. login, logout, reset password)"
                  rows={2}
                  disabled={isGenerating}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Excluded Features</Label>
                <Textarea
                  value={activeFeature.excludedFeatures}
                  onChange={(e) =>
                    updateFeature(safeIndex, {
                      excludedFeatures: e.target.value,
                    })
                  }
                  placeholder="One per line (e.g. SSO, 2FA)"
                  rows={2}
                  disabled={isGenerating}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Coverage Level</Label>
                <Select
                  value={activeFeature.coverageLevel}
                  onChange={(e) =>
                    updateFeature(safeIndex, {
                      coverageLevel: e.target.value as CoverageLevel,
                    })
                  }
                  disabled={isGenerating}
                >
                  {COVERAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </>
        )}

        <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <Label htmlFor="model-profile">AI Speed / Intelligence</Label>
          <Select
            id="model-profile"
            value={modelProfile}
            onChange={(e) => setModelProfile(e.target.value as ModelProfile)}
            disabled={isGenerating}
          >
            {MODEL_PROFILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Choose between speed, deeper reasoning, or local privacy.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={clearAll}
            disabled={isGenerating}
            className="flex-1"
          >
            <Eraser className="h-4 w-4" />
            Clear
          </Button>
          <Button
            type="submit"
            size="lg"
            className="flex-1"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Test Cases"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
