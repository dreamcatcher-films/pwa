


import React, { useState, useEffect, useRef, FC } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import {
    EngagementRingSpinner, ArrowLeftIcon, UserGroupIcon, MapPinIcon, CalendarDaysIcon, PencilSquareIcon, CheckCircleIcon, PlusCircleIcon, TrashIcon, CurrencyDollarIcon, ChatBubbleLeftRightIcon, PaperClipIcon, XMarkIcon, ChevronDownIcon, EnvelopeIcon, InformationCircleIcon, QuestionMarkCircleIcon, DocumentTextIcon
} from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { InputField, TextAreaField } from '../components/FormControls.tsx';
import {
    getAdminBookingDetails,
    getAdminBookingQuestionnaire,
    uploadContract, getBookingStagesForAdmin, getStages, addStageToBooking,
    updateBookingStageStatus, removeStageFromBooking, getAdminMessages,
    sendAdminMessage, uploadAdminAttachment, markAdminMessagesAsRead,
    updateAdminBooking, updateBookingPayment, resendCredentials,
    getQuestionnaireTemplates, assignQuestionnaireToBooking
} from '../api.ts';
import AdminGuestManager from '../components/admin/GuestManager.tsx';

// --- TYPES ---
interface BookingData { id: number; client_id: string; package_name: string; total_price: string; selected_items: string[]; bride_name: string; groom_name: string; wedding_date: string; bride_address: string; groom_address: string; church_location: string | null; venue_location: string | null; schedule: string; email: string; phone_number: string; additional_info: string | null; discount_code: string | null; access_key: string; created_at: string; payment_status: 'pending' | 'partial' | 'paid'; amount_paid: string; contract_url: string | null; }
interface QuestionnaireResponse { template: { title: string }, questions: { id: number; text: string; type: string }[], answers: Record<string, string>, response: { status: string } }
interface QuestionnaireTemplate { id: number; title: string; }
interface ProductionStage { id: number; name: string; }
interface BookingStage { id: number; name: string; status: 'pending' | 'in_progress' | 'awaiting_approval' | 'completed'; }
interface Message { id: number; sender: 'client' | 'admin'; content: string; created_at: string; attachment_url?: string; attachment_type?: string; }

type EditableBookingData = Pick<BookingData, 'bride_name' | 'groom_name' | 'email' | 'phone_number' | 'wedding_date' | 'bride_address' | 'groom_address' | 'church_location' | 'venue_location' | 'schedule' | 'additional_info'>;
type PaymentData = Pick<BookingData, 'payment_status' | 'amount_paid'>;


// --- MAIN COMPONENT ---
const AdminBookingDetailsPage: React.FC = () => {
    const { bookingId } = useParams<{ bookingId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(location.state?.openTab || 'details');
    const queryClient = useQueryClient();
    const chatEndRef = useRef<HTMLDivElement>(null);
    
    // --- State Management ---
    const [isEditing, setIsEditing] = useState(false);
    const [isPaymentEditing, setIsPaymentEditing] = useState(false);
    const [isChangingQuestionnaire, setIsChangingQuestionnaire] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [newStageId, setNewStageId] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [attachment, setAttachment] = useState<File | null>(null);
    const [contractFile, setContractFile] = useState<File | null>(null);

    // --- Data Queries ---
    const { data: bookingData, isLoading: isLoadingBooking, error: errorBooking } = useQuery<BookingData, Error>({
        queryKey: ['adminBookingDetails', bookingId],
        queryFn: () => getAdminBookingDetails(bookingId!),
    });
    const { data: bookingStages } = useQuery<BookingStage[], Error>({ queryKey: ['bookingStagesForAdmin', bookingId], queryFn: () => getBookingStagesForAdmin(bookingId!), enabled: !!bookingId });
    const { data: allStages } = useQuery<ProductionStage[], Error>({ queryKey: ['allProductionStages'], queryFn: getStages, enabled: !!bookingId });
    const { data: messages } = useQuery<Message[], Error>({ queryKey: ['adminMessages', bookingId], queryFn: () => getAdminMessages(bookingId!), enabled: !!bookingId, refetchInterval: 15000 });
    const { data: questionnaireData, isLoading: isLoadingQuestionnaire } = useQuery<QuestionnaireResponse, Error>({
        queryKey: ['adminBookingQuestionnaire', bookingId],
        queryFn: () => getAdminBookingQuestionnaire(bookingId!),
        enabled: !!bookingId,
    });
    const { data: allQuestionnaires } = useQuery<QuestionnaireTemplate[], Error>({
        queryKey: ['questionnaireTemplates'],
        queryFn: getQuestionnaireTemplates,
    });
    
    // --- Form Hooks ---
    const { register, handleSubmit, reset, formState: { errors } } = useForm<EditableBookingData>();
    const { register: registerPayment, handleSubmit: handleSubmitPayment, reset: resetPayment } = useForm<PaymentData>();

    useEffect(() => {
        if (bookingData) {
            reset(bookingData);
            resetPayment(bookingData);
        }
    }, [bookingData, reset, resetPayment, isEditing, isPaymentEditing]);
    
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    
    // --- Mutations ---
    const updateBookingMutation = useMutation({ mutationFn: (data: any) => updateAdminBooking({ id: bookingId!, data }), onSuccess: () => { setIsEditing(false); queryClient.invalidateQueries({queryKey: ['adminBookingDetails', bookingId]}); }});
    const updatePaymentMutation = useMutation({ mutationFn: (data: any) => updateBookingPayment({ id: bookingId!, data }), onSuccess: () => { setIsPaymentEditing(false); queryClient.invalidateQueries({queryKey: ['adminBookingDetails', bookingId]}); }});
    const addStageMutation = useMutation({ mutationFn: (stage_id: string) => addStageToBooking({ bookingId: bookingId!, stage_id }), onSuccess: () => { setNewStageId(''); queryClient.invalidateQueries({queryKey: ['bookingStagesForAdmin', bookingId]}); }});
    const updateStageStatusMutation = useMutation({ mutationFn: (vars: { stageId: number; status: string }) => updateBookingStageStatus(vars), onSuccess: () => queryClient.invalidateQueries({queryKey: ['bookingStagesForAdmin', bookingId]}) });
    const removeStageMutation = useMutation({ mutationFn: removeStageFromBooking, onSuccess: () => queryClient.invalidateQueries({queryKey: ['bookingStagesForAdmin', bookingId]}) });
    const sendMessageMutation = useMutation({ mutationFn: (data: any) => sendAdminMessage({ bookingId: bookingId!, data }), onSuccess: () => { setNewMessage(''); setAttachment(null); queryClient.invalidateQueries({queryKey:['adminMessages', bookingId]}); }});
    const contractMutation = useMutation({ mutationFn: (file: File) => uploadContract({ bookingId: bookingId!, file }), onSuccess: () => { setContractFile(null); queryClient.invalidateQueries({queryKey: ['adminBookingDetails', bookingId]}); }});
    const assignQuestionnaireMutation = useMutation({
        mutationFn: (templateId: number) => assignQuestionnaireToBooking({ bookingId: bookingId!, templateId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminBookingQuestionnaire', bookingId] });
            setIsChangingQuestionnaire(false);
            setSelectedTemplateId('');
        }
    });

    // --- Handlers ---
    const onSave: SubmitHandler<EditableBookingData> = data => updateBookingMutation.mutate(data);
    const onSavePayment: SubmitHandler<PaymentData> = data => updatePaymentMutation.mutate(data);
    const handleAddStage = () => { if (newStageId) addStageMutation.mutate(newStageId); };
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() && !attachment) return;
        
        let attachmentData = {};
        if (attachment) {
            // Placeholder for attachment upload logic
        }
        sendMessageMutation.mutate({ content: newMessage, ...attachmentData });
    };
    const handleAssignQuestionnaire = () => {
        if (!selectedTemplateId) return;

        if (questionnaireData && !window.confirm('Zmiana szablonu ankiety usunie wszystkie dotychczasowe odpowiedzi klienta. Czy na pewno chcesz kontynuować?')) {
            return;
        }
        assignQuestionnaireMutation.mutate(parseInt(selectedTemplateId, 10));
    };

    if (isLoadingBooking) return <div className="flex justify-center items-center py-20"><EngagementRingSpinner /></div>;
    if (errorBooking) return <div className="text-center py-20"><p className="text-red-500">{errorBooking.message}</p></div>;
    if (!bookingData) return <div className="text-center py-20">Nie znaleziono danych rezerwacji.</div>;

    const getStatusProps = (status: BookingStage['status']) => {
        switch (status) {
            case 'completed': return { text: 'Zakończony', color: 'bg-green-100 text-green-700' };
            case 'awaiting_approval': return { text: 'Oczekuje na akceptację klienta', color: 'bg-amber-100 text-amber-700' };
            case 'in_progress': return { text: 'W toku', color: 'bg-blue-100 text-blue-700' };
            default: return { text: 'Oczekuje', color: 'bg-slate-200 text-slate-600' };
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate('/admin/rezerwacje')} className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900">
                    <ArrowLeftIcon className="w-5 h-5 mr-2" /> Wróć do listy rezerwacji
                </button>
            </div>
             <div className="border-b border-slate-200 mb-8">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        <PencilSquareIcon className="w-5 h-5"/> Szczegóły rezerwacji
                    </button>
                    <button onClick={() => setActiveTab('guests')} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'guests' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        <UserGroupIcon className="w-5 h-5"/> Lista Gości
                    </button>
                     <button onClick={() => setActiveTab('questionnaire')} className={`flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'questionnaire' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        <QuestionMarkCircleIcon className="w-5 h-5"/> Ankieta
                    </button>
                </nav>
            </div>
            
            {activeTab === 'details' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <main className="lg:col-span-2 space-y-8">
                        <InfoCard title="Etapy Produkcji">
                           <div className="space-y-3">
                                {bookingStages?.map(stage => (
                                    <div key={stage.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusProps(stage.status).color}`}>{getStatusProps(stage.status).text}</span>
                                            <p className="font-medium text-slate-800">{stage.name}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <select value={stage.status} onChange={e => updateStageStatusMutation.mutate({ stageId: stage.id, status: e.target.value })} className="text-xs rounded-md border-slate-300">
                                                <option value="pending">Oczekuje</option>
                                                <option value="in_progress">W toku</option>
                                                <option value="awaiting_approval">Do akceptacji</option>
                                                <option value="completed">Zakończony</option>
                                            </select>
                                            <button onClick={() => removeStageMutation.mutate(stage.id)} className="p-1 text-slate-400 hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 pt-4 border-t">
                                <select value={newStageId} onChange={e => setNewStageId(e.target.value)} className="flex-grow rounded-md border-slate-300 text-sm">
                                    <option value="">-- Wybierz etap do dodania --</option>
                                    {allStages?.filter(s => !bookingStages?.some(bs => bs.name === s.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <button onClick={handleAddStage} disabled={!newStageId || addStageMutation.isPending} className="bg-slate-200 font-semibold px-4 py-2 rounded-lg text-sm">Dodaj</button>
                            </div>
                        </InfoCard>
                        
                        <InfoCard title="Ankieta" icon={<QuestionMarkCircleIcon className="w-7 h-7 mr-3 text-indigo-500"/>}>
                            {isLoadingQuestionnaire ? (
                                <EngagementRingSpinner />
                            ) : !questionnaireData && !isChangingQuestionnaire ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-slate-500">Do tej rezerwacji nie przypisano żadnej ankiety.</p>
                                    <div className="flex gap-2 pt-2">
                                        <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="flex-grow rounded-md border-slate-300 text-sm">
                                            <option value="">-- Wybierz szablon --</option>
                                            {allQuestionnaires?.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                                        </select>
                                        <button onClick={handleAssignQuestionnaire} disabled={!selectedTemplateId || assignQuestionnaireMutation.isPending} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm flex items-center justify-center w-28">
                                            {assignQuestionnaireMutation.isPending ? <EngagementRingSpinner className="w-5 h-5" /> : 'Przypisz'}
                                        </button>
                                    </div>
                                </div>
                            ) : isChangingQuestionnaire || !questionnaireData ? (
                                 <div className="space-y-3">
                                    <p className="text-sm text-slate-500">{questionnaireData ? 'Wybierz nowy szablon ankiety. Uwaga: spowoduje to usunięcie istniejących odpowiedzi klienta.' : 'Wybierz szablon ankiety do przypisania.'}</p>
                                    <div className="flex gap-2 pt-2">
                                        <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="flex-grow rounded-md border-slate-300 text-sm">
                                            <option value="">-- Wybierz szablon --</option>
                                            {allQuestionnaires?.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                                        </select>
                                        <button onClick={() => setIsChangingQuestionnaire(false)} className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm">Anuluj</button>
                                        <button onClick={handleAssignQuestionnaire} disabled={!selectedTemplateId || assignQuestionnaireMutation.isPending} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm flex items-center justify-center w-28">
                                            {assignQuestionnaireMutation.isPending ? <EngagementRingSpinner className="w-5 h-5" /> : 'Zaktualizuj'}
                                        </button>
                                    </div>
                                 </div>
                            ) : (
                                <div>
                                    <InfoItem label="Przypisany szablon" value={questionnaireData.template.title} />
                                    <InfoItem label="Status odpowiedzi" value={questionnaireData.response.status === 'submitted' ? 'Wysłana' : 'Oczekuje na wypełnienie'} />
                                    <div className="mt-4 pt-4 border-t">
                                        <button onClick={() => setIsChangingQuestionnaire(true)} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Zmień ankietę</button>
                                    </div>
                                </div>
                            )}
                            {assignQuestionnaireMutation.isError && <p className="text-red-500 text-xs mt-2">{assignQuestionnaireMutation.error.message}</p>}
                        </InfoCard>

                        <InfoCard title="Wiadomości" icon={<ChatBubbleLeftRightIcon className="w-7 h-7 mr-3 text-indigo-500"/>}>
                           <div className="flex flex-col h-[500px]">
                                <div className="flex-grow p-4 space-y-4 overflow-y-auto bg-slate-50 rounded-lg">
                                    {messages?.map(msg => (
                                        <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-xs p-3 rounded-lg ${msg.sender === 'admin' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-800'}`}>
                                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                <p className={`text-xs mt-1 ${msg.sender === 'admin' ? 'text-indigo-200' : 'text-slate-400'}`}>{new Date(msg.created_at).toLocaleString('pl-PL')}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <footer className="pt-4 border-t">
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
                        </InfoCard>

                        <InfoCard title="Dane Klienta i Wydarzenia" actionButton={
                            !isEditing && <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800"><PencilSquareIcon className="w-5 h-5"/> Edytuj</button>
                        }>
                           {isEditing ? (
                               <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <InputField id="bride_name" label="Panna Młoda" register={register('bride_name')} />
                                        <InputField id="groom_name" label="Pan Młody" register={register('groom_name')} />
                                        <InputField id="email" label="E-mail" type="email" register={register('email')} />
                                        <InputField id="phone_number" label="Telefon" type="tel" register={register('phone_number')} />
                                        <InputField id="wedding_date" label="Data ślubu" type="date" register={register('wedding_date')} />
                                    </div>
                                    <InputField id="bride_address" label="Adres przygotowań Panny Młodej" register={register('bride_address')} />
                                    <InputField id="groom_address" label="Adres przygotowań Pana Młodego" register={register('groom_address')} />
                                    <InputField id="church_location" label="Adres ceremonii" register={register('church_location')} />
                                    <InputField id="venue_location" label="Adres przyjęcia" register={register('venue_location')} />
                                    <TextAreaField id="schedule" label="Harmonogram" register={register('schedule')} rows={4} />
                                    <TextAreaField id="additional_info" label="Dodatkowe informacje" register={register('additional_info')} rows={3} />
                                   <div className="flex justify-end gap-3 pt-4 border-t">
                                       <button type="button" onClick={() => setIsEditing(false)} className="bg-slate-100 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                                       <button type="submit" disabled={updateBookingMutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Zapisz zmiany</button>
                                   </div>
                               </form>
                           ) : (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                   <InfoItem label="Para Młoda" value={`${bookingData.bride_name} & ${bookingData.groom_name}`} />
                                   <InfoItem label="Data ślubu" value={new Date(bookingData.wedding_date).toLocaleDateString('pl-PL')} />
                                   <InfoItem label="E-mail" value={bookingData.email} />
                                   <InfoItem label="Telefon" value={bookingData.phone_number} />
                                   <InfoItem label="Adres przygotowań Panny Młodej" value={bookingData.bride_address} />
                                   <InfoItem label="Adres przygotowań Pana Młodego" value={bookingData.groom_address} />
                                   <InfoItem label="Adres ceremonii" value={bookingData.church_location} />
                                   <InfoItem label="Adres przyjęcia" value={bookingData.venue_location} />
                                   <div className="md:col-span-2"><InfoItem label="Harmonogram" value={bookingData.schedule} /></div>
                                   <div className="md:col-span-2"><InfoItem label="Dodatkowe informacje" value={bookingData.additional_info} /></div>
                               </div>
                           )}
                        </InfoCard>

                        <InfoCard title="Umowa" icon={<DocumentTextIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                           <div className="space-y-4">
                                {bookingData.contract_url ? (
                                    <div>
                                        <p className="text-sm text-slate-600 mb-2">Umowa została załączona. Klient ma do niej dostęp w swoim panelu.</p>
                                        <a 
                                            href={bookingData.contract_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700"
                                        >
                                           <DocumentTextIcon className="w-5 h-5"/>
                                            Zobacz/Pobierz umowę
                                        </a>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">Brak załączonej umowy.</p>
                                )}
                                <div className="pt-4 border-t">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{bookingData.contract_url ? 'Załącz nową wersję (zastąpi obecną)' : 'Załącz umowę (PDF)'}</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="file" 
                                            onChange={(e) => setContractFile(e.target.files ? e.target.files[0] : null)} 
                                            accept="application/pdf"
                                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        />
                                        <button 
                                            onClick={() => contractFile && contractMutation.mutate(contractFile)}
                                            disabled={!contractFile || contractMutation.isPending}
                                            className="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 disabled:opacity-50 flex-shrink-0"
                                        >
                                            {contractMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Wyślij'}
                                        </button>
                                    </div>
                                    {contractMutation.isError && <p className="text-red-500 text-xs mt-1">{contractMutation.error.message}</p>}
                                </div>
                            </div>
                        </InfoCard>
                    </main>

                    <aside className="lg:col-span-1 space-y-8">
                         <InfoCard title="Szczegóły Pakietu">
                           <InfoItem label="Nazwa pakietu" value={bookingData.package_name} />
                           <div>
                                <p className="text-sm text-slate-500">Wybrane elementy</p>
                                <ul className="list-disc list-inside text-sm mt-1">
                                    {bookingData.selected_items.map((item, index) => <li key={index}>{item}</li>)}
                                </ul>
                            </div>
                        </InfoCard>
                        <InfoCard title="Płatności" actionButton={
                            !isPaymentEditing && <button onClick={() => setIsPaymentEditing(true)} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800"><PencilSquareIcon className="w-5 h-5"/> Edytuj</button>
                        }>
                             {isPaymentEditing ? (
                                <form onSubmit={handleSubmitPayment(onSavePayment)} className="space-y-4">
                                   <InputField id="amount_paid" label="Wpłacona kwota" type="number" step="0.01" register={registerPayment('amount_paid')} />
                                    <div>
                                        <label htmlFor="payment_status" className="block text-sm font-medium text-slate-700">Status płatności</label>
                                        <select id="payment_status" {...registerPayment('payment_status')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                                            <option value="pending">Oczekuje na płatność</option>
                                            <option value="partial">Częściowo opłacone</option>
                                            <option value="paid">Opłacono w całości</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t">
                                        <button type="button" onClick={() => setIsPaymentEditing(false)} className="bg-slate-100 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                                        <button type="submit" disabled={updatePaymentMutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Zapisz</button>
                                    </div>
                                </form>
                            ) : (
                                 <div className="space-y-2">
                                     <InfoItem label="Cena końcowa" value={formatCurrency(Number(bookingData.total_price))} />
                                     <InfoItem label="Wpłacono" value={formatCurrency(Number(bookingData.amount_paid))} />
                                     <InfoItem label="Do zapłaty" value={formatCurrency(Number(bookingData.total_price) - Number(bookingData.amount_paid))} />
                                     <InfoItem label="Status" value={bookingData.payment_status} />
                                 </div>
                            )}
                        </InfoCard>
                    </aside>
                </div>
            )}
            
            {activeTab === 'guests' && bookingId && <AdminGuestManager bookingId={bookingId} />}
            
            {activeTab === 'questionnaire' && (
                 <div className="mt-8 bg-white rounded-2xl shadow p-6">
                    {isLoadingQuestionnaire ? <EngagementRingSpinner/> : questionnaireData ? (
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{questionnaireData.template.title}</h2>
                            <p className="text-sm text-slate-500 mb-4 pb-4 border-b">Status: <span className="font-semibold">{questionnaireData.response.status === 'submitted' ? 'Wysłana' : 'W trakcie'}</span></p>
                            <div className="space-y-4">
                                {questionnaireData.questions.map(q => (
                                    <div key={q.id}>
                                        <p className="font-semibold text-slate-700">{q.text}</p>
                                        <p className="text-slate-900 bg-slate-50 p-2 rounded-md mt-1 whitespace-pre-wrap">{questionnaireData.answers[q.id] || <i className="text-slate-400">Brak odpowiedzi</i>}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <p className="text-center text-slate-500">Klient nie wypełnił jeszcze ankiety.</p>}
                </div>
            )}
        </div>
    );
};

export default AdminBookingDetailsPage;
