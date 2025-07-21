

import React, { useState, useEffect } from 'react';
import { MenuIcon, BellIcon } from './Icons.tsx';
import NotificationPanel from './NotificationPanel.tsx';
import { Page } from '../App.tsx';

interface HeaderProps {
    onMenuToggle: () => void;
    onViewDetails: (bookingId: number) => void;
    navigateTo: (page: Page) => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle, onViewDetails, navigateTo }) => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const checkAdminStatus = () => {
        const token = localStorage.getItem('adminAuthToken');
        setIsAdmin(!!token);
        if (!token) {
            setUnreadCount(0);
            setIsPanelOpen(false);
        }
    };

    useEffect(() => {
        checkAdminStatus();
        const interval = setInterval(checkAdminStatus, 2000); // Check login status periodically
        return () => clearInterval(interval);
    }, []);

    const fetchUnreadCount = async () => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            if (unreadCount > 0) setUnreadCount(0);
            return;
        }
        
        try {
            const response = await fetch('/api/admin/notifications/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.count);
            } else {
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Failed to fetch notification count:', error);
            setUnreadCount(0);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchUnreadCount();
            const interval = setInterval(fetchUnreadCount, 15000);
            return () => clearInterval(interval);
        }
    }, [isAdmin]);

    const handleBellClick = () => {
      setIsPanelOpen(prev => !prev);
      if(!isPanelOpen) {
          fetchUnreadCount();
      }
    };

    return (
        <header className="bg-white shadow-md sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <button
                            onClick={onMenuToggle}
                            className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                            aria-label="Otwórz menu"
                        >
                            <MenuIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <div className="font-cinzel text-2xl font-semibold text-slate-800 tracking-wider drop-shadow-sm">
                        DreamCatcher Film
                    </div>
                    <div className="w-8 flex items-center justify-end">
                        {isAdmin && (
                            <div className="relative">
                                <button
                                    onClick={handleBellClick}
                                    className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 relative"
                                    aria-label="Powiadomienia"
                                >
                                    <BellIcon className="h-6 w-6" />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold ring-2 ring-white">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                                {isPanelOpen && (
                                    <NotificationPanel 
                                        navigateTo={navigateTo}
                                        onViewDetails={onViewDetails}
                                        onClose={() => setIsPanelOpen(false)}
                                        onActionTaken={fetchUnreadCount}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
