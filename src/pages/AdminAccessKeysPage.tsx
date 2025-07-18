import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, KeyIcon } from '../components/Icons.tsx';

const AdminAccessKeysPage: FC = () => {
    const [keys, setKeys] = useState<AccessKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newClientName, setNewClientName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle'|'success'>('idle');

    interface AccessKey {
        id: number;
        key: string;
        client_name: string;
        created_at: string;
    }

    const fetchKeys = async () => {
        setIsLoading(true);
        const token = localStorage.getItem('adminAuthToken');
        try {
            const response = await fetch('/api/admin/access-keys', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd pobierania kluczy.');
            }
            const data = await response.json();
            setKeys(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);
    
    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName) return;
        setIsSubmitting(true);
        setError('');
        const token = localStorage.getItem('adminAuthToken');

        try {
            const response = await fetch('/api/admin/access-keys', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: newClientName }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd tworzenia klucza.');
            }
            const newKey = await response.json();
            setKeys(prev => [newKey, ...prev]);
            setNewClientName('');
            setSubmitStatus('success');
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteKey = async (keyId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten klucz? Tej operacji nie można cofnąć.')) return;
        
        setError('');
        const token = localStorage.getItem('adminAuthToken');
        
        try {
            const response = await fetch(`/api/admin/access-keys/${keyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd usuwania klucza.');
            }
            setKeys(prev => prev.filter(key => key.id !== keyId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL');

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Aktywne Klucze Dostępu</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500">
                             <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Klucz</th>
                                    <th scope="col" className="px-6 py-3">Przypisany do Klienta</th>
                                    <th scope="col" className="px-6 py-3">Data Utworzenia</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                             <tbody>
                                {keys.map(key => (
                                    <tr key={key.id} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-6 py-4 font-mono text-indigo-600 font-bold">{key.key}</td>
                                        <td className="px-6 py-4 text-slate-800 font-medium">{key.client_name}</td>
                                        <td className="px-6 py-4">{formatDate(key.created_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDeleteKey(key.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń klucz">
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                     {keys.length === 0 && <p className="text-center p-8 text-slate-500">Brak aktywnych kluczy dostępu.</p>}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Wygeneruj Nowy Klucz</h2>
                 <form onSubmit={handleAddKey} className="bg-white rounded-2xl shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="clientName" className="block text-sm font-medium text-slate-700">Nazwa klienta</label>
                        <input
                            type="text"
                            id="clientName"
                            value={newClientName}
                            onChange={e => setNewClientName(e.target.value)}
                            placeholder="np. Anna i Piotr"
                            required
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <button type="submit" disabled={isSubmitting || !newClientName} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <KeyIcon className="w-5 h-5" />}
                        <span>Wygeneruj</span>
                    </button>
                    {submitStatus === 'success' && <p className="flex items-center gap-2 text-sm text-green-600"><CheckCircleIcon className="w-5 h-5"/> Klucz został pomyślnie utworzony!</p>}
                 </form>
            </div>
        </div>
    );
};

export default AdminAccessKeysPage;
