'use client';

import { useEffect, useState, useMemo } from 'react';
import { ClauseHistory, Clause } from '@/types/contract';
import { fetchClauseHistory } from '@/lib/api';
import PDFViewerModal from './PDFViewerModal';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    contractId: number;
    clauseId: string | null;
    clause?: Clause | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Sidebar({ isOpen, onClose, contractId, clauseId, clause }: SidebarProps) {
    const [history, setHistory] = useState<ClauseHistory | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
    const [selectedPdfUrl, setSelectedPdfUrl] = useState<string>('');
    const [selectedPdfFilename, setSelectedPdfFilename] = useState<string>('');

    useEffect(() => {
        if (isOpen && clauseId) {
            setLoading(true);
            setError(null);

            fetchClauseHistory(contractId, clauseId)
                .then(setHistory)
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, contractId, clauseId]);

    const handleViewDocument = (filename: string) => {
        setSelectedPdfUrl(`${API_BASE_URL}/files/${filename}`);
        setSelectedPdfFilename(filename);
        setPdfViewerOpen(true);
    };

    // Determine if this clause has been eliminated (hooks must be before early return)
    const isEliminated = useMemo(() => {
        if (!history) return false;
        return history.versions.some(v => v.action === 'DELETE');
    }, [history]);

    const deleteVersion = useMemo(() => {
        if (!history) return null;
        return history.versions.find(v => v.action === 'DELETE') || null;
    }, [history]);

    if (!isOpen) return null;

    const getTimelineDotColor = (action: string) => {
        switch (action) {
            case 'ORIGINAL': return 'bg-gray-500';
            case 'REPLACE': return 'bg-orange-500';
            case 'DELETE': return 'bg-green-600';
            case 'SIDE_LETTER_TAG': return 'bg-purple-500';
            default: return 'bg-blue-600';
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'ORIGINAL': return null; // No badge for original
            case 'REPLACE': return { text: 'AMENDED', color: 'bg-red-500 text-white' };
            case 'DELETE': return { text: 'ELIMINATED', color: 'bg-green-500 text-white' };
            case 'SIDE_LETTER_TAG': return { text: 'SIDE LETTER', color: 'bg-purple-500 text-white' };
            default: return null;
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40"
                onClick={onClose}
            />

            {/* Sidebar */}
            <div
                className={`fixed top-0 right-0 h-full w-full md:w-[420px] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex justify-between items-center z-10">
                    <h2 className="text-lg font-bold text-gray-900">Clause History</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Close sidebar"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* Current Clause - adapted for eliminated clauses */}
                    {clause && history && history.versions.length > 0 && (
                        <div className="mb-6">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Current Clause</p>
                            {isEliminated ? (
                                // Eliminated clause: show pre-deletion text with green ELIMINATED tag
                                <div className="bg-white rounded-xl p-4 border-2 border-green-400 relative">
                                    <div className="absolute top-2 right-2">
                                        <span className="px-2 py-1 text-xs font-bold bg-green-500 text-white rounded">
                                            ELIMINATED
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-gray-900 mb-2 pr-24">{clause.header}</h3>
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap text-justify">
                                        {clause.text}
                                    </p>
                                </div>
                            ) : (
                                // Active clause: check if it's ORIGINAL (never amended) or AMENDED/SIDE LETTER
                                (() => {
                                    const isOriginal = history.versions.length === 1; // Only has ORIGINAL version
                                    const borderColor = isOriginal ? 'border-gray-300' : (clause.side_letter_affected ? 'border-purple-400' : 'border-red-400');
                                    const badgeColor = isOriginal ? 'bg-black' : (clause.side_letter_affected ? 'bg-purple-500' : 'bg-red-500');
                                    const badgeText = isOriginal ? 'ORIGINAL' : (clause.side_letter_affected ? 'SIDE LETTER' : 'AMENDED');

                                    return (
                                        <div className={`bg-white rounded-xl p-4 border-2 relative ${borderColor}`}>
                                            <div className="absolute top-2 right-2">
                                                <span className={`px-2 py-1 text-xs font-bold text-white rounded ${badgeColor}`}>
                                                    {badgeText}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-gray-900 mb-2 pr-24">{clause.header}</h3>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap text-justify">
                                                {clause.text}
                                            </p>
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    )}

                    {/* Deletion Clause - shown for eliminated clauses */}
                    {isEliminated && deleteVersion?.metadata?.deletion_clause_text && (
                        <div className="mb-6">
                            <p className="text-xs text-green-600 uppercase tracking-wider mb-2 font-semibold">Deletion Clause</p>
                            <div className="bg-green-50 rounded-xl p-4 border-2 border-green-300 relative">
                                <div className="absolute top-2 right-2">
                                    <span className="px-2 py-1 text-xs font-bold bg-green-500 text-white rounded">
                                        FROM AMENDMENT
                                    </span>
                                </div>
                                <p className="text-sm text-green-900 leading-relaxed whitespace-pre-wrap text-justify pr-28">
                                    {deleteVersion.metadata.deletion_clause_text}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Side Letter Clause - shown between Current Clause and Version History */}
                    {clause && !isEliminated && clause.side_letter_affected && (clause.side_letter_text || clause.metadata?.side_letter_text) && (
                        <div className="mb-6">
                            <p className="text-xs text-purple-600 uppercase tracking-wider mb-2 font-semibold">Side Letter Clause</p>
                            <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-300 relative">
                                <div className="absolute top-2 right-2">
                                    <span className="px-2 py-1 text-xs font-bold bg-purple-500 text-white rounded">
                                        FROM SIDE LETTER
                                    </span>
                                </div>
                                <p className="text-sm text-purple-900 leading-relaxed whitespace-pre-wrap text-justify pr-28">
                                    {clause.side_letter_text || clause.metadata?.side_letter_text}
                                </p>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl">
                            <p className="font-semibold">Error loading history</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {!loading && !error && history && history.versions.length === 0 && (
                        <div className="text-gray-500 text-center py-12">
                            No version history available for this clause.
                        </div>
                    )}

                    {!loading && !error && history && history.versions.length > 0 && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-semibold">Version History</p>
                            {/* Timeline - Chronological Order (oldest first) */}
                            <div className="relative border-l-2 border-gray-200 pl-5 space-y-6 ml-2">
                                {history.versions.map((version, idx) => {
                                    const actionLabel = getActionLabel(version.action);
                                    const dotColor = getTimelineDotColor(version.action);

                                    return (
                                        <div key={idx} className="relative">
                                            {/* Timeline dot */}
                                            <div className={`absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow`}></div>

                                            {/* Version card */}
                                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                                {/* Amendment Header */}
                                                {version.amendment && (
                                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-semibold text-gray-800 text-sm flex-1">
                                                                {version.amendment.description?.split('|')[0].replace('Title: ', '') || version.amendment.filename.replace('.pdf', '')}
                                                            </p>
                                                            {actionLabel && (
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${actionLabel.color}`}>
                                                                    {actionLabel.text}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {version.amendment.date && (
                                                            <p className="text-xs text-gray-500">
                                                                {new Date(version.amendment.date).toLocaleDateString('en-US', {
                                                                    year: 'numeric',
                                                                    month: 'short',
                                                                    day: 'numeric'
                                                                })}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="p-4">
                                                    {/* For DELETE versions, show the deletion clause text from the amendment */}
                                                    {version.action === 'DELETE' && version.metadata?.deletion_clause_text ? (
                                                        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap text-justify">
                                                            {version.metadata.deletion_clause_text}
                                                        </div>
                                                    ) : version.text ? (
                                                        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap text-justify">
                                                            {version.text}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Source Documents Footer */}
                {!loading && !error && history && history.versions.some(v => v.amendment) && (
                    <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-5">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">Source Documents</p>
                        <div className="space-y-2">
                            {history.versions.map((v, idx) => v.amendment && (
                                <button
                                    key={idx}
                                    onClick={() => handleViewDocument(v.amendment!.filename)}
                                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors w-full text-left"
                                >
                                    <span>📝</span>
                                    <span className="flex-1">{v.amendment.filename.replace('.pdf', '')}</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* PDF Viewer Modal */}
            <PDFViewerModal
                isOpen={pdfViewerOpen}
                onClose={() => setPdfViewerOpen(false)}
                pdfUrl={selectedPdfUrl}
                filename={selectedPdfFilename}
            />
        </>
    );
}
