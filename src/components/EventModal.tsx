import React, { useState, useEffect, FC } from 'react';
import { XMarkIcon, LoadingSpinner, TrashIcon } from './Icons.tsx';

interface CalendarEvent {
    id?: number | string;
    title: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    description?: string;
}

interface EventModalProps {
    event: Partial<CalendarEvent> | null;
    onClose: () => void;
    onSave: () => void;
}

const EventModal: FC<EventModalProps> = ({ event, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        start_time: '',
        end_time: '',
        is_all_day: false,
        description: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (event) {
            const formatDateTimeLocal = (date: Date) => {
                const pad = (num: number) => num.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
            };
            setFormData({
                title: event.title || '',
                start_time: event.start ? formatDateTimeLocal(event.start) : '',
                end_time: event.end ? formatDateTimeLocal(event.end) : '',
                is_all_day: event.allDay || false,
                description: event.description || '',
            });
        }
    }, [event]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const target = e.target;
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
            setFormData(prev => ({ ...prev, [target.name]: target.checked }));
        } else {
            setFormData(prev => ({ ...prev, [target.name]: target.value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;
        const endpoint = event && event.id ? `${apiUrl}/api/admin/availability/${event.id}` : `${apiUrl}/api/admin/availability`;
        const method = event && event.id ? 'PATCH' : 'POST';

        const body = {
            ...formData,
            start_time: new Date(formData.start_time).toISOString(),
            end_time: new Date(formData.end_time).toISOString(),
        };

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Nie udało się zapisać wydarzenia.');
            onSave();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!event || !event.id || !window.confirm('Czy na pewno chcesz usunąć to wydarzenie?')) return;
        
        setIsLoading(true);
        setError('');

        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;
        
        try {
             const response = await fetch(`${apiUrl}/api/admin/availability/${event.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Nie udało się usunąć wydarzenia.');
            onSave();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClasses = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

    return (
         <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full relative transform transition-all duration-300 scale-95 animate-modal-in">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Zamknij okno">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-bold text-slate-900 mb-6">{event && event.id ? 'Edytuj wydarzenie' : 'Dodaj nowe wydarzenie'}</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}
                    
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700">Tytuł</label>
                        <input type="text" name="title" id="title" value={formData.title} onChange={handleChange} required className={inputClasses} placeholder="np. Spotkanie z klientem" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="start_time" className="block text-sm font-medium text-slate-700">Początek</label>
                            <input type="datetime-local" name="start_time" id="start_time" value={formData.start_time} onChange={handleChange} required className={inputClasses} />
                        </div>
                         <div>
                            <label htmlFor="end_time" className="block text-sm font-medium text-slate-700">Koniec</label>
                            <input type="datetime-local" name="end_time" id="end_time" value={formData.end_time} onChange={handleChange} required className={inputClasses} />
                        </div>
                    </div>
                    
                    <div className="flex items-center">
                        <input type="checkbox" name="is_all_day" id="is_all_day" checked={formData.is_all_day} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        <label htmlFor="is_all_day" className="ml-2 block text-sm text-slate-900">Wydarzenie całodniowe</label>
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700">Opis (opcjonalnie)</label>
                        <textarea name="description" id="description" value={formData.description} onChange={handleChange} rows={3} className={inputClasses} placeholder="Ważne szczegóły..."></textarea>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t">
                        <div>
                            {event && event.id && (
                                <button type="button" onClick={handleDelete} disabled={isLoading} className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 transition">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} disabled={isLoading} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-200 transition">Anuluj</button>
                            <button type="submit" disabled={isLoading} className="bg-indigo-600 w-28 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition flex justify-center items-center">
                                {isLoading ? <LoadingSpinner className="w-5 h-5" /> : 'Zapisz'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EventModal;
