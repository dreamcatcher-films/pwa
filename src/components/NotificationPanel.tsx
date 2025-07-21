

import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, BellIcon, EnvelopeIcon } from './Icons.tsx';
import { Page } from '../App.tsx';

interface ClientMessageNotification {
    type: 'client_message';
    booking_id: number;
    sender_name: string;
    unread_count: string;
    preview: string;
}

interface InboxNotification {
    type: 'inbox_message';
    message_id: number;
    sender_name: string;
    preview: string;
}

type Notification = ClientMessageNotification | InboxNotification;

interface NotificationPanelProps {
    navigateTo: (page: Page) => void;
    onViewDetails: (bookingId: number) => void;
    onClose: () => void;
    onActionTaken: () => void;
}

const NotificationPanel: FC<NotificationPanelProps> = ({ navigateTo, onViewDetails, onClose, onActionTaken }) => {
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

    const handleNotificationClick = (notification: Notification) => {
        if (notification.type === 'client_message') {
            onViewDetails(notification.booking_id);
        } else {
            navigateTo('adminInbox');
        }
        onClose();
        setTimeout(onActionTaken, 1200); // Give time for the read status to update on backend
    };

    const getIcon = (type: Notification['type']) => {
        switch(type) {
            case 'client_message':
                return <BellIcon className="w-5 h-5 text-indigo-600" />;
            case 'inbox_message':
                return <EnvelopeIcon className="w-5 h-5 text-sky-600" />;
            default:
                return <BellIcon className="w-5 h-5 text-slate-500" />;
        }
    }

    const getTitle = (notification: Notification) => {
        if (notification.type === 'client_message') {
            return `${notification.unread_count} nowa wiadomość od ${notification.sender_name}`;
        }
        return `Nowe zapytanie od ${notification.sender_name}`;
    }

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
                        <li key={`${n.type}-${n.type === 'client_message' ? n.booking_id : n.message_id}`} onClick={() => handleNotificationClick(n)} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 pt-1">
                                    <span className="relative flex h-5 w-5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                        {getIcon(n.type)}
                                    </span>
                                </div>
                                <div className="ml-3 w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900">
                                        {getTitle(n)}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500 truncate italic">
                                        "{n.preview}"
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
