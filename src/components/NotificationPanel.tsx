
import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, BellIcon } from './Icons.tsx';

interface Notification {
    booking_id: number;
    bride_name: string;
    groom_name: string;
    unread_count: string; // Comes as string from DB aggregation
    latest_message_preview: string;
}

interface NotificationPanelProps {
    onNavigateToBooking: (bookingId: number) => void;
    onClose: () => void;
}

const NotificationPanel: FC<NotificationPanelProps> = ({ onNavigateToBooking, onClose }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchNotifications = async () => {
            const token = localStorage.getItem('adminAuthToken');
            if (!token) return;

            setIsLoading(true);
            setError('');
            try {
                const response = await fetch('/api/admin/notifications', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Nie udało się pobrać powiadomień.');
                const data = await response.json();
                setNotifications(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchNotifications();
    }, []);

    const handleNotificationClick = (bookingId: number) => {
        onNavigateToBooking(bookingId);
        onClose();
    };

    return (
        <div className="absolute right-0 mt-2 w-80 max-w-sm bg-white rounded-lg shadow-xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5">
            <div className="p-4 font-bold text-slate-800 border-b">
                Powiadomienia
            </div>
            {isLoading ? (
                <div className="p-8 flex justify-center"><LoadingSpinner /></div>
            ) : error ? (
                <div className="p-4 text-red-500 text-sm">{error}</div>
            ) : notifications.length === 0 ? (
                <div className="p-4 text-slate-500 text-sm text-center">Brak nowych powiadomień.</div>
            ) : (
                <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {notifications.map(n => (
                        <li key={n.booking_id} onClick={() => handleNotificationClick(n.booking_id)} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 pt-1">
                                    <span className="relative flex h-5 w-5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                        <BellIcon className="w-5 h-5 text-indigo-600" />
                                    </span>
                                </div>
                                <div className="ml-3 w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900">
                                        {n.unread_count} nowa wiadomość od {n.bride_name}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500 truncate italic">
                                        "{n.latest_message_preview}"
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default NotificationPanel;
