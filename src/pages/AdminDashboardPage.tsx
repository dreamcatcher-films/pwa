import React, { useEffect } from 'react';
import { Page } from '../App.tsx';

interface AdminDashboardPageProps {
    navigateTo: (page: Page) => void;
}

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo }) => {
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigateTo('adminLogin');
        }
    }, [navigateTo]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigateTo('home');
    };

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-10">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Witaj w Panelu Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            <div className="bg-white p-8 rounded-2xl shadow-lg">
                <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
                <p className="mt-2 text-slate-600">Ta sekcja jest w budowie. Wkrótce pojawią się tu statystyki i narzędzia do zarządzania.</p>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
