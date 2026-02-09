import { Contract, ClauseHistory, ContractListItem } from '@/types/contract';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchContracts(): Promise<ContractListItem[]> {
    const response = await fetch(`${API_BASE_URL}/contracts`);
    if (!response.ok) {
        throw new Error('Failed to fetch contracts list');
    }
    return response.json();
}

export async function fetchContract(contractId: number): Promise<Contract> {
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch contract: ${response.statusText}`);
    }

    return response.json();
}

export async function fetchClauseHistory(
    contractId: number,
    clauseId: string
): Promise<ClauseHistory> {
    const response = await fetch(
        `${API_BASE_URL}/contracts/${contractId}/clauses/${clauseId}/history`
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch clause history: ${response.statusText}`);
    }

    return response.json();
}

export async function uploadContract(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('files', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Failed to upload contract');
    }

    return response.json();
}

export async function amendContract(contractId: number, files: File[]): Promise<any> {
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });

    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/amend`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Failed to amend contract');
    }

    return response.json();
}

