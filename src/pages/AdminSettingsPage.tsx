
import React, { useState, useEffect } from 'react';
import { LoadingSpinner, CheckCircleIcon, CircleStackIcon, EnvelopeIcon } from '../components/Icons';

const AdminSettingsPage: React.FC = () => {
    const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [dbMessage, setDbMessage] = useState('');

    const [notificationEmail, setNotificationEmail] = useState('');
    const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [emailMessage, setEmailMessage] = useState('');
    
    const token = localStorage.getItem('adminAuthToken');
    
    useEffect(() => {
        const fetchSettings = async () => {
            if (!token) return;
            try {
                const response = await fetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) throw new Error('Nie udało się pobrać ustawień.');
                const data = await response.json();
                setNotificationEmail(data.email || '');
            } catch (err) {
                setEmailStatus('error');
                setEmailMessage(err instanceof Error ? err.message : 'Błąd ładowania e-maila.');
            }
        };
        fetchSettings();
    }, [token]);

    const handleInitializeDb = async () => {
        if (!window.confirm('Czy na pewno chcesz zainicjować schemat bazy danych? Ta operacja utworzy/zaktualizuje wszystkie niezbędne tabele. Jest to bezpieczne do uruchomienia, nawet jeśli tabele już istnieją.')) {
            return;
        }

        setDbStatus('loading');
        setDbMessage('');

        try {
            const response = await fetch('/api/admin/setup-database', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Wystąpił nieznany błąd.');
            }

            setDbStatus('success');
            setDbMessage(data.message);
        } catch (err) {
            setDbStatus('error');
            setDbMessage(err instanceof Error ? err.message : 'Nie udało się zainicjować bazy danych.');
        }
    };
    
    const handleSaveEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailStatus('loading');
        setEmailMessage('');
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: notificationEmail }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Nie udało się zapisać adresu e-mail.');

            setEmailStatus('success');
            setEmailMessage('Adres e-mail do powiadomień został pomyślnie zaktualizowany.');
            setTimeout(() => setEmailStatus('idle'), 3000);
        } catch (err) {
            setEmailStatus('error');
            setEmailMessage(err instanceof Error ? err.message : 'Błąd zapisu.');
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Ustawienia Systemowe</h2>
            <div className="space-y-8 max-w-2xl">
                 <div className="bg-white rounded-2xl shadow p-6">
                    <h3 className="text-lg font-semibold text-slate-900">Ustawienia Powiadomień</h3>
                    <p className="mt-1 text-sm text-slate-600">
                        Wprowadź adres e-mail, na który mają być wysyłane powiadomienia systemowe (np. o nowej wiadomości od klienta).
                    </p>
                    <form onSubmit={handleSaveEmail} className="mt-6">
                        <label htmlFor="notificationEmail" className="block text-sm font-medium text-slate-700">Adres e-mail do powiadomień</label>
                        <div className="relative mt-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <EnvelopeIcon className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="email"
                                id="notificationEmail"
                                value={notificationEmail}
                                onChange={(e) => setNotificationEmail(e.target.value)}
                                required
                                className="block w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                         <div className="mt-4 flex items-center justify-between">
                             <button
                                type="submit"
                                disabled={emailStatus === 'loading'}
                                className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition w-28"
                            >
                                {emailStatus === 'loading' ? <LoadingSpinner className="w-5 h-5" /> : 'Zapisz'}
                            </button>
                            
                             {emailMessage && (
                                <div className="text-sm">
                                    {emailStatus === 'success' && <p className="flex items-center gap-2 text-green-600"><CheckCircleIcon className="w-5 h-5"/> {emailMessage}</p>}
                                    {emailStatus === 'error' && <p className="text-red-600">{emailMessage}</p>}
                                </div>
                            )}
                         </div>
                    </form>
                </div>
                
                <div className="bg-white rounded-2xl shadow p-6">
                    <h3 className="text-lg font-semibold text-slate-900">Zarządzanie Bazą Danych</h3>
                    <p className="mt-1 text-sm text-slate-600">
                        Jeśli aplikacja nie działa poprawnie lub widzisz błędy, możesz ręcznie uruchomić proces inicjalizacji i migracji schematu bazy danych.
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={handleInitializeDb}
                            disabled={dbStatus === 'loading'}
                            className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition w-full sm:w-auto"
                        >
                            {dbStatus === 'loading' ? (
                                <LoadingSpinner className="w-5 h-5" />
                            ) : (
                                <CircleStackIcon className="w-5 h-5" />
                            )}
                            <span>{dbStatus === 'loading' ? 'Inicjalizowanie...' : 'Inicjalizuj Schemat Bazy Danych'}</span>
                        </button>
                    </div>
                    {dbMessage && (
                        <div className="mt-4 p-3 rounded-lg text-sm" role="alert">
                            {dbStatus === 'success' && (
                                <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
                                    <CheckCircleIcon className="w-5 h-5" />
                                    <div>
                                        <p className="font-bold">Sukces!</p>
                                        <p>{dbMessage}</p>
                                    </div>
                                </div>
                            )}
                            {dbStatus === 'error' && (
                                 <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg">
                                    <div>
                                        <p className="font-bold">Błąd!</p>
                                        <p>{dbMessage}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSettingsPage;
