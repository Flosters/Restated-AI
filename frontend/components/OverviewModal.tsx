'use client';

import { useState } from 'react';
import { Contract } from '@/types/contract';
import PDFViewerModal from './PDFViewerModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface OverviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
}

export default function OverviewModal({ isOpen, onClose, contract }: OverviewModalProps) {
    const [selectedDoc, setSelectedDoc] = useState<number | null>(null);
    const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

    if (!isOpen) return null;

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    const getDocIcon = (type: string) => {
        if (type === 'Original') return '📄';
        if (type === 'Amendment') return '📝';
        if (type === 'Side Letter') return '📌';
        return '📋';
    };

    const handleDocumentClick = (index: number) => {
        setSelectedDoc(index);
    };

    const handleVisualize = () => {
        if (selectedDoc !== null && contract.source_documents && contract.source_documents[selectedDoc]) {
            const doc = contract.source_documents[selectedDoc];
            if (doc.file_path) {
                setPdfViewerOpen(true);
            }
        }
    };

    const handleClosePdfViewer = () => {
        setPdfViewerOpen(false);
    };

    const selectedDocument = selectedDoc !== null && contract.source_documents
        ? contract.source_documents[selectedDoc]
        : null;

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    {contract.filename.replace('.pdf', '')}
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {contract.parties && contract.parties.length > 0 && (
                                        <span>• {contract.parties[0]}</span>
                                    )}
                                    {contract.source_documents && contract.source_documents[0]?.date && (
                                        <span> • Effective: {formatDate(contract.source_documents[0].date)}</span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
                        {/* AI Insights & Summary */}
                        {(contract.bullet_summary && contract.bullet_summary.length > 0) || contract.ai_summary ? (
                            <div className="mb-8">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-lg">✨</span>
                                    <h3 className="font-bold text-blue-700 uppercase text-sm tracking-wide">Agreement Insights</h3>
                                </div>
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 shadow-sm">
                                    {contract.bullet_summary && contract.bullet_summary.length > 0 ? (
                                        <ul className="space-y-3">
                                            {contract.bullet_summary.map((bullet, idx) => (
                                                <li key={idx} className="text-gray-800 text-sm flex items-start gap-3">
                                                    <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="leading-relaxed">{bullet}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-gray-700 leading-relaxed text-sm italic">
                                            {contract.ai_summary}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {/* Document History */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800">Document History</h3>
                                <p className="text-xs text-gray-500">Click to select a document</p>
                            </div>
                            <div className="space-y-3">
                                {contract.source_documents?.map((doc, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleDocumentClick(index)}
                                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedDoc === index
                                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm ${selectedDoc === index ? 'bg-blue-100' : 'bg-white'
                                            }`}>
                                            {getDocIcon(doc.type)}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900">
                                                {doc.filename.replace('.pdf', '')}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {doc.type} {doc.date && `• ${formatDate(doc.date)}`}
                                            </p>
                                        </div>
                                        {!doc.file_path && (
                                            <span className="text-xs text-red-500">PDF not available</span>
                                        )}
                                    </div>
                                ))}

                                {(!contract.source_documents || contract.source_documents.length === 0) && (
                                    <p className="text-gray-500 text-sm">No document history available.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleVisualize}
                            disabled={selectedDoc === null || !selectedDocument?.file_path}
                            className={`px-6 py-2 rounded-lg transition-colors font-medium ${selectedDoc !== null && selectedDocument?.file_path
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            Visualize Agreement
                        </button>
                    </div>
                </div>
            </div>

            {/* PDF Viewer Modal */}
            {selectedDocument && selectedDocument.file_path && (
                <PDFViewerModal
                    isOpen={pdfViewerOpen}
                    onClose={handleClosePdfViewer}
                    pdfUrl={`${API_BASE_URL}/files/${selectedDocument.file_path}`}
                    filename={selectedDocument.filename}
                />
            )}
        </>
    );
}
