import React, { useEffect, useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils.ts';
import { LoadingSpinner, InboxStackIcon, TrashIcon } from '../components/Icons.tsx';

interface BookingSummary {
    id: number;
    client_id: string;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    total_price: string;
    created_at: string;
}

const StatCard: FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
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

const AdminBookingsPage: FC = () => {
    const [bookings, setBookings] = useState<BookingSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

     useEffect(() => {
        const fetchBookings = async () => {
            const token = localStorage.getItem('adminAuthToken');
            try {
                const response = await fetch('/api/admin/bookings', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Nie udało się pobrać rezerwacji.');
                }
                const data = await response.json();
                setBookings(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchBookings();
    }, []);

    const handleDeleteBooking = async (bookingId: number) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć rezerwację #${bookingId}? Tej operacji nie można cofnąć.`)) {
            return;
        }

        const token = localStorage.getItem('adminAuthToken');
        setError('');

        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Nie udało się usunąć rezerwacji.');
            }

            setBookings(prev => prev.filter(b => b.id !== bookingId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };


    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 text-center py-20">{error}</p>;

    return (
        <>
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Wszystkie rezerwacje" value={bookings.length} icon={<InboxStackIcon className="w-6 h-6"/>} />
            </section>
            
            <section>
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Ostatnie rezerwacje</h2>
                 <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">ID Rezerwacji</th>
                                    <th scope="col" className="px-6 py-3">ID Klienta</th>
                                    <th scope="col" className="px-6 py-3">Klient</th>
                                    <th scope="col" className="px-6 py-3">Data ślubu</th>
                                    <th scope="col" className="px-6 py-3">Cena</th>
                                    <th scope="col" className="px-6 py-3">Data rezerwacji</th>
                                    <th scope="col" className="px-6 py-3 text-right">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <tr key={booking.id} className="bg-white border-b hover:bg-slate-50">
                                        <th scope="row" className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">#{booking.id}</th>
                                        <td className="px-6 py-4 font-mono">{booking.client_id}</td>
                                        <td className="px-6 py-4"><div>{booking.bride_name}</div><div className="text-xs text-slate-400">{booking.groom_name}</div></td>
                                        <td className="px-6 py-4">{booking.wedding_date ? formatDate(booking.wedding_date) : '-'}</td>
                                        <td className="px-6 py-4 font-semibold">{formatCurrency(Number(booking.total_price))}</td>
                                        <td className="px-6 py-4">{formatDate(booking.created_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => navigate(`/admin/rezerwacje/${booking.id}`)} className="font-medium text-indigo-600 hover:underline">Szczegóły</button>
                                                <button onClick={() => handleDeleteBooking(booking.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń rezerwację">
                                                    <TrashIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {bookings.length === 0 && <p className="text-center p-8 text-slate-500">Nie znaleziono żadnych rezerwacji.</p>}
                 </div>
            </section>
        </>
    );
};

export default AdminBookingsPage;
