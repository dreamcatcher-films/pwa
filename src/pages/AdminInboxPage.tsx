
import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, TrashIcon, EnvelopeIcon } from '../components/Icons.tsx';

interface Message {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

const AdminInboxPage: FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const token = localStorage.getItem('adminAuthToken');

    const fetchMessages = async (selectFirst: boolean = false) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/inbox', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd pobierania wiadomości.');
            }
            const data: Message[] = await response.json();
            setMessages(data);
            if (selectFirst && data.length > 0) {
                handleSelectMessage(data[0]);
            } else if (data.length === 0) {
                setSelectedMessage(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages(true);
    }, []);

    const handleSelectMessage = async (message: Message) => {
        setSelectedMessage(message);
        if (!message.is_read) {
            try {
                await fetch(`/api/admin/inbox/${message.id}/read`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_read: true } : m));
            } catch (err) {
                console.error('Failed to mark message as read:', err);
            }
        }
    };
    
    const handleDeleteMessage = async (messageId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć tę wiadomość?')) return;
        
        setError('');
        try {
            await fetch(`/api/admin/inbox/${messageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await fetchMessages(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas usuwania.');
        }
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="bg-white rounded-2xl shadow-lg h-[calc(100vh-280px)] flex overflow-hidden">
            {/* Message List */}
            <div className="w-1/3 border-r border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800">Skrzynka odbiorcza</h2>
                </div>
                 {isLoading && !messages.length ? (
                    <div className="flex-grow flex items-center justify-center"><LoadingSpinner/></div>
                ) : (
                    <ul className="overflow-y-auto flex-grow">
                        {messages.map(msg => (
                            <li
                                key={msg.id}
                                onClick={() => handleSelectMessage(msg)}
                                className={`p-4 border-b border-slate-100 cursor-pointer ${selectedMessage?.id === msg.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <p className={`font-semibold text-slate-800 ${!msg.is_read ? 'font-bold' : ''}`}>{`${msg.first_name} ${msg.last_name}`}</p>
                                    {!msg.is_read && <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5"></span>}
                                </div>
                                <p className="text-sm text-slate-600 truncate">{msg.subject}</p>
                                <p className="text-xs text-slate-400 mt-1">{formatDate(msg.created_at)}</p>
                            </li>
                        ))}
                         {messages.length === 0 && !isLoading && (
                            <div className="text-center text-slate-500 p-8 flex flex-col items-center justify-center h-full">
                                <EnvelopeIcon className="w-12 h-12 text-slate-300 mb-4"/>
                                <p className="font-semibold">Skrzynka jest pusta</p>
                                <p className="text-sm">Nowe zapytania pojawią się tutaj.</p>
                            </div>
                         )}
                    </ul>
                )}
            </div>
            
            {/* Message Detail */}
            <div className="w-2/3 flex flex-col">
                {selectedMessage ? (
                    <>
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900">{selectedMessage.subject}</h3>
                                <p className="text-sm text-slate-500">od: {`${selectedMessage.first_name} ${selectedMessage.last_name}`} (<a href={`mailto:${selectedMessage.email}`} className="text-indigo-600 hover:underline">{selectedMessage.email}</a>)</p>
                            </div>
                            <button onClick={() => handleDeleteMessage(selectedMessage.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń wiadomość">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-grow space-y-4">
                            {selectedMessage.phone && (
                                 <p className="text-sm"><strong>Telefon:</strong> <a href={`tel:${selectedMessage.phone}`} className="text-indigo-600 hover:underline">{selectedMessage.phone}</a></p>
                            )}
                            <div className="prose prose-sm max-w-none text-slate-800 bg-slate-50 p-4 rounded-lg">
                                <p className="whitespace-pre-wrap">{selectedMessage.message}</p>
                            </div>
                        </div>
                    </>
                ) : (
                     <div className="flex-grow flex items-center justify-center text-slate-400">
                        <p>Wybierz wiadomość, aby ją wyświetlić.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminInboxPage;
