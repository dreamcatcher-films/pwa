

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, UserGroupIcon, PencilSquareIcon, CheckCircleIcon, ClockIcon, ChatBubbleLeftRightIcon, ChevronDownIcon, MapPinIcon, QuestionMarkCircleIcon, DocumentTextIcon, CalendarDaysIcon, EnvelopeIcon, PhoneIcon, Squares2X2Icon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { getClientPanelData, updateMyBooking, approveBookingStage, sendClientMessage, markMessagesAsRead } from '../api.ts';
import CountdownTimer from '../components/CountdownTimer.tsx';
import ClientPanelHero from '../components/ClientPanelHero.tsx';
import GuestManager from '../components/client/GuestManager.tsx';
import Questionnaire from '../components/client/Questionnaire.tsx';
import Contract from '../components/client/Contract.tsx';

// --- TYPES ---
interface EditableBookingData {
    bride_name: string;
    groom_name: string;
    email: string;
    phone_number: string;
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
    contract_url: string | null;
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

type ActiveTab = 'details' | 'guests' | 'questionnaire' | 'contract';

const TABS = [
    { id: 'details', label: 'Szczegóły rezerwacji', icon: <PencilSquareIcon className="w-5 h-5"/> },
    { id: 'guests', label: 'Lista Gości', icon: <UserGroupIcon className="w-5 h-5"/> },
    { id: 'questionnaire', label: 'Ankieta i Moodboard', icon: <QuestionMarkCircleIcon className="w-5 h-5"/> },
    { id: 'contract', label: 'Umowa', icon: <DocumentTextIcon className="w-5 h-5"/> }
];

// --- MAIN COMPONENT ---
const ClientPanelPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('details');
    const [isEditing, setIsEditing] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
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
            queryClient.clear();
            navigate('/logowanie');
        }
    }, [error, navigate, queryClient]);
    
     useEffect(() => {
        if (data?.booking) {
            const defaultValues = {
                bride_name: data.booking.bride_name || '',
                groom_name: data.booking.groom_name || '',
                email: data.booking.email || '',
                phone_number: data.booking.phone_number || '',
                bride_address: data.booking.bride_address || '',
                groom_address: data.booking.groom_address || '',
                church_location: data.booking.church_location || '',
                venue_location: data.booking.venue_location || '',
                schedule: data.booking.schedule || '',
                additional_info: data.booking.additional_info || '',
            };
            reset(defaultValues);
        }
    }, [data?.booking, reset, isEditing]);

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
        queryClient.clear(); // Clear cache to ensure fresh data for next user
        navigate('/');
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
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

    const handleTabClick = (tabId: ActiveTab) => {
        setActiveTab(tabId);
        setIsMobileMenuOpen(false);
    };
    
    if (isLoading || !data) return <div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>;
    
    const { booking, stages, messages, unreadCount, questionnaire } = data;
    
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
            
            {/* Desktop Tabs */}
            <div className="mt-8 border-b border-slate-200">
                <nav className="hidden md:flex -mb-px space-x-8" aria-label="Tabs">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => handleTabClick(tab.id as ActiveTab)} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === 'details' && (
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
                        
                        <InfoCard 
                            title="Dane kontaktowe i szczegóły wydarzenia" 
                            icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500" />}
                            actionButton={
                                isEditing ? (
                                    <div className="flex items-center gap-2">
                                        {updateBookingMutation.isSuccess && <div className="flex items-center gap-2 text-green-600 text-sm mr-2"><CheckCircleIcon className="w-5 h-5"/> Zapisano!</div>}
                                        <button onClick={handleCancelEdit} disabled={updateBookingMutation.isPending} className="bg-slate-100 text-slate-800 font-bold py-1 px-3 rounded-lg text-sm">Anuluj</button>
                                        <button onClick={handleSubmit(onSave)} disabled={updateBookingMutation.isPending} className="bg-indigo-600 text-white font-bold py-1 px-3 rounded-lg text-sm flex items-center justify-center w-24">
                                            {updateBookingMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zapisz'}
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                                        <PencilSquareIcon className="w-5 h-5" /> Edytuj informacje
                                    </button>
                                )
                            }
                        >
                            {isEditing ? (
                                <form onSubmit={handleSubmit(onSave)} className="space-y-6">
                                    <div>
                                        <h4 className="text-md font-semibold text-slate-800 mb-2">Dane Pary Młodej i Kontakt</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <InputField id="bride_name" label="Imię i nazwisko Panny Młodej" register={register('bride_name')} error={errors.bride_name} />
                                            <InputField id="groom_name" label="Imię i nazwisko Pana Młodego" register={register('groom_name')} error={errors.groom_name} />
                                            <InputField id="email" label="E-mail kontaktowy" type="email" register={register('email')} error={errors.email} />
                                            <InputField id="phone_number" label="Numer telefonu" type="tel" register={register('phone_number')} error={errors.phone_number} />
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t">
                                        <h4 className="text-md font-semibold text-slate-800 mb-2">Szczegóły Wydarzenia</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <InputField id="bride_address" label="Adres przygotowań Panny Młodej" register={register('bride_address')} error={errors.bride_address} />
                                            <InputField id="groom_address" label="Adres przygotowań Pana Młodego" register={register('groom_address')} error={errors.groom_address} />
                                            <InputField id="church_location" label="Adres ceremonii" register={register('church_location')} error={errors.church_location} />
                                            <InputField id="venue_location" label="Adres przyjęcia" register={register('venue_location')} error={errors.venue_location} />
                                        </div>
                                        <div className="mt-4">
                                            <TextAreaField id="schedule" label="Przybliżony harmonogram dnia" register={register('schedule')} error={errors.schedule} rows={4} />
                                        </div>
                                        <div className="mt-4">
                                            <TextAreaField id="additional_info" label="Dodatkowe informacje" register={register('additional_info')} error={errors.additional_info} rows={3} required={false} />
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    <InfoItem label="Panna Młoda" value={booking.bride_name} />
                                    <InfoItem label="Pan Młody" value={booking.groom_name} />
                                    <InfoItem label="E-mail kontaktowy" value={booking.email} />
                                    <InfoItem label="Numer telefonu" value={booking.phone_number} />
                                     <div className="md:col-span-2">
                                        <InfoItem 
                                            label="Data ślubu" 
                                            value={new Date(booking.wedding_date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' })} 
                                        />
                                    </div>
                                    <div className="md:col-span-2 pt-4 mt-4 border-t">
                                        <InfoItem label="Adres przygotowań Panny Młodej" value={booking.bride_address} />
                                    </div>
                                    <InfoItem label="Adres przygotowań Pana Młodego" value={booking.groom_address} />
                                    <InfoItem label="Adres ceremonii" value={booking.church_location} />
                                    <InfoItem label="Adres przyjęcia" value={booking.venue_location} />
                                    <div className="md:col-span-2">
                                        <InfoItem label="Przybliżony harmonogram dnia" value={booking.schedule} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <InfoItem label="Dodatkowe informacje" value={booking.additional_info} />
                                    </div>
                                </div>
                            )}
                        </InfoCard>
                    </main>
                    <aside className="lg:col-span-1">
                        <div className="sticky top-28 space-y-8">
                            <CountdownTimer targetDate={booking.wedding_date} />
                            <InfoCard title="Płatności">
                                <InfoItem label="Wybrany pakiet" value={booking.package_name} />
                                {booking.discount_code && <InfoItem label="Kod rabatowy" value={booking.discount_code} />}
                                <div className="border-t pt-4 mt-4">
                                    <InfoItem label="Cena końcowa" value={formatCurrency(Number(booking.total_price))} />
                                    <InfoItem label="Wpłacono" value={formatCurrency(Number(booking.amount_paid))} />
                                    <div className="mt-2 pt-2 border-t">
                                        <InfoItem 
                                            label="Pozostało do zapłaty" 
                                            value={<span className="font-bold text-xl text-indigo-600">{formatCurrency(Number(booking.total_price) - Number(booking.amount_paid))}</span>}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">Status: <span className="font-semibold">{getPaymentStatusText(booking.payment_status)}</span></p>
                                </div>
                            </InfoCard>
                        </div>
                    </aside>
                </div>
            )}

            {activeTab === 'guests' && <div className="mt-8"><GuestManager /></div>}
            {activeTab === 'questionnaire' && <div className="mt-8"><Questionnaire questionnaire={questionnaire} /></div>}
            {activeTab === 'contract' && <div className="mt-8"><Contract contractUrl={booking.contract_url} /></div>}

            {/* Chat Bubble */}
            <div className="fixed bottom-6 right-6 z-40 md:hidden">
                <button onClick={handleToggleChat} className="relative bg-indigo-600 text-white rounded-full p-4 shadow-lg hover:bg-indigo-700 transition-transform hover:scale-110">
                    <ChatBubbleLeftRightIcon className="w-8 h-8"/>
                    {unreadCount?.count > 0 && !isChatOpen && (
                        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold ring-2 ring-white">
                            {unreadCount.count}
                        </span>
                    )}
                </button>
            </div>
            
            <div className="fixed bottom-6 right-28 z-40 hidden md:block">
                 <button onClick={handleToggleChat} className="relative bg-indigo-600 text-white rounded-full p-4 shadow-lg hover:bg-indigo-700 transition-transform hover:scale-110">
                    <ChatBubbleLeftRightIcon className="w-8 h-8"/>
                    {unreadCount?.count > 0 && !isChatOpen && (
                        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold ring-2 ring-white">
                            {unreadCount.count}
                        </span>
                    )}
                </button>
            </div>

            {/* Chat Window */}
            {isChatOpen && (
                <div className="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl flex flex-col h-[60vh] max-h-[600px] animate-slide-in-bottom">
                    <header className="p-4 bg-slate-100 rounded-t-2xl border-b flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Czat z nami</h3>
                        <button onClick={handleToggleChat} className="p-1 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-200"><ChevronDownIcon className="w-6 h-6"/></button>
                    </header>
                    <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs p-3 rounded-lg ${msg.sender === 'client' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    <p className={`text-xs mt-1 ${msg.sender === 'client' ? 'text-indigo-200' : 'text-slate-400'}`}>{formatMessageDate(msg.created_at)}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <footer className="p-4 border-t">
                        <form onSubmit={handleSendMessage} className="flex gap-2">
                            <input 
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Napisz wiadomość..."
                                className="flex-grow p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                disabled={sendMessageMutation.isPending}
                            />
                            <button type="submit" disabled={sendMessageMutation.isPending || !newMessage.trim()} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300">
                                Wyślij
                            </button>
                        </form>
                    </footer>
                </div>
            )}

            {/* Mobile FAB Menu */}
            <div className="md:hidden fixed bottom-6 right-6 z-40">
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="bg-brand-dark-green text-white rounded-full p-4 shadow-lg hover:bg-opacity-90 transition-transform hover:scale-110"
                    aria-label="Otwórz menu nawigacji"
                >
                    <Squares2X2Icon className="w-8 h-8"/>
                </button>
            </div>

            {/* Mobile Menu Panel */}
            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="bg-white rounded-t-2xl shadow-2xl p-4 animate-slide-in-bottom" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4"></div>
                        <nav className="space-y-2">
                            {TABS.map(tab => (
                                <button key={tab.id} onClick={() => handleTabClick(tab.id as ActiveTab)} className={`w-full flex items-center gap-3 p-4 rounded-lg text-left text-lg font-semibold ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-100'}`}>
                                    {React.cloneElement(tab.icon, { className: `w-6 h-6 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-500'}` })}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientPanelPage;
