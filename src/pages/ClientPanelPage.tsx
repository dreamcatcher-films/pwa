import React, { useState, useEffect, FC, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, UserGroupIcon, PencilSquareIcon, CheckCircleIcon, ClockIcon, CheckBadgeIcon, ChatBubbleLeftRightIcon, ChevronDownIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { getClientPanelData, updateMyBooking, approveBookingStage, sendClientMessage, markMessagesAsRead } from '../api.ts';
import CountdownTimer from '../components/CountdownTimer.tsx';
import ClientPanelHero from '../components/ClientPanelHero.tsx';

// --- TYPES ---
interface EditableBookingData {
    bride_address: string;
    groom_address: string;
    church_location: string;
    venue_location: string;
    schedule: string;
    additional_info: string;
}

interface BookingData {
    id: number;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    couple_photo_url: string | null;
    bride_address: string | null;
    groom_address: string | null;
    church_location: string | null;
    venue_location: string | null;
    schedule: string | null;
    additional_info: string | null;
    payment_status: 'pending' | 'partial' | 'paid';
    email: string;
    phone_number: string;
    package_name: string;
    total_price: string;
    amount_paid: string;
    discount_code: string | null;
    selected_items: string[];
}

interface ProductionStage {
    id: number;
    name: string;
    description: string;
    status: 'pending' | 'in_progress' | 'awaiting_approval' | 'completed';
    completed_at: string | null;
}

interface Message {
    id: number | string;
    sender: 'client' | 'admin';
    content: string;
    created_at: string;
    status?: 'sending' | 'error';
}

// --- MAIN COMPONENT ---
const ClientPanelPage: React.FC = () => {
    const [isEditing, setIsEditing] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    
    const { data, isLoading, error } = useQuery({
        queryKey: ['clientPanel'],
        queryFn: getClientPanelData,
        staleTime: 5 * 60 * 1000,
        retry: (failureCount, error: any) => {
            if (error.message.includes('401') || error.message.includes('403')) return false;
            return failureCount < 3;
        }
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<EditableBookingData>();

    useEffect(() => {
        if (error) {
            localStorage.removeItem('authToken');
            navigate('/logowanie');
        }
    }, [error, navigate]);
    
     useEffect(() => {
        if (data?.booking) {
            const defaultValues = {
                bride_address: data.booking.bride_address || '',
                groom_address: data.booking.groom_address || '',
                church_location: data.booking.church_location || '',
                venue_location: data.booking.venue_location || '',
                schedule: data.booking.schedule || '',
                additional_info: data.booking.additional_info || '',
            };
            reset(defaultValues);
        }
    }, [data?.booking, reset]);

    const updateBookingMutation = useMutation({
        mutationFn: updateMyBooking,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientPanel'] });
             setTimeout(() => {
                setIsEditing(false);
            }, 2000);
        }
    });

    const approveStageMutation = useMutation({
        mutationFn: approveBookingStage,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPanel'] }),
        onError: (err) => alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.'),
    });

    const sendMessageMutation = useMutation({
        mutationFn: sendClientMessage,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPanel'] }),
    });
    
    const markAsReadMutation = useMutation({
        mutationFn: markMessagesAsRead,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPanel'] })
    });

    useEffect(() => {
        if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [data?.messages, isChatOpen]);
    
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        navigate('/');
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        if (data?.booking) reset(); // Reset form to default values
    };
    
    const onSave: SubmitHandler<EditableBookingData> = (formData) => {
        updateBookingMutation.mutate(formData);
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        const content = newMessage.trim();
        if (!content || sendMessageMutation.isPending) return;
        sendMessageMutation.mutate(content);
        setNewMessage('');
    };

    const handleToggleChat = () => {
        const newChatState = !isChatOpen;
        setIsChatOpen(newChatState);
        if (newChatState && data?.unreadCount?.count > 0) {
            markAsReadMutation.mutate();
        }
    };
    
    if (isLoading || !data) return <div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>;
    
    const { booking, stages, messages, unreadCount } = data;
    
    if (!booking) return <div className="text-center py-20 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8"><p className="text-red-500">Błąd: Nie znaleziono danych rezerwacji.</p><button onClick={() => navigate('/logowanie')} className="mt-4 bg-brand-dark-green text-white font-bold py-2 px-4 rounded-lg">Wróć do logowania</button></div>;
    
    const formatMessageDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    
    const getStatusProps = (status: ProductionStage['status']) => {
        switch (status) {
            case 'completed': return { text: 'Zakończony', icon: <CheckCircleIcon className="w-5 h-5 text-green-700" />, bgColor: 'bg-green-100', textColor: 'text-green-700' };
            case 'awaiting_approval': return { text: 'Oczekuje na Twoją akceptację', icon: <PencilSquareIcon className="w-5 h-5 text-amber-700" />, bgColor: 'bg-amber-100', textColor: 'text-amber-700' };
            case 'in_progress': return { text: 'W toku', icon: <ClockIcon className="w-5 h-5 text-blue-700" />, bgColor: 'bg-blue-100', textColor: 'text-blue-700' };
            default: return { text: 'Oczekuje', icon: <ClockIcon className="w-5 h-5 text-slate-500" />, bgColor: 'bg-slate-200', textColor: 'text-slate-600' };
        }
    };
    
    const getPaymentStatusText = (status: BookingData['payment_status']) => {
        switch (status) {
            case 'paid': return 'Opłacono w całości';
            case 'partial': return 'Częściowo opłacone';
            default: return 'Oczekuje na płatność';
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <ClientPanelHero booking={booking} onLogout={handleLogout} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                <main className="lg:col-span-2 space-y-8">
                    <InfoCard title="Etapy Produkcji">
                        <div className="space-y-4">
                            {stages.map((stage: ProductionStage) => {
                                const props = getStatusProps(stage.status);
                                return (
                                    <div key={stage.id} className="p-4 bg-slate-50 rounded-lg">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${props.bgColor}`}>{props.icon}</div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">{stage.name}</h4>
                                                    <p className={`text-sm font-semibold ${props.textColor}`}>{props.text}</p>
                                                </div>
                                            </div>
                                            {stage.status === 'awaiting_approval' && (
                                                <button onClick={() => approveStageMutation.mutate(stage.id)} disabled={approveStageMutation.isPending} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-300">
                                                    {approveStageMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zatwierdź'}
                                                </button>
                                            )}
                                        </div>
                                        {stage.description && <p className="mt-2 text-sm text-slate-600 pl-11">{stage.description}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </InfoCard>

                     <div className="bg-white rounded-2xl shadow-md">
                        <button onClick={handleToggleChat} className="w-full flex items-center justify-between p-6 cursor-pointer">
                            <div className="flex items-center">
                                <ChatBubbleLeftRightIcon className="w-7 h-7 mr-3 text-indigo-500" />
                                <h2 className="text-xl font-bold text-slate-800">Komunikacja z nami</h2>
                                {unreadCount?.count > 0 && <span className="ml-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{unreadCount.count} nowa</span>}
                            </div>
                            <ChevronDownIcon className={`w-6 h-6 text-slate-500 transition-transform ${isChatOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isChatOpen && (
                            <div className="p-6 pt-0">
                                <div className="border-t border-slate-200 pt-4">
                                    <div className="space-y-4 pr-2 max-h-96 overflow-y-auto">
                                        {messages.map((msg: Message) => (
                                            <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'client' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'} ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'error' ? 'bg-red-200 text-red-800' : ''}`}>
                                                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                                                    <p className={`text-xs mt-1 ${msg.sender === 'client' ? 'text-indigo-200' : 'text-slate-400'}`}>
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
                                        <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Napisz wiadomość..." rows={3} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" disabled={sendMessageMutation.isPending} />
                                        <div className="flex justify-end mt-2">
                                            <button type="submit" disabled={sendMessageMutation.isPending || !newMessage.trim()} className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center w-28 ml-auto">
                                                {sendMessageMutation.isPending ? <EngagementRingSpinner className="w-5 h-5" /> : 'Wyślij'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
                <aside className="lg:col-span-1">
                    <div className="sticky top-28 space-y-8">
                        <CountdownTimer targetDate={booking.wedding_date} />
                        <InfoCard title="Rozliczenie">
                             <InfoItem label="Status płatności" value={<span className="font-bold">{getPaymentStatusText(booking.payment_status)}</span>} />
                            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-4">
                                <InfoItem label="Wpłacono" value={formatCurrency(Number(booking.amount_paid))} />
                                <InfoItem label="Pozostało" value={formatCurrency(Number(booking.total_price) - Number(booking.amount_paid))} />
                            </div>
                            <div className="flex justify-between items-baseline pt-4 mt-2 border-t">
                                <p className="text-lg font-bold text-slate-900">Suma</p>
                                <p className="text-2xl font-bold text-indigo-600">{formatCurrency(Number(booking.total_price))}</p>
                            </div>
                        </InfoCard>
                         <InfoCard title="Dane Pary Młodej" icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500"/>}>
                            <InfoItem label="Panna Młoda" value={booking.bride_name} />
                            <InfoItem label="Pan Młody" value={booking.groom_name} />
                            <InfoItem label="Adres e-mail" value={booking.email} />
                            <InfoItem label="Numer telefonu" value={booking.phone_number} />
                        </InfoCard>
                        <InfoCard title="Podsumowanie pakietu">
                            <InfoItem label="Wybrany pakiet" value={booking.package_name} />
                            <InfoItem label="Wybrane usługi" value={<ul className="list-disc list-inside mt-1 font-medium">{booking.selected_items.map((item, index) => <li key={index}>{item}</li>)}</ul>} />
                            <InfoItem label="Użyty kod rabatowy" value={booking.discount_code || 'Brak'} />
                         </InfoCard>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default ClientPanelPage;
