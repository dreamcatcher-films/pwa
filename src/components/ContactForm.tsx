
import React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { InputField, TextAreaField } from './FormControls.tsx';
import { EngagementRingSpinner, CheckCircleIcon } from './Icons.tsx';
import { submitContactForm } from '../api.ts';

type FormValues = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
    consent: boolean;
};

const ContactForm: React.FC = () => {
    const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
        defaultValues: {
            subject: 'Zapytanie o wolny termin'
        }
    });

    const mutation = useMutation({
        mutationFn: submitContactForm,
        onSuccess: () => {
            reset();
        }
    });

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        mutation.mutate(data);
    };
    
    if (mutation.isSuccess) {
        return (
            <div className="text-center py-10">
                <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-900">Dziękujemy!</h3>
                <p className="text-slate-600 mt-2">Twoja wiadomość została wysłana. Skontaktujemy się z Tobą najszybciej, jak to możliwe.</p>
                <button 
                    onClick={() => mutation.reset()}
                    className="mt-6 bg-indigo-100 text-indigo-800 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200"
                >
                    Wyślij kolejną wiadomość
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <h3 className="text-2xl font-bold text-slate-900">Napisz do nas</h3>
            
            {mutation.isError && <p className="text-red-600 bg-red-50 p-3 rounded-lg text-sm">{mutation.error.message}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField id="firstName" label="Imię" register={register('firstName', { required: "Imię jest wymagane" })} error={errors.firstName} placeholder="Jan" />
                <InputField id="lastName" label="Nazwisko" register={register('lastName', { required: "Nazwisko jest wymagane" })} error={errors.lastName} placeholder="Kowalski" />
            </div>
             <InputField id="email" label="Adres e-mail" type="email" register={register('email', { required: "Adres e-mail jest wymagany" })} error={errors.email} placeholder="jan.kowalski@example.com" />
             <InputField id="phone" label="Numer telefonu (opcjonalnie)" type="tel" register={register('phone')} error={errors.phone} required={false} placeholder="123-456-789" />
            
             <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-700">Temat zapytania</label>
                <select 
                    id="subject"
                    {...register('subject')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                    <option>Zapytanie o wolny termin</option>
                    <option>Współpraca</option>
                    <option>Pytanie ogólne</option>
                    <option>Inne</option>
                </select>
            </div>

            <TextAreaField id="message" label="Treść wiadomości" rows={5} register={register('message', { required: "Wiadomość nie może być pusta" })} error={errors.message} placeholder="Twoja wiadomość..." />
            
            <div className="flex items-start">
                <input
                    id="consent"
                    type="checkbox"
                    {...register('consent', { required: "Zgoda na przetwarzanie danych jest wymagana." })}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                />
                <label htmlFor="consent" className="ml-3 block text-sm text-slate-600">
                    Wyrażam zgodę na przetwarzanie moich danych osobowych w celu odpowiedzi na moje zapytanie.
                </label>
                 {errors.consent && <p className="text-red-600 text-xs ml-3">{errors.consent.message}</p>}
            </div>
            
            <div className="pt-2">
                <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed"
                >
                    {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Wyślij wiadomość'}
                </button>
            </div>
        </form>
    );
};

export default ContactForm;
