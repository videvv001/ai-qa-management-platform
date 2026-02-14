import csv
import io
import json
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse

from app.schemas.testcase import (
    BatchGenerateRequest,
    BatchGenerateResponse,
    BatchStatusResponse,
    GenerateTestCasesRequest,
    TestCaseGenerationRequest,
    TestCaseListResponse,
    TestCaseResponse,
)
from app.schemas.project import (
    BatchExecutionUpdate,
    ExportCsvCombinedRequest,
    TestCaseSave,
    TestExecutionResponse,
    TestExecutionUpdate,
)
from app.services.testcase_service import TestCaseService
from app.database.connection import get_db
from app.database import models
from sqlalchemy.orm import Session
from app.utils.csv_filename import generate_csv_filename
from app.utils.excel_exporter import test_cases_to_excel
from app.utils.excel_template_merge import (
    MAX_TEMPLATE_SIZE_BYTES,
    format_test_steps,
    merge_all_features_to_excel,
    merge_module_cases_to_excel_template,
    merge_test_cases_to_excel,
)
from app.utils.import_parser import parse_file

router = APIRouter()

# Single shared instance so in-memory batch store and test case store persist across requests.
_service: TestCaseService | None = None


def get_service() -> TestCaseService:
    global _service
    if _service is None:
        _service = TestCaseService()
    return _service


@router.get(
    "/csv-filename",
    summary="Get a unique OS-safe CSV filename for export",
)
async def get_csv_filename_route(feature_name: str | None = None) -> dict:
    """
    Return a short, unique, OS-safe CSV filename. Use for single-feature export.
    If feature_name is omitted, returns batch-style filename.
    """
    filename = generate_csv_filename(feature_name=feature_name)
    return {"filename": filename}


@router.post(
    "/from-requirements",
    response_model=TestCaseListResponse,
    summary="Generate test cases from requirements",
)
async def generate_from_requirements(
    payload: TestCaseGenerationRequest,
    service: TestCaseService = Depends(get_service),
) -> TestCaseListResponse:
    """
    Generate a set of candidate test cases from high-level requirements.
    """
    test_cases = await service.generate_test_cases(payload)
    responses: List[TestCaseResponse] = [
        await service.to_response(tc) for tc in test_cases
    ]
    return TestCaseListResponse(items=responses, total=len(responses))


@router.delete(
    "/{test_case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a generated test case",
)
async def delete_test_case(
    test_case_id: UUID,
    service: TestCaseService = Depends(get_service),
) -> None:
    """
    Delete a test case. It is removed from the store and from all batch feature results,
    so it will not appear in per-feature or Export All CSV.
    """
    deleted = await service.delete_test_case(test_case_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case {test_case_id} not found",
        )


@router.get(
    "/{test_case_id}",
    response_model=TestCaseResponse,
    summary="Get a single test case by id",
)
async def get_test_case(
    test_case_id: UUID,
    service: TestCaseService = Depends(get_service),
) -> TestCaseResponse:
    test_case = await service.get_by_id(test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case {test_case_id} not found",
        )
    return await service.to_response(test_case)


@router.get(
    "",
    response_model=TestCaseListResponse,
    summary="List all generated test cases (in-memory)",
)
async def list_test_cases(
    service: TestCaseService = Depends(get_service),
) -> TestCaseListResponse:
    items = [await service.to_response(tc) for tc in await service.list_all()]
    return TestCaseListResponse(items=items, total=len(items))


@router.post(
    "/generate-test-cases",
    response_model=TestCaseListResponse,
    summary="Generate test cases using the AI model",
)
async def generate_test_cases_with_ai(
    payload: GenerateTestCasesRequest,
    generate_excel: bool = False,
    service: TestCaseService = Depends(get_service),
) -> TestCaseListResponse | FileResponse:
    """
    Generate structured test cases using the configured LLM (Ollama or OpenAI).
    """
    try:
        cases = await service.generate_ai_test_cases(payload)

        if generate_excel:
            excel_path = test_cases_to_excel(cases)
            return FileResponse(
                excel_path,
                media_type=(
                    "application/"
                    "vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ),
                filename="generated-test-cases.xlsx",
            )

        responses: List[TestCaseResponse] = [
            await service.to_response(tc) for tc in cases
        ]
        return TestCaseListResponse(items=responses, total=len(responses))
    except ValueError as exc:
        msg = str(exc)
        if "Unsupported LLM provider" in msg or "API key" in msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=msg,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI returned invalid structure: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate test cases from AI: {exc}",
        ) from exc


# --- Batch generation ---

@router.post(
    "/batch-generate",
    response_model=BatchGenerateResponse,
    summary="Start a batch of feature generations",
)
async def batch_generate(
    payload: BatchGenerateRequest,
    service: TestCaseService = Depends(get_service),
) -> BatchGenerateResponse:
    """
    Start a batch job: generate test cases for multiple features in parallel.
    Returns batch_id immediately; poll GET /batches/{batch_id} for status and results.
    When model_id is set, provider is derived from it (gpt-4o-mini, gpt-4o, gemini-2.5-flash, llama-3.3-70b-versatile, llama3.2:3b).
    """
    batch_id = await service.start_batch(
        provider=payload.provider,
        features=payload.features,
        model_profile=payload.model_profile,
        model_id=payload.model_id,
    )
    return BatchGenerateResponse(batch_id=batch_id)


@router.get(
    "/batches/{batch_id}",
    response_model=BatchStatusResponse,
    summary="Get batch status and per-feature results",
)
async def get_batch_status(
    batch_id: str,
    service: TestCaseService = Depends(get_service),
) -> BatchStatusResponse:
    """Return current status and results for a batch. Partial results are returned as features complete."""
    status_resp = await service.get_batch_status(batch_id)
    if not status_resp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch {batch_id} not found",
        )
    return status_resp


@router.post(
    "/batches/{batch_id}/features/{feature_id}/retry",
    summary="Retry failed feature generation",
)
async def retry_batch_feature(
    batch_id: str,
    feature_id: str,
    provider: str | None = None,
    service: TestCaseService = Depends(get_service),
) -> dict:
    """Re-run generation for a failed feature in the batch."""
    ok = await service.retry_batch_feature(batch_id, feature_id, provider)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch or feature not found, or feature config missing",
        )
    return {"status": "ok", "message": "Retry started"}


def _cases_to_csv_content(cases: List) -> str:
    """Convert test cases to CSV string (same column order as frontend export)."""
    headers = [
        "Test Scenario",
        "Description",
        "Precondition",
        "Test Data",
        "Test Steps",
        "Expected Result",
    ]
    rows = [headers]
    for tc in cases:
        steps_str = " | ".join(getattr(tc, "test_steps", []) or [])
        rows.append(
            [
                getattr(tc, "test_scenario", ""),
                getattr(tc, "test_description", ""),
                getattr(tc, "pre_condition", ""),
                getattr(tc, "test_data", ""),
                steps_str,
                getattr(tc, "expected_result", ""),
            ]
        )
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in rows:
        w.writerow(row)
    return buf.getvalue()


@router.get(
    "/batches/{batch_id}/export-all",
    summary="Download merged (deduped) CSV of all features",
)
async def export_batch_all(
    batch_id: str,
    service: TestCaseService = Depends(get_service),
) -> Response:
    """Return a single CSV with all test cases from the batch, deduplicated by similar titles."""
    cases = await service.get_batch_merged_cases(batch_id, dedupe=True)
    if not cases:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found or has no test cases",
        )
    content = _cases_to_csv_content(cases)
    filename = generate_csv_filename()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post(
    "/export-to-excel",
    summary="Merge test cases into Excel template and download",
)
async def export_to_excel(
    template: UploadFile = File(..., description="Excel .xlsx template file"),
    test_cases: str = Form(..., alias="testCases", description="JSON array of test case objects"),
    feature_name: str = Form(..., alias="featureName", description="Feature name for Test ID and filename"),
) -> FileResponse:
    """
    Accept multipart: template (Excel .xlsx), testCases (JSON string), featureName.
    Merges test cases into the template 'Test Cases' sheet and returns the Excel file.
    """
    if not template.filename or not template.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .xlsx template files are allowed",
        )

    content = await template.read()
    if len(content) > MAX_TEMPLATE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Template must be under {MAX_TEMPLATE_SIZE_BYTES // (1024 * 1024)}MB",
        )

    try:
        cases_list: List[Any] = json.loads(test_cases)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid testCases JSON: {e}",
        ) from e
    if not isinstance(cases_list, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="testCases must be a JSON array",
        )

    feature_safe = (feature_name or "export").strip() or "export"
    name_part = "".join(c if c.isalnum() or c in " -_" else "_" for c in feature_safe)[:80]
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    out_filename = f"{name_part}_Test_Cases_{date_str}.xlsx"

    tmp_dir = Path(tempfile.gettempdir())
    template_path = tmp_dir / f"template_{id(template)}_{template.filename or 'template.xlsx'}"
    try:
        template_path.write_bytes(content)
        out_path = merge_test_cases_to_excel(
            str(template_path),
            cases_list,
            feature_name or "Export",
        )
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_filename,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to merge template: {e}",
        ) from e
    finally:
        if template_path.exists():
            try:
                template_path.unlink()
            except OSError:
                pass


@router.post(
    "/export-all-to-excel",
    summary="Merge all features' test cases into Excel template (one sheet per feature)",
)
async def export_all_to_excel(
    template: UploadFile = File(..., description="Excel .xlsx template file"),
    test_cases_by_feature: str = Form(
        ...,
        alias="testCasesByFeature",
        description="JSON array of { featureName, testCases } objects",
    ),
) -> FileResponse:
    """
    Accept multipart: template (Excel .xlsx), testCasesByFeature (JSON string).
    Merges each feature's test cases into a separate sheet (same structure as template).
    Returns one Excel file.
    """
    if not template.filename or not template.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .xlsx template files are allowed",
        )

    content = await template.read()
    if len(content) > MAX_TEMPLATE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Template must be under {MAX_TEMPLATE_SIZE_BYTES // (1024 * 1024)}MB",
        )

    try:
        raw: Any = json.loads(test_cases_by_feature)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid testCasesByFeature JSON: {e}",
        ) from e
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="testCasesByFeature must be a JSON array",
        )

    features_data: List[Tuple[str, List[Any]]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each element must be { featureName, testCases }",
            )
        name = item.get("featureName") or item.get("feature_name") or ""
        cases = item.get("testCases") or item.get("test_cases") or []
        if not isinstance(cases, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="testCases must be an array",
            )
        features_data.append((str(name).strip() or "Feature", cases))

    if not features_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one feature with test cases is required",
        )

    # Include UTC date and time (hour + minute) in the output filename for uniqueness.
    # Example: All_Features_Test_Cases_2025-01-10_1432.xlsx
    timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H%M")
    out_filename = f"All_Features_Test_Cases_{timestamp}.xlsx"

    tmp_dir = Path(tempfile.gettempdir())
    template_path = tmp_dir / f"template_all_{id(template)}_{template.filename or 'template.xlsx'}"
    try:
        template_path.write_bytes(content)
        out_path = merge_all_features_to_excel(str(template_path), features_data)
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_filename,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to merge template: {e}",
        ) from e
    finally:
        if template_path.exists():
            try:
                template_path.unlink()
            except OSError:
                pass


# --- Persistent test management endpoints ---


@router.post(
    "/import-from-file",
    summary="Import test cases from Excel/CSV files into a project",
)
async def import_from_file(
    files: List[UploadFile] = File(..., description="Excel or CSV files to import"),
    project_id: int = Form(..., description="Project ID to import into"),
    module_names: str = Form(default="{}", description="JSON: {filename: module_name}"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Create a new module per file. Each file's test cases go into a module.
    Module name = module_names[filename] or filename without extension.
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    try:
        name_map = json.loads(module_names) if module_names else {}
    except json.JSONDecodeError:
        name_map = {}

    imported_modules: List[dict] = []
    errors: List[dict] = []

    for f in files:
        if not f.filename:
            errors.append({"file": "unknown", "error": "Skipped file with no filename"})
            continue
        fn = f.filename
        module_name = (name_map.get(fn) or Path(fn).stem or fn).strip()

        try:
            content = await f.read()
        except Exception as e:
            errors.append({"file": fn, "error": f"Failed to read file: {e}"})
            continue

        try:
            cases, meta, warnings = parse_file(content, fn)
        except ValueError as e:
            errors.append({"file": fn, "error": str(e)})
            continue
        except Exception as e:
            errors.append({"file": fn, "error": f"Parse error: {e}"})
            continue

        try:
            module = models.Module(project_id=project_id, name=module_name)
            db.add(module)
            db.flush()

            for idx, tc in enumerate(cases, 1):
                test_id = tc.get("test_id") or f"TC_{module.id}_{idx}"
                entity = models.TestCase(
                    module_id=module.id,
                    test_id=str(test_id),
                    scenario=tc.get("scenario") or "Scenario",
                    description=tc.get("description") or "",
                    preconditions=tc.get("preconditions") or "",
                    steps=tc.get("steps") or ["Execute test"],
                    expected_result=tc.get("expected_result") or "",
                    test_data=tc.get("test_data") or None,
                )
                db.add(entity)
                db.flush()

                actual = tc.get("actual_result")
                status_val = tc.get("status")
                if actual or status_val:
                    exec_entity = models.TestExecution(
                        test_case_id=entity.id,
                        status=status_val or "Not Executed",
                        actual_result=actual,
                    )
                    db.add(exec_entity)

            db.commit()
            item: dict = {"file": fn, "module_name": module.name, "test_cases_count": len(cases)}
            if meta.get("sheet_used"):
                item["sheet_used"] = meta["sheet_used"]
            if warnings:
                item["warnings"] = warnings
            imported_modules.append(item)
        except Exception as e:
            db.rollback()
            errors.append({"file": fn, "error": str(e)})

    return {
        "imported_modules": imported_modules,
        "errors": errors,
        "total_imported": sum(m["test_cases_count"] for m in imported_modules),
    }


@router.post(
    "/import-preview",
    summary="Preview parsed test cases from file (no import)",
)
async def import_preview(
    file: UploadFile = File(..., description="Excel or CSV file to preview"),
) -> dict:
    """Parse file and return preview (test cases, column map, row count, warnings)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File has no filename")
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    try:
        cases, meta, warnings = parse_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")

    return {
        "filename": file.filename,
        "test_cases_count": len(cases),
        "column_map": meta.get("column_map", {}),
        "sheet_used": meta.get("sheet_used"),
        "warnings": warnings,
        "preview": cases[:10],
    }


@router.post(
    "/save-to-project",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk save generated test cases to a module",
)
async def save_test_cases_to_project(
    payload: TestCaseSave,
    db: Session = Depends(get_db),
) -> dict:
    module = db.query(models.Module).filter(models.Module.id == payload.module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )

    created_ids: list[int] = []
    for idx, tc in enumerate(payload.test_cases, start=1):
        test_id = tc.test_id or f"TC_{module.id}_{idx}"
        entity = models.TestCase(
            module_id=payload.module_id,
            test_id=test_id,
            scenario=tc.scenario,
            description=tc.description,
            preconditions=tc.preconditions,
            steps=tc.steps,
            expected_result=tc.expected_result,
            test_data=tc.test_data,
            priority=tc.priority,
            tags=tc.tags,
        )
        db.add(entity)
        db.flush()
        created_ids.append(entity.id)

    db.commit()
    return {"created_ids": created_ids}


@router.get(
    "/modules/{module_id}/testcases",
    summary="List all test cases for a module",
)
async def get_test_cases_for_module(
    module_id: int,
    db: Session = Depends(get_db),
) -> list[dict]:
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    cases = (
        db.query(models.TestCase)
        .filter(models.TestCase.module_id == module_id)
        .order_by(models.TestCase.id)
        .all()
    )
    result: list[dict] = []
    for c in cases:
        latest_exec = (
            db.query(models.TestExecution)
            .filter(models.TestExecution.test_case_id == c.id)
            .order_by(models.TestExecution.executed_at.desc())
            .first()
        )
        result.append(
            {
                "id": c.id,
                "module_id": c.module_id,
                "test_id": c.test_id,
                "scenario": c.scenario,
                "description": c.description,
                "preconditions": c.preconditions,
                "test_data": getattr(c, "test_data", None) or None,
                "steps": c.steps,
                "expected_result": c.expected_result,
                "priority": c.priority,
                "tags": c.tags,
                "created_at": c.created_at.isoformat(),
                "latest_execution": TestExecutionResponse.model_validate(latest_exec).model_dump()
                if latest_exec
                else None,
            }
        )
    return result


@router.put(
    "/{test_case_id}/execute",
    response_model=TestExecutionResponse,
    summary="Record execution result for a single test case",
)
async def execute_test_case(
    test_case_id: int,
    payload: TestExecutionUpdate,
    db: Session = Depends(get_db),
) -> TestExecutionResponse:
    case = db.query(models.TestCase).filter(models.TestCase.id == test_case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test case not found",
        )
    execution = models.TestExecution(
        test_case_id=test_case_id,
        status=payload.status,
        actual_result=payload.actual_result,
        notes=payload.notes,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return TestExecutionResponse.model_validate(execution)


@router.post(
    "/modules/{module_id}/execute-batch",
    response_model=list[TestExecutionResponse],
    summary="Record execution results for multiple test cases within a module",
)
async def execute_batch_for_module(
    module_id: int,
    payload: BatchExecutionUpdate,
    db: Session = Depends(get_db),
) -> list[TestExecutionResponse]:
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )

    case_ids = {c.id for c in module.test_cases}
    responses: list[TestExecutionResponse] = []
    for item in payload.executions:
        if item.test_case_id not in case_ids:
            continue
        execution = models.TestExecution(
            test_case_id=item.test_case_id,
            status=item.status,
            actual_result=item.actual_result,
            notes=item.notes,
        )
        db.add(execution)
        db.flush()
        db.refresh(execution)  # load id, executed_at from DB before serializing
        responses.append(TestExecutionResponse.model_validate(execution))

    db.commit()
    return responses


@router.get(
    "/{test_case_id}/executions",
    response_model=list[TestExecutionResponse],
    summary="Get execution history for a test case",
)
async def get_execution_history(
    test_case_id: int,
    db: Session = Depends(get_db),
) -> list[TestExecutionResponse]:
    case = db.query(models.TestCase).filter(models.TestCase.id == test_case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test case not found",
        )
    executions = (
        db.query(models.TestExecution)
        .filter(models.TestExecution.test_case_id == test_case_id)
        .order_by(models.TestExecution.executed_at.desc())
        .all()
    )
    return [TestExecutionResponse.model_validate(e) for e in executions]


@router.delete(
    "/db/{test_case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a persisted test case",
)
async def delete_persisted_test_case(
    test_case_id: int,
    db: Session = Depends(get_db),
) -> None:
    case = db.query(models.TestCase).filter(models.TestCase.id == test_case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test case not found",
        )
    db.delete(case)
    db.commit()


# --- Export endpoints ---

def _steps_to_csv(steps: List[str] | None) -> str:
    if not steps:
        return ""
    return format_test_steps(steps)


def _get_test_cases_with_latest_execution(
    db: Session, module_ids: List[int]
) -> List[Tuple[models.TestCase, models.TestExecution | None, str]]:
    """Return (test_case, latest_execution, module_name) for each test case in modules."""
    result: List[Tuple[models.TestCase, models.TestExecution | None, str]] = []
    for module_id in module_ids:
        module = db.query(models.Module).filter(models.Module.id == module_id).first()
        if not module:
            continue
        cases = (
            db.query(models.TestCase)
            .filter(models.TestCase.module_id == module_id)
            .order_by(models.TestCase.id)
            .all()
        )
        for c in cases:
            latest = (
                db.query(models.TestExecution)
                .filter(models.TestExecution.test_case_id == c.id)
                .order_by(models.TestExecution.executed_at.desc())
                .first()
            )
            result.append((c, latest, module.name))
    return result


def _build_csv_rows(
    cases: List[Tuple[models.TestCase, models.TestExecution | None, str]],
    include_module: bool = False,
) -> List[List[str]]:
    headers = [
        "Test ID",
        "Test Scenario",
        "Test Description",
        "Pre-condition",
        "Test Data",
        "Test Step",
        "Expected Result",
        "Actual Result",
        "Status",
    ]
    if include_module:
        headers.insert(0, "Module")
    rows = [headers]
    for tc, latest, module_name in cases:
        actual = (latest.actual_result or "") if latest else ""
        status_val = (latest.status or "Not Executed") if latest else "Not Executed"
        steps_str = _steps_to_csv(tc.steps)
        test_data_val = getattr(tc, "test_data", None) or ""
        row = [
            tc.test_id or "",
            tc.scenario or "",
            tc.description or "",
            tc.preconditions or "",
            test_data_val,
            steps_str,
            tc.expected_result or "",
            actual,
            status_val,
        ]
        if include_module:
            row.insert(0, module_name)
        rows.append(row)
    return rows


def _csv_content_from_rows(rows: List[List[str]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in rows:
        w.writerow(row)
    return buf.getvalue()


@router.post(
    "/modules/{module_id}/export-csv",
    summary="Export test cases in a module to CSV",
)
async def export_module_csv(
    module_id: int,
    db: Session = Depends(get_db),
) -> Response:
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    cases = _get_test_cases_with_latest_execution(db, [module_id])
    rows = _build_csv_rows(cases, include_module=False)
    content = _csv_content_from_rows(rows)
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in module.name)[:80]
    filename = f"{safe_name}_test_cases.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/modules/export-csv-combined",
    summary="Export test cases from selected modules to one CSV",
)
async def export_combined_modules_csv(
    payload: ExportCsvCombinedRequest,
    db: Session = Depends(get_db),
) -> Response:
    if not payload.module_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one module_id is required",
        )
    cases = _get_test_cases_with_latest_execution(db, payload.module_ids)
    if not cases:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No test cases found in the selected modules",
        )
    project_id = db.query(models.Module).filter(
        models.Module.id == payload.module_ids[0]
    ).first().project_id
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    project_name = project.name if project else "Project"
    rows = _build_csv_rows(cases, include_module=False)
    content = _csv_content_from_rows(rows)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in project_name)[:80]
    filename = f"{safe_name}_combined_test_cases_{timestamp}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/projects/{project_id}/export-all-modules-zip",
    summary="Export all modules in a project as separate CSV files in a ZIP",
)
async def export_all_modules_zip(
    project_id: int,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    modules = (
        db.query(models.Module)
        .filter(models.Module.project_id == project_id)
        .order_by(models.Module.id)
        .all()
    )
    if not modules:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project has no modules",
        )
    buffer = io.BytesIO()
    zip_has_files = False
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for mod in modules:
            cases = _get_test_cases_with_latest_execution(db, [mod.id])
            if not cases:
                continue
            rows = _build_csv_rows(cases, include_module=False)
            content = _csv_content_from_rows(rows)
            safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in mod.name)[:80]
            zf.writestr(f"{safe_name}.csv", content)
            zip_has_files = True
    if not zip_has_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No test cases found in any module",
        )
    buffer.seek(0)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_project = "".join(c if c.isalnum() or c in " -_" else "_" for c in project.name)[:80]
    filename = f"{safe_project}_all_modules_{timestamp}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/modules/{module_id}/export-to-excel-template",
    summary="Merge module test cases into uploaded Excel template",
)
async def export_module_to_excel_template(
    module_id: int,
    template: UploadFile = File(..., description="Excel .xlsx template file"),
    db: Session = Depends(get_db),
) -> FileResponse:
    if not template.filename or not template.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .xlsx template files are allowed",
        )
    content = await template.read()
    if len(content) > MAX_TEMPLATE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Template must be under {MAX_TEMPLATE_SIZE_BYTES // (1024 * 1024)}MB",
        )
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    cases_data = (
        db.query(models.TestCase)
        .filter(models.TestCase.module_id == module_id)
        .order_by(models.TestCase.id)
        .all()
    )
    cases_with_exec: List[dict] = []
    for c in cases_data:
        latest = (
            db.query(models.TestExecution)
            .filter(models.TestExecution.test_case_id == c.id)
            .order_by(models.TestExecution.executed_at.desc())
            .first()
        )
        cases_with_exec.append(
            {
                "id": c.id,
                "test_id": c.test_id,
                "scenario": c.scenario,
                "description": c.description,
                "preconditions": c.preconditions,
                "test_data": getattr(c, "test_data", None) or "",
                "steps": c.steps,
                "expected_result": c.expected_result,
                "latest_execution": (
                    {
                        "actual_result": latest.actual_result,
                        "status": latest.status,
                        "notes": latest.notes,
                    }
                    if latest
                    else None
                ),
            }
        )
    tmp_dir = Path(tempfile.gettempdir())
    template_path = tmp_dir / f"tmpl_{id(template)}_{template.filename or 'template.xlsx'}"
    try:
        template_path.write_bytes(content)
        out_path = merge_module_cases_to_excel_template(
            str(template_path), cases_with_exec, module.name
        )
        safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in module.name)[:80]
        filename = f"{safe_name}_test_cases.xlsx"
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to merge template: {e}",
        ) from e
    finally:
        if template_path.exists():
            try:
                template_path.unlink()
            except OSError:
                pass


@router.post(
    "/modules/export-to-excel-template-combined",
    summary="Export selected modules into one Excel file using template",
)
async def export_combined_modules_to_excel_template(
    template: UploadFile = File(..., description="Excel .xlsx template file"),
    module_ids: str = Form(..., alias="module_ids", description="JSON array of module IDs"),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Combine test cases from multiple modules into one Excel file."""
    if not template.filename or not template.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .xlsx template files are allowed",
        )
    content = await template.read()
    if len(content) > MAX_TEMPLATE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Template must be under {MAX_TEMPLATE_SIZE_BYTES // (1024 * 1024)}MB",
        )
    try:
        ids = json.loads(module_ids)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid module_ids JSON: {e}",
        ) from e
    if not isinstance(ids, list) or len(ids) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="module_ids must be a non-empty JSON array",
        )

    cases_with_exec: List[dict] = []
    first_module_name = ""
    for module_id in ids:
        module = db.query(models.Module).filter(models.Module.id == module_id).first()
        if not module:
            continue
        if not first_module_name:
            first_module_name = module.name
        cases_data = (
            db.query(models.TestCase)
            .filter(models.TestCase.module_id == module_id)
            .order_by(models.TestCase.id)
            .all()
        )
        for c in cases_data:
            latest = (
                db.query(models.TestExecution)
                .filter(models.TestExecution.test_case_id == c.id)
                .order_by(models.TestExecution.executed_at.desc())
                .first()
            )
            cases_with_exec.append(
                {
                    "id": c.id,
                    "test_id": c.test_id,
                    "scenario": c.scenario,
                    "description": c.description,
                    "preconditions": c.preconditions,
                    "test_data": getattr(c, "test_data", None) or "",
                    "steps": c.steps,
                    "expected_result": c.expected_result,
                    "latest_execution": (
                        {
                            "actual_result": latest.actual_result,
                            "status": latest.status,
                            "notes": latest.notes,
                        }
                        if latest
                        else None
                    ),
                }
            )

    if not cases_with_exec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No test cases found in the selected modules",
        )

    tmp_dir = Path(tempfile.gettempdir())
    template_path = tmp_dir / f"tmpl_comb_{id(template)}_{template.filename or 'template.xlsx'}"
    try:
        template_path.write_bytes(content)
        out_path = merge_module_cases_to_excel_template(
            str(template_path), cases_with_exec, first_module_name or "Combined"
        )
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in first_module_name)[:80]
        filename = f"{safe_name}_combined_test_cases_{timestamp}.xlsx"
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to merge template: {e}",
        ) from e
    finally:
        if template_path.exists():
            try:
                template_path.unlink()
            except OSError:
                pass
