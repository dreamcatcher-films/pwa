import React, { useState, useEffect } from 'react';
import { LoadingSpinner, UserIcon, LockClosedIcon, CheckCircleIcon } from './Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from './FormControls.tsx';

interface BookingDetails {
    accessKey: string;
    packageName: string;
    totalPrice: number;
    selectedItems: string[];
}

interface BookingFormProps {
    bookingDetails: BookingDetails;
    onBookingComplete: (data: {bookingId: number, clientId: string}) => void;
}

type Discount = {
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
} | null;

const BookingForm: React.FC<BookingFormProps> = ({ bookingDetails, onBookingComplete }) => {
    const [formData, setFormData] = useState({
        brideName: '', groomName: '', weddingDate: '', brideAddress: '',
        groomAddress: '', locations: '', schedule: '', email: '',
        phoneNumber: '', additionalInfo: '', password: '', confirmPassword: ''
    });
    const [discountCode, setDiscountCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<Discount>(null);
    const [discountStatus, setDiscountStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [discountError, setDiscountError] = useState('');
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [error, setError] = useState('');
    const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

    const initialPrice = bookingDetails.totalPrice;
    const [finalPrice, setFinalPrice] = useState(initialPrice);

    useEffect(() => {
        let newPrice = initialPrice;
        if (appliedDiscount) {
            if (appliedDiscount.type === 'percentage') {
                newPrice = newPrice * (1 - appliedDiscount.value / 100);
            } else {
                newPrice = newPrice - appliedDiscount.value;
            }
        }
        setFinalPrice(Math.max(0, newPrice));
    }, [initialPrice, appliedDiscount]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
        if (validationErrors[id]) {
             setValidationErrors(prev => ({ ...prev, [id]: '' }));
        }
    };

    const handleApplyDiscount = async () => {
        if (!discountCode) return;
        setDiscountStatus('loading');
        setDiscountError('');
        setAppliedDiscount(null);
        try {
            const response = await fetch('/api/validate-discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: discountCode })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Nieprawidłowy kod rabatowy.');
            }
            setAppliedDiscount(data);
            setDiscountStatus('success');
        } catch(err) {
            setDiscountError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setDiscountStatus('error');
        }
    }

    const validateForm = () => {
        const errors: { [key: string]: string } = {};
        if (formData.password.length < 8) errors.password = "Hasło musi mieć co najmniej 8 znaków.";
        if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Hasła nie są identyczne.";
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!validateForm()) return;

        setStatus('loading');
        const { confirmPassword, ...dataToSend } = formData;
        const fullBookingData = {
            ...bookingDetails,
            ...dataToSend,
            totalPrice: finalPrice,
            discountCode: appliedDiscount?.code || null,
        };

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullBookingData),
            });
            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(errorText || 'Nie udało się zapisać rezerwacji.');
            }
            const result = await response.json();
            onBookingComplete({bookingId: result.bookingId, clientId: result.clientId});
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setStatus('error');
        } finally {
            if (status !== 'idle') setStatus('idle');
        }
    };

    return (
        <>
            <div className="bg-slate-100 p-6 rounded-2xl mb-8 border border-slate-200">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Podsumowanie Twojego wyboru</h2>
                <div className="space-y-3">
                    <div className="flex justify-between items-center"><span className="text-slate-600">Wybrany pakiet:</span><span className="font-bold text-slate-900">{bookingDetails.packageName}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-600">Cena bazowa:</span><span className="font-medium text-slate-700">{formatCurrency(initialPrice)}</span></div>
                    {appliedDiscount && (
                         <div className="flex justify-between items-center text-green-600">
                             <span>Rabat ({appliedDiscount.code}):</span>
                             <span className="font-medium">
                                -{appliedDiscount.type === 'percentage' 
                                    ? `${appliedDiscount.value}%` 
                                    : formatCurrency(appliedDiscount.value)}
                            </span>
                         </div>
                    )}
                    <div className="flex justify-between items-center text-lg border-t pt-3 mt-3">
                        <span className="text-slate-600">Cena końcowa:</span>
                        <span className="font-bold text-indigo-600 text-2xl">{formatCurrency(finalPrice)}</span>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                {error && <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg"><p className="font-bold">Wystąpił błąd</p><p>{error}</p></div>}
                
                {/* Sections for personal data, wedding details, etc. remain the same */}
                 <section className="pb-6 border-b"><h3 className="text-lg font-semibold text-slate-800 mb-4">Dane Pary Młodej</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><InputField id="brideName" label="Imię i nazwisko Panny Młodej" placeholder="Anna Nowak" value={formData.brideName} onChange={handleChange} icon={<UserIcon className="h-5 w-5 text-slate-400" />} /><InputField id="groomName" label="Imię i nazwisko Pana Młodego" placeholder="Piotr Kowalski" value={formData.groomName} onChange={handleChange} icon={<UserIcon className="h-5 w-5 text-slate-400" />} /></div></section>
                <InputField id="weddingDate" label="Data ślubu" type="date" value={formData.weddingDate} onChange={handleChange} placeholder="" />
                <section className="pt-6 mt-6 border-t"><h3 className="text-lg font-semibold text-slate-800 mb-4">Dane kontaktowe i logowania</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><InputField id="email" label="Adres e-mail" type="email" placeholder="anna.nowak@example.com" value={formData.email} onChange={handleChange} /><InputField id="phoneNumber" label="Numer telefonu" type="tel" placeholder="123-456-789" value={formData.phoneNumber} onChange={handleChange} /><InputField id="password" label="Ustaw hasło do panelu klienta" type="password" placeholder="Minimum 8 znaków" value={formData.password} onChange={handleChange} icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />} error={validationErrors.password} /><InputField id="confirmPassword" label="Potwierdź hasło" type="password" placeholder="Powtórz hasło" value={formData.confirmPassword} onChange={handleChange} icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />} error={validationErrors.confirmPassword} /></div></section>
                <section className="pt-6 mt-6 border-t"><h3 className="text-lg font-semibold text-slate-800 mb-4">Szczegóły wydarzenia</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><InputField id="brideAddress" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.brideAddress} onChange={handleChange} /><InputField id="groomAddress" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groomAddress} onChange={handleChange} /></div><div className="mt-6"><TextAreaField id="locations" label="Lokalizacje" placeholder="Kościół: Parafia Św. Anny, Warszawa&#10;Sala: Hotel Bristol, Warszawa" value={formData.locations} onChange={handleChange} /></div><div className="mt-6"><TextAreaField id="schedule" label="Przybliżony harmonogram dnia ślubu" placeholder="12:00 - Przygotowania Panny Młodej&#10;14:00 - Ceremonia&#10;16:00 - Wesele" value={formData.schedule} onChange={handleChange} /></div></section>
                <section className="pt-6 mt-6 border-t"><TextAreaField id="additionalInfo" label="Dodatkowe informacje (opcjonalnie)" rows={4} placeholder="np. specjalne prośby, nietypowe elementy dnia, informacje o gościach" value={formData.additionalInfo} onChange={handleChange} required={false} /></section>
                
                <section className="pt-6 mt-6 border-t">
                    <label htmlFor="discountCode" className="block text-sm font-medium text-slate-700">Kod rabatowy (opcjonalnie)</label>
                    <div className="mt-1 flex items-stretch gap-2">
                        <input
                            id="discountCode"
                            type="text"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                            placeholder="np. LATO2024"
                            className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                        <button type="button" onClick={handleApplyDiscount} disabled={discountStatus === 'loading' || !discountCode} className="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex-shrink-0 w-32 flex justify-center items-center">
                            {discountStatus === 'loading' ? <LoadingSpinner className="w-5 h-5"/> : 'Zastosuj'}
                        </button>
                    </div>
                    {discountStatus === 'success' && <p className="mt-2 text-sm text-green-600 flex items-center gap-2"><CheckCircleIcon className="w-5 h-5"/>Rabat został pomyślnie naliczony!</p>}
                    {discountStatus === 'error' && <p className="mt-2 text-sm text-red-600">{discountError}</p>}
                </section>

                <div className="pt-6 border-t">
                     <button type="submit" disabled={status === 'loading'} className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex justify-center items-center h-12 disabled:bg-indigo-300 disabled:cursor-not-allowed">
                        {status === 'loading' ? <LoadingSpinner /> : 'Zarezerwuj i utwórz konto'}
                    </button>
                </div>
            </form>
        </>
    );
};

export default BookingForm;
