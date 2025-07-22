import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { EngagementRingSpinner, LockClosedIcon, UserIcon } from '../components/Icons.tsx';
import { InputField } from '../components/FormControls.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { loginAdmin } from '../api.ts';

type FormValues = {
    email: string;
    password: string;
};

const AdminLoginPage: React.FC = () => {
    const { isAdmin, login } = useAuth();
    const navigate = useNavigate();
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();

    useEffect(() => {
        if (isAdmin) {
            navigate('/admin');
        }
    }, [isAdmin, navigate]);

    const loginMutation = useMutation({
        mutationFn: loginAdmin,
        onSuccess: (data) => {
            login(data.token);
        },
    });

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        loginMutation.mutate(data);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zaloguj się, aby zarządzać aplikacją.</p>
                </div>
                
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {loginMutation.isError && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{loginMutation.error.message}</p>
                        </div>
                    )}
                    
                     <InputField
                        id="email"
                        label="Adres e-mail"
                        type="email"
                        placeholder="admin@example.com"
                        register={register('email', { required: 'Adres e-mail jest wymagany' })}
                        error={errors.email}
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

                    <button
                        type="submit"
                        disabled={loginMutation.isPending}
                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed"
                    >
                        {loginMutation.isPending ? <EngagementRingSpinner className="w-6 h-6" /> : 'Zaloguj się'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminLoginPage;
