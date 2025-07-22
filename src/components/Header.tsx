import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MenuIcon, BellIcon } from './Icons.tsx';
import NotificationPanel from './NotificationPanel.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { getNotificationCount } from '../api.ts';

interface HeaderProps {
    onMenuToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
    const { isAdmin } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const { data: unreadCount, refetch } = useQuery({
      queryKey: ['notificationCount'],
      queryFn: getNotificationCount,
      enabled: isAdmin,
      refetchInterval: 15000, // Refetch every 15 seconds
      select: (data) => data.count,
      initialData: { count: 0 },
    });

    const handleBellClick = () => {
      const newPanelState = !isPanelOpen;
      setIsPanelOpen(newPanelState);
      if(newPanelState) {
          refetch(); // Manually refetch when opening the panel
      }
    };

    return (
        <header className="bg-white shadow-md sticky top-0 z-30">
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
                                        onClose={() => setIsPanelOpen(false)}
                                        onActionTaken={() => refetch()}
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
