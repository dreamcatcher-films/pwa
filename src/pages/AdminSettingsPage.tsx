import React, { useState } from 'react';
import { LoadingSpinner, CheckCircleIcon, CircleStackIcon } from '../components/Icons';

const AdminSettingsPage: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleInitializeDb = async () => {
        if (!window.confirm('Czy na pewno chcesz zainicjować schemat bazy danych? Ta operacja utworzy wszystkie niezbędne tabele, jeśli nie istnieją. Jest to bezpieczne do uruchomienia, nawet jeśli tabele już istnieją.')) {
            return;
        }

        setStatus('loading');
        setMessage('');

        const token = localStorage.getItem('adminAuthToken');

        try {
            const response = await fetch('/api/admin/setup-database', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Wystąpił nieznany błąd.');
            }

            setStatus('success');
            setMessage(data.message);
        } catch (err) {
            setStatus('error');
            setMessage(err instanceof Error ? err.message : 'Nie udało się zainicjować bazy danych.');
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Ustawienia Systemowe</h2>
            <div className="bg-white rounded-2xl shadow p-6 max-w-2xl">
                <h3 className="text-lg font-semibold text-slate-900">Zarządzanie Bazą Danych</h3>
                <p className="mt-1 text-sm text-slate-600">
                    Jeśli aplikacja nie działa poprawnie lub widzisz błędy związane z brakiem danych,
                    możesz ręcznie uruchomić proces tworzenia schematu bazy danych.
                </p>
                <div className="mt-6">
                    <button
                        onClick={handleInitializeDb}
                        disabled={status === 'loading'}
                        className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition w-full sm:w-auto"
                    >
                        {status === 'loading' ? (
                            <LoadingSpinner className="w-5 h-5" />
                        ) : (
                            <CircleStackIcon className="w-5 h-5" />
                        )}
                        <span>{status === 'loading' ? 'Inicjalizowanie...' : 'Inicjalizuj Schemat Bazy Danych'}</span>
                    </button>
                </div>
                {message && (
                    <div className="mt-4 p-3 rounded-lg text-sm" role="alert">
                        {status === 'success' && (
                            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
                                <CheckCircleIcon className="w-5 h-5" />
                                <div>
                                    <p className="font-bold">Sukces!</p>
                                    <p>{message}</p>
                                </div>
                            </div>
                        )}
                        {status === 'error' && (
                             <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg">
                                <div>
                                    <p className="font-bold">Błąd!</p>
                                    <p>{message}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSettingsPage;
