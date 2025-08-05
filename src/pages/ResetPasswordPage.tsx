import React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, LockClosedIcon, CheckCircleIcon } from '../components/Icons.tsx';
import { InputField } from '../components/FormControls.tsx';
import { resetPassword } from '../api.ts';

type FormValues = {
    password: string;
    confirmPassword: string;
};

const ResetPasswordPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>();

    const mutation = useMutation({
        mutationFn: resetPassword,
        onSuccess: () => {
            // Success state is handled by the component's render logic
        },
    });

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        if (token) {
            mutation.mutate({ token, password: data.password });
        }
    };
    
    const password = watch('password');

    if (mutation.isSuccess) {
        return (
             <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-md text-center">
                     <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Hasło zostało zmienione!</h1>
                    <p className="mt-4 text-lg text-slate-600">
                        Możesz teraz zalogować się do swojego panelu klienta przy użyciu nowego hasła.
                    </p>
                    <Link to="/logowanie" className="mt-6 inline-block bg-brand-dark-green text-white font-bold py-3 px-6 rounded-lg hover:bg-brand-dark-green/90">
                        Przejdź do logowania
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Ustaw nowe hasło</h1>
                    <p className="mt-2 text-lg text-slate-600">Wprowadź swoje nowe hasło poniżej.</p>
                </div>
                
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {mutation.isError && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{mutation.error.message}</p>
                        </div>
                    )}
                    
                    <InputField
                        id="password"
                        label="Nowe hasło"
                        type="password"
                        placeholder="Minimum 8 znaków"
                        register={register('password', { required: 'Hasło jest wymagane.', minLength: { value: 8, message: 'Hasło musi mieć co najmniej 8 znaków.' } })}
                        error={errors.password}
                        icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />}
                    />
                    
                     <InputField
                        id="confirmPassword"
                        label="Potwierdź nowe hasło"
                        type="password"
                        placeholder="Powtórz hasło"
                        register={register('confirmPassword', { required: 'Potwierdzenie hasła jest wymagane.', validate: value => value === password || 'Hasła nie są identyczne.' })}
                        error={errors.confirmPassword}
                        icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />}
                    />

                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed"
                    >
                        {mutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Zapisz nowe hasło'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
