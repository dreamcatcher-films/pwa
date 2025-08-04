
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { EngagementRingSpinner, CheckCircleIcon, MapPinIcon, CalendarDaysIcon } from '../components/Icons.tsx';

// --- TYPES ---
interface Guest {
    id: number;
    name: string;
    rsvp_status: 'pending' | 'confirmed' | 'declined';
    notes: string | null;
}
interface Booking {
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    church_location: string | null;
    venue_location: string | null;
    couple_photo_url: string | null;
}
interface RsvpData {
    guest: Guest;
    booking: Booking;
}
type RsvpStatus = 'confirmed' | 'declined';

// --- API (move to api.ts if grows) ---
const fetchRsvpData = async (token: string): Promise<RsvpData> => {
    const res = await fetch(`/api/public/rsvp/${token}`);
    if (!res.ok) throw new Error('Nie znaleziono zaproszenia lub jest ono nieprawidłowe.');
    return res.json();
};
const submitRsvp = async ({ token, status, notes }: { token: string, status: RsvpStatus, notes: string }) => {
    const res = await fetch(`/api/public/rsvp/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvp_status: status, notes }),
    });
    if (!res.ok) throw new Error('Wystąpił błąd podczas wysyłania odpowiedzi.');
    return res.json();
};

const RsvpPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [notes, setNotes] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const { data, isLoading, error } = useQuery<RsvpData, Error>({
        queryKey: ['rsvp', token],
        queryFn: () => fetchRsvpData(token!),
        enabled: !!token,
    });

    const mutation = useMutation({
        mutationFn: submitRsvp,
        onSuccess: () => setSubmitted(true),
    });
    
    const handleSubmit = (status: RsvpStatus) => {
        if (!token) return;
        mutation.mutate({ token, status, notes });
    };

    if (isLoading) return <div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>;
    if (error) return <div className="text-center py-20 text-red-500">{error.message}</div>;
    if (!data) return <div className="text-center py-20">Nie znaleziono danych.</div>;

    const { guest, booking } = data;
    const isAlreadyAnswered = guest.rsvp_status !== 'pending' || submitted;
    
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const AddressLink: React.FC<{ address: string | null }> = ({ address }) => {
        if (!address) return null;
        return <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{address}</a>;
    };
    
    return (
        <div className="bg-slate-50 min-h-screen py-12 px-4">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
                {booking.couple_photo_url ? (
                    <img src={booking.couple_photo_url} alt={`${booking.bride_name} & ${booking.groom_name}`} className="w-full h-64 object-cover"/>
                ) : (
                    <div className="w-full h-48 bg-slate-200 flex items-center justify-center">
                        <p className="font-cinzel text-2xl text-slate-500">{booking.bride_name} & {booking.groom_name}</p>
                    </div>
                )}
                <div className="p-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-slate-800">Cześć, {guest.name}!</h1>
                        <p className="mt-2 text-lg text-slate-600">
                            {booking.bride_name} i {booking.groom_name} z radością zapraszają Cię na swój ślub.
                        </p>
                    </div>

                    <div className="mt-8 space-y-4 text-center border-y py-6">
                        <div className="flex justify-center items-center gap-3 text-slate-700">
                            <CalendarDaysIcon className="w-6 h-6 text-indigo-500"/>
                            <span className="font-semibold text-lg">{formatDate(booking.wedding_date)}</span>
                        </div>
                        {booking.church_location && <div className="flex justify-center items-start gap-3 text-slate-700"><MapPinIcon className="w-6 h-6 text-indigo-500 mt-0.5 flex-shrink-0"/><p>Ceremonia: <AddressLink address={booking.church_location}/></p></div>}
                        {booking.venue_location && <div className="flex justify-center items-start gap-3 text-slate-700"><MapPinIcon className="w-6 h-6 text-indigo-500 mt-0.5 flex-shrink-0"/><p>Przyjęcie: <AddressLink address={booking.venue_location}/></p></div>}
                    </div>
                    
                    {isAlreadyAnswered ? (
                        <div className="text-center py-10">
                            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-2xl font-bold text-slate-900">Dziękujemy za odpowiedź!</h3>
                            <p className="text-slate-600 mt-2">Twoja obecność została już zarejestrowana.</p>
                        </div>
                    ) : (
                        <div className="mt-8">
                             <h2 className="text-xl font-semibold text-center text-slate-800 mb-4">Potwierdź swoją obecność</h2>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Dodatkowe informacje (np. alergie, preferencje dietetyczne, dedykacja muzyczna)"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button onClick={() => handleSubmit('confirmed')} disabled={mutation.isPending} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-green-300 flex justify-center">
                                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6"/> : 'Potwierdzam z radością!'}
                                </button>
                                <button onClick={() => handleSubmit('declined')} disabled={mutation.isPending} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 flex justify-center">
                                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6"/> : 'Z przykrością odmawiam'}
                                </button>
                            </div>
                            {mutation.isError && <p className="text-red-500 text-sm mt-2 text-center">{mutation.error.message}</p>}
                        </div>
                    )}
                </div>
            </div>
            <p className="text-center text-xs text-slate-400 mt-6">
                Powered by <span className="font-semibold">Dreamcatcher Film</span>
            </p>
        </div>
    );
};

export default RsvpPage;
