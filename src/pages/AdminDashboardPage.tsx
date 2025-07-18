import React, { useEffect, useState, FC, ReactNode } from 'react';
import { Page } from '../App.tsx';
import { formatCurrency } from '../utils.ts';
import { LoadingSpinner, InboxStackIcon, KeyIcon, TrashIcon, CheckCircleIcon, CalendarIcon, PhotoIcon, TagIcon } from '../components/Icons.tsx';
import AdminAvailabilityPage from './AdminAvailabilityPage.tsx';
import AdminGalleryPage from './AdminGalleryPage.tsx';
import AdminPackagesPage from './AdminPackagesPage.tsx';

// --- SHARED TYPES ---
interface AdminDashboardPageProps {
    navigateTo: (page: Page) => void;
    onViewDetails: (bookingId: number) => void;
}
type AdminTab = 'bookings' | 'accessKeys' | 'availability' | 'gallery' | 'packages';


// --- TAB: Bookings View ---
interface BookingSummary {
    id: number;
    client_id: string;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    total_price: string;
    created_at: string;
}

const StatCard: FC<{ title: string; value: string | number; icon: ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white rounded-2xl shadow p-6 flex items-center">
        <div className="bg-indigo-100 text-indigo-600 rounded-full p-3 mr-4">
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);

const BookingsView: FC<Pick<AdminDashboardPageProps, 'onViewDetails'>> = ({ onViewDetails }) => {
    const [bookings, setBookings] = useState<BookingSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

     useEffect(() => {
        const fetchBookings = async () => {
            const token = localStorage.getItem('adminAuthToken');
            try {
                const response = await fetch('/api/admin/bookings', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać rezerwacji.');
                }
                setBookings(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchBookings();
    }, []);

    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 text-center py-20">{error}</p>;

    return (
        <>
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Wszystkie rezerwacje" value={bookings.length} icon={<InboxStackIcon className="w-6 h-6"/>} />
            </section>
            
            <section>
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Ostatnie rezerwacje</h2>
                 <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">ID Rezerwacji</th>
                                    <th scope="col" className="px-6 py-3">Klient</th>
                                    <th scope="col" className="px-6 py-3">Data ślubu</th>
                                    <th scope="col" className="px-6 py-3">Cena</th>
                                    <th scope="col" className="px-6 py-3">Data rezerwacji</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <tr key={booking.id} className="bg-white border-b hover:bg-slate-50">
                                        <th scope="row" className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">#{booking.id}</th>
                                        <td className="px-6 py-4"><div>{booking.bride_name}</div><div className="text-xs text-slate-400">{booking.groom_name}</div></td>
                                        <td className="px-6 py-4">{booking.wedding_date ? formatDate(booking.wedding_date) : '-'}</td>
                                        <td className="px-6 py-4 font-semibold">{formatCurrency(Number(booking.total_price))}</td>
                                        <td className="px-6 py-4">{formatDate(booking.created_at)}</td>
                                        <td className="px-6 py-4 text-right"><button onClick={() => onViewDetails(booking.id)} className="font-medium text-indigo-600 hover:underline">Szczegóły</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {bookings.length === 0 && <p className="text-center p-8 text-slate-500">Nie znaleziono żadnych rezerwacji.</p>}
                 </div>
            </section>
        </>
    );
};

// --- TAB: Access Keys View ---
interface AccessKey {
    id: number;
    key: string;
    client_name: string;
    created_at: string;
}

const AccessKeysView: FC = () => {
    const [keys, setKeys] = useState<AccessKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newClientName, setNewClientName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle'|'success'>('idle');

    const fetchKeys = async () => {
        setIsLoading(true);
        const token = localStorage.getItem('adminAuthToken');
        try {
            const response = await fetch('/api/admin/access-keys', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Błąd pobierania kluczy.');
            setKeys(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);
    
    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName) return;
        setIsSubmitting(true);
        setError('');
        const token = localStorage.getItem('adminAuthToken');

        try {
            const response = await fetch('/api/admin/access-keys', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: newClientName }),
            });
            const newKey = await response.json();
            if (!response.ok) throw new Error(newKey.message || 'Błąd tworzenia klucza.');
            setKeys(prev => [newKey, ...prev]);
            setNewClientName('');
            setSubmitStatus('success');
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteKey = async (keyId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten klucz? Tej operacji nie można cofnąć.')) return;
        
        setError('');
        const token = localStorage.getItem('adminAuthToken');
        
        try {
            const response = await fetch(`/api/admin/access-keys/${keyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Błąd usuwania klucza.');
            setKeys(prev => prev.filter(key => key.id !== keyId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL');

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Aktywne Klucze Dostępu</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500">
                             <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Klucz</th>
                                    <th scope="col" className="px-6 py-3">Przypisany do Klienta</th>
                                    <th scope="col" className="px-6 py-3">Data Utworzenia</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                             <tbody>
                                {keys.map(key => (
                                    <tr key={key.id} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-6 py-4 font-mono text-indigo-600 font-bold">{key.key}</td>
                                        <td className="px-6 py-4 text-slate-800 font-medium">{key.client_name}</td>
                                        <td className="px-6 py-4">{formatDate(key.created_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDeleteKey(key.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń klucz">
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                     {keys.length === 0 && <p className="text-center p-8 text-slate-500">Brak aktywnych kluczy dostępu.</p>}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Wygeneruj Nowy Klucz</h2>
                 <form onSubmit={handleAddKey} className="bg-white rounded-2xl shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="clientName" className="block text-sm font-medium text-slate-700">Nazwa klienta</label>
                        <input
                            type="text"
                            id="clientName"
                            value={newClientName}
                            onChange={e => setNewClientName(e.target.value)}
                            placeholder="np. Anna i Piotr"
                            required
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <button type="submit" disabled={isSubmitting || !newClientName} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <KeyIcon className="w-5 h-5" />}
                        <span>Wygeneruj</span>
                    </button>
                    {submitStatus === 'success' && <p className="flex items-center gap-2 text-sm text-green-600"><CheckCircleIcon className="w-5 h-5"/> Klucz został pomyślnie utworzony!</p>}
                 </form>
            </div>
        </div>
    );
};


// --- MAIN COMPONENT ---
const TabButton: FC<{ isActive: boolean; onClick: () => void; children: ReactNode }> = ({ isActive, onClick, children }) => (
    <button onClick={onClick} className={`flex items-center gap-2 ${isActive ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-3 border-b-2 font-medium text-sm transition-colors focus:outline-none`}>
        {children}
    </button>
);

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo, onViewDetails }) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('bookings');
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigateTo('adminLogin');
            return;
        }
    }, [navigateTo]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigateTo('home');
    };

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-6">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            <div className="border-b border-slate-200 mb-8">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    <TabButton isActive={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')}>
                        <InboxStackIcon className="w-5 h-5" /> Rezerwacje
                    </TabButton>
                    <TabButton isActive={activeTab === 'accessKeys'} onClick={() => setActiveTab('accessKeys')}>
                        <KeyIcon className="w-5 h-5" /> Klucze Dostępu
                    </TabButton>
                    <TabButton isActive={activeTab === 'availability'} onClick={() => setActiveTab('availability')}>
                        <CalendarIcon className="w-5 h-5" /> Dostępność
                    </TabButton>
                    <TabButton isActive={activeTab === 'gallery'} onClick={() => setActiveTab('gallery')}>
                        <PhotoIcon className="w-5 h-5" /> Galeria
                    </TabButton>
                    <TabButton isActive={activeTab === 'packages'} onClick={() => setActiveTab('packages')}>
                        <TagIcon className="w-5 h-5" /> Oferta
                    </TabButton>
                </nav>
            </div>

            <div>
                {activeTab === 'bookings' && <BookingsView onViewDetails={onViewDetails} />}
                {activeTab === 'accessKeys' && <AccessKeysView />}
                {activeTab === 'availability' && <AdminAvailabilityPage onViewBookingDetails={onViewDetails} />}
                {activeTab === 'gallery' && <AdminGalleryPage />}
                {activeTab === 'packages' && <AdminPackagesPage />}
            </div>
        </div>
    );
};

export default AdminDashboardPage;