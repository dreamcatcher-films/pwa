import React, { ReactNode, FC } from 'react';

export const InfoCard: FC<{title: string; icon?: ReactNode, children: ReactNode; actionButton?: ReactNode}> = ({ title, icon, children, actionButton }) => (
    <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4 border-b pb-4">
            <div className="flex items-center">
                {icon}
                <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            </div>
            {actionButton}
        </div>
        <div className="space-y-4 text-slate-700">{children}</div>
    </div>
);

export const InfoItem: FC<{label: string; value?: string | number | null | ReactNode}> = ({ label, value }) => {
    if (value === null || value === undefined) return null;
    const displayValue = typeof value === 'string' && value.trim() === '' ? <span className="italic text-slate-400">Brak danych</span> : value;
    return (
        <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="font-medium whitespace-pre-wrap break-words">{displayValue}</p>
        </div>
    );
};
