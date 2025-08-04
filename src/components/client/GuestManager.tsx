
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, PlusCircleIcon, PencilSquareIcon, TrashIcon, XMarkIcon, CheckCircleIcon, EnvelopeIcon } from '../Icons.tsx';
import { InputField } from '../FormControls.tsx';
import { sendGuestInvites } from '../../api.ts';

// --- TYPES ---
interface Guest {
    id: number;
    name: string;
    email: string | null;
    group_name: string | null;
    rsvp_status: 'pending' | 'confirmed' | 'declined';
}

type GuestFormValues = {
    name: string;
    email: string;
    group_name: string;
};

// --- API (move to api.ts if this grows) ---
const getClientToken = () => localStorage.getItem('authToken');

const fetchGuests = async (): Promise<Guest[]> => {
    const res = await fetch('/api/my-booking/guests', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
    if (!res.ok) throw new Error('Nie udało się pobrać listy gości.');
    return res.json();
};

const addGuest = async (data: GuestFormValues): Promise<Guest> => {
    const res = await fetch('/api/my-booking/guests', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getClientToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Nie udało się dodać gościa.');
    return res.json();
};

const updateGuest = async ({ id, ...data }: Partial<Guest>): Promise<Guest> => {
    const res = await fetch(`/api/my-booking/guests/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getClientToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Nie udało się zaktualizować gościa.');
    return res.json();
};

const deleteGuest = async (id: number): Promise<void> => {
    const res = await fetch(`/api/my-booking/guests/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getClientToken()}` },
    });
    if (!res.ok) throw new Error('Nie udało się usunąć gościa.');
};


// --- COMPONENTS ---

const GuestEditorModal: React.FC<{ guest?: Guest; onClose: () => void }> = ({ guest, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit, formState: { errors } } = useForm<GuestFormValues>({
        defaultValues: guest || { name: '', email: '', group_name: '' },
    });

    const mutation = useMutation({
        mutationFn: (data: GuestFormValues) => guest?.id ? updateGuest({ id: guest.id, ...data }) : addGuest(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['guests'] });
            onClose();
        },
    });

    const onSubmit: SubmitHandler<GuestFormValues> = data => mutation.mutate(data);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md relative animate-modal-in">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><XMarkIcon /></button>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">{guest?.id ? 'Edytuj Gościa' : 'Dodaj Gościa'}</h3>
                    {mutation.isError && <p className="text-red-500 text-sm">{mutation.error.message}</p>}
                    <InputField id="name" label="Imię i nazwisko" register={register('name', { required: 'To pole jest wymagane' })} error={errors.name} />
                    <InputField id="email" label="Adres e-mail (opcjonalnie)" type="email" register={register('email')} error={errors.email} />
                    <InputField id="group_name" label="Grupa/Rodzina (opcjonalnie)" register={register('group_name')} error={errors.group_name} placeholder="np. Rodzina Kowalskich"/>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={onClose} disabled={mutation.isPending} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                        <button type="submit" disabled={mutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg w-28 flex justify-center">
                            {mutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zapisz'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: number, color: string }> = ({ title, value, color }) => (
    <div className={`p-4 rounded-lg border-l-4 ${color}`}>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-bold text-slate-800">{value}</p>
    </div>
);


const GuestManager: React.FC = () => {
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const queryClient = useQueryClient();

    const { data: guests, isLoading, error } = useQuery<Guest[], Error>({ queryKey: ['guests'], queryFn: fetchGuests });

    const sendInvitesMutation = useMutation< { message: string }, Error, void >({
        mutationFn: sendGuestInvites,
        onSuccess: (data) => {
            setFeedbackMessage({ type: 'success', text: data.message });
            setTimeout(() => setFeedbackMessage(null), 5000);
        },
        onError: (error) => {
            setFeedbackMessage({ type: 'error', text: error.message });
            setTimeout(() => setFeedbackMessage(null), 5000);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteGuest,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guests'] }),
    });

    const handleEdit = (guest: Guest) => {
        setEditingGuest(guest);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingGuest(null);
        setIsModalOpen(true);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('Czy na pewno chcesz usunąć tego gościa?')) {
            deleteMutation.mutate(id);
        }
    };

    const statusMap: Record<Guest['rsvp_status'], { text: string; color: string }> = {
        pending: { text: 'Oczekuje', color: 'bg-slate-200 text-slate-700' },
        confirmed: { text: 'Potwierdzono', color: 'bg-green-100 text-green-700' },
        declined: { text: 'Odrzucono', color: 'bg-red-100 text-red-700' },
    };
    
    const stats = guests ? {
        confirmed: guests.filter(g => g.rsvp_status === 'confirmed').length,
        declined: guests.filter(g => g.rsvp_status === 'declined').length,
        pending: guests.filter(g => g.rsvp_status === 'pending').length,
        total: guests.length
    } : { confirmed: 0, declined: 0, pending: 0, total: 0 };

    const hasPendingGuests = guests ? guests.some(g => g.rsvp_status === 'pending') : false;

    if (isLoading) return <div className="flex justify-center py-10"><EngagementRingSpinner /></div>;
    if (error) return <p className="text-red-500 text-center">{error.message}</p>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Potwierdzeni" value={stats.confirmed} color="border-green-500 bg-green-50" />
                <StatCard title="Oczekujący" value={stats.pending} color="border-slate-500 bg-slate-100" />
                <StatCard title="Odrzucili" value={stats.declined} color="border-red-500 bg-red-50" />
                <StatCard title="Wszyscy" value={stats.total} color="border-indigo-500 bg-indigo-50" />
            </div>

            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Lista Gości</h3>
                <div className="flex gap-4">
                    <button 
                        onClick={() => sendInvitesMutation.mutate()}
                        disabled={!hasPendingGuests || sendInvitesMutation.isPending}
                        className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
                    >
                        {sendInvitesMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : <EnvelopeIcon className="w-5 h-5"/>}
                        Wyślij zaproszenia
                    </button>
                    <button onClick={handleAdd} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                        <PlusCircleIcon className="w-5 h-5"/> Dodaj Gościa
                    </button>
                </div>
            </div>

            {feedbackMessage && (
                <div className={`p-3 rounded-lg text-sm ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedbackMessage.text}
                </div>
            )}

            <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left">Imię i nazwisko</th>
                                <th className="px-6 py-3 text-left">E-mail / Grupa</th>
                                <th className="px-6 py-3 text-center">Status RSVP</th>
                                <th className="px-6 py-3 text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {guests?.map(guest => (
                                <tr key={guest.id} className="border-b hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium text-slate-900">{guest.name}</td>
                                    <td className="px-6 py-4 text-slate-600">{guest.email || <span className="italic text-slate-400">{guest.group_name || 'Brak danych'}</span>}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusMap[guest.rsvp_status].color}`}>
                                            {statusMap[guest.rsvp_status].text}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleEdit(guest)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDelete(guest.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {guests?.length === 0 && <p className="text-center text-slate-500 py-8">Brak gości na liście. Zacznij dodawać!</p>}
                </div>
            </div>

            {isModalOpen && <GuestEditorModal guest={editingGuest || undefined} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

export default GuestManager;
