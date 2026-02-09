from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from .database import Base
from pydantic import BaseModel
from typing import List, Optional

class ContractModel(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String, nullable=True)  # Path to the uploaded PDF file
    clauses = Column(JSON)  # Stores the current list of structured clauses
    parties = Column(JSON, nullable=True)  # ["Party A", "Party B"]
    ai_summary = Column(String, nullable=True)  # Pre-computed AI summary
    agreement_type = Column(String, nullable=True)  # e.g., "Consulting Services Agreement"
    original_preamble = Column(String, nullable=True)  # Preserve original heading
    deleted_clauses = Column(JSON, nullable=True)  # Track deleted clause positions
    original_date = Column(String, nullable=True)  # ISO date string when contract was first uploaded
    bullet_summary = Column(JSON, nullable=True)  # 3-bullet summary list for hover preview
    
    # Relationships
    from sqlalchemy.orm import relationship
    amendments = relationship("Amendment", back_populates="contract", order_by="Amendment.upload_timestamp")

class Amendment(Base):
    __tablename__ = "amendments"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), index=True)
    filename = Column(String)
    file_path = Column(String, nullable=True)  # Path to the uploaded PDF file
    upload_timestamp = Column(String)
    effective_date = Column(String, nullable=True)
    description = Column(String, nullable=True)
    
    from sqlalchemy.orm import relationship
    contract = relationship("ContractModel", back_populates="amendments")

class ClauseVersion(Base):
    __tablename__ = "clause_versions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, index=True)
    amendment_id = Column(Integer, index=True, nullable=True) # Linked to the source amendment if applicable
    clause_id = Column(String, index=True)
    text = Column(String)
    action = Column(String)
    change_metadata = Column(JSON, nullable=True)
    timestamp = Column(String)

class Clause(BaseModel):
    id: str
    header: str
    text: str
    page_number: int

class ContractCreate(BaseModel):
    filename: str
    clauses: List[Clause]
