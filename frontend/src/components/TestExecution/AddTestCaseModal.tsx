import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AddTestCaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  moduleId: number;
}

export function AddTestCaseModal({
  open,
  onClose,
  onSuccess,
  moduleId,
}: AddTestCaseModalProps) {
  const [scenario, setScenario] = useState("");
  const [description, setDescription] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [testSteps, setTestSteps] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [testData, setTestData] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleClose = () => {
    setScenario("");
    setDescription("");
    setPreconditions("");
    setTestSteps("");
    setExpectedResult("");
    setTestData("");
    setPriority("Medium");
    setErrors({});
    setError(null);
    onClose();
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!scenario.trim()) newErrors.scenario = "Scenario is required";
    if (!description.trim()) newErrors.description = "Description is required";
    if (!testSteps.trim()) newErrors.testSteps = "Test steps are required";
    if (!expectedResult.trim())
      newErrors.expectedResult = "Expected result is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const { createManualTestCase } = await import("@/api/client");
      await createManualTestCase(moduleId, {
        scenario: scenario.trim(),
        description: description.trim(),
        preconditions: preconditions.trim(),
        test_steps: testSteps.trim(),
        expected_result: expectedResult.trim(),
        test_data: testData.trim(),
        priority,
      });
      handleClose();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create test case");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-700">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 py-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Add Test Case
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="scenario" className="text-sm font-medium">
              Scenario <span className="text-red-600">*</span>
            </Label>
            <Input
              id="scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="e.g., User logs in with valid credentials"
              className="mt-1.5"
            />
            {errors.scenario && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.scenario}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Description <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this test case validates"
              rows={3}
              className="mt-1.5"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.description}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="preconditions" className="text-sm font-medium">
              Preconditions
            </Label>
            <Textarea
              id="preconditions"
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              placeholder="e.g., User has valid account credentials"
              rows={2}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="testSteps" className="text-sm font-medium">
              Test Steps <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="testSteps"
              value={testSteps}
              onChange={(e) => setTestSteps(e.target.value)}
              placeholder="One step per line:&#10;1. Navigate to login page&#10;2. Enter username and password&#10;3. Click login button"
              rows={5}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Enter each step on a new line
            </p>
            {errors.testSteps && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.testSteps}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="expectedResult" className="text-sm font-medium">
              Expected Result <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="expectedResult"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              placeholder="e.g., User is redirected to dashboard and session is created"
              rows={3}
              className="mt-1.5"
            />
            {errors.expectedResult && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.expectedResult}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="testData" className="text-sm font-medium">
              Test Data
            </Label>
            <Textarea
              id="testData"
              value={testData}
              onChange={(e) => setTestData(e.target.value)}
              placeholder="e.g., Username: testuser@example.com, Password: Test123!"
              rows={2}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="priority" className="text-sm font-medium">
              Priority
            </Label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Test Case"}
          </Button>
        </div>
      </div>
    </div>
  );
}
