from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class Clause(BaseModel):
    id: str = "uuid"
    header: str
    text: str
    page_number: int

class ContractAnalysis(BaseModel):
    clauses: List[Clause]

class ChangeLogAction(str, Enum):
    REPLACE = "REPLACE"
    DELETE = "DELETE"
    SIDE_LETTER_TAG = "SIDE_LETTER_TAG"

class ChangeLogItem(BaseModel):
    action: ChangeLogAction
    target_clause_id: str
    new_text: Optional[str] = None
    side_letter_text: Optional[str] = None
    deletion_clause_text: Optional[str] = None

class AmendmentMetadata(BaseModel):
    title: str
    date: str # ISO or string, e.g. "2023-10-27"

