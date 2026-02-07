import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { CoverageLevel, ModelProfile } from "@/api/types";

export interface GenerationFormValues {
  featureName: string;
  featureDescription: string;
  allowedActions: string;
  excludedFeatures: string;
  coverageLevel: CoverageLevel;
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

const defaultValues: GenerationFormValues = {
  featureName: "",
  featureDescription: "",
  allowedActions: "",
  excludedFeatures: "",
  coverageLevel: "medium",
  modelProfile: "fast",
};

interface GenerationFormProps {
  isGenerating: boolean;
  onSubmit: (values: GenerationFormValues) => void;
}

export function GenerationForm({ isGenerating, onSubmit }: GenerationFormProps) {
  const [featureName, setFeatureName] = useState(defaultValues.featureName);
  const [featureDescription, setFeatureDescription] = useState(
    defaultValues.featureDescription
  );
  const [allowedActions, setAllowedActions] = useState(
    defaultValues.allowedActions
  );
  const [excludedFeatures, setExcludedFeatures] = useState(
    defaultValues.excludedFeatures
  );
  const [coverageLevel, setCoverageLevel] = useState<CoverageLevel>(
    defaultValues.coverageLevel
  );
  const [modelProfile, setModelProfile] = useState<ModelProfile>(
    defaultValues.modelProfile
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      featureName,
      featureDescription,
      allowedActions,
      excludedFeatures,
      coverageLevel,
      modelProfile,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="feature-name">Feature Name</Label>
        <Input
          id="feature-name"
          value={featureName}
          onChange={(e) => setFeatureName(e.target.value)}
          placeholder="e.g. User login"
          required
          disabled={isGenerating}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="feature-description">Feature Description</Label>
        <Textarea
          id="feature-description"
          value={featureDescription}
          onChange={(e) => setFeatureDescription(e.target.value)}
          placeholder="Describe the feature and expected behaviour..."
          rows={4}
          required
          disabled={isGenerating}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="allowed-actions">Allowed Actions</Label>
        <Textarea
          id="allowed-actions"
          value={allowedActions}
          onChange={(e) => setAllowedActions(e.target.value)}
          placeholder="One per line (e.g. login, logout, reset password)"
          rows={2}
          disabled={isGenerating}
          className="resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded-features">Excluded Features</Label>
        <Textarea
          id="excluded-features"
          value={excludedFeatures}
          onChange={(e) => setExcludedFeatures(e.target.value)}
          placeholder="One per line (e.g. SSO, 2FA)"
          rows={2}
          disabled={isGenerating}
          className="resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="coverage-level">Coverage Level</Label>
        <Select
          id="coverage-level"
          value={coverageLevel}
          onChange={(e) => setCoverageLevel(e.target.value as CoverageLevel)}
          disabled={isGenerating}
        >
          {COVERAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Coverage controls how deeply the system explores risks.
        </p>
      </div>

      <div className="space-y-1.5">
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

      <Button
        type="submit"
        size="lg"
        className="w-full"
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
    </form>
  );
}
