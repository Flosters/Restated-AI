"""
Tests for the contracts listing and detail API endpoints.
Uses a test database — no running server or Gemini key required.
"""

from app.models import ContractModel, Amendment


def test_list_contracts_empty(client):
    """GET /contracts returns an empty list when no amended contracts exist."""
    response = client.get("/contracts")
    assert response.status_code == 200
    assert response.json() == []


def test_list_contracts_excludes_unamended(client, db):
    """Contracts without amendments are NOT included in the listing."""
    contract = ContractModel(filename="original_only.pdf", clauses=[])
    db.add(contract)
    db.commit()

    response = client.get("/contracts")
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_list_contracts_includes_amended(client, db):
    """Contracts with at least one amendment appear in the listing."""
    contract = ContractModel(
        filename="amended.pdf",
        clauses=[],
        parties=["Acme Corp", "Globex Inc"],
        agreement_type="Service Agreement",
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)

    amendment = Amendment(
        contract_id=contract.id,
        filename="amendment_1.pdf",
        upload_timestamp="2025-06-01",
        description="First amendment",
    )
    db.add(amendment)
    db.commit()

    response = client.get("/contracts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == contract.id
    assert data[0]["amendment_count"] == 1
    assert data[0]["agreement_type"] == "Service Agreement"


def test_get_contract_detail(client, db):
    """GET /contracts/{id} returns full contract details."""
    contract = ContractModel(
        filename="detail_test.pdf",
        clauses=[{"id": "c1", "header": "Section 1", "text": "Hello world", "page_number": 1}],
        parties=["Alpha LLC"],
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)

    response = client.get(f"/contracts/{contract.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "detail_test.pdf"
    assert data["clause_count"] == 1
    assert data["clauses"][0]["header"] == "Section 1"


def test_get_contract_not_found(client):
    """GET /contracts/{id} returns 404 for nonexistent ID."""
    response = client.get("/contracts/9999")
    assert response.status_code == 404
