import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, EnvelopeIcon, CheckCircleIcon } from '../components/Icons.tsx';
import { InputField } from '../components/FormControls.tsx';
import { forgotPassword } from '../api.ts';

type FormValues = {
    email: string;
};

const ForgotPasswordPage: React.FC = () => {
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();

    const mutation = useMutation({
        mutationFn: forgotPassword,
    });

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        mutation.mutate(data.email);
    };
    
    if (mutation.isSuccess) {
        return (
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-md text-center">
                     <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sprawdź swoją skrzynkę!</h1>
                    <p className="mt-4 text-lg text-slate-600">
                        Jeśli konto powiązane z podanym adresem e-mail istnieje w naszym systemie, wysłaliśmy na nie link do zresetowania hasła.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Zapomniałeś/aś hasła?</h1>
                    <p className="mt-2 text-lg text-slate-600">Wpisz swój adres e-mail, a wyślemy Ci link do zresetowania hasła.</p>
                </div>
                
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {mutation.isError && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{mutation.error.message}</p>
                        </div>
                    )}
                    
                    <InputField
                        id="email"
                        label="Adres e-mail"
                        type="email"
                        placeholder="jan.kowalski@example.com"
                        register={register('email', { required: 'Adres e-mail jest wymagany' })}
                        error={errors.email}
                        icon={<EnvelopeIcon className="h-5 w-5 text-slate-400" />}
                    />
                    
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed"
                    >
                        {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Wyślij link'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
