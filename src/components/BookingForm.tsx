import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { EngagementRingSpinner, UserIcon, LockClosedIcon, CheckCircleIcon } from './Icons.tsx';
import { formatCurrency } from '../utils.ts';
import { InputField, TextAreaField } from './FormControls.tsx';
import { validateDiscount, createBooking } from '../api.ts';

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
        groomAddress: '', churchLocation: '', venueLocation: '', schedule: '', email: '',
        phoneNumber: '', additionalInfo: '', password: '', confirmPassword: ''
    });
    const [discountCode, setDiscountCode] = useState('');
    const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

    const discountMutation = useMutation<Discount, Error, string>({
        mutationFn: validateDiscount,
    });

    const bookingMutation = useMutation({
        mutationFn: createBooking,
        onSuccess: (data) => {
            onBookingComplete({ bookingId: data.bookingId, clientId: data.clientId });
        }
    });

    const initialPrice = bookingDetails.totalPrice;
    const [finalPrice, setFinalPrice] = useState(initialPrice);
    
    const appliedDiscount = discountMutation.data;

    useEffect(() => {
        let newPrice = initialPrice;
        if (appliedDiscount) {
            if (appliedDiscount.type === 'percentage') {
                newPrice = newPrice * (1 - Number(appliedDiscount.value) / 100);
            } else {
                newPrice = newPrice - Number(appliedDiscount.value);
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

    const handleApplyDiscount = () => {
        if (!discountCode) return;
        discountMutation.mutate(discountCode);
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
        if (!validateForm()) return;

        const { confirmPassword, ...dataToSend } = formData;
        const fullBookingData = {
            ...bookingDetails,
            ...dataToSend,
            totalPrice: finalPrice,
            discountCode: appliedDiscount?.code || null,
        };
        bookingMutation.mutate(fullBookingData);
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
                {bookingMutation.isError && <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg"><p className="font-bold">Wystąpił błąd</p><p>{bookingMutation.error.message}</p></div>}
                
                <section className="pb-6 border-b"><h3 className="text-lg font-semibold text-slate-800 mb-4">Dane Pary Młodej</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><InputField id="brideName" label="Imię i nazwisko Panny Młodej" placeholder="Anna Nowak" value={formData.brideName} onChange={handleChange} icon={<UserIcon className="h-5 w-5 text-slate-400" />} /><InputField id="groomName" label="Imię i nazwisko Pana Młodego" placeholder="Piotr Kowalski" value={formData.groomName} onChange={handleChange} icon={<UserIcon className="h-5 w-5 text-slate-400" />} /></div></section>
                <InputField id="weddingDate" label="Data ślubu" type="date" value={formData.weddingDate} onChange={handleChange} placeholder="" />
                <section className="pt-6 mt-6 border-t"><h3 className="text-lg font-semibold text-slate-800 mb-4">Dane kontaktowe i logowania</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><InputField id="email" label="Adres e-mail" type="email" placeholder="anna.nowak@example.com" value={formData.email} onChange={handleChange} /><InputField id="phoneNumber" label="Numer telefonu" type="tel" placeholder="123-456-789" value={formData.phoneNumber} onChange={handleChange} /><InputField id="password" label="Ustaw hasło do panelu klienta" type="password" placeholder="Minimum 8 znaków" value={formData.password} onChange={handleChange} icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />} error={validationErrors.password} /><InputField id="confirmPassword" label="Potwierdź hasło" type="password" placeholder="Powtórz hasło" value={formData.confirmPassword} onChange={handleChange} icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />} error={validationErrors.confirmPassword} /></div></section>
                <section className="pt-6 mt-6 border-t">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Szczegóły wydarzenia</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField id="brideAddress" label="Adres przygotowań Panny Młodej" placeholder="ul. Przykładowa 1, Warszawa" value={formData.brideAddress} onChange={handleChange} />
                        <InputField id="groomAddress" label="Adres przygotowań Pana Młodego" placeholder="ul. Inna 2, Kraków" value={formData.groomAddress} onChange={handleChange} />
                        <InputField id="churchLocation" label="Adres ceremonii (np. kościół)" placeholder="Parafia Św. Anny, Warszawa" value={formData.churchLocation} onChange={handleChange} />
                        <InputField id="venueLocation" label="Adres przyjęcia (np. sala weselna)" placeholder="Hotel Bristol, Warszawa" value={formData.venueLocation} onChange={handleChange} />
                    </div>
                    <div className="mt-6">
                        <TextAreaField id="schedule" label="Przybliżony harmonogram dnia ślubu" placeholder="12:00 - Przygotowania Panny Młodej&#10;14:00 - Ceremonia&#10;16:00 - Wesele" value={formData.schedule} onChange={handleChange} />
                    </div>
                </section>
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
                        <button type="button" onClick={handleApplyDiscount} disabled={discountMutation.isPending || !discountCode} className="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex-shrink-0 w-32 flex justify-center items-center">
                            {discountMutation.isPending ? <EngagementRingSpinner className="w-5 h-5"/> : 'Zastosuj'}
                        </button>
                    </div>
                    {discountMutation.isSuccess && <p className="mt-2 text-sm text-green-600 flex items-center gap-2"><CheckCircleIcon className="w-5 h-5"/>Rabat został pomyślnie naliczony!</p>}
                    {discountMutation.isError && <p className="mt-2 text-sm text-red-600">{discountMutation.error.message}</p>}
                </section>

                <div className="pt-6 border-t">
                     <button type="submit" disabled={bookingMutation.isPending} className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed">
                        {bookingMutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Zarezerwuj i utwórz konto'}
                    </button>
                </div>
            </form>
        </>
    );
};

export default BookingForm;
