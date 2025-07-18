import React, { ReactNode } from 'react';

export const InputField = ({ id, label, type = 'text', placeholder, value, onChange, required = true, icon, error, name }: {
    id: string;
    label: string;
    type?: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    required?: boolean;
    icon?: ReactNode;
    error?: string;
    name?: string;
}) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="relative mt-1">
             {icon && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{icon}</div>}
             <input
                type={type}
                id={id}
                name={name || id}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                className={`block w-full py-2 bg-white border rounded-md text-sm shadow-sm placeholder-slate-400
                         focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                         ${icon ? 'pl-10 pr-3' : 'px-3'}
                         ${error ? 'border-red-500' : 'border-slate-300'}`}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
            />
        </div>
        {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
);


export const TextAreaField = ({ id, label, placeholder, value, onChange, rows = 3, required = true, name }: {
    id: string;
    label: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    rows?: number;
    required?: boolean;
    name?: string;
}) => (
     <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <textarea
            id={id}
            name={name || id}
            rows={rows}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400
                     focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        ></textarea>
    </div>
);