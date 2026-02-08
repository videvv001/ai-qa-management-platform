import csv
import io
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response

from schemas.testcase import (
    BatchGenerateRequest,
    BatchGenerateResponse,
    BatchStatusResponse,
    GenerateTestCasesRequest,
    TestCaseGenerationRequest,
    TestCaseListResponse,
    TestCaseResponse,
)
from services.testcase_service import TestCaseService
from utils.csv_filename import generate_csv_filename
from utils.excel_exporter import test_cases_to_excel


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
    summary="Delete a test case",
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
