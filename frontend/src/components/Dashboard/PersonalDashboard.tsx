import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FolderOpen,
  FolderTree,
  FileText,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { getDashboardData, type DashboardData } from "@/api/client";

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 dark:bg-blue-900/40 p-2">
          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await getDashboardData();
        setData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4">
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const ps = data.project_status_distribution || { to_do: 0, in_progress: 0, completed: 0 };
  const ms = data.module_status_distribution || { to_do: 0, in_progress: 0, completed: 0 };
  const totalStatus = ps.to_do + ps.in_progress + ps.completed || 1;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Personal Dashboard
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
          Overview of projects, modules, test cases, and recent activity.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={data.total_projects} icon={FolderOpen} />
        <StatCard label="Total Modules" value={data.total_modules} icon={FolderTree} />
        <StatCard label="Total Test Cases" value={data.total_test_cases} icon={FileText} />
        <StatCard
          label="Overall Completion"
          value={`${data.overall_completion_percentage}%`}
          icon={TrendingUp}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Modules list with execution stats */}
        <div className="lg:col-span-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Module Execution Status
            </h2>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            {!data.modules_with_stats || data.modules_with_stats.length === 0 ? (
              <p className="px-4 py-4 text-xs text-neutral-500">No modules yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Project - Module</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 w-16">Passed</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 w-16">Failed</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 w-16">Blocked</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 w-20">Not Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modules_with_stats.map((row) => (
                    <tr
                      key={`${row.project_id}-${row.module_id}`}
                      className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <td className="px-4 py-2">
                        <Link
                          to={`/projects/${row.project_id}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[200px]"
                          title={row.project_module}
                        >
                          {row.project_module}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{row.passed}</td>
                      <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{row.failed}</td>
                      <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">{row.blocked}</td>
                      <td className="px-3 py-2 text-right text-neutral-500">{row.not_executed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Project Status - donut-style */}
        <div className="lg:col-span-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-4">
            Project Status
          </h2>
          {totalStatus === 0 ? (
            <p className="text-xs text-neutral-500">No projects.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-neutral-400" />
                <span className="text-xs">To Do: {ps.to_do}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-xs">In Progress: {ps.in_progress}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs">Completed: {ps.completed}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Project List Table */}
        <div className="lg:col-span-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Projects
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Modules</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Test Cases</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.project_list.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.modules_count}</td>
                    <td className="px-4 py-2">{p.test_cases_count}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          p.status === "completed"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50"
                            : p.status === "in progress"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800"
                        }`}
                      >
                        {p.status === "completed"
                          ? "Completed"
                          : p.status === "in progress"
                            ? "In Progress"
                            : "To Do"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/projects/${p.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-700">
            <Link
              to="/projects"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              View All Projects →
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
            <Activity className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Recent Activity
            </h2>
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {data.recent_activities.length === 0 ? (
              <p className="text-xs text-neutral-500">No recent activity.</p>
            ) : (
              data.recent_activities.map((a, i) => (
                <div
                  key={i}
                  className="flex gap-3 text-xs"
                >
                  <div className="shrink-0 w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    {a.type === "project_created" ? (
                      <FolderOpen className="h-3 w-3 text-neutral-500" />
                    ) : a.type === "module_created" ? (
                      <FolderTree className="h-3 w-3 text-neutral-500" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-800 dark:text-neutral-200">
                      {a.description}
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {formatTimeAgo(a.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Module Status Distribution */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-4">
          Module Status Distribution
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
            <Clock className="h-5 w-5 text-neutral-500" />
            <div>
              <div className="text-lg font-semibold">{ms.to_do}</div>
              <div className="text-xs text-neutral-500">To Do</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Loader2 className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-lg font-semibold">{ms.in_progress}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400">In Progress</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <div className="text-lg font-semibold">{ms.completed}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Completed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
