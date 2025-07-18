import React, { useState } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, LockClosedIcon, UserIcon } from '../components/Icons.tsx';

interface LoginPageProps {
    navigateTo: (page: Page) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ navigateTo }) => {
    const [clientId, setClientId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const apiUrl = import.meta.env.VITE_API_URL;

        try {
            const response = await fetch(`${apiUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Logowanie nie powiodło się.');
            }
            
            localStorage.setItem('authToken', data.token);
            navigateTo('clientPanel');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Klienta</h1>
                    <p className="mt-2 text-lg text-slate-600">Zaloguj się, aby zobaczyć szczegóły swojej rezerwacji.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
                    {error && (
                        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm">
                            <p>{error}</p>
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
                        disabled={isLoading}
                        className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex justify-center items-center h-12 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <LoadingSpinner /> : 'Zaloguj się'}
                    </button>
                </form>
                 <p className="text-center text-sm text-slate-500 mt-6">
                    Nie pamiętasz danych? <a href="#" className="font-medium text-indigo-600 hover:underline">Skontaktuj się z nami</a>.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
