"""Dashboard API - aggregate stats and activity."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_db
from app.database import models
from app.api.projects import _compute_module_execution_status

router = APIRouter()


def _project_status_from_modules(modules: List[models.Module]) -> str:
    if not modules:
        return "to do"
    statuses = [getattr(m, "status", "to do") or "to do" for m in modules]
    if all(s == "completed" for s in statuses):
        return "completed"
    if any(s == "in progress" for s in statuses):
        return "in progress"
    if any(s == "completed" for s in statuses):
        return "in progress"
    return "to do"


@router.get(
    "",
    summary="Get dashboard aggregate data",
)
def get_dashboard(
    db: Session = Depends(get_db),
) -> dict:
    """
    Return stats, charts data, project list, and recent activities.
    """
    projects = db.query(models.Project).all()
    modules = (
        db.query(models.Module)
        .options(joinedload(models.Module.test_cases), joinedload(models.Module.project))
        .all()
    )

    total_projects = len(projects)
    total_modules = len(modules)
    total_test_cases = db.query(models.TestCase).count()

    # Overall completion: % of test cases that have at least one execution with status Passed
    executed = (
        db.query(models.TestCase.id)
        .join(models.TestExecution)
        .distinct()
        .count()
    )
    passed = (
        db.query(models.TestExecution)
        .filter(models.TestExecution.status == "Passed")
        .count()
    )
    overall_completion = (
        round((passed / total_test_cases) * 100) if total_test_cases > 0 else 0
    )

    # Modules list with execution stats (project-module, passed, failed, blocked, not_executed)
    modules_with_stats: List[dict] = []
    for m in modules:
        _, stats = _compute_module_execution_status(db, m)
        proj = m.project
        project_name = proj.name if proj else "?"
        modules_with_stats.append({
            "project_id": m.project_id,
            "module_id": m.id,
            "project_module": f"{project_name} - {m.name}",
            "passed": (stats or {}).get("passed", 0),
            "failed": (stats or {}).get("failed", 0),
            "blocked": (stats or {}).get("blocked", 0),
            "not_executed": (stats or {}).get("not_executed", 0),
        })

    # Project status distribution (use snake_case for JSON)
    project_status_dist: dict[str, int] = {"to_do": 0, "in_progress": 0, "completed": 0}
    _status_to_key = {"to do": "to_do", "in progress": "in_progress", "completed": "completed"}
    for p in projects:
        s = _project_status_from_modules(p.modules)
        key = _status_to_key.get(s, "to_do")
        project_status_dist[key] = project_status_dist.get(key, 0) + 1

    # Module status distribution
    module_status_dist: dict[str, int] = {"to_do": 0, "in_progress": 0, "completed": 0}
    for m in modules:
        s = getattr(m, "status", "to do") or "to do"
        key = _status_to_key.get(s, "to_do")
        module_status_dist[key] = module_status_dist.get(key, 0) + 1

    # Project list (max 10)
    project_list: List[dict] = []
    for p in sorted(projects, key=lambda x: x.name)[:10]:
        mods = list(p.modules)
        tc_count = sum(len(m.test_cases) for m in mods)
        project_list.append({
            "id": p.id,
            "name": p.name,
            "modules_count": len(mods),
            "test_cases_count": tc_count,
            "status": _project_status_from_modules(mods),
        })

    # Recent activities (last 10)
    recent_activities: List[dict] = []
    cutoff = datetime.utcnow() - timedelta(days=30)

    # Recent executions
    execs = (
        db.query(models.TestExecution)
        .filter(models.TestExecution.executed_at >= cutoff)
        .order_by(desc(models.TestExecution.executed_at))
        .limit(5)
        .all()
    )
    for e in execs:
        tc = db.query(models.TestCase).filter(models.TestCase.id == e.test_case_id).first()
        mod = db.query(models.Module).filter(models.Module.id == tc.module_id).first() if tc else None
        proj = mod.project if mod else None
        recent_activities.append({
            "type": "execution",
            "description": f"Executed test '{tc.test_id if tc else '?'}' in module '{mod.name if mod else '?'}'",
            "timestamp": e.executed_at.isoformat(),
        })

    # Recent projects
    recent_projects = (
        db.query(models.Project)
        .filter(models.Project.created_at >= cutoff)
        .order_by(desc(models.Project.created_at))
        .limit(3)
        .all()
    )
    for p in recent_projects:
        recent_activities.append({
            "type": "project_created",
            "description": f"Created project '{p.name}'",
            "timestamp": p.created_at.isoformat(),
        })

    # Recent modules
    recent_mods = (
        db.query(models.Module)
        .filter(models.Module.created_at >= cutoff)
        .order_by(desc(models.Module.created_at))
        .limit(3)
        .all()
    )
    for m in recent_mods:
        proj = m.project
        recent_activities.append({
            "type": "module_created",
            "description": f"Added module '{m.name}' to project '{proj.name if proj else '?'}'",
            "timestamp": m.created_at.isoformat(),
        })

    # Sort all by timestamp descending and take 10
    recent_activities.sort(key=lambda x: x["timestamp"], reverse=True)
    recent_activities = recent_activities[:10]

    return {
        "total_projects": total_projects,
        "total_modules": total_modules,
        "total_test_cases": total_test_cases,
        "overall_completion_percentage": overall_completion,
        "modules_with_stats": modules_with_stats,
        "project_status_distribution": project_status_dist,
        "module_status_distribution": module_status_dist,
        "project_list": project_list,
        "recent_activities": recent_activities,
    }
