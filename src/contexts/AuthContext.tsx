import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
    isAdmin: boolean;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState<boolean>(() => {
        // Initialize state from localStorage to prevent flicker on load
        return !!localStorage.getItem('adminAuthToken');
    });
    const navigate = useNavigate();

    const login = (token: string) => {
        localStorage.setItem('adminAuthToken', token);
        setIsAdmin(true);
        navigate('/admin');
    };

    const logout = () => {
        localStorage.removeItem('adminAuthToken');
        setIsAdmin(false);
        navigate('/');
    };

    return (
        <AuthContext.Provider value={{ isAdmin, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
