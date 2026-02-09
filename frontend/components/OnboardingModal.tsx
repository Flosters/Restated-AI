'use client';

import { useState, useEffect } from 'react';

interface OnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (identity: UserIdentity) => void;
}

export interface UserIdentity {
    firstName: string;
    lastName: string;
    companyName: string;
}

export default function OnboardingModal({ isOpen, onClose, onSave }: OnboardingModalProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [isValid, setIsValid] = useState(false);

    useEffect(() => {
        setIsValid(firstName.trim() !== '' && lastName.trim() !== '' && companyName.trim() !== '');
    }, [firstName, lastName, companyName]);

    const handleSubmit = () => {
        if (!isValid) return;

        onSave({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            companyName: companyName.trim()
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp">
                <div className="p-10">
                    <div className="text-center mb-10">
                        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm">
                            👋
                        </div>
                        <h2 className="text-3xl font-semibold text-neutral-900 mb-3 tracking-tight" style={{ fontFamily: "'Cormorant', serif" }}>
                            Welcome to Restated AI
                        </h2>
                        <p className="text-neutral-600">
                            Tell us a bit about yourself so we can personalize your dashboard and accurately identify counterparties.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700 ml-1">First Name</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="Jane"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700 ml-1">Last Name</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Doe"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 ml-1">Company Name</label>
                            <input
                                type="text"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                placeholder="e.g. Acme Corporation"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
                            />
                            <p className="text-xs text-gray-400 ml-1">
                                We use this to correctly identify counterparties in your agreements.
                            </p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!isValid}
                            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.98] ${isValid
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                }`}
                        >
                            Get Started
                        </button>
                    </div>
                </div>
            </div>
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleUp {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
                .animate-scaleUp { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
            `}</style>
        </div>
    );
}
