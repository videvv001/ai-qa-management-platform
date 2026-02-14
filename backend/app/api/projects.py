from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database import models
from sqlalchemy.orm import joinedload
from app.schemas.project import (
    ModuleResponse,
    ProjectCreate,
    ProjectResponse,
)


router = APIRouter()


def _project_status_from_modules(modules: List[models.Module]) -> str:
    """Compute project status from module statuses."""
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


def _compute_module_execution_status(
    db: Session,
    module: models.Module,
) -> tuple[str, dict | None]:
    """
    Compute execution_status for a module based on test case executions.
    Returns (execution_status, execution_stats dict for tooltip).
    Priority: blocked > failed > passed > in-progress > not-started.
    """
    test_cases = list(module.test_cases)
    total = len(test_cases)
    if total == 0:
        return "not-started", {"executed": 0, "passed": 0, "failed": 0, "blocked": 0, "not_executed": 0}

    executed_count = 0
    passed_count = 0
    failed_count = 0
    blocked_count = 0

    for tc in test_cases:
        latest_exec = (
            db.query(models.TestExecution)
            .filter(models.TestExecution.test_case_id == tc.id)
            .order_by(models.TestExecution.executed_at.desc())
            .first()
        )
        if latest_exec:
            executed_count += 1
            s = latest_exec.status or ""
            if s == "Passed":
                passed_count += 1
            elif s == "Failed":
                failed_count += 1
            elif s == "Blocked":
                blocked_count += 1

    not_executed = total - executed_count
    stats = {
        "executed": executed_count,
        "passed": passed_count,
        "failed": failed_count,
        "blocked": blocked_count,
        "not_executed": not_executed,
        "total": total,
    }

    if blocked_count > 0:
        return "blocked", stats
    if executed_count == 0:
        return "not-started", stats
    if executed_count < total:
        return "in-progress", stats
    if failed_count > 0:
        return "failed", stats
    if passed_count == total:
        return "passed", stats
    return "completed", stats


def _build_module_tree(
    db: Session,
    modules: List[models.Module],
) -> List[ModuleResponse]:
    """
    Convert flat list of Module rows into a nested ModuleResponse tree.
    Computes execution_status for each module.
    """
    by_id: dict[int, ModuleResponse] = {}
    roots: list[ModuleResponse] = []

    for m in modules:
        exec_status, exec_stats = _compute_module_execution_status(db, m)
        node = ModuleResponse(
            id=m.id,
            project_id=m.project_id,
            name=m.name,
            parent_id=m.parent_id,
            status=getattr(m, "status", "to do") or "to do",
            created_at=m.created_at,
            test_cases_count=len(m.test_cases),
            execution_status=exec_status,
            execution_stats=exec_stats,
            children=[],
        )
        by_id[m.id] = node

    for node in by_id.values():
        if node.parent_id and node.parent_id in by_id:
            by_id[node.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = models.Project(name=payload.name, description=payload.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    tc_count = sum(len(m.test_cases) for m in project.modules)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        modules_count=len(project.modules),
        test_cases_count=tc_count,
        status=_project_status_from_modules(project.modules),
    )


@router.get(
    "",
    response_model=List[ProjectResponse],
    summary="List all projects with module counts",
)
def list_projects(
    db: Session = Depends(get_db),
) -> List[ProjectResponse]:
    projects = db.query(models.Project).all()
    result = []
    for p in projects:
        tc_count = sum(len(m.test_cases) for m in p.modules)
        result.append(
            ProjectResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                created_at=p.created_at,
                modules_count=len(p.modules),
                test_cases_count=tc_count,
                status=_project_status_from_modules(p.modules),
            )
        )
    return result


@router.get(
    "/{project_id}",
    summary="Get a project with its module tree",
)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    modules = (
        db.query(models.Module)
        .filter(models.Module.project_id == project_id)
        .options(joinedload(models.Module.test_cases))
        .all()
    )
    module_tree = _build_module_tree(db, modules)
    mods = list(project.modules)
    tc_count = sum(len(m.test_cases) for m in mods)
    return {
        "project": ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            created_at=project.created_at,
            modules_count=len(mods),
            test_cases_count=tc_count,
            status=_project_status_from_modules(mods),
        ),
        "modules": module_tree,
    }


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
)
def update_project(
    project_id: int,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    project.name = payload.name
    project.description = payload.description
    db.add(project)
    db.commit()
    db.refresh(project)
    tc_count = sum(len(m.test_cases) for m in project.modules)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        modules_count=len(project.modules),
        test_cases_count=tc_count,
        status=_project_status_from_modules(project.modules),
    )


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project (cascade delete modules and test cases)",
)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
) -> None:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    db.delete(project)
    db.commit()

