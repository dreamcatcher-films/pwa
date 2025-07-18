import React, { useState, useEffect } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, ArrowLeftIcon, UserGroupIcon, MapPinIcon, CalendarDaysIcon, PencilSquareIcon, CheckCircleIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InfoCard, InfoItem } from '../components/InfoCard.tsx';
import { InputField, TextAreaField } from '../components/FormControls.tsx';

interface AdminBookingDetailsPageProps {
    navigateTo: (page: Page) => void;
    bookingId: number;
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
    discount_code: string | null;
    access_key: string;
    created_at: string;
}

const AdminBookingDetailsPage: React.FC<AdminBookingDetailsPageProps> = ({ navigateTo, bookingId }) => {
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<BookingData | null>(null);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [updateError, setUpdateError] = useState('');
    
    useEffect(() => {
        const fetchBookingDetails = async () => {
            const token = localStorage.getItem('adminAuthToken');
            if (!token) {
                navigateTo('adminLogin');
                return;
            }

            const apiUrl = import.meta.env.VITE_API_URL;
            try {
                const response = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401 || response.status === 403) {
                     localStorage.removeItem('adminAuthToken');
                     navigateTo('adminLogin');
                     return;
                }
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać szczegółów rezerwacji.');
                }
                setBookingData(data);
                setFormData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchBookingDetails();
    }, [navigateTo, bookingId]);

    const handleBack = () => navigateTo('adminDashboard');

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (formData) {
            setFormData({ ...formData, [e.target.id]: e.target.value });
        }
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
        const token = localStorage.getItem('adminAuthToken');
        const apiUrl = import.meta.env.VITE_API_URL;

        if (!formData) {
            setUpdateError('Brak danych do zapisu.');
            setUpdateStatus('error');
            return;
        }

        try {
            const response = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}`, {
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
            setBookingData(result.booking);
            setFormData(result.booking);
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
                <button onClick={handleBack} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Wróć do panelu</button>
            </div>
        );
    }
    
    if (!bookingData || !formData) {
        return <div className="text-center py-20">Nie znaleziono danych rezerwacji.</div>;
    }

    const formatDateForDisplay = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formatDateForInput = (dateString: string) => dateString.split('T')[0];

    return (
        <div>
            <header className="relative mb-10">
                <div className="flex justify-between items-start">
                    <div>
                        <button 
                            onClick={handleBack} 
                            className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group mb-4">
                            <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                            Wróć do panelu
                        </button>
                        <div className="text-center sm:text-left">
                            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Szczegóły rezerwacji #{bookingData.id}</h1>
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
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg bg-indigo-50"
                            >
                                <PencilSquareIcon className="w-5 h-5" />
                                Edytuj rezerwację
                            </button>
                        )}
                    </div>
                </div>
            </header>
            
            {updateStatus === 'error' && <p className="text-red-600 text-sm bg-red-100 p-3 rounded-lg mb-4">{updateError}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <InfoCard title="Dane Klienta" icon={<UserGroupIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                        {isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InputField id="bride_name" label="Panna Młoda" value={formData.bride_name} onChange={handleFormChange} />
                                <InputField id="groom_name" label="Pan Młody" value={formData.groom_name} onChange={handleFormChange} />
                                <InputField id="email" label="Adres e-mail" type="email" value={formData.email} onChange={handleFormChange} />
                                <InputField id="phone_number" label="Numer telefonu" type="tel" value={formData.phone_number} onChange={handleFormChange} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InfoItem label="Panna Młoda" value={bookingData.bride_name} />
                                <InfoItem label="Pan Młody" value={bookingData.groom_name} />
                                <InfoItem label="Adres e-mail" value={bookingData.email} />
                                <InfoItem label="Numer telefonu" value={bookingData.phone_number} />
                                <InfoItem label="ID Klienta (do logowania)" value={bookingData.client_id} />
                                <InfoItem label="Data utworzenia rezerwacji" value={formatDateForDisplay(bookingData.created_at)} />
                            </div>
                        )}
                    </InfoCard>

                    <InfoCard title="Szczegóły Wydarzenia" icon={<MapPinIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                        {isEditing ? (
                            <div className="space-y-6">
                                <InputField id="wedding_date" label="Data ślubu" type="date" value={formatDateForInput(formData.wedding_date)} onChange={handleFormChange} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField id="bride_address" label="Adres przygotowań Panny Młodej" value={formData.bride_address} onChange={handleFormChange} />
                                    <InputField id="groom_address" label="Adres przygotowań Pana Młodego" value={formData.groom_address} onChange={handleFormChange} />
                                </div>
                                <TextAreaField id="locations" label="Lokalizacje (ceremonia, wesele)" value={formData.locations} onChange={handleFormChange} />
                                <TextAreaField id="schedule" label="Przybliżony harmonogram dnia" value={formData.schedule} onChange={handleFormChange} />
                                <TextAreaField id="additional_info" label="Dodatkowe informacje od klienta" value={formData.additional_info || ''} onChange={handleFormChange} required={false} />
                            </div>
                        ) : (
                             <>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <InfoItem label="Data ślubu" value={new Date(bookingData.wedding_date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })} />
                                     <div></div>
                                    <InfoItem label="Adres przygotowań Panny Młodej" value={bookingData.bride_address} />
                                    <InfoItem label="Adres przygotowań Pana Młodego" value={bookingData.groom_address} />
                                 </div>
                                 <InfoItem label="Lokalizacje (ceremonia, wesele)" value={bookingData.locations} />
                                 <InfoItem label="Przybliżony harmonogram dnia" value={bookingData.schedule} />
                                 <InfoItem label="Dodatkowe informacje od klienta" value={bookingData.additional_info} />
                             </>
                        )}
                    </InfoCard>
                </div>

                 <div className="lg:col-span-1">
                    <div className="sticky top-8 space-y-8">
                         <InfoCard title="Pakiet i Wycena" icon={<CalendarDaysIcon className="w-7 h-7 mr-3 text-indigo-500" />}>
                            <InfoItem label="Wybrany pakiet" value={bookingData.package_name} />
                            <InfoItem 
                                label="Wybrane usługi" 
                                value={<ul className="list-disc list-inside mt-1 font-medium">{bookingData.selected_items.map((item, index) => <li key={index} className="capitalize">{item.replace(/_/g, ' ')}</li>)}</ul>} 
                            />
                            <InfoItem label="Użyty kod rabatowy" value={bookingData.discount_code} />
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

export default AdminBookingDetailsPage;
