export interface Clause {
    id: string;
    header: string;
    text: string;
    page_number: number;
    type?: 'added' | 'modified';
    side_letter_affected?: boolean;
    side_letter_text?: string;
    metadata?: {
        affected_by?: string;
        side_letter_text?: string;
    };
}

export interface SourceDocument {
    type: 'Original' | 'Amendment' | 'Side Letter';
    filename: string;
    file_path?: string | null;
    date: string | null;
}

export interface DeletedClause {
    id: string;
    header: string;
    text: string;
    deleted_by: number | null;
}

export interface Contract {
    id: number;
    filename: string;
    clause_count: number;
    clauses: Clause[];
    is_amended: boolean;
    parties?: string[];
    ai_summary?: string;
    bullet_summary?: string[];
    agreement_type?: string;
    original_preamble?: string;
    source_documents?: SourceDocument[];
    deleted_clauses?: DeletedClause[];
    amendment_count?: number;
}

// New interface for dashboard card data (from /contracts endpoint)
export interface ContractListItem {
    id: number;
    filename: string;
    clause_count: number;
    is_amended: boolean;
    amendment_count: number;
    counterparty: string | null;
    parties: string[] | null;
    agreement_type: string | null;
    original_date: string | null;
    last_amended_date: string | null;
    bullet_summary: string[] | null;
}

export interface ClauseVersion {
    timestamp: string;
    action: 'REPLACE' | 'DELETE' | 'SIDE_LETTER_TAG' | 'ORIGINAL';
    text: string;
    amendment?: {
        filename: string;
        description: string;
        date: string;
    };
    metadata?: {
        affected_by?: string;
        side_letter_text?: string;
        deletion_clause_text?: string;
        original_header?: string;
        original_id?: string;
        [key: string]: any;
    };
}

export interface ClauseHistory {
    clause_id: string;
    versions: ClauseVersion[];
}
