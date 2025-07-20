
import React, { useState } from 'react';
import { InputField, TextAreaField } from './FormControls.tsx';
import { LoadingSpinner, CheckCircleIcon } from './Icons.tsx';

const ContactForm: React.FC = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: 'Zapytanie o wolny termin',
        message: '',
        consent: false,
    });
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.consent) {
            setError('Zgoda na przetwarzanie danych jest wymagana.');
            setStatus('error');
            return;
        }
        
        setStatus('loading');
        setError('');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Nie udało się wysłać wiadomości.');
            }
            
            setStatus('success');
            setFormData({
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                subject: 'Zapytanie o wolny termin',
                message: '',
                consent: false,
            });

        } catch (err) {
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };
    
    if (status === 'success') {
        return (
            <div className="text-center py-10">
                <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-900">Dziękujemy!</h3>
                <p className="text-slate-600 mt-2">Twoja wiadomość została wysłana. Skontaktujemy się z Tobą najszybciej, jak to możliwe.</p>
                <button 
                    onClick={() => setStatus('idle')}
                    className="mt-6 bg-indigo-100 text-indigo-800 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200"
                >
                    Wyślij kolejną wiadomość
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-slate-900">Napisz do nas</h3>
            
            {status === 'error' && <p className="text-red-600 bg-red-50 p-3 rounded-lg text-sm">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField id="firstName" name="firstName" label="Imię" value={formData.firstName} onChange={handleChange} placeholder="Jan" />
                <InputField id="lastName" name="lastName" label="Nazwisko" value={formData.lastName} onChange={handleChange} placeholder="Kowalski" />
            </div>
             <InputField id="email" name="email" label="Adres e-mail" type="email" value={formData.email} onChange={handleChange} placeholder="jan.kowalski@example.com" />
             <InputField id="phone" name="phone" label="Numer telefonu (opcjonalnie)" type="tel" value={formData.phone} onChange={handleChange} required={false} placeholder="123-456-789" />
            
             <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-700">Temat zapytania</label>
                <select 
                    id="subject"
                    name="subject" 
                    value={formData.subject} 
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                    <option>Zapytanie o wolny termin</option>
                    <option>Współpraca</option>
                    <option>Pytanie ogólne</option>
                    <option>Inne</option>
                </select>
            </div>

            <TextAreaField id="message" name="message" label="Treść wiadomości" rows={5} value={formData.message} onChange={handleChange} placeholder="Twoja wiadomość..." />
            
            <div className="flex items-start">
                <input
                    id="consent"
                    name="consent"
                    type="checkbox"
                    checked={formData.consent}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                />
                <label htmlFor="consent" className="ml-3 block text-sm text-slate-600">
                    Wyrażam zgodę na przetwarzanie moich danych osobowych w celu odpowiedzi na moje zapytanie.
                </label>
            </div>
            
            <div className="pt-2">
                <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex justify-center items-center h-12 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                >
                    {status === 'loading' ? <LoadingSpinner /> : 'Wyślij wiadomość'}
                </button>
            </div>
        </form>
    );
};

export default ContactForm;
