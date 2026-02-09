from datetime import datetime
from sqlalchemy.orm import Session
from .models import ContractModel, ClauseVersion, Amendment
from .gemini_parser import generate_change_log, extract_amendment_metadata
from .schemas import ChangeLogAction

def apply_amendment(
    contract_id: int, 
    amendment_pdf_bytes: bytes, 
    db: Session,
    filename: str = "amendment.pdf",
    metadata: dict = None,
    file_path: str = None
):
    """
    Applies a SINGLE amendment. Now accepts metadata (title, date) for better records.
    """
    from pathlib import Path
    
    contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
    if not contract:
        raise ValueError(f"Contract with ID {contract_id} not found.")

    original_json = contract.clauses

    # 1. Get Change Log from Gemini
    change_log = generate_change_log(original_json, amendment_pdf_bytes)

    # 2. Save PDF to disk if not already saved
    if not file_path:
        upload_dir = Path("app/static/uploads")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        safe_filename = filename.replace(" ", "_").replace("/", "_")
        pdf_path = upload_dir / safe_filename
        
        # Handle duplicate filenames
        counter = 1
        original_path = pdf_path
        while pdf_path.exists():
            stem = original_path.stem
            suffix = original_path.suffix
            pdf_path = upload_dir / f"{stem}_{counter}{suffix}"
            counter += 1
        
        with open(pdf_path, "wb") as f:
            f.write(amendment_pdf_bytes)
        
        file_path = str(pdf_path.relative_to(Path("app")))

    # 3. Create Amendment Record
    timestamp = datetime.utcnow().isoformat()
    
    # Use extracted metadata if available
    amendment_title = filename
    amendment_date = timestamp
    if metadata:
        amendment_title = metadata.get('title', filename)
        amendment_date = metadata.get('date', timestamp)

    amendment = Amendment(
        contract_id=contract.id,
        filename=filename, # keep actual filename
        file_path=file_path,  # Store the file path
        upload_timestamp=amendment_date, # Use effective date for sorting logic if we want, or store separate?
        description=f"Title: {amendment_title} | Date: {amendment_date}"
    )
    db.add(amendment)
    db.commit()
    db.refresh(amendment)

    # 3. Process Change Log
    current_clauses_map = {c['id']: c for c in original_json}
    
    processed_count = 0
    for item in change_log:
        clause_id = item.target_clause_id
        action = item.action
        
        # Verify target exists
        if clause_id not in current_clauses_map:
            print(f"Warning: Target clause {clause_id} not found. Skipping.")
            continue
            
        target_clause = current_clauses_map[clause_id]
        processed_count += 1
        
        # Prepare ClauseVersion entry
        version_entry = ClauseVersion(
            contract_id=contract.id,
            amendment_id=amendment.id,
            clause_id=clause_id,
            timestamp=timestamp,
            action=action.value
        )

        if action == ChangeLogAction.REPLACE:
            if not item.new_text:
                continue

            # Snapshot the text BEFORE mutation so history can show the original
            previous_text = target_clause['text']

            # Update memory
            target_clause['text'] = item.new_text

            version_entry.text = item.new_text
            version_entry.change_metadata = {
                "previous_text": previous_text
            }
            
        elif action == ChangeLogAction.DELETE:
            version_entry.text = target_clause['text'] # Snapshot of clause text before deletion
            version_entry.change_metadata = {
                "original_header": target_clause.get('header', ''),
                "original_id": clause_id,
                "deletion_clause_text": item.deletion_clause_text or item.new_text or ""
            }
            target_clause['_mark_for_delete'] = True

        elif action == ChangeLogAction.SIDE_LETTER_TAG:
            if 'metadata' not in target_clause:
                target_clause['metadata'] = {}
            target_clause['metadata']['affected_by'] = "Side Letter"

            # Store the side letter clause text if extracted by Gemini
            side_letter_text = item.side_letter_text or ""
            if side_letter_text:
                target_clause['metadata']['side_letter_text'] = side_letter_text

            version_entry.text = target_clause['text']
            version_entry.change_metadata = {
                "affected_by": "Side Letter",
                "side_letter_text": side_letter_text
            }

        db.add(version_entry)

    # 4. Reconstruct and Save
    # We SAVE the state after EACH amendment to be safe and allow incremental updates
    final_clause_list = []
    for clause in original_json:
        if clause.get('_mark_for_delete'):
            continue
        final_clause_list.append(clause)

    contract.clauses = final_clause_list
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(contract, "clauses")
    db.commit()
    
    return {
        "status": "success",
        "amendment_id": amendment.id,
        "changes_applied": processed_count,
        "title": amendment_title
    }

async def process_batch_amendments(contract_id: int, files: list, db: Session):
    """
    Process multiple amendment files.
    1. Extract metadata (Date) from ALL files first.
    2. Sort files by Date.
    3. Apply them sequentially.
    4. Generate bullet_summary for dashboard hover.
    """
    from .gemini_parser import generate_bullet_summary
    
    # 1. Extract Metadata
    files_with_meta = []
    for file in files:
        content = await file.read()
        await file.seek(0) # Reset for later reading
        meta = extract_amendment_metadata(content)
        files_with_meta.append({
            "file": file,
            "content": content,
            "meta": meta
        })
    
    # 2. Sort by Date
    # Simple string sort works for ISO YYYY-MM-DD. If formats vary, might need robust parsing.
    # We assume Gemini executes the prompt well.
    files_with_meta.sort(key=lambda x: x['meta'].date)
    
    results = []
    total_changes = 0
    
    # 3. Apply sequentially
    for item in files_with_meta:
        print(f"Applying {item['meta'].title} (Date: {item['meta'].date})")
        res = apply_amendment(
            contract_id, 
            item['content'], 
            db, 
            filename=item['file'].filename, 
            metadata=item['meta'].model_dump()
        )
        results.append(res)
        total_changes += res['changes_applied']
    
    # 4. Re-extract parties first, then generate bullet_summary for dashboard hover
    contract = db.query(ContractModel).filter(ContractModel.id == contract_id).first()
    if contract:
        from .gemini_parser import generate_bullet_summary, extract_parties_from_clauses

        # Re-extract parties in case amendments added or changed them
        parties = extract_parties_from_clauses(contract.clauses)
        if parties:  # Only update if we got valid parties
            contract.parties = parties

        amendments_data = [
            {"filename": a.filename, "upload_timestamp": a.upload_timestamp}
            for a in contract.amendments
        ]
        # Generate summary with party names
        bullet_summary = generate_bullet_summary(contract.clauses, amendments_data, parties)
        contract.bullet_summary = bullet_summary

        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(contract, "bullet_summary")
        flag_modified(contract, "parties")
        db.commit()
        print(f"Generated bullet summary: {bullet_summary}")
        print(f"Updated parties: {parties}")

    return {
        "status": "batch_completed",
        "processed_count": len(results),
        "total_changes": total_changes,
        "history": [r['title'] for r in results]
    }
