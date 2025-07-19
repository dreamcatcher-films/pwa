import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, TicketIcon, PlusCircleIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';

interface DiscountCode {
    id: number;
    code: string;
    type: 'percentage' | 'fixed';
    value: string;
    usage_limit: number | null;
    times_used: number;
    expires_at: string | null;
    created_at: string;
}

const AdminDiscountsPage: FC = () => {
    const [codes, setCodes] = useState<DiscountCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [newCode, setNewCode] = useState({
        code: '',
        type: 'percentage' as 'percentage' | 'fixed',
        value: '',
        usage_limit: '',
        expires_at: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle'|'success'>('idle');

    const token = localStorage.getItem('adminAuthToken');

    const fetchCodes = async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/discounts', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd pobierania kodów.');
            }
            const data = await response.json();
            setCodes(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCodes();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setNewCode(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAddCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        try {
            const body = {
                ...newCode,
                value: parseFloat(newCode.value) || 0,
                usage_limit: newCode.usage_limit ? parseInt(newCode.usage_limit, 10) : null,
                expires_at: newCode.expires_at ? new Date(newCode.expires_at).toISOString() : null,
            };
            const response = await fetch('/api/admin/discounts', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Błąd tworzenia kodu.');

            setCodes(prev => [data, ...prev]);
            setNewCode({ code: '', type: 'percentage', value: '', usage_limit: '', expires_at: '' });
            setSubmitStatus('success');
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteCode = async (codeId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten kod rabatowy?')) return;
        setError('');
        try {
            const response = await fetch(`/api/admin/discounts/${codeId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd usuwania kodu.');
            }
            setCodes(prev => prev.filter(code => code.id !== codeId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const formatDate = (dateString: string | null) => dateString ? new Date(dateString).toLocaleDateString('pl-PL') : 'Bez limitu';
    const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Aktywne Kody Rabatowe</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500">
                             <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Kod</th>
                                    <th scope="col" className="px-6 py-3">Rabat</th>
                                    <th scope="col" className="px-6 py-3">Wykorzystanie</th>
                                    <th scope="col" className="px-6 py-3">Wygasa</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                             <tbody>
                                {codes.map(code => (
                                    <tr key={code.id} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-6 py-4 font-mono text-indigo-600 font-bold">{code.code}</td>
                                        <td className="px-6 py-4 text-slate-800 font-medium">{code.type === 'percentage' ? `${code.value}%` : formatCurrency(Number(code.value))}</td>
                                        <td className="px-6 py-4">{code.times_used} / {code.usage_limit || '∞'}</td>
                                        <td className="px-6 py-4">{formatDate(code.expires_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDeleteCode(code.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń kod">
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                     {codes.length === 0 && <p className="text-center p-8 text-slate-500">Brak aktywnych kodów rabatowych.</p>}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Utwórz Nowy Kod</h2>
                 <form onSubmit={handleAddCode} className="bg-white rounded-2xl shadow p-6 space-y-4">
                     <div>
                        <label htmlFor="code" className="block text-sm font-medium text-slate-700">Kod</label>
                        <input name="code" type="text" value={newCode.code} onChange={handleInputChange} required className={inputClasses} placeholder="LATO2024" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="type" className="block text-sm font-medium text-slate-700">Typ</label>
                            <select name="type" value={newCode.type} onChange={handleInputChange} className={inputClasses}>
                                <option value="percentage">Procentowy (%)</option>
                                <option value="fixed">Kwotowy (PLN)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="value" className="block text-sm font-medium text-slate-700">Wartość</label>
                            <input name="value" type="number" step="0.01" value={newCode.value} onChange={handleInputChange} required className={inputClasses} placeholder="np. 10 lub 100" />
                        </div>
                    </div>
                     <div>
                        <label htmlFor="usage_limit" className="block text-sm font-medium text-slate-700">Limit użyć (opcjonalnie)</label>
                        <input name="usage_limit" type="number" value={newCode.usage_limit} onChange={handleInputChange} className={inputClasses} placeholder="np. 100" />
                    </div>
                    <div>
                        <label htmlFor="expires_at" className="block text-sm font-medium text-slate-700">Data wygaśnięcia (opcjonalnie)</label>
                        <input name="expires_at" type="date" value={newCode.expires_at} onChange={handleInputChange} className={inputClasses} />
                    </div>
                    
                    <button type="submit" disabled={isSubmitting} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <PlusCircleIcon className="w-5 h-5" />}
                        <span>Utwórz kod</span>
                    </button>
                    {submitStatus === 'success' && <p className="flex items-center gap-2 text-sm text-green-600"><CheckCircleIcon className="w-5 h-5"/> Kod został pomyślnie utworzony!</p>}
                 </form>
            </div>
        </div>
    );
};

export default AdminDiscountsPage;
