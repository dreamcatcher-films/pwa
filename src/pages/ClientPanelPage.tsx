import React, { useState, useEffect, FC, ReactNode, useRef } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, UserGroupIcon, PencilSquareIcon, CalendarDaysIcon, MapPinIcon, CheckCircleIcon, ClockIcon, CheckBadgeIcon, CurrencyDollarIcon, ChatBubbleLeftRightIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';

interface ClientPanelPageProps {
    navigateTo: (page: Page) => void;
}

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
    locations: string;
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
    locations: string;
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


const ClientPanelPage: React.FC<ClientPanelPageProps> = ({ navigateTo }) => {
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [stages, setStages] = useState<ProductionStage[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<EditableBookingData>({ bride_address: '', groom_address: '', locations: '', schedule: '', additional_info: '' });
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [updateError, setUpdateError] = useState('');

    const [newMessage, setNewMessage] = useState('');
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [messageError, setMessageError] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    const token = localStorage.getItem('authToken');

    const fetchAllData = async (shouldScrollChat = false) => {
        if (!token) {
            navigateTo('login');
            return;
        }
        
        if (!bookingData) setIsLoading(true); // Only show full-page loader on initial load

        try {
            const [bookingRes, stagesRes, messagesRes] = await Promise.all([
                fetch('/api/my-booking', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/booking-stages', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/messages', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (bookingRes.status === 401 || bookingRes.status === 403) {
                 localStorage.removeItem('authToken');
                 navigateTo('login');
                 return;
            }

            if (!bookingRes.ok) throw new Error(await bookingRes.text() || 'Błąd pobierania rezerwacji.');
            if (!stagesRes.ok) throw new Error(await stagesRes.text() || 'Błąd pobierania etapów.');
            if (!messagesRes.ok) throw new Error(await messagesRes.text() || 'Błąd pobierania wiadomości.');
            
            const bookingDataResult = await bookingRes.json();
            const stagesData = await stagesRes.json();
            const messagesData = await messagesRes.json();
            
            setBookingData(bookingDataResult);
            setStages(stagesData);
            setMessages(messagesData);

            if (!isEditing) {
                setFormData({
                    bride_address: bookingDataResult.bride_address || '',
                    groom_address: bookingDataResult.groom_address || '',
                    locations: bookingDataResult.locations || '',
                    schedule: bookingDataResult.schedule || '',
                    additional_info: bookingDataResult.additional_info || '',
                });
            }

            if (shouldScrollChat) {
                scrollToChatBottom();
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const scrollToChatBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        fetchAllData();
    }, [navigateTo, token]);

     useEffect(() => {
        scrollToChatBottom();
    }, [messages]);
    
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        navigateTo('home');
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({...prev, [e.target.id]: e.target.value}));
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        if (bookingData) {
             setFormData({
                bride_address: bookingData.bride_address || '',
                groom_address: bookingData.groom_address || '',
                locations: bookingData.locations || '',
                schedule: bookingData.schedule || '',
                additional_info: bookingData.additional_info || '',
            });
        }
        setUpdateError('');
        setUpdateStatus('idle');
    };

    const handleSave = async () => {
        setUpdateStatus('loading');
        setUpdateError('');

        try {
            const response = await fetch('/api/my-booking', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });
            
            if(!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd zapisu danych.');
            }
            const result = await response.json();
            setBookingData(prev => prev ? {...prev, ...result.booking} : null);
            setUpdateStatus('success');
            setTimeout(() => {
                setIsEditing(false);
                setUpdateStatus('idle');
            }, 2000);
        } catch(err) {
            setUpdateError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setUpdateStatus('error');
        }
    };
    
    const handleApproveStage = async (stageId: number) => {
        try {
            const response = await fetch(`/api/booking-stages/${stageId}/approve`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd zatwierdzania etapu.');
            }
            await fetchAllData();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = newMessage.trim();
        if (!content || isSendingMessage) return;

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            sender: 'client',
            content,
            created_at: new Date().toISOString(),
            status: 'sending',
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');
        setMessageError('');
        setIsSendingMessage(true);
        
        setTimeout(() => scrollToChatBottom(), 0);

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd wysyłania wiadomości.');
            }
            
            const savedMessage = await response.json();
            setMessages(prev => prev.map(msg => msg.id === tempId ? savedMessage : msg));

        } catch (err) {
            setMessageError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, status: 'error' } : msg));
        } finally {
            setIsSendingMessage(false);
        }
    };


    if (isLoading) {
        return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    }

    if (error) {
        return (
             <div className="text-center py-20">
                <p className="text-red-500">{error}</p>
                <button onClick={() => navigateTo('login')} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Wróć do logowania</button>
            </div>
        );
    }
    
    if (!bookingData) {
        return <div className="text-center py-20">Nie znaleziono danych rezerwacji.</div>;
    }
    
    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
    const formatMessageDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const editButton = (
        <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
            <PencilSquareIcon className="w-5 h-5" />
            Edytuj dane
        </button>
    );

    const getStatusIcon = (status: ProductionStage['status']) => {
        switch (status) {
            case 'completed': return <CheckBadgeIcon className="w-6 h-6 text-green-500" />;
            case 'awaiting_approval': return <CheckCircleIcon className="w-6 h-6 text-yellow-500" />;
            default: return <ClockIcon className="w-6 h-6 text-slate-400" />;
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
        <div>
             <header className="flex flex-col sm:flex-row justify-between items-center mb-10">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Witaj, {bookingData.bride_name}!</h1>
                    <p className="mt-2 text-lg text-slate-600">Oto podsumowanie Twojej rezerwacji nr #{bookingData.id}.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            {stages.length > 0 && (
                 <section className="mb-8">
                     <h2 className="text-2xl font-bold text-slate-800 mb-4">Postęp Produkcji</h2>
                    <div className="bg-white p-6 rounded-2xl shadow-md">
                        <ol className="relative border-l border-slate-200">
                            {stages.map((stage, index) => (
                                <li key={stage.id} className="mb-10 ml-8">
                                    <span className="absolute flex items-center justify-center w-8 h-8 bg-slate-100 rounded-full -left-4 ring-8 ring-white">
                                        {getStatusIcon(stage.status)}
                                    </span>
                                    <h3 className="flex items-center mb-1 text-lg font-semibold text-slate-900">{stage.name}</h3>
                                    {stage.completed_at && <time className="block mb-2 text-sm font-normal leading-none text-slate-400">Zakończono: {formatDate(stage.completed_at)}</time>}
                                    <p className="mb-4 text-base font-normal text-slate-500">{stage.description}</p>
                                     {stage.status === 'awaiting_approval' && (
                                        <button onClick={() => handleApproveStage(stage.id)} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:z-10 focus:ring-4 focus:outline-none focus:ring-green-200">
                                            <CheckCircleIcon className="w-4 h-4 mr-2" />
                                            Zatwierdź etap
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            )}

            <section className="mb-8">
                 <InfoCard title="Komunikacja z nami" icon={<ChatBubbleLeftRightIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                     <div className="space-y-4 pr-2 max-h-96 overflow-y-auto">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'client' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'} ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'error' ? 'bg-red-200 text-red-800' : ''}`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                     <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t">
                        {messageError && <p className="text-red-500 text-sm mb-2">{messageError}</p>}
                        <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Napisz wiadomość..."
                            rows={3}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={isSendingMessage}
                        />
                        <div className="text-right mt-2">
                            <button
                                type="submit"
                                disabled={isSendingMessage || !newMessage.trim()}
                                className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center w-28 ml-auto"
                            >
                                {isSendingMessage ? <LoadingSpinner className="w-5 h-5" /> : 'Wyślij'}
                            </button>
                        </div>
                    </form>
                </InfoCard>
            </section>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                     <InfoCard title="Dane Pary Młodej" icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoItem label="Panna Młoda" value={bookingData.bride_name} />
                            <InfoItem label="Pan Młody" value={bookingData.groom_name} />
                            <InfoItem label="Adres e-mail" value={bookingData.email} />
                            <InfoItem label="Numer telefonu" value={bookingData.phone_number} />
                        </div>
                    </InfoCard>

                     <InfoCard 
                        title="Szczegóły wydarzenia" 
                        icon={<MapPinIcon className="w-7 h-7 mr-3 text-indigo-500" />}
                        actionButton={!isEditing ? editButton : undefined}
                    >
                        {!isEditing ? (
                             <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <InfoItem label="Data ślubu" value={formatDate(bookingData.wedding_date)} />
                                    <div></div>
                                    <InfoItem label="Adres przygotowań Panny Młodej" value={bookingData.bride_address} />
                                    <InfoItem label="Adres przygotowań Pana Młodego" value={bookingData.groom_address} />
                                     <InfoItem label="Lokalizacje (ceremonia, wesele)" value={bookingData.locations} />
                                </div>
                                <InfoItem label="Przybliżony harmonogram dnia" value={bookingData.schedule} />
                                <InfoItem label="Dodatkowe informacje" value={bookingData.additional_info} />
                            </>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <InputField id="bride_address" name="bride_address" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.bride_address} onChange={handleFormChange} />
                                     <InputField id="groom_address" name="groom_address" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groom_address} onChange={handleFormChange} />
                                </div>
                                <TextAreaField id="locations" name="locations" label="Lokalizacje (ceremonia, wesele)" placeholder="Kościół: ..., Sala: ..." value={formData.locations} onChange={handleFormChange} />
                                <TextAreaField id="schedule" name="schedule" label="Przybliżony harmonogram dnia" placeholder="12:00 - Przygotowania..." value={formData.schedule} onChange={handleFormChange} />
                                <TextAreaField id="additional_info" name="additional_info" label="Dodatkowe informacje" placeholder="np. specjalne prośby, nietypowe elementy dnia, informacje o gościach" value={formData.additional_info} onChange={handleFormChange} required={false} />

                                {updateStatus === 'error' && <p className="text-red-600 text-sm">{updateError}</p>}
                                
                                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                                    {updateStatus === 'success' && <div className="flex items-center gap-2 text-green-600 mr-auto"><CheckCircleIcon className="w-5 h-5"/> Zapisano pomyślnie!</div>}
                                    <button onClick={handleCancelEdit} disabled={updateStatus==='loading'} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-200 transition">Anuluj</button>
                                    <button onClick={handleSave} disabled={updateStatus==='loading'} className="bg-indigo-600 w-32 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition flex justify-center items-center">
                                        {updateStatus === 'loading' ? <LoadingSpinner className="w-5 h-5" /> : 'Zapisz zmiany'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </InfoCard>
                </div>
                <div className="lg:col-span-1">
                    <div className="sticky top-8 space-y-8">
                         <InfoCard title="Podsumowanie pakietu" icon={<CalendarDaysIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Wybrany pakiet" value={bookingData.package_name} />
                            <div>
                                <p className="text-sm text-slate-500">Wybrane usługi</p>
                                <ul className="list-disc list-inside mt-1 font-medium">
                                    {bookingData.selected_items.map((item, index) => <li key={index} className="capitalize">{item.replace(/_/g, ' ')}</li>)}
                               </ul>
                            </div>
                         </InfoCard>
                         <InfoCard title="Rozliczenie" icon={<CurrencyDollarIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Status płatności" value={<span className="font-bold">{getPaymentStatusText(bookingData.payment_status)}</span>} />
                            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-2">
                                <InfoItem label="Wpłacono" value={formatCurrency(Number(bookingData.amount_paid))} />
                                <InfoItem label="Pozostało" value={formatCurrency(Number(bookingData.total_price) - Number(bookingData.amount_paid))} />
                            </div>
                             <div className="border-t pt-4 mt-2">
                                <div className="flex justify-between items-baseline">
                                    <p className="text-lg font-bold text-slate-900">Suma</p>
                                    <p className="text-2xl font-bold text-indigo-600">{formatCurrency(Number(bookingData.total_price))}</p>
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
