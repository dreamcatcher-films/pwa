import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAdminBookings } from '../api.ts';
import { LoadingSpinner, UserGroupIcon } from '../components/Icons.tsx';

interface BookingSummary {
    id: number;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
}

const AdminGuestsPage: FC = () => {
    const navigate = useNavigate();
    const { data: bookings, isLoading, error } = useQuery<BookingSummary[], Error>({ 
        queryKey: ['adminBookingsSummary'], 
        queryFn: getAdminBookings 
    });

    const handleManageClick = (bookingId: number) => {
        navigate(`/admin/rezerwacje/${bookingId}`, { state: { openTab: 'guests' } });
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center">{error.message}</p>;

    return (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Para Młoda</th>
                            <th scope="col" className="px-6 py-3">Data Ślubu</th>
                            <th scope="col" className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bookings && bookings.map(booking => (
                            <tr key={booking.id} className="bg-white border-b hover:bg-slate-50">
                                <td className="px-6 py-4 font-semibold text-slate-900">{booking.bride_name} & {booking.groom_name}</td>
                                <td className="px-6 py-4">{formatDate(booking.wedding_date)}</td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleManageClick(booking.id)} 
                                        className="font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-2 ml-auto"
                                    >
                                        <UserGroupIcon className="w-5 h-5"/>
                                        Zarządzaj listą gości
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {(!bookings || bookings.length === 0) && (
                    <p className="text-center p-8 text-slate-500">Nie znaleziono żadnych rezerwacji.</p>
                )}
            </div>
        </div>
    );
};

export default AdminGuestsPage;
