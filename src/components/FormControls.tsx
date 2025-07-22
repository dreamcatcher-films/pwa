import React, { ReactNode } from 'react';
import { UseFormRegisterReturn, FieldError } from 'react-hook-form';

interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'ref'> {
    id: string;
    label: string;
    icon?: ReactNode;
    error?: FieldError;
    register?: UseFormRegisterReturn;
}

export const InputField: React.FC<InputFieldProps> = ({ id, label, type = 'text', icon, error, register, required, ...rest }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="relative mt-1">
             {icon && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{icon}</div>}
             <input
                id={id}
                type={type}
                required={required}
                {...register}
                {...rest}
                className={`block w-full py-2 bg-white border rounded-md text-sm shadow-sm placeholder-slate-400
                         focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                         ${icon ? 'pl-10 pr-3' : 'px-3'}
                         ${error ? 'border-red-500' : 'border-slate-300'}`}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
            />
        </div>
        {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{error.message}</p>}
    </div>
);


interface TextAreaFieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> {
    id: string;
    label: string;
    error?: FieldError;
    register?: UseFormRegisterReturn;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({ id, label, error, register, required, ...rest }) => (
     <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <textarea
            id={id}
            required={required}
            {...register}
            {...rest}
            className={`mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400
                     focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                     ${error ? 'border-red-500' : 'border-slate-300'}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
        ></textarea>
        {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{error.message}</p>}
    </div>
);
