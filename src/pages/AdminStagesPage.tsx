import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, PlusCircleIcon, TrashIcon } from '../components/Icons.tsx';

interface Stage {
    id: number;
    name: string;
    description: string | null;
}

const AdminStagesPage: FC = () => {
    const [stages, setStages] = useState<Stage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const token = localStorage.getItem('adminAuthToken');

    const fetchStages = async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/stages', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd pobierania etapów.');
            }
            const data = await response.json();
            setStages(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStages();
    }, []);

    const handleAddStage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName) return;
        setIsSubmitting(true);
        setError('');
        try {
            const response = await fetch('/api/admin/stages', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, description: newDescription }),
            });
            if (!response.ok) throw new Error(await response.text() || 'Błąd tworzenia etapu.');
            const newStage = await response.json();
            setStages(prev => [...prev, newStage]);
            setNewName('');
            setNewDescription('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteStage = async (stageId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten szablon etapu? Usunięcie go nie wpłynie na projekty, do których jest już przypisany.')) return;
        setError('');
        try {
            const response = await fetch(`/api/admin/stages/${stageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd usuwania etapu.');
            }
            setStages(prev => prev.filter(s => s.id !== stageId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Szablony Etapów Produkcji</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                    {stages.length === 0 ? (
                        <p className="text-center p-8 text-slate-500">Brak zdefiniowanych szablonów etapów.</p>
                    ) : (
                        <ul className="divide-y divide-slate-200">
                             {stages.map(stage => (
                                <li key={stage.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                    <div>
                                        <p className="font-bold text-slate-800">{stage.name}</p>
                                        <p className="text-sm text-slate-500">{stage.description}</p>
                                    </div>
                                    <button onClick={() => handleDeleteStage(stage.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń etap">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </li>
                             ))}
                        </ul>
                     )}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Dodaj Nowy Szablon</h2>
                 <form onSubmit={handleAddStage} className="bg-white rounded-2xl shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="newName" className="block text-sm font-medium text-slate-700">Nazwa etapu</label>
                        <input type="text" id="newName" value={newName} onChange={e => setNewName(e.target.value)} required className={inputClasses} placeholder="np. Selekcja materiału" />
                    </div>
                     <div>
                        <label htmlFor="newDescription" className="block text-sm font-medium text-slate-700">Krótki opis (dla klienta)</label>
                        <textarea id="newDescription" value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3} className={inputClasses} placeholder="np. Wybieramy najlepsze ujęcia..."></textarea>
                    </div>
                    
                    <button type="submit" disabled={isSubmitting || !newName} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <PlusCircleIcon className="w-5 h-5" />}
                        <span>{isSubmitting ? 'Dodawanie...' : 'Dodaj szablon'}</span>
                    </button>
                 </form>
            </div>
        </div>
    );
};

export default AdminStagesPage;
