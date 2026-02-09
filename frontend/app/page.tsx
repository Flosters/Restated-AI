'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchContracts } from '@/lib/api';
import { ContractListItem } from '@/types/contract';
import UploadModal from '@/components/UploadModal';
import OnboardingModal, { UserIdentity } from '@/components/OnboardingModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
    const [contracts, setContracts] = useState<ContractListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);

    const refreshContracts = () => {
        setLoading(true);
        fetchContracts()
            .then(setContracts)
            .catch(err => {
                console.error(err);
                setError('Could not connect to the backend server. Please ensure the FastAPI server is running at http://localhost:8000.');
            })
            .finally(() => setLoading(false));
    };

    // Close all key points popups
    const closeAllKeyPoints = () => {
        const allModals = document.querySelectorAll('[id^="keypoints-"]');
        allModals.forEach(modal => modal.classList.add('hidden'));
    };

    useEffect(() => {
        // Check for existing user identity
        const savedIdentity = localStorage.getItem('restated_user_identity');
        if (savedIdentity) {
            setUserIdentity(JSON.parse(savedIdentity));
        } else {
            setIsOnboardingOpen(true);
        }
        refreshContracts();

        // Add click listener to close popups when clicking outside
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Check if click is outside any keypoints modal and not on a keypoints button
            if (!target.closest('[id^="keypoints-"]') && !target.closest('[title="View Key Points"]')) {
                closeAllKeyPoints();
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleIdentitySave = (identity: UserIdentity) => {
        localStorage.setItem('restated_user_identity', JSON.stringify(identity));
        setUserIdentity(identity);
    };

    // Format date for display
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const getCounterparty = (contract: ContractListItem) => {
        if (!contract.parties || contract.parties.length === 0) return contract.counterparty;
        if (!userIdentity || !userIdentity.companyName) return contract.counterparty;

        // Simplify match (case insensitive, check inclusion)
        const userCompany = userIdentity.companyName.toLowerCase();

        // Find the party that is NOT the user's company
        const counterparty = contract.parties.find(p => {
            const partyName = p.toLowerCase();
            // Return true if this party is NOT the user's company
            // We check if partyName contains userCompany OR userCompany contains partyName (for basic fuzzy match)
            return !partyName.includes(userCompany) && !userCompany.includes(partyName);
        });

        return counterparty || contract.parties[0]; // Fallback to first party if no match or both match
    };

    return (
        <div className="min-h-screen flex flex-col">
            <OnboardingModal
                isOpen={isOnboardingOpen}
                onClose={() => setIsOnboardingOpen(false)}
                onSave={handleIdentitySave}
            />
            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onSuccess={refreshContracts}
            />

            {/* Header with logo and upload button */}
            <header className="border-b border-neutral-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-neutral-900 to-neutral-700 rounded-lg shadow-sm">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 3H15L19 7V21H5V3H9Z" stroke="rgb(183, 148, 92)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 3V7H15" stroke="rgb(183, 148, 92)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13H15M9 17H13" stroke="rgb(183, 148, 92)" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <h1 className="text-2xl font-serif" style={{ fontFamily: "'Cormorant', serif", fontWeight: 600, letterSpacing: '0.02em' }}>
                            <span className="text-neutral-900">Restated AI</span>
                        </h1>
                    </div>

                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="group flex items-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                        style={{ fontWeight: 600, fontSize: '0.9375rem' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>New Agreement</span>
                    </button>
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-8 py-16">
                {/* Page title */}
                <div className="mb-12 animate-fadeInUp">
                    <h2 className="text-5xl mb-4" style={{ fontFamily: "'Cormorant', serif", fontWeight: 600, color: 'rgb(var(--navy))' }}>
                        Amended & Restated Agreements
                    </h2>
                    <p className="text-neutral-600 text-lg" style={{ fontWeight: 500 }}>
                        Know exactly what you've signed.
                    </p>
                </div>

                {/* Agreements list */}
                <div className="animate-stagger-1">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-32 bg-white/40 rounded-2xl animate-pulse border border-neutral-200/40" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-12 text-center backdrop-blur-sm">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 15.333c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <p className="text-red-900 font-semibold text-lg mb-2">Connection Error</p>
                            <p className="text-red-700 text-sm max-w-md mx-auto">{error}</p>
                        </div>
                    ) : contracts.length > 0 ? (
                        <div className="space-y-3">
                            {contracts.map((c, idx) => (
                                <div
                                    key={c.id}
                                    className="group relative animate-stagger-1"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <Link href={`/contracts/${c.id}`} className="flex items-center gap-6 p-6 bg-white/60 backdrop-blur-sm border border-neutral-200/60 rounded-2xl hover:bg-white/80 hover:border-neutral-300/60 hover:shadow-sm transition-all duration-200 cursor-pointer">
                                        {/* Icon */}
                                        <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-neutral-100 to-neutral-50 rounded-xl flex items-center justify-center border border-neutral-200/40">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-600">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="9" y1="15" x2="15" y2="15" />
                                            </svg>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-neutral-900 mb-1.5 text-lg truncate" style={{ fontFamily: "'Cormorant', serif" }}>
                                                {c.agreement_type || c.filename?.replace('.pdf', '')}
                                            </h3>
                                            <div className="flex items-center gap-3 text-sm text-neutral-600">
                                                {getCounterparty(c) && (
                                                    <>
                                                        <span className="font-medium">{getCounterparty(c)}</span>
                                                        <span className="text-neutral-400">•</span>
                                                    </>
                                                )}
                                                <span>{c.amendment_count} {c.amendment_count === 1 ? 'amendment' : 'amendments'}</span>
                                            </div>
                                            {(c.original_date || c.last_amended_date) && (
                                                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                                                    {c.original_date && (
                                                        <span>Established {formatDate(c.original_date)}</span>
                                                    )}
                                                    {c.original_date && c.last_amended_date && <span className="text-neutral-400">•</span>}
                                                    {c.last_amended_date && (
                                                        <span>Last amended {formatDate(c.last_amended_date)}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex-shrink-0 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                                            {/* Key Points Button */}
                                            {c.bullet_summary && c.bullet_summary.length > 0 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const thisModal = document.getElementById(`keypoints-${c.id}`);
                                                        const isCurrentlyHidden = thisModal?.classList.contains('hidden');

                                                        // Close all other key points
                                                        closeAllKeyPoints();

                                                        // Toggle this one
                                                        if (thisModal && isCurrentlyHidden) {
                                                            thisModal.classList.remove('hidden');
                                                        }
                                                    }}
                                                    className="p-2.5 text-neutral-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                                                    title="View Key Points"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                                                    </svg>
                                                </button>
                                            )}

                                            {/* Download Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    window.open(`${API_BASE_URL}/contracts/${c.id}/export`, '_blank');
                                                }}
                                                className="p-2.5 text-neutral-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                                                title="Download PDF"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="7 10 12 15 17 10" />
                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                </svg>
                                            </button>
                                        </div>
                                    </Link>

                                    {/* Key Points Modal (hidden by default) */}
                                    {c.bullet_summary && c.bullet_summary.length > 0 && (
                                        <div id={`keypoints-${c.id}`} className="hidden absolute left-0 right-0 bottom-full mb-2 z-50 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-neutral-200/60 p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                                                        <span className="text-xs">✦</span>
                                                    </div>
                                                    <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Key Points</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const modal = document.getElementById(`keypoints-${c.id}`);
                                                        if (modal) modal.classList.add('hidden');
                                                    }}
                                                    className="text-neutral-400 hover:text-neutral-600"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <ul className="space-y-2">
                                                {c.bullet_summary.map((bullet, idx) => (
                                                    <li key={idx} className="text-sm text-neutral-700 flex items-start gap-2.5 leading-relaxed">
                                                        <span className="text-amber-600 mt-1.5 flex-shrink-0">•</span>
                                                        <span>{bullet}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-24 bg-white/40 backdrop-blur-sm rounded-2xl border-2 border-dashed border-neutral-300/60">
                            <div className="w-20 h-20 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </div>
                            <p className="text-neutral-600 text-lg font-medium mb-2">No agreements found</p>
                            <p className="text-sm text-neutral-500 mb-8">Upload your first contract to get started</p>
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md font-semibold"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Upload Agreement
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-neutral-200/60 bg-white/40 backdrop-blur-sm py-8">
                <div className="max-w-7xl mx-auto px-8 text-center">
                    <p className="text-sm text-neutral-500">
                        © 2026 Restated AI • v0.1.0
                    </p>
                </div>
            </footer>
        </div>
    );
}
