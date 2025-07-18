import React, { useState, useEffect, FC, ReactNode } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, UserGroupIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';

interface ClientPanelPageProps {
    navigateTo: (page: Page) => void;
}

interface BookingData {
    id: number;
    client_id: string;
    package_name: string;
    total_price: number;
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

const InfoCard: FC<{title: string; icon?: ReactNode, children: ReactNode}> = ({ title, icon, children }) => (
    <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center mb-4">
            {icon}
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        </div>
        <div className="space-y-3 text-slate-700">{children}</div>
    </div>
);

const InfoItem: FC<{label: string; value?: string | number | null}> = ({ label, value }) => {
    if (!value) return null;
    return (
        <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="font-medium whitespace-pre-wrap">{value}</p>
        </div>
    );
};


const ClientPanelPage: React.FC<ClientPanelPageProps> = ({ navigateTo }) => {
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

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
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
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

                     <InfoCard title="Szczegóły wydarzenia">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoItem label="Data ślubu" value={formatDate(bookingData.wedding_date)} />
                            <InfoItem label="Adres przygotowań Panny Młodej" value={bookingData.bride_address} />
                            <InfoItem label="Adres przygotowań Pana Młodego" value={bookingData.groom_address} />
                             <InfoItem label="Lokalizacje (ceremonia, wesele)" value={bookingData.locations} />
                        </div>
                        <InfoItem label="Przybliżony harmonogram dnia" value={bookingData.schedule} />
                        <InfoItem label="Dodatkowe informacje" value={bookingData.additional_info} />
                    </InfoCard>
                </div>
                <div className="lg:col-span-1">
                    <div className="sticky top-8">
                         <InfoCard title="Podsumowanie pakietu">
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
