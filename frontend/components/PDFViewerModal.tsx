'use client';

import { useState } from 'react';

interface PDFViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    pdfUrl: string;
    filename: string;
}

export default function PDFViewerModal({ isOpen, onClose, pdfUrl, filename }: PDFViewerModalProps) {
    const [loadError, setLoadError] = useState(false);

    if (!isOpen) return null;

    const handleDownload = () => {
        // Use fetch to download with proper headers
        fetch(pdfUrl)
            .then(response => response.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Download failed:', error);
                // Fallback: open in new tab
                window.open(pdfUrl, '_blank');
            });
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-white rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-900" style={{ fontFamily: "'Cormorant', serif" }}>{filename.replace('.pdf', '')}</h2>
                            <p className="text-xs text-neutral-500">Source Document</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors font-medium text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Open in Tab
                        </a>
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors font-semibold text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                            aria-label="Close PDF viewer"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* PDF Viewer */}
                <div className="flex-1 overflow-hidden bg-gray-100" style={{ minHeight: '500px' }}>
                    {!loadError ? (
                        <object
                            data={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                            type="application/pdf"
                            className="w-full h-full"
                            style={{ border: 'none', minHeight: '100%' }}
                            onError={() => setLoadError(true)}
                        >
                            {/* Fallback: iframe */}
                            <iframe
                                src={`${pdfUrl}#toolbar=1`}
                                className="w-full h-full"
                                title={filename}
                                style={{ border: 'none', minHeight: '100%' }}
                                onError={() => setLoadError(true)}
                            />
                        </object>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4 text-3xl">
                                📄
                            </div>
                            <p className="text-gray-600 mb-2 font-medium">Unable to display PDF inline</p>
                            <p className="text-gray-400 text-sm mb-6">Your browser may not support inline PDF viewing.</p>
                            <div className="flex gap-3">
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                >
                                    Open in New Tab
                                </a>
                                <button
                                    onClick={handleDownload}
                                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                >
                                    Download PDF
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
