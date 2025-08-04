import React, { useState, useEffect, useRef, FC } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { LoadingSpinner, ArrowLeftIcon, UserGroupIcon, MapPinIcon, CalendarDaysIcon, PencilSquareIcon, CheckCircleIcon, PlusCircleIcon, TrashIcon, CurrencyDollarIcon, ChatBubbleLeftRightIcon, PaperClipIcon, XMarkIcon, ChevronDownIcon, EnvelopeIcon, InformationCircleIcon, EngagementRingSpinner } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import { 
    getAdminBookingDetails, getAdminGuests, getAdminGuestGroups, 
    addAdminGuest, updateAdminGuest, deleteAdminGuest, 
    addAdminGuestGroup, deleteAdminGuestGroup 
} from '../api.ts';


// --- TYPES ---
interface CompanionStatus { attending: boolean; is_child: boolean; }
interface Guest { id: number; name: string; email: string | null; group_id: number | null; group_name: string | null; notes: string | null; rsvp_status: 'pending' | 'confirmed' | 'declined' | 'tentative'; allowed_companions: number; companion_status: CompanionStatus[] | null; }
interface GuestGroup { id: number; name: string; }
type GuestFormValues = { name: string; email: string; group_id: string; allowed_companions: number; rsvp_status: Guest['rsvp_status']; };

// --- GUEST MANAGER FOR ADMIN ---
const AdminGuestManager: FC<{ bookingId: string }> = ({ bookingId }) => {
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState<Guest['rsvp_status'] | 'all'>('all');
    const queryClient = useQueryClient();

    const guestsQueryKey = ['adminGuests', bookingId];
    const groupsQueryKey = ['adminGuestGroups', bookingId];

    const { data: guests, isLoading: isLoadingGuests } = useQuery<Guest[], Error>({ queryKey: guestsQueryKey, queryFn: () => getAdminGuests(bookingId) });
    const { data: groups, isLoading: isLoadingGroups } = useQuery<GuestGroup[], Error>({ queryKey: groupsQueryKey, queryFn: () => getAdminGuestGroups(bookingId) });

    const [newGroupName, setNewGroupName] = useState('');

    const deleteGuestMutation = useMutation({
        mutationFn: (guestId: number) => deleteAdminGuest({ bookingId, guestId }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: guestsQueryKey }),
    });
    const addGroupMutation = useMutation({
        mutationFn: (name: string) => addAdminGuestGroup({ bookingId, name }),
        onSuccess: () => { setNewGroupName(''); queryClient.invalidateQueries({ queryKey: groupsQueryKey }); },
    });
    const deleteGroupMutation = useMutation({
        mutationFn: (groupId: number) => deleteAdminGuestGroup({ bookingId, groupId }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
    });

    const handleEdit = (guest: Guest) => { setEditingGuest(guest); setIsModalOpen(true); };
    const handleAdd = () => { setEditingGuest(null); setIsModalOpen(true); };
    const handleDelete = (id: number) => { if (window.confirm('Na pewno?')) deleteGuestMutation.mutate(id); };
    const handleAddGroup = (e: React.FormEvent) => { e.preventDefault(); if (newGroupName) addGroupMutation.mutate(newGroupName); };

    const stats = guests ? (() => {
        const confirmed_guests = guests.filter(g => g.rsvp_status === 'confirmed');
        const confirmed_companions = confirmed_guests.reduce((acc, guest) => acc + (guest.companion_status?.filter(c => c.attending).length || 0), 0);
        return {
            confirmed: confirmed_guests.length + confirmed_companions,
            declined: guests.filter(g => g.rsvp_status === 'declined').length,
            pending: guests.filter(g => g.rsvp_status === 'pending').length,
            tentative: guests.filter(g => g.rsvp_status === 'tentative').length,
        };
    })() : { confirmed: 0, declined: 0, pending: 0, tentative: 0 };

    const statusMap: Record<Guest['rsvp_status'], { text: string; color: string }> = {
        pending: { text: 'Oczekuje', color: 'bg-slate-200 text-slate-700' },
        confirmed: { text: 'Potwierdzono', color: 'bg-green-100 text-green-700' },
        declined: { text: 'Odrzucono', color: 'bg-red-100 text-red-700' },
        tentative: { text: 'Jeszcze nie wie', color: 'bg-yellow-100 text-yellow-700' },
    };

    const filteredGuests = guests?.filter(g => activeFilter === 'all' || g.rsvp_status === activeFilter);
    if (isLoadingGuests || isLoadingGroups) return <div className="flex justify-center py-10"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Potwierdzeni" value={stats.confirmed} color="border-green-500 bg-green-50" onClick={() => setActiveFilter('confirmed')} isActive={activeFilter === 'confirmed'} />
                <StatCard title="Oczekujący" value={stats.pending} color="border-slate-500 bg-slate-100" onClick={() => setActiveFilter('pending')} isActive={activeFilter === 'pending'} />
                <StatCard title="Jeszcze nie wiedzą" value={stats.tentative} color="border-yellow-500 bg-yellow-50" onClick={() => setActiveFilter('tentative')} isActive={activeFilter === 'tentative'} />
                <StatCard title="Odrzucili" value={stats.declined} color="border-red-500 bg-red-50" onClick={() => setActiveFilter('declined')} isActive={activeFilter === 'declined'} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-slate-800">Lista Gości</h3>
                        <button onClick={handleAdd} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700"><PlusCircleIcon className="w-5 h-5"/> Dodaj Gościa</button>
                    </div>
                    <div className="bg-white rounded-2xl shadow overflow-hidden">
                        <table className="w-full text-sm">
                           <thead className="text-xs text-slate-700 uppercase bg-slate-50"><tr><th className="px-6 py-3 text-left">Gość</th><th className="px-6 py-3 text-left">Uwagi</th><th className="px-6 py-3 text-center">Status</th><th className="px-6 py-3 text-right">Akcje</th></tr></thead>
                            <tbody>
                                {filteredGuests?.map(guest => (
                                    <tr key={guest.id} className="border-b hover:bg-slate-50">
                                        <td className="px-6 py-4"><p className="font-medium text-slate-900">{guest.name}</p><p className="text-xs text-slate-500">{guest.group_name || 'Brak grupy'}</p></td>
                                        <td className="px-6 py-4 text-slate-600 text-xs">{guest.notes ? <div className="flex items-start gap-2"><InformationCircleIcon className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0"/><span>{guest.notes}</span></div> : <span className="italic text-slate-400">Brak</span>}</td>
                                        <td className="px-6 py-4 text-center"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusMap[guest.rsvp_status].color}`}>{statusMap[guest.rsvp_status].text}</span></td>
                                        <td className="px-6 py-4 text-right"><button onClick={() => handleEdit(guest)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button><button onClick={() => handleDelete(guest.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredGuests?.length === 0 && <p className="text-center text-slate-500 py-8">Brak gości.</p>}
                    </div>
                </div>
                <div className="md:col-span-1">
                     <h3 className="text-xl font-bold text-slate-800 mb-4">Grupy Gości</h3>
                     <div className="bg-white rounded-2xl shadow p-4 space-y-3">
                        <ul className="space-y-2">{groups?.map(g => (<li key={g.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-md"><span className="text-sm font-medium">{g.name}</span><button onClick={() => deleteGroupMutation.mutate(g.id)} className="p-1 text-slate-400 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button></li>))}</ul>
                        <form onSubmit={handleAddGroup} className="flex gap-2 pt-2 border-t"><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nowa grupa..." className="w-full text-sm rounded-md border-slate-300"/><button type="submit" className="bg-slate-200 p-2 rounded-md hover:bg-slate-300"><PlusCircleIcon className="w-5 h-5"/></button></form>
                     </div>
                </div>
            </div>
            {isModalOpen && <AdminGuestEditorModal guest={editingGuest || undefined} groups={groups || []} bookingId={bookingId} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};
const AdminGuestEditorModal: FC<{ guest?: Guest; groups: GuestGroup[]; bookingId: string; onClose: () => void }> = ({ guest, groups, bookingId, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit, watch } = useForm<GuestFormValues>({ defaultValues: { name: guest?.name || '', email: guest?.email || '', group_id: guest?.group_id?.toString() || '', allowed_companions: guest?.allowed_companions || 0, rsvp_status: guest?.rsvp_status || 'pending' } });
    const allowedCompanions = watch('allowed_companions');
    const [companions, setCompanions] = useState<CompanionStatus[]>([]);

    useEffect(() => {
        const initialCompanions = Array.from({ length: guest?.allowed_companions || 0 }, (_, i) => guest?.companion_status?.[i] || { attending: false, is_child: false });
        setCompanions(initialCompanions);
    }, [guest]);

    const mutation = useMutation({
        mutationFn: (data: GuestFormValues & { companion_status: CompanionStatus[] }) => {
            const payload = { ...data, group_id: data.group_id ? parseInt(data.group_id, 10) : null, companion_status: data.companion_status };
            return guest?.id ? updateAdminGuest({ bookingId, guestId: guest.id, data: payload }) : addAdminGuest({ bookingId, data: payload });
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminGuests', bookingId] }); onClose(); },
    });

    const handleCompanionChange = (index: number, field: 'attending' | 'is_child', value: boolean) => {
        const newCompanions = [...companions];
        newCompanions[index] = { ...newCompanions[index], [field]: value };
        if (field === 'attending' && !value) newCompanions[index].is_child = false;
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
                        <div className="col-span-2"><label htmlFor="name" className="block text-sm font-medium text-slate-700">Imię i nazwisko</label><input id="name" {...register('name', { required: true })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" /></div>
                        <div className="col-span-2"><label htmlFor="email" className="block text-sm font-medium text-slate-700">Adres e-mail</label><input id="email" type="email" {...register('email')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" /></div>
                        <div><label htmlFor="group_id" className="block text-sm font-medium text-slate-700">Grupa/Rodzina</label><select id="group_id" {...register('group_id')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm"><option value="">-- Brak grupy --</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                        <div><label htmlFor="allowed_companions" className="block text-sm font-medium text-slate-700">Os. towarzyszące</label><input id="allowed_companions" type="number" min="0" {...register('allowed_companions')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" /></div>
                    </div>
                    {guest?.id && (
                        <div className="pt-4 border-t"><h4 className="text-md font-semibold text-slate-800 mb-2">Edytuj odpowiedź gościa</h4>
                            <div><label htmlFor="rsvp_status" className="block text-sm font-medium text-slate-700">Status RSVP</label><select id="rsvp_status" {...register('rsvp_status')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm"><option value="pending">Oczekuje</option><option value="confirmed">Potwierdzono</option><option value="declined">Odrzucono</option><option value="tentative">Jeszcze nie wiem</option></select></div>
                            {allowedCompanions > 0 && (<div className="mt-4"><label className="block text-sm font-medium text-slate-700">Status osób towarzyszących</label><div className="space-y-2 mt-1">{Array.from({ length: allowedCompanions }).map((_, index) => (<div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-md"><label htmlFor={`companion_attending_${index}`} className="flex items-center"><input type="checkbox" id={`companion_attending_${index}`} checked={companions[index]?.attending || false} onChange={e => handleCompanionChange(index, 'attending', e.target.checked)} className="h-4 w-4 rounded" /><span className="ml-2 text-sm">Osoba #{index + 1}</span></label>{(companions[index]?.attending) && (<label htmlFor={`companion_child_${index}`} className="flex items-center text-sm"><input type="checkbox" id={`companion_child_${index}`} checked={companions[index]?.is_child || false} onChange={e => handleCompanionChange(index, 'is_child', e.target.checked)} className="h-4 w-4 rounded" /><span className="ml-2">Dziecko</span></label>)}</div>))}</div></div>)}
                        </div>)}
                    <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={onClose} disabled={mutation.isPending} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button><button type="submit" disabled={mutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg w-28 flex justify-center">{mutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zapisz'}</button></div>
                </form>
            </div>
        </div>
    );
};
const StatCard: FC<{ title: string; value: number; color: string; isActive: boolean; onClick: () => void; }> = ({ title, value, color, isActive, onClick }) => (<button onClick={onClick} className={`p-4 rounded-lg border-l-4 text-left transition-all ${isActive ? 'ring-2 ring-indigo-400 shadow-lg' : 'hover:shadow-md'} ${color}`}><p className="text-sm text-slate-500">{title}</p><p className="text-2xl font-bold text-slate-800">{value}</p></button>);


const AddressWithMapLink: FC<{ address: string | null }> = ({ address }) => {
    if (!address) return <span className="italic text-slate-400">Brak danych</span>;

    return (
        <div className="flex items-center gap-2">
            <span className="flex-grow">{address}</span>
            <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:text-indigo-700 p-1 rounded-full hover:bg-indigo-50 transition-colors flex-shrink-0"
                aria-label="Pokaż na mapie"
            >
                <MapPinIcon className="w-5 h-5" />
            </a>
        </div>
    );
};

interface BookingData {
    id: number;
    client_id: string;
    package_name: string;
    total_price: string;
    selected_items: string[];
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    bride_address: string;
    groom_address: string;
    church_location: string | null;
    venue_location: string | null;
    schedule: string;
    email: string;
    phone_number: string;
    additional_info: string | null;
    discount_code: string | null;
    access_key: string;
    created_at: string;
    payment_status: 'pending' | 'partial' | 'paid';
    amount_paid: string;
}

interface ProductionStageTemplate {
    id: number;
    name: string;
}

interface BookingStage {
    id: number;
    name: string;
    status: 'pending' | 'in_progress' | 'awaiting_approval' | 'completed';
}

interface PaymentData {
    payment_status: 'pending' | 'partial' | 'paid';
    amount_paid: string;
}

interface Message {
    id: number | string;
    sender: 'client' | 'admin';
    content: string;
    created_at: string;
    status?: 'sending' | 'error';
    attachment_url?: string;
    attachment_type?: string;
}


const AdminBookingDetailsPage: React.FC = () => {
    const { bookingId } = useParams<{ bookingId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(location.state?.openTab || 'details');
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<BookingData | null>(null);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [updateError, setUpdateError] = useState('');
    
    const [paymentData, setPaymentData] = useState<PaymentData>({ payment_status: 'pending', amount_paid: '0' });
    const [paymentUpdateStatus, setPaymentUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    
    const [bookingStages, setBookingStages] = useState<BookingStage[]>([]);
    const [allStageTemplates, setAllStageTemplates] = useState<ProductionStageTemplate[]>([]);
    const [selectedStageToAdd, setSelectedStageToAdd] = useState('');

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [messageError, setMessageError] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [resendMessage, setResendMessage] = useState('');

    const token = localStorage.getItem('adminAuthToken');

    const fetchAllData = async () => {
        if (!token) { navigate('/admin/logowanie'); return; }

        try {
            const [bookingRes, bookingStagesRes, allStagesRes, messagesRes, unreadCountRes] = await Promise.all([
                fetch(`/api/admin/bookings/${bookingId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/admin/booking-stages/${bookingId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/admin/stages`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/admin/messages/${bookingId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/admin/bookings/${bookingId}/unread-count`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            
            if (bookingRes.status === 401 || bookingRes.status === 403) {
                 localStorage.removeItem('adminAuthToken');
                 navigate('/admin/logowanie');
                 return;
            }

            if (!bookingRes.ok) throw new Error(await bookingRes.text() || 'Błąd pobierania rezerwacji.');
            if (!bookingStagesRes.ok) throw new Error(await bookingStagesRes.text() || 'Błąd pobierania etapów projektu.');
            if (!allStagesRes.ok) throw new Error(await allStagesRes.text() || 'Błąd pobierania szablonów etapów.');
            if (!messagesRes.ok) throw new Error(await messagesRes.text() || 'Błąd pobierania wiadomości.');
            if (!unreadCountRes.ok) throw new Error(await unreadCountRes.text() || 'Błąd pobierania licznika wiadomości.');
            
            const bookingDataResult = await bookingRes.json();
            const bookingStagesData = await bookingStagesRes.json();
            const allStagesData = await allStagesRes.json();
            const messagesData = await messagesRes.json();
            const unreadCountData = await unreadCountRes.json();

            setBookingData(bookingDataResult);
            setFormData(bookingDataResult);
            setPaymentData({ payment_status: bookingDataResult.payment_status, amount_paid: bookingDataResult.amount_paid });
            setBookingStages(bookingStagesData);
            setAllStageTemplates(allStagesData);
            setMessages(messagesData);
            setUnreadCount(unreadCountData.count);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [navigate, bookingId, token]);

    useEffect(() => {
        if(isChatOpen) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isChatOpen]);

    const handleToggleChat = async () => {
        const newChatState = !isChatOpen;
        setIsChatOpen(newChatState);
        if (newChatState && unreadCount > 0) {
            try {
                await fetch(`/api/admin/bookings/${bookingId}/messages/mark-as-read`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setUnreadCount(0);
            } catch (err) {
                console.error("Failed to mark messages as read", err);
            }
        }
    };

    const handleBack = () => navigate('/admin/rezerwacje');
    
    const handleDeleteBooking = async () => {
        if (!window.confirm(`Czy na pewno chcesz usunąć rezerwację #${bookingId}? Tej operacji nie można cofnąć.`)) { return; }
        setError('');
        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(await response.text() || 'Nie udało się usunąć rezerwacji.');
            navigate('/admin/rezerwacje');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (formData) { setFormData({ ...formData, [e.target.id]: e.target.value }); }
    };
    
    const handleCancelEdit = () => {
        setIsEditing(false);
        setFormData(bookingData);
        setUpdateError('');
        setUpdateStatus('idle');
    };

    const handleSave = async () => {
        setUpdateStatus('loading');
        setUpdateError('');
        if (!formData) { setUpdateError('Brak danych do zapisu.'); setUpdateStatus('error'); return; }

        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(formData),
            });
            if(!response.ok) throw new Error(await response.text() || 'Błąd zapisu danych.');
            const result = await response.json();
            setBookingData(result.booking);
            setFormData(result.booking);
            setUpdateStatus('success');
            setTimeout(() => { setIsEditing(false); setUpdateStatus('idle'); }, 2000);
        } catch(err) {
            setUpdateError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setUpdateStatus('error');
        }
    };

    const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setPaymentData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSavePayment = async () => {
        setPaymentUpdateStatus('loading');
        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}/payment`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(paymentData),
            });
            if (!response.ok) throw new Error(await response.text() || 'Błąd zapisu płatności.');
            const result = await response.json();
            setBookingData(prev => prev ? { ...prev, ...result.payment_details } : null);
            setPaymentData(result.payment_details);
            setPaymentUpdateStatus('success');
            setTimeout(() => setPaymentUpdateStatus('idle'), 2000);
        } catch (err) {
            setPaymentUpdateStatus('error');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setMessageError('Plik jest za duży. Maksymalny rozmiar to 5MB.');
                return;
            }
            setAttachmentFile(file);
            setAttachmentPreview(URL.createObjectURL(file));
            setMessageError('');
        }
    };

    const removeAttachment = () => {
        setAttachmentFile(null);
        setAttachmentPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = newMessage.trim();
        if ((!content && !attachmentFile) || isSendingMessage) return;

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = { id: tempId, sender: 'admin', content, created_at: new Date().toISOString(), status: 'sending', attachment_url: attachmentPreview || undefined };

        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');
        removeAttachment();
        setMessageError('');
        setIsSendingMessage(true);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);

        try {
            let attachmentData = null;
            if (attachmentFile) {
                const uploadResponse = await fetch('/api/admin/messages/upload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-vercel-filename': attachmentFile.name,
                        'Content-Type': attachmentFile.type,
                    },
                    body: attachmentFile,
                });
                if (!uploadResponse.ok) throw new Error(await uploadResponse.text() || 'Błąd wysyłania załącznika.');
                const blob = await uploadResponse.json();
                attachmentData = { attachment_url: blob.url, attachment_type: blob.contentType };
            }

            const response = await fetch(`/api/admin/messages/${bookingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content, ...attachmentData }),
            });
             if (!response.ok) throw new Error(await response.text() || 'Błąd wysyłania wiadomości.');
            const savedMessage = await response.json();
            setMessages(prev => prev.map(msg => msg.id === tempId ? savedMessage : msg));
        } catch (err) {
            setMessageError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, status: 'error' } : msg));
        } finally {
            setIsSendingMessage(false);
        }
    };
    
    const handleAddStageToBooking = async () => {
        if (!selectedStageToAdd) return;
        try {
            await fetch(`/api/admin/booking-stages/${bookingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ stage_id: selectedStageToAdd })
            });
            await fetchAllData();
            setSelectedStageToAdd('');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const handleUpdateStageStatus = async (stageId: number, newStatus: string) => {
        try {
            await fetch(`/api/admin/booking-stages/${stageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus })
            });
            setBookingStages(prev => prev.map(s => s.id === stageId ? { ...s, status: newStatus as BookingStage['status'] } : s));
        } catch (err) {
             alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };
    
    const handleRemoveStageFromBooking = async (stageId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten etap z projektu?')) return;
        try {
            await fetch(`/api/admin/booking-stages/${stageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setBookingStages(prev => prev.filter(s => s.id !== stageId));
        } catch (err) {
             alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const handleResendCredentials = async () => {
        setResendStatus('loading');
        setResendMessage('');
        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}/resend-credentials`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Nie udało się wysłać e-maila.');
            
            setResendStatus('success');
            setResendMessage(data.message);
        } catch (err) {
            setResendStatus('error');
            setResendMessage(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setTimeout(() => {
                setResendStatus('idle');
                setResendMessage('');
            }, 3000);
        }
    };

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return ( <div className="text-center py-20"><p className="text-red-500">{error}</p><button onClick={handleBack} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Wróć do panelu</button></div> );
    if (!bookingData || !formData) return <div className="text-center py-20">Nie znaleziono danych rezerwacji.</div>;

    const formatDateForDisplay = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formatDateForInput = (dateString: string) => dateString.split('T')[0];
    const formatMessageDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const availableStagesToAdd = allStageTemplates.filter(template => !bookingStages.some(bs => bs.name === template.name));

    return (
        <div>
            <header className="relative mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <button onClick={handleBack} className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group mb-4">
                            <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" /> Wróć do listy rezerwacji
                        </button>
                        <div className="text-left">
                            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Rezerwacja #{bookingData.id}</h1>
                            <p className="mt-2 text-lg text-slate-600">Klient: {bookingData.bride_name} & {bookingData.groom_name}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-3 pt-4">
                        {isEditing ? (
                            <>
                                {updateStatus === 'success' && <div className="flex items-center gap-2 text-green-600 mr-auto"><CheckCircleIcon className="w-5 h-5"/> Zapisano!</div>}
                                <button onClick={handleCancelEdit} disabled={updateStatus === 'loading'} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-200 transition">Anuluj</button>
                                <button onClick={handleSave} disabled={updateStatus === 'loading'} className="bg-indigo-600 w-32 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition flex justify-center items-center">
                                    {updateStatus === 'loading' ? <LoadingSpinner className="w-5 h-5" /> : 'Zapisz zmiany'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg bg-indigo-50">
                                    <PencilSquareIcon className="w-5 h-5" /> Edytuj rezerwację
                                </button>
                                <button onClick={handleDeleteBooking} className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-800 transition-colors px-3 py-1.5 rounded-lg bg-red-50">
                                    <TrashIcon className="w-5 h-5" /> Usuń rezerwację
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <div className="border-b border-slate-200 mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        <PencilSquareIcon className="w-5 h-5"/> Szczegóły rezerwacji
                    </button>
                    <button onClick={() => setActiveTab('guests')} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'guests' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        <UserGroupIcon className="w-5 h-5"/> Lista Gości
                    </button>
                </nav>
            </div>
            
            {updateStatus === 'error' && <p className="text-red-600 text-sm bg-red-100 p-3 rounded-lg mb-4">{updateError}</p>}
            {error && <p className="text-red-600 text-sm bg-red-100 p-3 rounded-lg mb-4">{error}</p>}
            
            {activeTab === 'details' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <InfoCard title="Postęp Produkcji">
                            <div className="space-y-4">
                                {bookingStages.map(stage => (
                                    <div key={stage.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <span className="font-medium text-slate-800">{stage.name}</span>
                                        <div className="flex items-center gap-2">
                                            <select value={stage.status} onChange={(e) => handleUpdateStageStatus(stage.id, e.target.value)} className="block w-48 rounded-md border-slate-300 py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500" >
                                                <option value="pending">Oczekuje</option>
                                                <option value="in_progress">W toku</option>
                                                <option value="awaiting_approval">Oczekuje na akceptację</option>
                                                <option value="completed">Zakończony</option>
                                            </select>
                                            <button onClick={() => handleRemoveStageFromBooking(stage.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"><TrashIcon className="w-5 h-5"/></button>
                                        </div>
                                    </div>
                                ))}
                                {bookingStages.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Brak etapów w tym projekcie.</p>}
                            </div>
                            <div className="flex items-center gap-2 pt-4 mt-4 border-t">
                                <select value={selectedStageToAdd} onChange={e => setSelectedStageToAdd(e.target.value)} className="block w-full rounded-md border-slate-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500" >
                                    <option value="">-- Wybierz etap do dodania --</option>
                                    {availableStagesToAdd.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                                </select>
                                <button onClick={handleAddStageToBooking} disabled={!selectedStageToAdd} className="flex-shrink-0 flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300">
                                    <PlusCircleIcon className="w-5 h-5"/> Dodaj
                                </button>
                            </div>
                        </InfoCard>

                        <div className="bg-white rounded-2xl shadow-md">
                            <button onClick={handleToggleChat} className="w-full flex items-center justify-between p-6 cursor-pointer">
                                <div className="flex items-center">
                                    <ChatBubbleLeftRightIcon className="w-7 h-7 mr-3 text-indigo-500" />
                                    <h2 className="text-xl font-bold text-slate-800">Komunikacja z Klientem</h2>
                                    {unreadCount > 0 && <span className="ml-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{unreadCount} nowa</span>}
                                </div>
                                <ChevronDownIcon className={`w-6 h-6 text-slate-500 transition-transform ${isChatOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isChatOpen && (
                                <div className="p-6 pt-0">
                                    <div className="border-t border-slate-200 pt-4">
                                        <div className="space-y-4 pr-2 max-h-96 overflow-y-auto">
                                            {messages.map(msg => (
                                                <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'admin' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'} ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'error' ? 'bg-red-200 text-red-800' : ''}`}>
                                                        {msg.attachment_url && msg.attachment_type?.startsWith('image/') && (
                                                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                                                                <img src={msg.attachment_url} alt="Załącznik" className="rounded-lg max-w-xs mb-2" />
                                                            </a>
                                                        )}
                                                        {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                                                        <p className={`text-xs mt-1 ${msg.sender === 'admin' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                            {msg.status === 'sending' && 'Wysyłanie...'}
                                                            {msg.status === 'error' && <span className="font-semibold">Błąd wysyłania</span>}
                                                            {!msg.status && formatMessageDate(msg.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={chatEndRef} />
                                        </div>
                                        <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-slate-200">
                                            {messageError && <p className="text-red-500 text-sm mb-2">{messageError}</p>}
                                            <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Napisz odpowiedź do klienta..." rows={3} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" disabled={isSendingMessage} />
                                            {attachmentPreview && (
                                                <div className="mt-2 relative w-24 h-24">
                                                    <img src={attachmentPreview} alt="Podgląd załącznika" className="w-full h-full object-cover rounded-lg" />
                                                    <button onClick={removeAttachment} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><XMarkIcon className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center mt-2">
                                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                                                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full" aria-label="Dodaj załącznik">
                                                    <PaperClipIcon className="w-6 h-6" />
                                                </button>
                                                <button type="submit" disabled={isSendingMessage || (!newMessage.trim() && !attachmentFile)} className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center w-28 ml-auto">
                                                    {isSendingMessage ? <LoadingSpinner className="w-5 h-5" /> : 'Wyślij'}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <InfoCard title="Dane Klienta" icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            {isEditing ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField id="bride_name" name="bride_name" label="Panna Młoda" value={formData.bride_name} onChange={handleFormChange} />
                                    <InputField id="groom_name" name="groom_name" label="Pan Młody" value={formData.groom_name} onChange={handleFormChange} />
                                    <InputField id="email" name="email" label="Adres e-mail" type="email" value={formData.email} onChange={handleFormChange} />
                                    <InputField id="phone_number" name="phone_number" label="Numer telefonu" type="tel" value={formData.phone_number} onChange={handleFormChange} />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <InfoItem label="Panna Młoda" value={bookingData.bride_name} />
                                        <InfoItem label="Pan Młody" value={bookingData.groom_name} />
                                        <InfoItem label="Adres e-mail" value={bookingData.email} />
                                        <InfoItem label="Numer telefonu" value={bookingData.phone_number} />
                                        <InfoItem label="ID Klienta (do logowania)" value={bookingData.client_id} />
                                        <InfoItem label="Data utworzenia rezerwacji" value={formatDateForDisplay(bookingData.created_at)} />
                                    </div>
                                    <div className="pt-4 mt-4 border-t flex items-center justify-between">
                                        <button onClick={handleResendCredentials} disabled={resendStatus === 'loading'} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {resendStatus === 'loading' ? <LoadingSpinner className="w-5 h-5" /> : <EnvelopeIcon className="w-5 h-5" />}
                                            Wyślij ponownie dane logowania
                                        </button>
                                        {resendStatus === 'success' && <p className="text-sm text-green-600">{resendMessage}</p>}
                                        {resendStatus === 'error' && <p className="text-sm text-red-600">{resendMessage}</p>}
                                    </div>
                                </>
                            )}
                        </InfoCard>

                        <InfoCard title="Szczegóły Wydarzenia" icon={<MapPinIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            {isEditing ? (
                                <div className="space-y-6">
                                    <InputField id="wedding_date" name="wedding_date" label="Data ślubu" type="date" value={formatDateForInput(formData.wedding_date)} onChange={handleFormChange} />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField id="bride_address" name="bride_address" label="Adres przygotowań Panny Młodej" value={formData.bride_address} onChange={handleFormChange} />
                                        <InputField id="groom_address" name="groom_address" label="Adres przygotowań Pana Młodego" value={formData.groom_address} onChange={handleFormChange} />
                                        <InputField id="church_location" name="church_location" label="Adres ceremonii" value={formData.church_location || ''} onChange={handleFormChange} />
                                        <InputField id="venue_location" name="venue_location" label="Adres przyjęcia" value={formData.venue_location || ''} onChange={handleFormChange} />
                                    </div>
                                    <TextAreaField id="schedule" name="schedule" label="Przybliżony harmonogram dnia" value={formData.schedule} onChange={handleFormChange} />
                                    <TextAreaField id="additional_info" name="additional_info" label="Dodatkowe informacje od klienta" value={formData.additional_info || ''} onChange={handleFormChange} required={false} />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <InfoItem label="Data ślubu" value={new Date(bookingData.wedding_date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })} />
                                        <div></div>
                                        <InfoItem label="Adres przygotowań Panny Młodej" value={<AddressWithMapLink address={bookingData.bride_address} />} />
                                        <InfoItem label="Adres przygotowań Pana Młodego" value={<AddressWithMapLink address={bookingData.groom_address} />} />
                                        <InfoItem label="Adres ceremonii" value={<AddressWithMapLink address={bookingData.church_location} />} />
                                        <InfoItem label="Adres przyjęcia" value={<AddressWithMapLink address={bookingData.venue_location} />} />
                                    </div>
                                    <InfoItem label="Przybliżony harmonogram dnia" value={bookingData.schedule} />
                                    <InfoItem label="Dodatkowe informacje od klienta" value={bookingData.additional_info} />
                                </>
                            )}
                        </InfoCard>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="sticky top-28 space-y-8">
                            <InfoCard title="Pakiet i Wycena" icon={<CalendarDaysIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                                <InfoItem label="Wybrany pakiet" value={bookingData.package_name} />
                                <InfoItem label="Wybrane usługi" value={<ul className="list-disc list-inside mt-1 font-medium">{bookingData.selected_items.map((item, index) => <li key={index} className="capitalize">{item.replace(/_/g, ' ')}</li>)}</ul>} />
                                <InfoItem label="Użyty kod rabatowy" value={bookingData.discount_code} />
                                <div className="border-t pt-4 mt-2">
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-lg font-bold text-slate-900">Suma</p>
                                        <p className="text-2xl font-bold text-indigo-600">{formatCurrency(Number(bookingData.total_price))}</p>
                                    </div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Zarządzanie Płatnościami" icon={<CurrencyDollarIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="payment_status" className="block text-sm font-medium text-slate-700">Status płatności</label>
                                        <select id="payment_status" name="payment_status" value={paymentData.payment_status} onChange={handlePaymentChange} className="mt-1 block w-full rounded-md border-slate-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm" >
                                            <option value="pending">Oczekuje na płatność</option>
                                            <option value="partial">Częściowo opłacone</option>
                                            <option value="paid">Opłacono w całości</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="amount_paid" className="block text-sm font-medium text-slate-700">Wpłacona kwota (PLN)</label>
                                        <input type="number" step="0.01" id="amount_paid" name="amount_paid" value={paymentData.amount_paid} onChange={handlePaymentChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                    </div>
                                    <div className="border-t pt-4">
                                        <InfoItem label="Pozostało do zapłaty" value={formatCurrency(Number(bookingData.total_price) - Number(paymentData.amount_paid))} />
                                    </div>
                                    <div className="flex items-center justify-end gap-3 pt-2">
                                        {paymentUpdateStatus === 'success' && <div className="flex items-center gap-2 text-green-600 mr-auto text-sm"><CheckCircleIcon className="w-5 h-5"/> Zapisano!</div>}
                                        {paymentUpdateStatus === 'error' && <div className="flex items-center gap-2 text-red-600 mr-auto text-sm">Błąd zapisu</div>}
                                        <button onClick={handleSavePayment} disabled={paymentUpdateStatus === 'loading'} className="bg-indigo-600 w-32 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition flex justify-center items-center">
                                            {paymentUpdateStatus === 'loading' ? <LoadingSpinner className="w-5 h-5" /> : 'Zapisz płatność'}
                                        </button>
                                    </div>
                                </div>
                            </InfoCard>
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'guests' && bookingId && (
                <div className="mt-8">
                    <AdminGuestManager bookingId={bookingId} />
                </div>
            )}
        </div>
    );
};

export default AdminBookingDetailsPage;
