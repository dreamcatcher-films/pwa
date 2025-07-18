import React, { useState, useEffect, FC, ReactNode } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, UserGroupIcon, PencilSquareIcon, CalendarDaysIcon, MapPinIcon, CheckCircleIcon } from '../components/Icons.tsx';
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
}

interface EditableBookingData {
    bride_address: string;
    groom_address: string;
    locations: string;
    schedule: string;
    additional_info: string;
}

const ClientPanelPage: React.FC<ClientPanelPageProps> = ({ navigateTo }) => {
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<EditableBookingData>({ bride_address: '', groom_address: '', locations: '', schedule: '', additional_info: '' });
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [updateError, setUpdateError] = useState('');

    useEffect(() => {
        const fetchBookingData = async () => {
            const token = localStorage.getItem('authToken');
            if (!token) {
                navigateTo('login');
                return;
            }

            const apiUrl = import.meta.env.VITE_API_URL;

            try {
                const response = await fetch(`${apiUrl}/api/my-booking`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401 || response.status === 403) {
                     localStorage.removeItem('authToken');
                     navigateTo('login');
                     return;
                }

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać danych rezerwacji.');
                }
                setBookingData(data);
                setFormData({
                    bride_address: data.bride_address || '',
                    groom_address: data.groom_address || '',
                    locations: data.locations || '',
                    schedule: data.schedule || '',
                    additional_info: data.additional_info || '',
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchBookingData();
    }, [navigateTo]);
    
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
        const token = localStorage.getItem('authToken');
        const apiUrl = import.meta.env.VITE_API_URL;

        try {
            const response = await fetch(`${apiUrl}/api/my-booking`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if(!response.ok) {
                throw new Error(result.message || 'Błąd zapisu danych.');
            }
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

    const editButton = (
        <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
            <PencilSquareIcon className="w-5 h-5" />
            Edytuj dane
        </button>
    );

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
                                     <InputField id="bride_address" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.bride_address} onChange={handleFormChange} />
                                     <InputField id="groom_address" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groom_address} onChange={handleFormChange} />
                                </div>
                                <TextAreaField id="locations" label="Lokalizacje (ceremonia, wesele)" placeholder="Kościół: ..., Sala: ..." value={formData.locations} onChange={handleFormChange} />
                                <TextAreaField id="schedule" label="Przybliżony harmonogram dnia" placeholder="12:00 - Przygotowania..." value={formData.schedule} onChange={handleFormChange} />
                                <TextAreaField id="additional_info" label="Dodatkowe informacje" placeholder="np. specjalne prośby, nietypowe elementy dnia, informacje o gościach" value={formData.additional_info} onChange={handleFormChange} required={false} />

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
                    <div className="sticky top-8">
                         <InfoCard title="Podsumowanie pakietu" icon={<CalendarDaysIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Wybrany pakiet" value={bookingData.package_name} />
                            <div>
                                <p className="text-sm text-slate-500">Wybrane usługi</p>
                                <ul className="list-disc list-inside mt-1 font-medium">
                                    {bookingData.selected_items.map((item, index) => <li key={index} className="capitalize">{item.replace(/_/g, ' ')}</li>)}
                               </ul>
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
