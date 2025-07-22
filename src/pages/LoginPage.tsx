import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { EngagementRingSpinner, LockClosedIcon, UserIcon } from '../components/Icons.tsx';
import { loginClient } from '../api.ts';

const LoginPage: React.FC = () => {
    const [clientId, setClientId] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const loginMutation = useMutation({
        mutationFn: loginClient,
        onSuccess: (data) => {
            localStorage.setItem('authToken', data.token);
            navigate('/panel-klienta');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loginMutation.mutate({ clientId, password });
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Klienta</h1>
                    <p className="mt-2 text-lg text-slate-600">Zaloguj się, aby zobaczyć szczegóły swojej rezerwacji.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {loginMutation.isError && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{loginMutation.error.message}</p>
                        </div>
                    )}
                    
                    <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-slate-700">Numer Klienta</label>
                        <div className="relative mt-1">
                             <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <UserIcon className="h-5 w-5 text-slate-400" />
                            </div>
                             <input
                                type="text"
                                id="clientId"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value.trim())}
                                placeholder="np. 1234"
                                required
                                className="block w-full py-2 pl-10 pr-3 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="password"  className="block text-sm font-medium text-slate-700">Hasło</label>
                         <div className="relative mt-1">
                             <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <LockClosedIcon className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="block w-full py-2 pl-10 pr-3 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
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
                    Nie pamiętasz danych? <a href="/kontakt" className="font-medium text-indigo-600 hover:underline">Skontaktuj się z nami</a>.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
