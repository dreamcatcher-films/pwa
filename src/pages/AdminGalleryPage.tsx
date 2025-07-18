import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, PhotoIcon } from '../components/Icons';

interface GalleryItem {
    id: number;
    title: string;
    description: string;
    image_url: string;
    created_at: string;
}

const AdminGalleryPage: FC = () => {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');

    const fetchItems = async () => {
        setIsLoading(true);
        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;
        try {
            const response = await fetch(`${apiUrl}/api/admin/galleries`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Błąd pobierania elementów galerii.');
            setItems(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
        }
    };
    
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title) {
            setError('Tytuł i plik obrazu są wymagane.');
            return;
        }
        
        setIsSubmitting(true);
        setError('');
        
        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;

        try {
            const uploadResponse = await fetch(`${apiUrl}/api/admin/galleries/upload?filename=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': file.type,
                },
                body: file,
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.message || 'Błąd wysyłania pliku.');
            }
            const newBlob = await uploadResponse.json();

            const response = await fetch(`${apiUrl}/api/admin/galleries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, description, image_url: newBlob.url }),
            });

            const newItem = await response.json();
            if (!response.ok) throw new Error(newItem.message || 'Błąd zapisu elementu galerii.');
            
            setItems(prev => [newItem, ...prev]);
            setTitle('');
            setDescription('');
            setFile(null);
            if(document.getElementById('imageFile')) {
                (document.getElementById('imageFile') as HTMLInputElement).value = "";
            }
            setSubmitStatus('success');
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch (err) {
             setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (itemId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten element galerii? Tej operacji nie można cofnąć.')) return;
        
        setError('');
        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;
        
        try {
            const response = await fetch(`${apiUrl}/api/admin/galleries/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Błąd usuwania elementu.');
            setItems(prev => prev.filter(item => item.id !== itemId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL');

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Elementy w Galerii</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                     {items.length === 0 ? (
                        <p className="text-center p-8 text-slate-500">Brak elementów w galerii.</p>
                     ) : (
                        <ul className="divide-y divide-slate-200">
                             {items.map(item => (
                                <li key={item.id} className="p-4 flex items-center space-x-4 hover:bg-slate-50">
                                    <img src={item.image_url} alt={item.title} className="w-24 h-16 object-cover rounded-md bg-slate-100" />
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-800">{item.title}</p>
                                        <p className="text-sm text-slate-500 truncate">{item.description}</p>
                                        <p className="text-xs text-slate-400">Dodano: {formatDate(item.created_at)}</p>
                                    </div>
                                    <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń element">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </li>
                             ))}
                        </ul>
                     )}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Dodaj Nowe Zdjęcie</h2>
                 <form onSubmit={handleAdd} className="bg-white rounded-2xl shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700">Tytuł</label>
                        <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} required className="mt-1 block w-full input" placeholder="np. Ślub Ani i Piotra" />
                    </div>
                     <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700">Krótki opis</label>
                        <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 block w-full input" placeholder="np. Plener w górach"></textarea>
                    </div>
                     <div>
                        <label htmlFor="imageFile" className="block text-sm font-medium text-slate-700">Plik obrazu</label>
                        <input type="file" id="imageFile" onChange={handleFileChange} required accept="image/png, image/jpeg, image/gif" className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                    </div>
                    
                    <button type="submit" disabled={isSubmitting || !file || !title} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <PhotoIcon className="w-5 h-5" />}
                        <span>{isSubmitting ? 'Wysyłanie...' : 'Dodaj do galerii'}</span>
                    </button>
                    {submitStatus === 'success' && <p className="flex items-center gap-2 text-sm text-green-600"><CheckCircleIcon className="w-5 h-5"/> Dodano pomyślnie!</p>}
                 </form>
            </div>
        </div>
    );
};

export default AdminGalleryPage;
