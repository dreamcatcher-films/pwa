import React, { useState } from 'react';
import { LoadingSpinner, ArrowLeftIcon } from './Icons.tsx';

interface BookingDetails {
    accessKey: string;
    packageName: string;
    totalPrice: number;
    selectedItems: string[];
}

interface BookingFormProps {
    bookingDetails: BookingDetails;
    onBookingComplete: (bookingId: number) => void;
    onBack: () => void;
}

const InputField = ({ id, label, type = 'text', placeholder, value, onChange, required = true }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <input
            type={type}
            id={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400
                     focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
    </div>
);

const TextAreaField = ({ id, label, placeholder, value, onChange, rows = 3, required = true }) => (
     <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <textarea
            id={id}
            rows={rows}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400
                     focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        ></textarea>
    </div>
);


const BookingForm: React.FC<BookingFormProps> = ({ bookingDetails, onBookingComplete, onBack }) => {
    const [formData, setFormData] = useState({
        weddingDate: '',
        brideAddress: '',
        groomAddress: '',
        locations: '',
        schedule: '',
        discountCode: '',
    });
    const [status, setStatus] = useState('idle'); // 'idle', 'loading', 'error'
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setError('');

        const fullBookingData = {
            ...bookingDetails,
            ...formData,
        };
        const apiUrl = import.meta.env.VITE_API_URL;

        try {
            const response = await fetch(`${apiUrl}/api/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullBookingData),
            });
            
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: `Błąd serwera (${response.status}).` }));
                 throw new Error(errorData.message || 'Nie udało się zapisać rezerwacji.');
            }

            const result = await response.json();
            onBookingComplete(result.bookingId);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setStatus('error');
        } finally {
            if (status !== 'idle') {
                setStatus('idle');
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <header className="relative text-center mb-10">
                 <button 
                    onClick={onBack} 
                    className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                     <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                     Wróć do kalkulatora
                 </button>
                <h1 className="text-4xl font-bold tracking-tight text-slate-900">Szczegóły Rezerwacji</h1>
                <p className="mt-2 text-lg text-slate-600">Uzupełnij poniższe informacje, aby dokończyć rezerwację.</p>
            </header>
            
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                
                {error && (
                    <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg">
                        <p className="font-bold">Wystąpił błąd</p>
                        <p>{error}</p>
                    </div>
                )}
                
                <InputField id="weddingDate" label="Data ślubu" type="date" value={formData.weddingDate} onChange={handleChange} placeholder="" />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField id="brideAddress" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.brideAddress} onChange={handleChange} />
                    <InputField id="groomAddress" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groomAddress} onChange={handleChange} />
                </div>

                <TextAreaField id="locations" label="Lokalizacje" placeholder="Kościół: Parafia Św. Anny, Warszawa&#10;Sala: Hotel Bristol, Warszawa" value={formData.locations} onChange={handleChange} />
                <TextAreaField id="schedule" label="Przybliżony harmonogram dnia ślubu" placeholder="12:00 - Przygotowania Panny Młodej&#10;14:00 - Ceremonia&#10;16:00 - Wesele" value={formData.schedule} onChange={handleChange} />
                
                <InputField id="discountCode" label="Kod rabatowy (opcjonalnie)" placeholder="np. LATO2024" value={formData.discountCode} onChange={handleChange} required={false} />

                <div className="pt-6 border-t">
                     <button 
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex justify-center items-center h-12 disabled:bg-indigo-300 disabled:cursor-not-allowed">
                        {status === 'loading' ? <LoadingSpinner /> : 'Zarezerwuj termin'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default BookingForm;
