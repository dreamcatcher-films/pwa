import React, { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraIcon, EngagementRingSpinner, CheckCircleIcon } from './Icons.tsx';
import { uploadCouplePhoto } from '../api.ts';

interface BookingData {
    id: number;
    bride_name: string;
    groom_name: string;
    couple_photo_url: string | null;
}

interface ClientPanelHeroProps {
    booking: BookingData;
    onLogout: () => void;
}

const ClientPanelHero: React.FC<ClientPanelHeroProps> = ({ booking, onLogout }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: uploadCouplePhoto,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientPanel'] });
        },
    });

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            mutation.mutate(file);
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const heroStyle = {
        backgroundImage: booking.couple_photo_url ? `url(${booking.couple_photo_url})` : 'none',
    };

    return (
        <div 
            className="relative bg-slate-200 bg-cover bg-center rounded-2xl shadow-lg p-8 h-64 flex flex-col justify-between text-white" 
            style={heroStyle}
        >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20 rounded-2xl"></div>
            
            <div className="relative z-10 flex justify-between items-start">
                <div>
                    <h1 className="text-4xl font-bold font-cinzel tracking-wide drop-shadow-lg">
                        Witajcie, {booking.bride_name} & {booking.groom_name}
                    </h1>
                    <p className="text-lg text-slate-200 drop-shadow">Oto centrum zarządzania Waszym wielkim dniem.</p>
                </div>
                <button onClick={onLogout} className="bg-white/10 text-white backdrop-blur-sm font-bold py-2 px-4 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0">
                    Wyloguj się
                </button>
            </div>

            <div className="relative z-10 self-end">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png, image/jpeg"
                    className="hidden"
                    disabled={mutation.isPending}
                />
                <button 
                    onClick={handleButtonClick}
                    disabled={mutation.isPending}
                    className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white font-semibold py-2 px-4 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                    {mutation.isPending && <EngagementRingSpinner className="w-5 h-5" />}
                    {mutation.isSuccess && <CheckCircleIcon className="w-5 h-5 text-green-300" />}
                    {!mutation.isPending && <CameraIcon className="w-5 h-5" />}
                    <span>{booking.couple_photo_url ? 'Zmień zdjęcie' : 'Dodaj Wasze zdjęcie'}</span>
                </button>
                {mutation.isError && <p className="text-xs text-red-300 mt-1">{mutation.error.message}</p>}
            </div>
        </div>
    );
};

export default ClientPanelHero;
