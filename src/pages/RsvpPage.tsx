

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EngagementRingSpinner, CheckCircleIcon, MapPinIcon, CalendarDaysIcon } from '../components/Icons.tsx';

// --- TYPES ---
interface CompanionStatus {
    attending: boolean;
    is_child: boolean;
}
interface Guest {
    id: number;
    name: string;
    rsvp_status: 'pending' | 'confirmed' | 'declined' | 'tentative';
    notes: string | null;
    allowed_companions: number;
    companion_status: CompanionStatus[] | null;
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
type RsvpStatus = 'confirmed' | 'declined' | 'tentative';

// --- API ---
const fetchRsvpData = async (token: string): Promise<RsvpData> => {
    const res = await fetch(`/api/public/rsvp/${token}`);
    if (!res.ok) throw new Error('Nie znaleziono zaproszenia lub jest ono nieprawidłowe.');
    return res.json();
};
const submitRsvp = async ({ token, status, notes, companions }: { token: string; status: RsvpStatus; notes: string; companions: CompanionStatus[] }) => {
    const res = await fetch(`/api/public/rsvp/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvp_status: status, notes, companion_status: companions }),
    });
    if (!res.ok) throw new Error('Wystąpił błąd podczas wysyłania odpowiedzi.');
    return res.json();
};

const RsvpPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [notes, setNotes] = useState('');
    const [companions, setCompanions] = useState<CompanionStatus[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery<RsvpData, Error>({
        queryKey: ['rsvp', token],
        queryFn: () => fetchRsvpData(token!),
        enabled: !!token,
    });

    useEffect(() => {
        if (data) {
            setNotes(data.guest.notes || '');
            const initialCompanions = Array.from({ length: data.guest.allowed_companions }, (_, i) => {
                return data.guest.companion_status?.[i] || { attending: false, is_child: false };
            });
            setCompanions(initialCompanions);
        }
    }, [data]);

    const mutation = useMutation({
        mutationFn: submitRsvp,
        onSuccess: () => {
            setSubmitted(true);
            queryClient.invalidateQueries({ queryKey: ['rsvp', token] });
            setTimeout(() => setSubmitted(false), 5000);
        },
    });
    
    const handleCompanionChange = (index: number, field: 'attending' | 'is_child', value: boolean) => {
        const newCompanions = [...companions];
        newCompanions[index] = { ...newCompanions[index], [field]: value };
        if (field === 'attending' && !value) {
            newCompanions[index].is_child = false;
        }
        setCompanions(newCompanions);
    };

    const handleSubmit = (status: RsvpStatus) => {
        if (!token) return;
        const finalCompanions = status === 'declined' ? companions.map(c => ({ ...c, attending: false })) : companions;
        mutation.mutate({ token, status, notes, companions: finalCompanions });
    };

    if (isLoading) return <div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>;
    if (error) return <div className="text-center py-20 text-red-500">{error.message}</div>;
    if (!data) return <div className="text-center py-20">Nie znaleziono danych.</div>;

    const { guest, booking } = data;
    
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const AddressLink: React.FC<{ address: string | null }> = ({ address }) => {
        if (!address) return null;
        return <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{address}</a>;
    };
    
    return (
        <div className="bg-slate-50 min-h-screen">
            <div className="py-12 px-4">
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
                        
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-center text-slate-800 mb-4">Potwierdź swoją obecność</h2>
                            {submitted && (
                                <div className="p-3 mb-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-r-lg">
                                    <p className="font-bold">Dziękujemy, Twoja odpowiedź została zapisana!</p>
                                    <p className="text-sm">Możesz ją zmienić w dowolnym momencie.</p>
                                </div>
                            )}
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Dodatkowe informacje (np. alergie, preferencje dietetyczne, dedykacja muzyczna)"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            {guest.allowed_companions > 0 && (
                                <div className="mt-6">
                                    <h3 className="font-semibold text-slate-800">Osoby towarzyszące ({guest.allowed_companions})</h3>
                                    <p className="text-sm text-slate-500 mb-2">Prosimy, zaznacz ile osób towarzyszących z Tobą przyjdzie.</p>
                                    <div className="space-y-3">
                                        {companions.map((comp, index) => (
                                            <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                                <label htmlFor={`companion_attending_${index}`} className="flex items-center cursor-pointer">
                                                    <input type="checkbox" id={`companion_attending_${index}`} checked={comp.attending} onChange={(e) => handleCompanionChange(index, 'attending', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                                    <span className="ml-3 text-sm font-medium text-slate-800">Osoba towarzysząca #{index + 1}</span>
                                                </label>
                                                {comp.attending && (
                                                    <label htmlFor={`companion_child_${index}`} className="flex items-center cursor-pointer text-sm">
                                                        <input type="checkbox" id={`companion_child_${index}`} checked={comp.is_child} onChange={(e) => handleCompanionChange(index, 'is_child', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                                        <span className="ml-2 text-slate-600">Dziecko</span>
                                                    </label>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex flex-col sm:flex-row gap-4">
                                <button onClick={() => handleSubmit('confirmed')} disabled={mutation.isPending} className="flex-1 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-green-300 flex justify-center">
                                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6"/> : 'Potwierdzam'}
                                </button>
                                <button onClick={() => handleSubmit('tentative')} disabled={mutation.isPending} className="flex-1 bg-yellow-500 text-white font-bold py-3 rounded-lg hover:bg-yellow-600 disabled:bg-yellow-300 flex justify-center">
                                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6"/> : 'Jeszcze nie wiem'}
                                </button>
                                <button onClick={() => handleSubmit('declined')} disabled={mutation.isPending} className="flex-1 bg-slate-200 text-slate-800 font-bold py-3 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 flex justify-center">
                                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6"/> : 'Odrzucam'}
                                </button>
                            </div>
                            {mutation.isError && <p className="text-red-500 text-sm mt-2 text-center">{mutation.error.message}</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RsvpPage;
