import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .database import engine, Base, get_db
from .models import ContractModel, ClauseVersion, Amendment
from .gemini_parser import parse_contract_with_gemini
import uvicorn

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Computable Contract Parser")

# CORS configuration for Next.js frontend
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse('app/static/index.html')

from typing import List

@app.post("/upload")
async def upload_contracts(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    import os
    from pathlib import Path
    
    results = []
    upload_dir = Path("app/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        if not file.filename.endswith(".pdf"):
            # Skip non-PDF files or raise error. Here skipping for robustness.
            continue
        
        try:
            pdf_bytes = await file.read()
            # Reset cursor if read multiple times or just to be safe, though mainly for file-like objects
            await file.seek(0)
            
            # Save PDF to disk
            safe_filename = file.filename.replace(" ", "_").replace("/", "_")
            file_path = upload_dir / safe_filename
            
            # Handle duplicate filenames
            counter = 1
            original_path = file_path
            while file_path.exists():
                stem = original_path.stem
                suffix = original_path.suffix
                file_path = upload_dir / f"{stem}_{counter}{suffix}"
                counter += 1
            
            with open(file_path, "wb") as f:
                f.write(pdf_bytes)
            
            clauses = parse_contract_with_gemini(pdf_bytes)
            
            # Extract metadata for dashboard
            from .gemini_parser import extract_parties_from_clauses, extract_contract_title, extract_original_date, generate_bullet_summary
            parties = extract_parties_from_clauses(clauses)
            agreement_type = extract_contract_title(clauses)
            original_date = extract_original_date(clauses)
            
            # Store relative path from app root
            relative_path = str(file_path.relative_to(Path("app")))
            
            db_contract = ContractModel(
                filename=file.filename,
                file_path=relative_path,
                clauses=clauses,
                parties=parties,
                agreement_type=agreement_type,
                original_date=original_date,
                bullet_summary=None # Will be generated when first amendment is uploaded
            )
            
            # If no amendments will be added yet, but we want a summary for the first card
            # we can generate a basic one now. But the user said "during amendment flow".
            # However, for a better UX, Let's generate a basic 3-bullet summary now too.
            db_contract.bullet_summary = generate_bullet_summary(clauses, [], parties)
            
            db.add(db_contract)
            db.commit()
            db.refresh(db_contract)
            
            results.append({
                "id": db_contract.id,
                "filename": db_contract.filename,
                "clause_count": len(clauses),
                "clauses": clauses,
                "parties": parties,
                "agreement_type": agreement_type,
                "original_date": original_date,
                "bullet_summary": db_contract.bullet_summary
            })
            
        except Exception as e:
            # For partial failures, we might want to return an error for this specific file
            # For now, let's treat any failure as fatal for that file but continue others?
            # Or fail the whole request?
            # Let's fail the file but return what succeeded, or error object
            results.append({
                "filename": file.filename,
                "error": str(e)
            })

    if not results:
         raise HTTPException(status_code=400, detail="No valid PDF files processed.")
         
    return results

from .amendment import apply_amendment, process_batch_amendments

@app.post("/contracts/{contract_id}/amend") # Keep same URL for ease but handle list
async def amend_contract(contract_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    # Validate files
    for file in files:
        if not file.filename.endswith(".pdf"):
             raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF.")
        
    try:
        # New Batch Processing Logic
        summary = await process_batch_amendments(contract_id, files, db)
        
        # Fetch updated contract to return full state
        # Need to close and reopen session to get fresh data
        db.expire_all()  # Expire all cached objects
        contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
        
        return {
            "id": contract.id,
            "filename": contract.filename,
            "clause_count": len(contract.clauses),
            "clauses": contract.clauses,
            "amendments": [
                {
                    "id": a.id,
                    "filename": a.filename,
                    "upload_timestamp": a.upload_timestamp,
                    "description": a.description
                } for a in contract.amendments
            ],
            "amendment_summary": {
                "changes_applied": summary['total_changes'],
                "history": summary['history']
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/contracts")
def list_contracts(db: Session = Depends(get_db)):
    """List only unique restated agreements (contracts with amendments applied)."""
    contracts = db.query(ContractModel).all()
    
    # Filter to only include restated agreements
    restated = [c for c in contracts if len(c.amendments) > 0]
    
    # Deduplicate by filename - keep only the most recent version (highest ID)
    unique_contracts = {}
    for contract in restated:
        filename = contract.filename
        if filename not in unique_contracts or contract.id > unique_contracts[filename].id:
            unique_contracts[filename] = contract
    
    return [{
        "id": c.id, 
        "filename": c.filename, 
        "clause_count": len(c.clauses),
        "is_amended": True,
        "amendment_count": len(c.amendments),
        # New fields for Mission 4 dashboard
        "counterparty": c.parties[0] if c.parties and len(c.parties) > 0 else None,
        "parties": c.parties or [],
        "agreement_type": c.agreement_type,
        "original_date": c.original_date,
        "last_amended_date": c.amendments[-1].upload_timestamp if c.amendments else None,
        "bullet_summary": c.bullet_summary
    } for c in unique_contracts.values()]

@app.get("/contracts/{contract_id}")
def get_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Enrich clauses with metadata for frontend visualization
    enriched_clauses = []
    deleted_clauses_list = []

    current_clause_ids = {clause['id'] for clause in contract.clauses}

    for clause in contract.clauses:
        # Check if this clause was modified
        versions = db.query(ClauseVersion).filter(
            ClauseVersion.contract_id == contract_id,
            ClauseVersion.clause_id == clause['id']
        ).all()

        clause_copy = clause.copy()

        # Determine clause type based on history
        side_letter_affected = False
        side_letter_text = ""
        if versions:
            # Check for side letter modifications
            for v in versions:
                if v.action == 'SIDE_LETTER_TAG':
                    side_letter_affected = True
                    # Extract side letter text from change_metadata
                    if v.change_metadata and v.change_metadata.get('side_letter_text'):
                        side_letter_text = v.change_metadata['side_letter_text']
                    break

            # Set type based on actions
            if any(v.action == 'REPLACE' for v in versions):
                clause_copy['type'] = 'modified'

        clause_copy['side_letter_affected'] = side_letter_affected
        if side_letter_text:
            clause_copy['side_letter_text'] = side_letter_text
        # Also check clause metadata for side letter text (stored during amendment)
        elif clause.get('metadata', {}).get('side_letter_text'):
            clause_copy['side_letter_text'] = clause['metadata']['side_letter_text']
        enriched_clauses.append(clause_copy)

    # Find deleted clauses: clause_versions with DELETE action whose clause_id is no longer in the contract
    delete_versions = db.query(ClauseVersion).filter(
        ClauseVersion.contract_id == contract_id,
        ClauseVersion.action == 'DELETE'
    ).all()

    for v in delete_versions:
        if v.clause_id not in current_clause_ids:
            # Get the original header from change_metadata (stored during deletion)
            original_header = ""
            if v.change_metadata:
                original_header = v.change_metadata.get("original_header", "")
            # Fallback: try to extract from clause_id (e.g., "clause_6" -> "6.")
            if not original_header:
                original_header = v.clause_id.replace("clause_", "Clause ").replace("_", ".")

            deleted_clauses_list.append({
                "id": v.clause_id,
                "header": original_header,
                "text": v.text,
                "deleted_by": v.amendment_id
            })
    
    # Build source documents list
    source_documents = [
        {
            "type": "Original",
            "filename": contract.filename,
            "file_path": contract.file_path,
            "date": None  # Original upload date not tracked currently
        }
    ]
    for amendment in contract.amendments:
        # Detect if this is a side letter based on description/title
        amendment_type = "Amendment"
        if amendment.description and "side letter" in amendment.description.lower():
            amendment_type = "Side Letter"

        source_documents.append({
            "type": amendment_type,
            "filename": amendment.filename,
            "file_path": amendment.file_path,
            "date": amendment.upload_timestamp
        })
    
    return {
        "id": contract.id,
        "filename": contract.filename,
        "clause_count": len(enriched_clauses),
        "clauses": enriched_clauses,
        "is_amended": len(contract.amendments) > 0,
        "parties": contract.parties or [],
        "ai_summary": contract.ai_summary or "",
        "bullet_summary": contract.bullet_summary or [],
        "agreement_type": contract.agreement_type or "",
        "original_preamble": contract.original_preamble or "",
        "source_documents": source_documents,
        "deleted_clauses": deleted_clauses_list
    }



@app.get("/contracts/{contract_id}/clauses/{clause_id}/history")
def get_clause_history(contract_id: int, clause_id: str, db: Session = Depends(get_db)):
    """Fetch the version history for a specific clause."""
    contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Find the original clause text from the contract's clauses
    original_clause = None
    for clause in contract.clauses:
        if clause.get('id') == clause_id:
            original_clause = clause
            break

    # Get all versions for this clause (amendments)
    versions = db.query(ClauseVersion).filter(
        ClauseVersion.contract_id == contract_id,
        ClauseVersion.clause_id == clause_id
    ).order_by(ClauseVersion.timestamp).all()

    # If clause is not in current clauses and has no versions, nothing to show
    if not original_clause and not versions:
        return {"clause_id": clause_id, "versions": []}

    # Build version history starting with original
    history = []

    # Determine original text by tracing back through version history.
    # contract.clauses stores the CURRENT (amended) state, not the original.
    # The earliest ClauseVersion with a REPLACE action stores "previous_text"
    # in its change_metadata — that is the text before that amendment was applied.
    original_text = ''
    if versions:
        for v in versions:
            if v.action == 'REPLACE' and v.change_metadata and v.change_metadata.get('previous_text'):
                original_text = v.change_metadata['previous_text']
                break
            elif v.action == 'DELETE' and v.text:
                original_text = v.text
                break
        if not original_text:
            original_text = versions[0].text
    elif original_clause:
        # Clause was never amended — current text IS the original
        original_text = original_clause.get('text', '')

    # Add original clause as first version
    history.append({
        "timestamp": contract.amendments[0].upload_timestamp if contract.amendments else None,
        "action": "ORIGINAL",
        "text": original_text,
        "amendment": {
            "filename": contract.filename,
            "description": "Original Agreement",
            "date": None
        },
        "metadata": None
    })

    # Then add all amendment versions in chronological order (including DELETE)
    for version in versions:
            
        # Get amendment info if available
        amendment_info = None
        if version.amendment_id:
            amendment = db.query(Amendment).filter(Amendment.id == version.amendment_id).first()
            if amendment:
                amendment_info = {
                    "filename": amendment.filename,
                    "description": amendment.description,
                    "date": amendment.upload_timestamp
                }
        
        history.append({
            "timestamp": version.timestamp,
            "action": version.action,
            "text": version.text,
            "amendment": amendment_info,
            "metadata": version.change_metadata
        })
    
    return {
        "clause_id": clause_id,
        "versions": history
    }

@app.post("/contracts/generate_restated")
async def generate_restated(
    original: UploadFile = File(...),
    amendments: List[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    One-Shot Endpoint:
    1. Parse Original PDF -> Create Contract
    2. Parse Amendment PDFs -> Sort by Date
    3. Apply Amendments sequentially
    """
    if not original.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Original must be a PDF")
    
    # --- Step 1: Process Original ---
    original_bytes = await original.read()

    # Save original PDF to disk
    from pathlib import Path
    upload_dir = Path("app/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = original.filename.replace(" ", "_").replace("/", "_")
    file_path = upload_dir / safe_filename
    counter = 1
    original_path = file_path
    while file_path.exists():
        stem = original_path.stem
        suffix = original_path.suffix
        file_path = upload_dir / f"{stem}_{counter}{suffix}"
        counter += 1
    with open(file_path, "wb") as f:
        f.write(original_bytes)
    relative_path = str(file_path.relative_to(Path("app")))

    # Define clauses structure
    try:
        clauses_data = parse_contract_with_gemini(original_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse original: {str(e)}")

    # Extract metadata for the original contract (matching /upload behavior)
    from .gemini_parser import extract_parties_from_clauses, extract_contract_title, extract_original_date, generate_bullet_summary
    parties = extract_parties_from_clauses(clauses_data)
    agreement_type = extract_contract_title(clauses_data)
    original_date = extract_original_date(clauses_data)
    bullet_summary = generate_bullet_summary(clauses_data, [], parties)

    # Create Contract Record
    new_contract = ContractModel(
        filename=original.filename,
        file_path=relative_path,
        clauses=clauses_data,
        parties=parties,
        agreement_type=agreement_type,
        original_date=original_date,
        bullet_summary=bullet_summary
    )
    db.add(new_contract)
    db.commit()
    db.refresh(new_contract)
    
    # --- Step 2: Process Amendments (if any) ---
    amendment_summary = {"changes_applied": 0, "history": []}
    
    if amendments:
        # Validate 
        valid_amendments = [f for f in amendments if f.filename.endswith(".pdf")]
        
        if valid_amendments:
             try:
                 # Use the batch processor 
                 batch_result = await process_batch_amendments(new_contract.id, valid_amendments, db)
                 amendment_summary = {
                     "changes_applied": batch_result['total_changes'],
                     "history": batch_result['history']
                 }
                 
                 # Refresh contract state 
                 db.refresh(new_contract)
                 
                 # --- Pre-compute metadata ---
                 from .gemini_parser import (
                     extract_parties_from_clauses, 
                     generate_contract_summary,
                     extract_contract_title,
                     extract_preamble
                 )
                 
                 # Extract parties from clauses
                 parties = extract_parties_from_clauses(new_contract.clauses)
                 
                 # Generate AI summary
                 amendment_info = [{"filename": a.filename, "date": a.upload_timestamp} for a in new_contract.amendments]
                 ai_summary = generate_contract_summary(new_contract.clauses, amendment_info)
                 
                 # Extract agreement type and preamble
                 agreement_type = extract_contract_title(new_contract.clauses)
                 original_preamble = extract_preamble(new_contract.clauses)
                 
                 # Store in database
                 new_contract.parties = parties
                 new_contract.ai_summary = ai_summary
                 new_contract.agreement_type = agreement_type
                 new_contract.original_preamble = original_preamble
                 db.commit()
                 db.refresh(new_contract)
                 
             except Exception as e:
                 print(f"Amendment processing error: {e}")
                 raise HTTPException(status_code=500, detail=f"Failed to apply amendments: {str(e)}")

    # --- Step 3: Return Result ---
    return {
        "id": new_contract.id,
        "filename": new_contract.filename,
        "clauses": new_contract.clauses,
        "amendment_summary": amendment_summary

    }

from .export import generate_pdf_export
from fastapi import Response

@app.get("/contracts/{contract_id}/export")
async def export_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
        
    pdf_bytes = generate_pdf_export(contract)
    
    return Response(
        content=pdf_bytes, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'attachment; filename="restated_{contract.filename}"'}
    )

@app.get("/files/{filename:path}")
async def serve_file(filename: str):
    """Serve uploaded PDF files"""
    from pathlib import Path
    
    # The filename parameter might include "static/uploads/" prefix or just the filename
    # Normalize it to just get the actual filename
    if filename.startswith("static/uploads/"):
        filename = filename.replace("static/uploads/", "")
    
    # Construct the file path
    file_path = Path("app/static/uploads") / filename
    
    # Security check: ensure the path is within the uploads directory
    try:
        file_path = file_path.resolve()
        upload_dir = Path("app/static/uploads").resolve()
        if not str(file_path).startswith(str(upload_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
    except:
        raise HTTPException(status_code=403, detail="Invalid path")
    
    # Check if file exists
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Return the file with inline disposition for browser PDF viewing
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{Path(filename).name}"'}
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

