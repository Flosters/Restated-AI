'use client';

import { useState } from 'react';
import { uploadContract, amendContract } from '@/lib/api';

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
    const [step, setStep] = useState<'original' | 'amendments' | 'processing' | 'success'>('original');
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [amendmentFiles, setAmendmentFiles] = useState<File[]>([]);
    const [contractId, setContractId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDraggingOriginal, setIsDraggingOriginal] = useState(false);
    const [isDraggingAmendments, setIsDraggingAmendments] = useState(false);

    const resetState = () => {
        setStep('original');
        setOriginalFile(null);
        setAmendmentFiles([]);
        setContractId(null);
        setIsUploading(false);
        setError(null);
        setIsDraggingOriginal(false);
        setIsDraggingAmendments(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleOriginalUpload = async () => {
        if (!originalFile) return;
        setIsUploading(true);
        setError(null);
        try {
            const result = await uploadContract(originalFile);
            setContractId(result[0].id);
            setStep('amendments');
        } catch (err) {
            console.error(err);
            setError('Failed to upload original contract.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleAmendmentsUpload = async () => {
        if (!contractId || amendmentFiles.length === 0) {
            // If no amendments, just finish
            setStep('success');
            onSuccess();
            return;
        }
        setIsUploading(true);
        setError(null);
        setStep('processing');
        try {
            await amendContract(contractId, amendmentFiles);
            setStep('success');
            onSuccess();
        } catch (err) {
            console.error(err);
            setError('Failed to apply amendments.');
            setStep('amendments'); // Go back to allow retry
        } finally {
            setIsUploading(false);
        }
    };

    const handleDropOriginal = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOriginal(false);
        const files = Array.from(e.dataTransfer.files);
        const pdfFile = files.find(f => f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFile) {
            setOriginalFile(pdfFile);
        } else {
            setError('Please drop a PDF file.');
        }
    };

    const handleDropAmendments = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingAmendments(false);
        const files = Array.from(e.dataTransfer.files);
        const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length > 0) {
            setAmendmentFiles(prev => [...prev, ...pdfFiles]);
        } else {
            setError('Please drop PDF files only.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-slideUp">
                <div className="p-8">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                                {step === 'original' && 'Upload Original'}
                                {step === 'amendments' && 'Add Amendments'}
                                {step === 'processing' && 'Processing AI...'}
                                {step === 'success' && 'Success!'}
                            </h2>
                            <p className="text-gray-500 font-medium">
                                {step === 'original' && 'Start by uploading the base agreement PDF.'}
                                {step === 'amendments' && 'Now upload any Side Letters or Amendment PDFs.'}
                                {step === 'processing' && "We're processing your documents with AI to create your amended and restated agreement."}
                                {step === 'success' && 'Your restated agreement is ready for viewing.'}
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {step === 'original' && (
                        <div className="space-y-6">
                            <label
                                className="block w-full cursor-pointer"
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOriginal(true); }}
                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOriginal(false); }}
                                onDrop={handleDropOriginal}
                            >
                                <div className={`border-4 border-dashed rounded-3xl p-12 text-center transition-all group ${
                                    isDraggingOriginal
                                        ? 'border-blue-400 bg-blue-50/50 scale-[1.02]'
                                        : 'border-gray-100 hover:border-blue-400 hover:bg-blue-50/50'
                                }`}>
                                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl group-hover:scale-110 transition-transform">
                                        📄
                                    </div>
                                    <p className="text-gray-900 font-bold text-lg mb-1">
                                        {originalFile ? originalFile.name : isDraggingOriginal ? 'Drop PDF here' : 'Click to select original PDF'}
                                    </p>
                                    <p className="text-gray-400 text-sm">Drag and drop or browse files</p>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf"
                                        onChange={(e) => setOriginalFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                            </label>

                            <button
                                disabled={!originalFile || isUploading}
                                onClick={handleOriginalUpload}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-2"
                            >
                                {isUploading ? 'Uploading...' : 'Continue to Amendments \u2192'}
                            </button>
                        </div>
                    )}

                    {step === 'amendments' && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                {amendmentFiles.map((f, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">📎</span>
                                            <span className="font-bold text-gray-800 text-sm">{f.name}</span>
                                        </div>
                                        <button
                                            onClick={() => setAmendmentFiles(prev => prev.filter((_, idx) => idx !== i))}
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <label
                                className="block w-full cursor-pointer"
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAmendments(true); }}
                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAmendments(false); }}
                                onDrop={handleDropAmendments}
                            >
                                <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                                    isDraggingAmendments
                                        ? 'border-blue-400 bg-blue-50/50 scale-[1.02]'
                                        : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                                }`}>
                                    <p className="text-gray-600 font-bold text-sm">
                                        {isDraggingAmendments ? 'Drop PDFs here' : 'Drag & drop or click to add Amendment PDFs'}
                                    </p>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        accept=".pdf"
                                        onChange={(e) => {
                                            if (e.target.files) {
                                                setAmendmentFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                            }
                                        }}
                                    />
                                </div>
                            </label>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => { setStep('success'); onSuccess(); }}
                                    className="py-5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black rounded-2xl transition-all"
                                >
                                    No Amendments
                                </button>
                                <button
                                    disabled={amendmentFiles.length === 0 || isUploading}
                                    onClick={handleAmendmentsUpload}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all"
                                >
                                    {isUploading ? 'Processing...' : 'Generate Amended & Restated Agreement'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="py-12 text-center">
                            <div className="relative w-24 h-24 mx-auto mb-8">
                                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-3xl">
                                    ✨
                                </div>
                            </div>
                            <div className="space-y-4 max-w-sm mx-auto">
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-600 animate-loading-bar"></div>
                                </div>
                                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">
                                    Synthesizing Agreement Details
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-12 text-center space-y-8 animate-fadeIn">
                            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto ring-8 ring-green-50 mb-4 scale-in">
                                ✓
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-gray-900">All Set!</h3>
                                <p className="text-gray-500">Your Amended & Restated Agreement is ready.</p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="w-full bg-gray-900 hover:bg-black text-white font-black py-5 rounded-2xl transition-all"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes loading-bar {
                    0% { width: 0%; transform: translateX(-100%); }
                    50% { width: 100%; transform: translateX(0); }
                    100% { width: 0%; transform: translateX(100%); }
                }
                .animate-slideUp { animation: slideUp 0.4s cubic-bezier(0, 0, 0.2, 1); }
                .animate-loading-bar { animation: loading-bar 2s infinite ease-in-out; }
                .scale-in { animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                @keyframes scaleIn {
                    from { transform: scale(0); }
                    to { transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
