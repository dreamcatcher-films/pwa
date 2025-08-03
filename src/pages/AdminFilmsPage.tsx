
import React, { FC, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { getAdminFilms, createFilm, updateFilm, deleteFilm, reorderFilms } from '../api.ts';
import { LoadingSpinner, FilmIcon, PlusCircleIcon, TrashIcon, PencilSquareIcon, ArrowUpIcon, ArrowDownIcon, XMarkIcon } from '../components/Icons.tsx';

interface Film {
    id: number;
    youtube_url: string;
    title: string;
    description: string;
    thumbnail_url: string;
    sort_order: number;
}

type FormValues = {
    youtube_url: string;
    title: string;
    description: string;
};

const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

const FilmEditorModal: FC<{ film: Partial<Film> | null; onClose: () => void; }> = ({ film, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
        defaultValues: {
            youtube_url: film?.youtube_url || '',
            title: film?.title || '',
            description: film?.description || '',
        }
    });

    const createMutation = useMutation({
        mutationFn: createFilm,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminFilms'] });
            onClose();
        }
    });

    const updateMutation = useMutation({
        mutationFn: (data: FormValues) => updateFilm({ id: film!.id!, data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminFilms'] });
            onClose();
        }
    });

    const mutation = film?.id ? updateMutation : createMutation;

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        mutation.mutate(data);
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full relative animate-modal-in" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <XMarkIcon className="w-6 h-6"/>
                </button>
                 <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">{film?.id ? 'Edytuj Film' : 'Dodaj Nowy Film'}</h3>
                    {mutation.isError && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm">{mutation.error.message}</p>}
                    
                    <div>
                        <label htmlFor="youtube_url" className="block text-sm font-medium text-slate-700">Link do YouTube</label>
                        <input id="youtube_url" {...register('youtube_url', { required: 'Link jest wymagany.' })} className={inputClasses} placeholder="https://www.youtube.com/watch?v=..." />
                        {errors.youtube_url && <p className="text-red-500 text-xs mt-1">{errors.youtube_url.message}</p>}
                    </div>
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700">Tytuł</label>
                        <input id="title" {...register('title', { required: 'Tytuł jest wymagany.' })} className={inputClasses} placeholder="np. Ania i Piotr - Teledysk ślubny" />
                        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700">Krótki opis</label>
                        <textarea id="description" {...register('description')} className={inputClasses} rows={3} placeholder="Opis filmu..."></textarea>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={onClose} disabled={mutation.isPending} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                        <button type="submit" disabled={mutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                            {mutation.isPending ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AdminFilmsPage: FC = () => {
    const [editingFilm, setEditingFilm] = useState<Partial<Film> | null>(null);
    const queryClient = useQueryClient();

    const { data: films, isLoading, error } = useQuery<Film[], Error>({
        queryKey: ['adminFilms'],
        queryFn: getAdminFilms
    });

    const deleteMutation = useMutation({
        mutationFn: deleteFilm,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminFilms'] }),
    });

    const reorderMutation = useMutation({
        mutationFn: reorderFilms,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminFilms'] }),
    });

    const handleDelete = (id: number) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten film?')) {
            deleteMutation.mutate(id);
        }
    };
    
    const handleReorder = (filmId: number, direction: 'up' | 'down') => {
        if (!films) return;
        const currentIndex = films.findIndex(f => f.id === filmId);
        if ((direction === 'up' && currentIndex === 0) || (direction === 'down' && currentIndex === films.length - 1)) {
            return;
        }

        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const newFilms = [...films];
        const [movedFilm] = newFilms.splice(currentIndex, 1);
        newFilms.splice(newIndex, 0, movedFilm);
        
        const orderedIds = newFilms.map(f => f.id);
        reorderMutation.mutate(orderedIds);
    };

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center">{error.message}</p>;

    return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FilmIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie Filmami</h2>
                <button onClick={() => setEditingFilm({})} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Film
                </button>
            </div>
            
            {(deleteMutation.isError || reorderMutation.isError) && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm mb-4">Wystąpił błąd. Spróbuj ponownie.</p>}

            <ul className="space-y-3">
                {films && films.map((film, index) => (
                    <li key={film.id} className="flex items-center gap-4 p-2 rounded-lg bg-slate-50">
                        <img src={film.thumbnail_url} alt={film.title} className="w-32 h-20 object-cover rounded-md" />
                        <div className="flex-grow">
                            <p className="font-bold text-slate-800">{film.title}</p>
                            <p className="text-sm text-slate-500">{film.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => handleReorder(film.id, 'up')} disabled={index === 0 || reorderMutation.isPending} className="p-1 disabled:opacity-30"><ArrowUpIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleReorder(film.id, 'down')} disabled={index === films.length - 1 || reorderMutation.isPending} className="p-1 disabled:opacity-30"><ArrowDownIcon className="w-5 h-5"/></button>
                            <button onClick={() => setEditingFilm(film)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDelete(film.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </li>
                ))}
                {films && films.length === 0 && <p className="text-center text-slate-400 py-4">Brak filmów. Dodaj nowy, aby go tu wyświetlić.</p>}
            </ul>
            {editingFilm && <FilmEditorModal film={editingFilm} onClose={() => setEditingFilm(null)} />}
        </div>
    );
};

export default AdminFilmsPage;
