"""
Unit tests for amendment logic.
Uses mocked Gemini responses so no API key is required.
"""

from unittest.mock import patch
from app.models import ContractModel, ClauseVersion
from app.amendment import apply_amendment
from app.schemas import ChangeLogItem, ChangeLogAction


def test_replace_amendment(db):
    """Applying a REPLACE amendment updates the clause text and creates a version record."""
    # 1. Create a contract with two clauses
    dummy_clauses = [
        {"id": "c1", "header": "Section 1", "text": "Original Text 1", "page_number": 1},
        {"id": "c2", "header": "Section 2", "text": "Original Text 2", "page_number": 1},
    ]
    contract = ContractModel(filename="test_contract.pdf", clauses=dummy_clauses)
    db.add(contract)
    db.commit()
    db.refresh(contract)

    # 2. Mock the AI to return a single REPLACE action
    mock_changes = [
        ChangeLogItem(
            action=ChangeLogAction.REPLACE,
            target_clause_id="c1",
            new_text="AMENDED Text 1",
        )
    ]

    with patch("app.amendment.generate_change_log", return_value=mock_changes):
        apply_amendment(contract.id, b"dummy_pdf_bytes", db)

    # 3. Verify the clause was updated
    db.refresh(contract)
    c1 = next(c for c in contract.clauses if c["id"] == "c1")
    assert c1["text"] == "AMENDED Text 1"

    # c2 should remain unchanged
    c2 = next(c for c in contract.clauses if c["id"] == "c2")
    assert c2["text"] == "Original Text 2"

    # 4. Verify a ClauseVersion was recorded
    versions = db.query(ClauseVersion).filter(ClauseVersion.contract_id == contract.id).all()
    assert len(versions) == 1
    assert versions[0].clause_id == "c1"
    assert versions[0].action == "REPLACE"
    assert versions[0].text == "AMENDED Text 1"


def test_delete_amendment(db):
    """Applying a DELETE amendment removes the clause and creates a version record."""
    dummy_clauses = [
        {"id": "c1", "header": "Section 1", "text": "Text 1", "page_number": 1},
        {"id": "c2", "header": "Section 2", "text": "Text 2", "page_number": 1},
    ]
    contract = ContractModel(filename="test_contract.pdf", clauses=dummy_clauses)
    db.add(contract)
    db.commit()
    db.refresh(contract)

    mock_changes = [
        ChangeLogItem(
            action=ChangeLogAction.DELETE,
            target_clause_id="c2",
            new_text="",
        )
    ]

    with patch("app.amendment.generate_change_log", return_value=mock_changes):
        apply_amendment(contract.id, b"dummy_pdf_bytes", db)

    db.refresh(contract)
    clause_ids = [c["id"] for c in contract.clauses]
    assert "c2" not in clause_ids
    assert "c1" in clause_ids

    versions = db.query(ClauseVersion).filter(
        ClauseVersion.contract_id == contract.id,
        ClauseVersion.action == "DELETE",
    ).all()
    assert len(versions) == 1
    assert versions[0].clause_id == "c2"
