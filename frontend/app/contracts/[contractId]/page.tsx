'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Contract, Clause } from '@/types/contract';
import { fetchContract, amendContract } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import OverviewModal from '@/components/OverviewModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ContractPage() {
    const params = useParams();
    const rawId = params.contractId as string;
    const isPlaceholder = rawId === '{contractId}' || rawId === '%7BcontractId%7D';
    const contractId = parseInt(rawId, 10);

    const [contract, setContract] = useState<Contract | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
    const [selectedClause, setSelectedClause] = useState<Clause | null>(null);
    const [zoom, setZoom] = useState(100);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const [legendVisible, setLegendVisible] = useState(true);

    // Amendment modal state
    const [amendModalOpen, setAmendModalOpen] = useState(false);
    const [amendFiles, setAmendFiles] = useState<File[]>([]);
    const [isAmending, setIsAmending] = useState(false);
    const [amendError, setAmendError] = useState<string | null>(null);
    const [isDraggingAmend, setIsDraggingAmend] = useState(false);

    useEffect(() => {
        if (isPlaceholder) {
            setError('Placeholder ID detected');
            setLoading(false);
            return;
        }

        if (!isNaN(contractId)) {
            fetchContract(contractId)
                .then(setContract)
                .catch((err) => setError(err.message))
                .finally(() => setLoading(false));
        } else {
            setError('Invalid contract ID');
            setLoading(false);
        }
    }, [contractId, isPlaceholder]);

    const refreshContract = () => {
        setLoading(true);
        fetchContract(contractId)
            .then(setContract)
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    };

    const handleClauseClick = (clause: Clause) => {
        setSelectedClauseId(clause.id);
        setSelectedClause(clause);
        setSidebarOpen(true);
    };

    const handleCloseSidebar = () => {
        setSidebarOpen(false);
        setSelectedClauseId(null);
        setSelectedClause(null);
    };

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

    const handleExportPDF = () => {
        window.open(`${API_BASE_URL}/contracts/${contractId}/export`, '_blank');
    };

    const handleAmendSubmit = async () => {
        if (amendFiles.length === 0) return;
        setIsAmending(true);
        setAmendError(null);
        try {
            await amendContract(contractId, amendFiles);
            setAmendModalOpen(false);
            setAmendFiles([]);
            refreshContract();
        } catch (err) {
            setAmendError(err instanceof Error ? err.message : 'Failed to apply amendments');
        } finally {
            setIsAmending(false);
        }
    };

    const handleCloseAmendModal = () => {
        setAmendModalOpen(false);
        setAmendFiles([]);
        setAmendError(null);
        setIsDraggingAmend(false);
    };

    // Get clause styling based on type (side letter has highest priority)
    const getClauseStyle = (clause: Clause) => {
        // Side letter takes priority
        if (clause.side_letter_affected) {
            return 'border-l-4 border-purple-500 bg-purple-50/40 hover:bg-purple-50';
        }
        if (clause.type === 'modified') {
            return 'border-l-4 border-red-400 bg-red-50/40 hover:bg-red-50';
        }
        if (clause.type === 'added') {
            return 'border-l-4 border-blue-500 bg-blue-50/40 hover:bg-blue-50';
        }
        return 'border-l-4 border-transparent hover:bg-neutral-50/50';
    };

    const handleDeletedClauseClick = (deletedClause: any) => {
        // Create a temporary clause object for the sidebar
        const tempClause: Clause = {
            id: deletedClause.id,
            header: deletedClause.header,
            text: deletedClause.text,
            page_number: 0,
            type: 'modified'
        };
        setSelectedClauseId(deletedClause.id);
        setSelectedClause(tempClause);
        setSidebarOpen(true);
    };

    // Check if a clause is a parent header (empty text, has sub-sections after it)
    const isParentHeader = (clause: Clause, index: number, clauses: Clause[]) => {
        if (clause.text && clause.text.trim() !== '') return false;
        // Check if next clause ID looks like a sub-section of this one
        if (index + 1 < clauses.length) {
            const nextId = clauses[index + 1].id;
            return nextId.startsWith(clause.id + '_');
        }
        return false;
    };

    // Build combined list of active and deleted clauses for positional rendering
    const allItems = useMemo(() => {
        if (!contract) return [];

        const items: Array<{ type: 'active' | 'deleted'; clause: any; originalIndex: number }> = [];

        // Add active clauses preserving their original order
        contract.clauses.forEach((clause, idx) => {
            const getPosition = (id: string) => {
                const match = id.match(/clause_(\d+)/);
                return match ? parseInt(match[1]) : idx;
            };
            items.push({ type: 'active', clause, originalIndex: getPosition(clause.id) });
        });

        // Insert deleted clauses at their original position
        if (contract.deleted_clauses) {
            contract.deleted_clauses.forEach((dc) => {
                const getPosition = (id: string) => {
                    const match = id.match(/clause_(\d+)/);
                    return match ? parseInt(match[1]) : 999;
                };
                items.push({ type: 'deleted', clause: dc, originalIndex: getPosition(dc.id) });
            });
        }

        // Sort: active clauses keep their array order; deleted clauses are inserted by position
        // We use a stable sort: for same position, active comes before deleted
        items.sort((a, b) => {
            if (a.originalIndex !== b.originalIndex) return a.originalIndex - b.originalIndex;
            // Active clauses come before deleted at same position
            if (a.type === 'active' && b.type === 'deleted') return -1;
            if (a.type === 'deleted' && b.type === 'active') return 1;
            return 0;
        });

        return items;
    }, [contract]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-neutral-900 mx-auto mb-4"></div>
                    <p className="text-neutral-600 font-medium">Loading agreement...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="bg-white border border-neutral-200 shadow-xl rounded-2xl p-10 max-w-lg w-full text-center">
                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 15.333c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-neutral-900 mb-4" style={{ fontFamily: "'Cormorant', serif" }}>
                        {isPlaceholder ? 'Action Required' : 'Error Loading Contract'}
                    </h2>
                    <p className="text-neutral-600 mb-8 leading-relaxed">
                        {isPlaceholder
                            ? "Replace {contractId} with a real numerical ID from your library."
                            : `We couldn't load the contract: ${error}`}
                    </p>
                    <Link href="/" className="inline-block w-full py-4 bg-neutral-900 text-white font-semibold rounded-xl hover:bg-neutral-800 transition-all">
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (!contract) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-neutral-600">Contract not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-100/40">
            {/* Header / Toolbar */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-neutral-200/60 sticky top-0 z-30 shadow-sm">
                <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
                    {/* Left: Back + Title */}
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-neutral-500 hover:text-neutral-900 transition-colors p-2 hover:bg-neutral-100 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-lg font-semibold text-neutral-900 truncate max-w-md" style={{ fontFamily: "'Cormorant', serif", fontSize: '1.25rem' }}>
                                {contract.agreement_type || contract.filename.replace('.pdf', '')}
                            </h1>
                            <p className="text-xs text-neutral-500">
                                Amended & Restated
                            </p>
                        </div>
                    </div>

                    {/* Center: Zoom Controls */}
                    <div className="flex items-center gap-2 bg-neutral-100/80 rounded-lg px-3 py-1.5">
                        <button
                            onClick={handleZoomOut}
                            className="p-1.5 text-neutral-600 hover:text-neutral-900 disabled:opacity-40 transition-colors hover:bg-white rounded"
                            disabled={zoom <= 50}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                            </svg>
                        </button>
                        <span className="text-sm font-medium text-neutral-700 w-12 text-center">{zoom}%</span>
                        <button
                            onClick={handleZoomIn}
                            className="p-1.5 text-neutral-600 hover:text-neutral-900 disabled:opacity-40 transition-colors hover:bg-white rounded"
                            disabled={zoom >= 200}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                            </svg>
                        </button>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLegendVisible(!legendVisible)}
                            className="flex items-center gap-2 px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors text-sm font-medium"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            <span>Legend</span>
                        </button>
                        <button
                            onClick={() => setOverviewOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors text-sm font-medium"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Overview</span>
                        </button>
                        <button
                            onClick={() => setAmendModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-200/60 text-sm font-medium"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add Amendment</span>
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors font-semibold text-sm shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export PDF
                        </button>
                    </div>
                </div>
            </header>

            {/* Smart Legend - Floating */}
            {legendVisible && (
                <div className="fixed bottom-8 left-8 z-20 animate-fadeInUp">
                    <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-neutral-200/60 p-5 w-64">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-neutral-900 text-sm" style={{ fontFamily: "'Cormorant', serif", fontSize: '1.125rem' }}>Smart Legend</h3>
                            <button
                                onClick={() => setLegendVisible(false)}
                                className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-1 bg-blue-500 rounded-full"></div>
                                <span className="text-sm text-neutral-700">Added Clauses</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-1 bg-red-400 rounded-full"></div>
                                <span className="text-sm text-neutral-700">Modified Terms</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-1 bg-green-500 rounded-full"></div>
                                <span className="text-sm text-neutral-700">Eliminated Clauses</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-1 bg-purple-500 rounded-full"></div>
                                <span className="text-sm text-neutral-700">Side Letters</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Document View */}
            <main className="py-8 overflow-auto" style={{ minHeight: 'calc(100vh - 80px)' }}>
                <div
                    className="mx-auto transition-transform duration-200"
                    style={{
                        width: '816px',
                        transform: `scale(${zoom / 100})`,
                        transformOrigin: 'top center'
                    }}
                >
                    {/* Paper */}
                    <div className="bg-white shadow-2xl" style={{ minHeight: '1056px' }}>
                        {/* Document Content */}
                        <div className="p-16">
                            {/* Document Title */}
                            <h1 className="text-2xl font-semibold text-center text-neutral-900 mb-8 uppercase tracking-wide" style={{ fontFamily: "'Cormorant', serif" }}>
                                Amended & Restated {contract.agreement_type || "Agreement"}
                            </h1>

                            {/* Original Preamble */}
                            {contract.original_preamble && (
                                <div className="mb-12 text-neutral-700 leading-relaxed border-b border-neutral-200 pb-8">
                                    <p className="whitespace-pre-wrap text-justify">{contract.original_preamble}</p>
                                </div>
                            )}

                            {/* Clauses with Deleted Indicators at original positions */}
                            <div className="space-y-6">
                                {allItems.map((item, index) => {
                                    if (item.type === 'deleted') {
                                        // Deleted clause indicator at its original position
                                        return (
                                            <div
                                                key={`deleted-${item.clause.id}`}
                                                className="border-l-4 border-green-500 bg-green-50/40 p-4 rounded cursor-pointer hover:bg-green-50 transition-colors"
                                                onClick={() => handleDeletedClauseClick(item.clause)}
                                            >
                                                <p className="text-sm text-green-800 flex items-center gap-2">
                                                    <span className="px-2 py-0.5 text-xs font-bold bg-green-500 text-white rounded">ELIMINATED</span>
                                                    <span className="font-medium">{item.clause.header || item.clause.id}</span>
                                                    <span className="text-xs text-neutral-500 ml-auto">(Click to view history)</span>
                                                </p>
                                            </div>
                                        );
                                    }

                                    const clause = item.clause as Clause;
                                    // Find original index in contract.clauses for parent header check
                                    const clauseIndex = contract.clauses.indexOf(clause);

                                    // Check if header matches agreement title (avoid duplicate title display)
                                    const agreementTitle = contract.agreement_type?.toUpperCase();
                                    const headerMatchesTitle = clause.header && agreementTitle &&
                                        clause.header.toUpperCase().replace(/[^\w\s]/g, '').includes(agreementTitle.replace(/[^\w\s]/g, ''));

                                    // If header matches title but has preamble text, show as intro clause
                                    if (headerMatchesTitle && clause.text && clause.text.trim()) {
                                        return (
                                            <div key={clause.id} className="mb-8 text-neutral-700 leading-relaxed">
                                                <p className="whitespace-pre-wrap text-justify text-sm">
                                                    {clause.text}
                                                </p>
                                            </div>
                                        );
                                    }

                                    // If header matches title but no text, skip entirely
                                    if (headerMatchesTitle) {
                                        return null;
                                    }

                                    // Parent header clause (empty text)
                                    if (isParentHeader(clause, clauseIndex, contract.clauses)) {
                                        return (
                                            <div key={clause.id} className="pt-4 pb-1">
                                                <p className="font-semibold text-neutral-900 text-base uppercase tracking-wide" style={{ fontFamily: "'Cormorant', serif" }}>
                                                    {clause.header}
                                                </p>
                                            </div>
                                        );
                                    }

                                    // Check if this is an Exhibit/Annex/Schedule title (non-clickable)
                                    const isExhibitTitle = clause.id.endsWith('_title');

                                    if (isExhibitTitle) {
                                        // Exhibit title - non-clickable, centered, larger font
                                        return (
                                            <div key={clause.id} className="py-8 text-center">
                                                <h2 className="text-2xl font-semibold text-neutral-900" style={{ fontFamily: "'Cormorant', serif" }}>
                                                    {clause.header}
                                                </h2>
                                            </div>
                                        );
                                    }

                                    // Introductory clauses (agreement_introduction, recitals, etc.)
                                    // These have empty headers but contain preamble/recital text
                                    const isIntroClause = !clause.header && clause.text &&
                                        (clause.id.includes('introduction') || clause.id.includes('recital') ||
                                         clause.id.includes('preamble') || clause.id.includes('whereas'));

                                    if (isIntroClause) {
                                        return (
                                            <div key={clause.id} className="mb-8 text-neutral-700 leading-relaxed">
                                                <p className="whitespace-pre-wrap text-justify text-sm">
                                                    {clause.text}
                                                </p>
                                            </div>
                                        );
                                    }

                                    // Regular Clause - clickable
                                    return (
                                        <div
                                            key={clause.id}
                                            className={`p-4 rounded cursor-pointer transition-all ${getClauseStyle(clause)}`}
                                            onClick={() => handleClauseClick(clause)}
                                        >
                                            <p className="font-semibold text-neutral-900 mb-2" style={{ fontFamily: "'Cormorant', serif" }}>
                                                {clause.header}
                                            </p>
                                            {clause.text && (
                                                <p className="text-neutral-700 leading-relaxed whitespace-pre-wrap text-sm text-justify">
                                                    {clause.text}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {contract.clauses.length === 0 && (
                                <div className="text-center py-12 text-neutral-500">
                                    No clauses found in this contract.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Sidebar */}
            <Sidebar
                isOpen={sidebarOpen}
                onClose={handleCloseSidebar}
                contractId={contractId}
                clauseId={selectedClauseId}
                clause={selectedClause}
            />

            {/* Overview Modal */}
            <OverviewModal
                isOpen={overviewOpen}
                onClose={() => setOverviewOpen(false)}
                contract={contract}
            />

            {/* Amendment Upload Modal */}
            {amendModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h2 className="text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: "'Cormorant', serif" }}>
                                        {isAmending ? 'Processing...' : 'Add New Amendment'}
                                    </h2>
                                    <p className="text-neutral-600 font-medium">
                                        Upload amendment or side letter PDFs to apply.
                                    </p>
                                </div>
                                <button
                                    onClick={handleCloseAmendModal}
                                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {amendError && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium">
                                    {amendError}
                                </div>
                            )}

                            {isAmending ? (
                                <div className="py-12 text-center">
                                    <div className="relative w-24 h-24 mx-auto mb-8">
                                        <div className="absolute inset-0 border-4 border-neutral-200 rounded-full"></div>
                                        <div className="absolute inset-0 border-4 border-neutral-900 rounded-full border-t-transparent animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-3xl">
                                            ✨
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-neutral-700 uppercase tracking-widest">
                                        Applying amendments...
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* File list */}
                                    <div className="space-y-3">
                                        {amendFiles.map((f, i) => (
                                            <div key={i} className="flex justify-between items-center p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">📎</span>
                                                    <span className="font-semibold text-neutral-800 text-sm">{f.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => setAmendFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="text-neutral-400 hover:text-red-500 transition-colors text-sm"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Drop zone with drag-and-drop */}
                                    <label
                                        className="block w-full cursor-pointer"
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAmend(true); }}
                                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAmend(false); }}
                                        onDrop={(e) => {
                                            e.preventDefault(); e.stopPropagation(); setIsDraggingAmend(false);
                                            const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
                                            if (files.length > 0) setAmendFiles(prev => [...prev, ...files]);
                                        }}
                                    >
                                        <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                                            isDraggingAmend ? 'border-neutral-400 bg-neutral-50/50 scale-[1.02]' : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50/50'
                                        }`}>
                                            <div className="w-12 h-12 bg-neutral-100 text-neutral-600 rounded-xl flex items-center justify-center mx-auto mb-3 text-xl">
                                                📄
                                            </div>
                                            <p className="text-neutral-700 font-semibold text-sm">
                                                {isDraggingAmend ? 'Drop PDFs here' : 'Drag & drop or click to add PDFs'}
                                            </p>
                                            <p className="text-neutral-500 text-xs mt-1">Amendment or Side Letter PDFs</p>
                                            <input
                                                type="file"
                                                multiple
                                                className="hidden"
                                                accept=".pdf"
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setAmendFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </label>

                                    {/* Action buttons */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            onClick={handleCloseAmendModal}
                                            className="py-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-2xl transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            disabled={amendFiles.length === 0}
                                            onClick={handleAmendSubmit}
                                            className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 text-white font-semibold py-4 rounded-2xl shadow-lg transition-all"
                                        >
                                            Apply Amendments
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
