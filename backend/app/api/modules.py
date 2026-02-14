from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_db
from app.database import models
from app.schemas.project import ModuleCreate, ModuleResponse
from app.api.projects import _build_module_tree, _compute_module_execution_status


router = APIRouter()


@router.post(
    "/projects/{project_id}/modules",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a module within a project",
)
def create_module(
    project_id: int,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
) -> ModuleResponse:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if payload.parent_id is not None:
        parent = (
            db.query(models.Module)
            .filter(
                models.Module.id == payload.parent_id,
                models.Module.project_id == project_id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent module does not exist in this project",
            )

    module = models.Module(
        project_id=project_id,
        name=payload.name,
        parent_id=payload.parent_id,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    return ModuleResponse(
        id=module.id,
        project_id=module.project_id,
        name=module.name,
        parent_id=module.parent_id,
        status=getattr(module, "status", "to do") or "to do",
        created_at=module.created_at,
        test_cases_count=len(module.test_cases),
        execution_status="not-started",
        execution_stats={"executed": 0, "passed": 0, "failed": 0, "blocked": 0, "not_executed": 0, "total": 0},
        children=[],
    )


@router.put(
    "/modules/{module_id}/status",
    summary="Update module status",
)
def update_module_status(
    module_id: int,
    status: str = Query(..., description="to do | in progress | completed"),
    db: Session = Depends(get_db),
) -> dict:
    valid = ("to do", "in progress", "completed")
    if status not in valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of: {', '.join(valid)}",
        )
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    module.status = status
    db.add(module)
    db.commit()
    return {"id": module.id, "status": module.status}


@router.get(
    "/projects/{project_id}/modules",
    response_model=List[ModuleResponse],
    summary="Get module tree for a project",
)
def get_modules_for_project(
    project_id: int,
    db: Session = Depends(get_db),
) -> List[ModuleResponse]:
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
    return _build_module_tree(db, modules)


@router.put(
    "/modules/{module_id}",
    response_model=ModuleResponse,
    summary="Update a module",
)
def update_module(
    module_id: int,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
) -> ModuleResponse:
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )

    if payload.parent_id is not None and payload.parent_id != module.parent_id:
        parent = (
            db.query(models.Module)
            .filter(
                models.Module.id == payload.parent_id,
                models.Module.project_id == module.project_id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent module does not exist in this project",
            )

    module.name = payload.name
    module.parent_id = payload.parent_id
    db.add(module)
    db.commit()
    db.refresh(module)

    exec_status, exec_stats = _compute_module_execution_status(db, module)
    return ModuleResponse(
        id=module.id,
        project_id=module.project_id,
        name=module.name,
        parent_id=module.parent_id,
        status=getattr(module, "status", "to do") or "to do",
        created_at=module.created_at,
        test_cases_count=len(module.test_cases),
        execution_status=exec_status,
        execution_stats=exec_stats,
        children=[],
    )


@router.delete(
    "/modules/{module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a module (cascade delete children and test cases)",
)
def delete_module(
    module_id: int,
    db: Session = Depends(get_db),
) -> None:
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    db.delete(module)
    db.commit()

