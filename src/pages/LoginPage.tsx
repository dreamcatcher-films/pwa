import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, LockClosedIcon, UserIcon } from '../components/Icons.tsx';
import { InputField } from '../components/FormControls.tsx';
import { loginClient } from '../api.ts';

type FormValues = {
    loginIdentifier: string;
    password: string;
};

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();

    const loginMutation = useMutation({
        mutationFn: loginClient,
        onSuccess: (data) => {
            localStorage.setItem('authToken', data.token);
            navigate('/panel-klienta');
        },
    });

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        loginMutation.mutate(data);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Klienta</h1>
                    <p className="mt-2 text-lg text-slate-600">Zaloguj się, aby zobaczyć szczegóły swojej rezerwacji.</p>
                </div>
                
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {loginMutation.isError && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{loginMutation.error.message}</p>
                        </div>
                    )}
                    
                    <InputField
                        id="loginIdentifier"
                        label="Numer Klienta lub E-mail"
                        placeholder="np. 1234 lub jan.kowalski@example.com"
                        register={register('loginIdentifier', { required: 'To pole jest wymagane' })}
                        error={errors.loginIdentifier}
                        icon={<UserIcon className="h-5 w-5 text-slate-400" />}
                    />
                    
                     <InputField
                        id="password"
                        label="Hasło"
                        type="password"
                        placeholder="••••••••"
                        register={register('password', { required: 'Hasło jest wymagane' })}
                        error={errors.password}
                        icon={<LockClosedIcon className="h-5 w-5 text-slate-400" />}
                    />

                    <div className="flex items-center justify-between">
                        <Link to="/przypomnij-haslo" className="text-sm font-medium text-indigo-600 hover:underline">
                            Zapomniałeś/aś hasła?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        disabled={loginMutation.isPending}
                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed"
                    >
                        {loginMutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Zaloguj się'}
                    </button>
                </form>
                 <p className="text-center text-sm text-slate-500 mt-6">
                    Nie masz jeszcze konta? <Link to="/kalkulator" className="font-medium text-indigo-600 hover:underline">Stwórz swój pakiet i zarezerwuj termin</Link>.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
