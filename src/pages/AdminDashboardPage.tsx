import React, { useEffect, useState, FC, ReactNode } from 'react';
import { Page } from '../App.tsx';
import { formatCurrency } from '../utils.ts';
import { LoadingSpinner, InboxStackIcon } from '../components/Icons.tsx';

interface AdminDashboardPageProps {
    navigateTo: (page: Page) => void;
}

interface BookingSummary {
    id: number;
    client_id: string;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    total_price: string;
    created_at: string;
}

const StatCard: FC<{ title: string; value: string | number; icon: ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white rounded-2xl shadow p-6 flex items-center">
        <div className="bg-indigo-100 text-indigo-600 rounded-full p-3 mr-4">
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);


const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo }) => {
    const [bookings, setBookings] = useState<BookingSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigateTo('adminLogin');
            return;
        }

        const fetchBookings = async () => {
            const apiUrl = import.meta.env.VITE_API_URL;
            try {
                const response = await fetch(`${apiUrl}/api/admin/bookings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401 || response.status === 403) {
                     localStorage.removeItem('adminAuthToken');
                     navigateTo('adminLogin');
                     return;
                }

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać rezerwacji.');
                }
                setBookings(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchBookings();
    }, [navigateTo]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigateTo('home');
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    if (isLoading) {
        return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    }

    if (error) {
        return (
             <div className="text-center py-20">
                <p className="text-red-500">{error}</p>
                <button onClick={handleLogout} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Wyloguj się</button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-10">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Wszystkie rezerwacje" value={bookings.length} icon={<InboxStackIcon className="w-6 h-6"/>} />
                {/* Future stat cards can go here */}
            </section>
            
            <section>
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Ostatnie rezerwacje</h2>
                 <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">ID Rezerwacji</th>
                                    <th scope="col" className="px-6 py-3">Klient</th>
                                    <th scope="col" className="px-6 py-3">Data ślubu</th>
                                    <th scope="col" className="px-6 py-3">Cena</th>
                                    <th scope="col" className="px-6 py-3">Data rezerwacji</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <tr key={booking.id} className="bg-white border-b hover:bg-slate-50">
                                        <th scope="row" className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                                            #{booking.id}
                                        </th>
                                        <td className="px-6 py-4">
                                            <div>{booking.bride_name}</div>
                                            <div className="text-xs text-slate-400">{booking.groom_name}</div>
                                        </td>
                                        <td className="px-6 py-4">{formatDate(booking.wedding_date)}</td>
                                        <td className="px-6 py-4 font-semibold">{formatCurrency(Number(booking.total_price))}</td>
                                        <td className="px-6 py-4">{formatDate(booking.created_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <a href="#" className="font-medium text-indigo-600 hover:underline">Szczegóły</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {bookings.length === 0 && <p className="text-center p-8 text-slate-500">Nie znaleziono żadnych rezerwacji.</p>}
                 </div>
            </section>
        </div>
    );
};

export default AdminDashboardPage;
