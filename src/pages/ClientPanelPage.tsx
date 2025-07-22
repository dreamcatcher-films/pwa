import React, { useState, useEffect, FC, ReactNode, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EngagementRingSpinner, UserGroupIcon, PencilSquareIcon, CalendarDaysIcon, MapPinIcon, CheckCircleIcon, ClockIcon, CheckBadgeIcon, CurrencyDollarIcon, ChatBubbleLeftRightIcon, ChevronDownIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { getClientPanelData, updateMyBooking, approveBookingStage, sendClientMessage, markMessagesAsRead } from '../api.ts';

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
    created_at: string;
    payment_status: 'pending' | 'partial' | 'paid';
    amount_paid: string;
}

interface EditableBookingData {
    bride_address: string;
    groom_address: string;
    church_location: string;
    venue_location: string;
    schedule: string;
    additional_info: string;
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


const ClientPanelPage: React.FC = () => {
    const [showWelcome, setShowWelcome] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<EditableBookingData>({ bride_address: '', groom_address: '', church_location: '', venue_location: '', schedule: '', additional_info: '' });
    const [newMessage, setNewMessage] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    
    const { data, isLoading, error } = useQuery({
        queryKey: ['clientPanel'],
        queryFn: getClientPanelData,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: (failureCount, error: any) => {
            if (error.message.includes('401') || error.message.includes('403')) {
                return false;
            }
            return failureCount < 3;
        }
    });
    
    useEffect(() => {
        if (error) {
            localStorage.removeItem('authToken');
            navigate('/logowanie');
        }
    }, [error, navigate]);
    
     useEffect(() => {
        if (data?.booking) {
            setFormData({
                bride_address: data.booking.bride_address || '',
                groom_address: data.booking.groom_address || '',
                church_location: data.booking.church_location || '',
                venue_location: data.booking.venue_location || '',
                schedule: data.booking.schedule || '',
                additional_info: data.booking.additional_info || '',
            });
            setTimeout(() => setShowWelcome(false), 2500);
        }
    }, [data?.booking]);

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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientPanel'] });
        },
        onError: (err) => {
             alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    });

    const sendMessageMutation = useMutation({
        mutationFn: sendClientMessage,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientPanel'] });
        },
    });
    
    const markAsReadMutation = useMutation({
        mutationFn: markMessagesAsRead,
        onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: ['clientPanel'] });
        }
    });

    useEffect(() => {
        if (isChatOpen) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [data?.messages, isChatOpen]);
    
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        navigate('/');
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({...prev, [e.target.id]: e.target.value}));
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        if (data?.booking) {
             setFormData({
                bride_address: data.booking.bride_address || '',
                groom_address: data.booking.groom_address || '',
                church_location: data.booking.church_location || '',
                venue_location: data.booking.venue_location || '',
                schedule: data.booking.schedule || '',
                additional_info: data.booking.additional_info || '',
            });
        }
    };
    
    const handleSave = () => {
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
    
    if (isLoading || !data) {
        return <div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>;
    }

    if (showWelcome && data?.booking) {
        return (
            <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center animate-modal-in">
                <h1 className="text-4xl md:text-6xl font-bold font-cinzel text-slate-800 text-center tracking-wide">
                    Witaj,<br/>{data.booking.bride_name} & {data.booking.groom_name}
                </h1>
            </div>
        );
    }
    
    const { booking, stages, messages, unreadCount } = data;
    
    if (!booking) {
         return (
             <div className="text-center py-20 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <p className="text-red-500">Błąd: Nie znaleziono danych rezerwacji.</p>
                <button onClick={() => navigate('/logowanie')} className="mt-4 bg-brand-dark-green text-white font-bold py-2 px-4 rounded-lg">Wróć do logowania</button>
            </div>
        );
    }
    
    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
    const formatMessageDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const editButton = (
        <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
            <PencilSquareIcon className="w-5 h-5" /> Edytuj dane
        </button>
    );

    const getStatusProps = (status: ProductionStage['status']): { icon: ReactNode, text: string, color: string } => {
        switch (status) {
            case 'completed': return { icon: <CheckBadgeIcon className="w-8 h-8 text-white" />, text: 'Zakończony', color: 'bg-green-500' };
            case 'awaiting_approval': return { icon: <CheckCircleIcon className="w-8 h-8 text-white" />, text: 'Oczekuje na akceptację', color: 'bg-yellow-500' };
            case 'in_progress': return { icon: <ClockIcon className="w-8 h-8 text-white" />, text: 'W toku', color: 'bg-blue-500' };
            default: return { icon: <ClockIcon className="w-8 h-8 text-slate-500" />, text: 'Oczekuje', color: 'bg-slate-200' };
        }
    };
    
    const getPaymentStatusText = (status: BookingData['payment_status']) => {
        switch (status) {
            case 'pending': return 'Oczekuje na płatność';
            case 'partial': return 'Częściowo opłacone';
            case 'paid': return 'Opłacono w całości';
            default: return 'Nieznany';
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
             <header className="flex flex-col sm:flex-row justify-between items-center mb-10">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Szczegóły rezerwacji #{booking.id}</h1>
                    <p className="mt-2 text-lg text-slate-600">Witaj, {booking.bride_name}!</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                > Wyloguj się </button>
            </header>
            
            <section className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Postęp Produkcji</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stages.map(stage => {
                        const { icon, text, color } = getStatusProps(stage.status);
                        return (
                             <div key={stage.id} className="bg-white p-5 rounded-2xl shadow-md flex flex-col">
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full ${color}`}>
                                        {icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">{stage.name}</h3>
                                        <p className="text-sm font-semibold text-slate-500">{text}</p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600 mt-3 flex-grow">{stage.description}</p>
                                {stage.status === 'awaiting_approval' && (
                                    <button onClick={() => approveStageMutation.mutate(stage.id)} disabled={approveStageMutation.isPending} className="mt-4 w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-dark-green rounded-lg hover:bg-brand-dark-green/90 disabled:opacity-50">
                                        <CheckCircleIcon className="w-4 h-4 mr-2" /> {approveStageMutation.isPending ? 'Zatwierdzanie...' : 'Zatwierdź etap'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                 {stages.length === 0 && <div className="bg-white p-6 rounded-2xl shadow-md text-center text-slate-500">Brak zdefiniowanych etapów dla Twojego projektu.</div>}
            </section>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <InfoCard title="Dane Pary Młodej" icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoItem label="Panna Młoda" value={booking.bride_name} />
                            <InfoItem label="Pan Młody" value={booking.groom_name} />
                            <InfoItem label="Adres e-mail" value={booking.email} />
                            <InfoItem label="Numer telefonu" value={booking.phone_number} />
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
                                <div className="space-y-4 pr-2 max-h-96 overflow-y-auto border-t pt-4">
                                    {messages.map(msg => (
                                        <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'client' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                <p className={`text-xs mt-1 ${msg.sender === 'client' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                    {formatMessageDate(msg.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t">
                                    {sendMessageMutation.isError && <p className="text-red-500 text-sm mb-2">{sendMessageMutation.error.message}</p>}
                                    <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Napisz wiadomość..." rows={3} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" disabled={sendMessageMutation.isPending} />
                                    <div className="text-right mt-2">
                                        <button type="submit" disabled={sendMessageMutation.isPending || !newMessage.trim()} className="bg-brand-dark-green text-white font-bold py-2 px-5 rounded-lg hover:bg-brand-dark-green/90 disabled:opacity-50 transition-colors flex items-center justify-center w-28 ml-auto">
                                            {sendMessageMutation.isPending ? <EngagementRingSpinner className="w-5 h-5" /> : 'Wyślij'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>

                     <InfoCard title="Szczegóły wydarzenia" icon={<MapPinIcon className="w-7 h-7 mr-3 text-indigo-500" />} actionButton={!isEditing ? editButton : undefined} >
                        {!isEditing ? (
                             <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <InfoItem label="Data ślubu" value={formatDate(booking.wedding_date)} />
                                    <div></div>
                                    <InfoItem label="Adres przygotowań Panny Młodej" value={<AddressWithMapLink address={booking.bride_address} />} />
                                    <InfoItem label="Adres przygotowań Pana Młodego" value={<AddressWithMapLink address={booking.groom_address} />} />
                                    <InfoItem label="Adres ceremonii" value={<AddressWithMapLink address={booking.church_location} />} />
                                    <InfoItem label="Adres przyjęcia" value={<AddressWithMapLink address={booking.venue_location} />} />
                                </div>
                                <InfoItem label="Przybliżony harmonogram dnia" value={booking.schedule} />
                                <InfoItem label="Dodatkowe informacje" value={booking.additional_info} />
                            </>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <InputField id="bride_address" name="bride_address" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.bride_address} onChange={handleFormChange} />
                                     <InputField id="groom_address" name="groom_address" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groom_address} onChange={handleFormChange} />
                                </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <InputField id="church_location" name="church_location" label="Adres ceremonii (np. kościół)" placeholder="Parafia Św. Anny, Warszawa" value={formData.church_location} onChange={handleFormChange} />
                                     <InputField id="venue_location" name="venue_location" label="Adres przyjęcia (np. sala weselna)" placeholder="Hotel Bristol, Warszawa" value={formData.venue_location} onChange={handleFormChange} />
                                </div>
                                <TextAreaField id="schedule" name="schedule" label="Przybliżony harmonogram dnia" placeholder="12:00 - Przygotowania..." value={formData.schedule} onChange={handleFormChange} />
                                <TextAreaField id="additional_info" name="additional_info" label="Dodatkowe informacje" placeholder="np. specjalne prośby..." value={formData.additional_info} onChange={handleFormChange} required={false} />

                                {updateBookingMutation.isError && <p className="text-red-600 text-sm">{updateBookingMutation.error.message}</p>}
                                
                                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                                    {updateBookingMutation.isSuccess && <div className="flex items-center gap-2 text-green-600 mr-auto"><CheckCircleIcon className="w-5 h-5"/> Zapisano pomyślnie!</div>}
                                    <button onClick={handleCancelEdit} disabled={updateBookingMutation.isPending} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-200 transition">Anuluj</button>
                                    <button onClick={handleSave} disabled={updateBookingMutation.isPending} className="bg-brand-dark-green w-32 text-white font-bold py-2 px-4 rounded-lg hover:bg-brand-dark-green/90 transition flex justify-center items-center">
                                        {updateBookingMutation.isPending ? <EngagementRingSpinner className="w-5 h-5" /> : 'Zapisz zmiany'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </InfoCard>
                </div>
                <div className="lg:col-span-1">
                    <div className="sticky top-28 space-y-8">
                         <InfoCard title="Podsumowanie pakietu" icon={<CalendarDaysIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Wybrany pakiet" value={booking.package_name} />
                            <div>
                                <p className="text-sm text-slate-500">Wybrane usługi</p>
                                <ul className="list-disc list-inside mt-1 font-medium">
                                    {booking.selected_items.map((item, index) => <li key={index} className="capitalize">{item.replace(/_/g, ' ')}</li>)}
                               </ul>
                            </div>
                         </InfoCard>
                         <InfoCard title="Rozliczenie" icon={<CurrencyDollarIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Status płatności" value={<span className="font-bold">{getPaymentStatusText(booking.payment_status)}</span>} />
                            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-2">
                                <InfoItem label="Wpłacono" value={formatCurrency(Number(booking.amount_paid))} />
                                <InfoItem label="Pozostało" value={formatCurrency(Number(booking.total_price) - Number(booking.amount_paid))} />
                            </div>
                             <div className="border-t pt-4 mt-2">
                                <div className="flex justify-between items-baseline">
                                    <p className="text-lg font-bold text-slate-900">Suma</p>
                                    <p className="text-2xl font-bold text-indigo-600">{formatCurrency(Number(booking.total_price))}</p>
                                </div>
                            </div>
                         </InfoCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientPanelPage;
