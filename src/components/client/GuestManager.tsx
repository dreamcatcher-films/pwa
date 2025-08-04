
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, PlusCircleIcon, PencilSquareIcon, TrashIcon, XMarkIcon, CheckCircleIcon, EnvelopeIcon, PhotoIcon, InformationCircleIcon } from '../Icons.tsx';
import { getGuestGroups, addGuestGroup, deleteGuestGroup, getInviteSettings, updateInviteSettings, uploadInviteImage } from '../../api.ts';

// --- TYPES ---
interface CompanionStatus {
    attending: boolean;
    is_child: boolean;
}
interface Guest {
    id: number;
    name: string;
    email: string | null;
    group_id: number | null;
    group_name: string | null;
    notes: string | null;
    rsvp_status: 'pending' | 'confirmed' | 'declined' | 'tentative';
    allowed_companions: number;
    companion_status: CompanionStatus[] | null;
}
interface GuestGroup {
    id: number;
    name: string;
}
interface InviteSettings {
    invite_message: string;
    invite_image_url: string;
}
type GuestFormValues = {
    name: string;
    email: string;
    group_id: string;
    allowed_companions: number;
    rsvp_status: Guest['rsvp_status'];
};

// --- API ---
const getClientToken = () => localStorage.getItem('authToken');

const fetchGuests = async (): Promise<Guest[]> => {
    const res = await fetch('/api/my-booking/guests', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
    if (!res.ok) throw new Error('Nie udało się pobrać listy gości.');
    return res.json();
};
const addGuest = async (data: Omit<GuestFormValues, 'rsvp_status' | 'group_id'> & { group_id: number | null }): Promise<Guest> => {
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
        body: JSON.stringify({ ...data, group_id: data.group_id || null }),
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
const sendGuestInvites = async (): Promise<{ message: string }> => {
    const res = await fetch('/api/my-booking/guests/send-invites', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getClientToken()}` },
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Nie udało się wysłać zaproszeń.');
    }
    return res.json();
};


// --- COMPONENTS ---

const GuestEditorModal: React.FC<{ guest?: Guest; groups: GuestGroup[]; onClose: () => void }> = ({ guest, groups, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit, watch } = useForm<GuestFormValues>({
        defaultValues: {
            name: guest?.name || '',
            email: guest?.email || '',
            group_id: guest?.group_id?.toString() || '',
            allowed_companions: guest?.allowed_companions || 0,
            rsvp_status: guest?.rsvp_status || 'pending',
        },
    });

    const allowedCompanions = watch('allowed_companions');
    const [companions, setCompanions] = useState<CompanionStatus[]>([]);

    useEffect(() => {
        const initialCompanions = Array.from({ length: guest?.allowed_companions || 0 }, (_, i) => {
            return guest?.companion_status?.[i] || { attending: false, is_child: false };
        });
        setCompanions(initialCompanions);
    }, [guest]);

    const mutation = useMutation({
        mutationFn: (data: GuestFormValues & { companion_status: CompanionStatus[] }) => {
            const payload = {
                ...data,
                group_id: data.group_id ? parseInt(data.group_id, 10) : null,
                companion_status: data.companion_status,
            };
            return guest?.id ? updateGuest({ id: guest.id, ...payload }) : addGuest(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['guests'] });
            onClose();
        },
    });
    
    const handleCompanionChange = (index: number, field: 'attending' | 'is_child', value: boolean) => {
        const newCompanions = [...companions];
        newCompanions[index] = { ...newCompanions[index], [field]: value };
        if (field === 'attending' && !value) {
            newCompanions[index].is_child = false;
        }
        setCompanions(newCompanions);
    };

    const onSubmit: SubmitHandler<GuestFormValues> = data => {
        const finalCompanions = Array.from({ length: data.allowed_companions }, (_, i) => companions[i] || { attending: false, is_child: false });
        mutation.mutate({ ...data, companion_status: finalCompanions });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative animate-modal-in">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><XMarkIcon /></button>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">{guest?.id ? 'Edytuj Gościa' : 'Dodaj Gościa'}</h3>
                    {mutation.isError && <p className="text-red-500 text-sm">{mutation.error.message}</p>}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label htmlFor="name" className="block text-sm font-medium text-slate-700">Imię i nazwisko</label>
                            <input id="name" {...register('name', { required: true })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" />
                        </div>
                        <div className="col-span-2">
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700">Adres e-mail</label>
                            <input id="email" type="email" {...register('email')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" />
                        </div>
                        <div>
                            <label htmlFor="group_id" className="block text-sm font-medium text-slate-700">Grupa/Rodzina</label>
                            <select id="group_id" {...register('group_id')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                                <option value="">-- Brak grupy --</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="allowed_companions" className="block text-sm font-medium text-slate-700">Os. towarzyszące</label>
                            <input id="allowed_companions" type="number" min="0" {...register('allowed_companions')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" />
                        </div>
                    </div>
                    {guest?.id && (
                        <div className="pt-4 border-t">
                            <h4 className="text-md font-semibold text-slate-800 mb-2">Edytuj odpowiedź gościa</h4>
                            <div>
                                <label htmlFor="rsvp_status" className="block text-sm font-medium text-slate-700">Status RSVP</label>
                                <select id="rsvp_status" {...register('rsvp_status')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                                    <option value="pending">Oczekuje</option>
                                    <option value="confirmed">Potwierdzono</option>
                                    <option value="declined">Odrzucono</option>
                                    <option value="tentative">Jeszcze nie wiem</option>
                                </select>
                            </div>
                            {allowedCompanions > 0 && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-slate-700">Status osób towarzyszących</label>
                                    <div className="space-y-2 mt-1">
                                    {Array.from({ length: allowedCompanions }).map((_, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-md">
                                            <label htmlFor={`companion_attending_${index}`} className="flex items-center">
                                                <input type="checkbox" id={`companion_attending_${index}`} checked={companions[index]?.attending || false} onChange={e => handleCompanionChange(index, 'attending', e.target.checked)} className="h-4 w-4 rounded" />
                                                <span className="ml-2 text-sm">Osoba #{index + 1}</span>
                                            </label>
                                            {(companions[index]?.attending) && (
                                            <label htmlFor={`companion_child_${index}`} className="flex items-center text-sm">
                                                <input type="checkbox" id={`companion_child_${index}`} checked={companions[index]?.is_child || false} onChange={e => handleCompanionChange(index, 'is_child', e.target.checked)} className="h-4 w-4 rounded" />
                                                <span className="ml-2">Dziecko</span>
                                            </label>
                                            )}
                                        </div>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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

const StatCard: React.FC<{ title: string; value: number; color: string; isActive: boolean; onClick: () => void; }> = ({ title, value, color, isActive, onClick }) => (
    <button onClick={onClick} className={`p-4 rounded-lg border-l-4 text-left transition-all ${isActive ? 'ring-2 ring-indigo-400 shadow-lg' : 'hover:shadow-md'} ${color}`}>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-bold text-slate-800">{value}</p>
    </button>
);


const GuestManager: React.FC = () => {
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [activeFilter, setActiveFilter] = useState<Guest['rsvp_status'] | 'all'>('all');
    const queryClient = useQueryClient();

    // Queries
    const { data: guests, isLoading: isLoadingGuests, error: errorGuests } = useQuery<Guest[], Error>({ queryKey: ['guests'], queryFn: fetchGuests });
    const { data: groups, isLoading: isLoadingGroups } = useQuery<GuestGroup[], Error>({ queryKey: ['guestGroups'], queryFn: getGuestGroups });
    const { data: inviteSettings } = useQuery<InviteSettings, Error>({ queryKey: ['inviteSettings'], queryFn: getInviteSettings });

    // State for forms
    const [newGroupName, setNewGroupName] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [inviteImageFile, setInviteImageFile] = useState<File | null>(null);

    useEffect(() => {
        if (inviteSettings) {
            setInviteMessage(inviteSettings.invite_message || '');
        }
    }, [inviteSettings]);

    // Mutations
    const sendInvitesMutation = useMutation< { message: string }, Error, void >({
        mutationFn: sendGuestInvites,
        onSuccess: (data) => setFeedbackMessage({ type: 'success', text: data.message }),
        onError: (error) => setFeedbackMessage({ type: 'error', text: error.message }),
    });

    const deleteGuestMutation = useMutation({
        mutationFn: deleteGuest,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guests'] }),
    });

    const addGroupMutation = useMutation({
        mutationFn: addGuestGroup,
        onSuccess: () => {
            setNewGroupName('');
            queryClient.invalidateQueries({ queryKey: ['guestGroups'] });
        },
    });

    const deleteGroupMutation = useMutation({
        mutationFn: deleteGuestGroup,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guestGroups'] }),
    });

    const uploadImageMutation = useMutation({ mutationFn: uploadInviteImage });
    const updateSettingsMutation = useMutation({
        mutationFn: updateInviteSettings,
        onSuccess: () => setFeedbackMessage({ type: 'success', text: 'Ustawienia zaproszenia zapisane.' }),
        onError: (e) => setFeedbackMessage({ type: 'error', text: (e as Error).message }),
    });
    
    // Handlers
    const handleEdit = (guest: Guest) => { setEditingGuest(guest); setIsModalOpen(true); };
    const handleAdd = () => { setEditingGuest(null); setIsModalOpen(true); };
    const handleDelete = (id: number) => { if (window.confirm('Na pewno?')) deleteGuestMutation.mutate(id); };
    const handleAddGroup = (e: React.FormEvent) => { e.preventDefault(); if (newGroupName) addGroupMutation.mutate(newGroupName); };
    const handleSaveInviteSettings = async () => {
        let imageUrl = inviteSettings?.invite_image_url || '';
        try {
            if (inviteImageFile) {
                const uploaded = await uploadImageMutation.mutateAsync(inviteImageFile);
                imageUrl = uploaded.url;
            }
            updateSettingsMutation.mutate({ invite_message: inviteMessage, invite_image_url: imageUrl });
        } catch (e) {
            setFeedbackMessage({ type: 'error', text: (e as Error).message });
        }
    };

    const statusMap: Record<Guest['rsvp_status'], { text: string; color: string }> = {
        pending: { text: 'Oczekuje', color: 'bg-slate-200 text-slate-700' },
        confirmed: { text: 'Potwierdzono', color: 'bg-green-100 text-green-700' },
        declined: { text: 'Odrzucono', color: 'bg-red-100 text-red-700' },
        tentative: { text: 'Jeszcze nie wie', color: 'bg-yellow-100 text-yellow-700' },
    };
    
    const stats = guests ? (() => {
        const confirmed_guests = guests.filter(g => g.rsvp_status === 'confirmed');
        const confirmed_companions = confirmed_guests.reduce((acc, guest) => {
            return acc + (guest.companion_status?.filter(c => c.attending).length || 0);
        }, 0);
        const total_allowed_companions = guests.reduce((acc, g) => acc + (g.allowed_companions || 0), 0);

        return {
            confirmed: confirmed_guests.length + confirmed_companions,
            declined: guests.filter(g => g.rsvp_status === 'declined').length,
            pending: guests.filter(g => g.rsvp_status === 'pending').length,
            tentative: guests.filter(g => g.rsvp_status === 'tentative').length,
            total: guests.length,
            total_invited: guests.length + total_allowed_companions
        };
    })() : { confirmed: 0, declined: 0, pending: 0, tentative: 0, total: 0, total_invited: 0 };
    
    const filteredGuests = guests?.filter(g => {
        if (activeFilter === 'all') return true;
        return g.rsvp_status === activeFilter;
    });

    const hasPendingGuests = guests ? guests.some(g => g.rsvp_status === 'pending') : false;

    useEffect(() => {
        if(feedbackMessage) {
            const timer = setTimeout(() => setFeedbackMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);

    if (isLoadingGuests || isLoadingGroups) return <div className="flex justify-center py-10"><EngagementRingSpinner /></div>;
    if (errorGuests) return <p className="text-red-500 text-center">{errorGuests.message}</p>;

    return (
        <div className="space-y-6">
            <details className="bg-white rounded-2xl shadow p-4">
                <summary className="font-semibold cursor-pointer">Dostosuj Zaproszenie</summary>
                <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Własna wiadomość w e-mailu</label>
                        <textarea value={inviteMessage} onChange={e => setInviteMessage(e.target.value)} rows={5} className="mt-1 w-full rounded-md border-slate-300" placeholder="Wpisz tekst, który pojawi się w zaproszeniu..."/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Grafika w nagłówku e-maila</label>
                         {inviteSettings?.invite_image_url && !inviteImageFile && <img src={inviteSettings.invite_image_url} alt="Podgląd" className="w-full h-32 object-cover rounded-md my-2"/>}
                        <input type="file" onChange={e => setInviteImageFile(e.target.files ? e.target.files[0] : null)} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <button onClick={handleSaveInviteSettings} disabled={uploadImageMutation.isPending || updateSettingsMutation.isPending} className="flex items-center gap-2 bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 w-40 justify-center">
                            {(uploadImageMutation.isPending || updateSettingsMutation.isPending) ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zapisz ustawienia'}
                        </button>
                    </div>
                </div>
            </details>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard title="Zaproszono Łącznie" value={stats.total_invited} color="border-indigo-500 bg-indigo-50" onClick={() => setActiveFilter('all')} isActive={activeFilter === 'all'} />
                <StatCard title="Potwierdzeni" value={stats.confirmed} color="border-green-500 bg-green-50" onClick={() => setActiveFilter('confirmed')} isActive={activeFilter === 'confirmed'} />
                <StatCard title="Oczekujący" value={stats.pending} color="border-slate-500 bg-slate-100" onClick={() => setActiveFilter('pending')} isActive={activeFilter === 'pending'} />
                <StatCard title="Jeszcze nie wiedzą" value={stats.tentative} color="border-yellow-500 bg-yellow-50" onClick={() => setActiveFilter('tentative')} isActive={activeFilter === 'tentative'} />
                <StatCard title="Odrzucili" value={stats.declined} color="border-red-500 bg-red-50" onClick={() => setActiveFilter('declined')} isActive={activeFilter === 'declined'} />
            </div>

            {feedbackMessage && (
                <div className={`p-3 rounded-lg text-sm ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedbackMessage.text}
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-slate-800">Lista Gości</h3>
                        <div className="flex gap-4">
                            <button onClick={() => sendInvitesMutation.mutate()} disabled={!hasPendingGuests || sendInvitesMutation.isPending} className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed">
                                {sendInvitesMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : <EnvelopeIcon className="w-5 h-5"/>}
                                Wyślij zaproszenia
                            </button>
                            <button onClick={handleAdd} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                                <PlusCircleIcon className="w-5 h-5"/> Dodaj Gościa
                            </button>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">Gość</th>
                                        <th className="px-6 py-3 text-left">Uwagi gościa</th>
                                        <th className="px-6 py-3 text-center">Status</th>
                                        <th className="px-6 py-3 text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredGuests?.map(guest => (
                                        <tr key={guest.id} className="border-b hover:bg-slate-50">
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-slate-900">{guest.name}</p>
                                                <p className="text-xs text-slate-500">{guest.group_name || 'Brak grupy'}</p>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 text-xs">
                                                {guest.notes ? <div className="flex items-start gap-2"><InformationCircleIcon className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0"/><span>{guest.notes}</span></div> : <span className="italic text-slate-400">Brak</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusMap[guest.rsvp_status].color}`}>{statusMap[guest.rsvp_status].text}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleEdit(guest)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button>
                                                <button onClick={() => handleDelete(guest.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredGuests?.length === 0 && <p className="text-center text-slate-500 py-8">Brak gości pasujących do filtra.</p>}
                        </div>
                    </div>
                </div>
                 <div className="md:col-span-1">
                     <h3 className="text-xl font-bold text-slate-800 mb-4">Grupy Gości</h3>
                     <div className="bg-white rounded-2xl shadow p-4 space-y-3">
                        <ul className="space-y-2">
                            {groups?.map(g => (
                                <li key={g.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-md">
                                    <span className="text-sm font-medium">{g.name}</span>
                                    <button onClick={() => deleteGroupMutation.mutate(g.id)} className="p-1 text-slate-400 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                </li>
                            ))}
                        </ul>
                         <form onSubmit={handleAddGroup} className="flex gap-2 pt-2 border-t">
                             <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nowa grupa..." className="w-full text-sm rounded-md border-slate-300"/>
                             <button type="submit" className="bg-slate-200 p-2 rounded-md hover:bg-slate-300"><PlusCircleIcon className="w-5 h-5"/></button>
                         </form>
                     </div>
                 </div>
            </div>

            {isModalOpen && <GuestEditorModal guest={editingGuest || undefined} groups={groups || []} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

export default GuestManager;
