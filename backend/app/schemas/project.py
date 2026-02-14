from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=10_000)


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    modules_count: int = Field(..., description="Number of modules in this project.")
    test_cases_count: int = Field(default=0, description="Total test cases across all modules.")
    status: str = Field(default="to do", description="Project status: to do, in progress, completed.")


class ModuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[int] = Field(
        default=None,
        description="Optional parent module id for nested hierarchy.",
    )


class ModuleResponse(BaseModel):
    id: int
    project_id: int
    name: str
    parent_id: Optional[int] = None
    status: str = Field(default="to do", description="Module status: to do, in progress, completed.")
    created_at: datetime
    test_cases_count: int = Field(
        ...,
        description="Number of test cases directly under this module.",
    )
    execution_status: str = Field(
        default="not-started",
        description="Test execution status: not-started, in-progress, completed, passed, failed, blocked.",
    )
    execution_stats: Optional[dict] = Field(
        default=None,
        description="Optional stats: executed, passed, failed, blocked, not_executed for tooltip.",
    )
    children: List["ModuleResponse"] = Field(
        default_factory=list,
        description="Nested child modules.",
    )


class TestCaseSaveItem(BaseModel):
    test_id: str
    scenario: str
    description: str
    preconditions: str
    steps: List[str]
    expected_result: str
    test_data: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None


class TestCaseSave(BaseModel):
    module_id: int
    test_cases: List[TestCaseSaveItem]


class TestExecutionUpdate(BaseModel):
    status: str = Field(
        ...,
        description="Execution status: Not Executed, Passed, Failed, Blocked, etc.",
    )
    actual_result: Optional[str] = None
    notes: Optional[str] = None


class TestExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    test_case_id: int
    status: str
    actual_result: Optional[str] = None
    notes: Optional[str] = None
    executed_at: datetime


class TestCaseExecutionUpdateItem(BaseModel):
    test_case_id: int
    status: str
    actual_result: Optional[str] = None
    notes: Optional[str] = None


class BatchExecutionUpdate(BaseModel):
    executions: List[TestCaseExecutionUpdateItem]


class ExportCsvCombinedRequest(BaseModel):
    module_ids: List[int] = Field(..., min_length=1, description="Module IDs to combine into one CSV")


ModuleResponse.model_rebuild()

