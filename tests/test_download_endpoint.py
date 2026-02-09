"""
Tests for the PDF export endpoint.
Uses a test database — no running server or Gemini key required.
"""

from app.models import ContractModel, Amendment


def test_export_returns_pdf(client, db):
    """GET /contracts/{id}/export returns a valid PDF response."""
    contract = ContractModel(
        filename="integration_test.pdf",
        clauses=[{"id": "c1", "header": "Clause 1", "text": "Sample text.", "page_number": 1}],
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)

    response = client.get(f"/contracts/{contract.id}/export")

    assert response.status_code == 200
    assert "application/pdf" in response.headers["content-type"]
    assert 'attachment; filename="restated_integration_test.pdf"' in response.headers["content-disposition"]
    assert len(response.content) > 0


def test_export_with_amendment(client, db):
    """Export works for a contract that has an amendment record."""
    contract = ContractModel(
        filename="amended_contract.pdf",
        clauses=[{"id": "c1", "header": "Clause 1", "text": "Amended text.", "page_number": 1}],
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)

    amendment = Amendment(
        contract_id=contract.id,
        filename="amendment_1.pdf",
        upload_timestamp="2025-01-01",
        description="Title: Test Amendment | Date: 2025-01-01",
    )
    db.add(amendment)
    db.commit()

    response = client.get(f"/contracts/{contract.id}/export")

    assert response.status_code == 200
    assert len(response.content) > 0


def test_export_not_found(client):
    """Export returns 404 for a nonexistent contract."""
    response = client.get("/contracts/9999/export")
    assert response.status_code == 404
