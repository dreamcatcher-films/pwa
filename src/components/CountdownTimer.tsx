import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
    targetDate: string;
}

const TimeSegment: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div className="flex flex-col items-center">
        <span className="text-4xl font-bold text-slate-800 tracking-tight">{String(value).padStart(2, '0')}</span>
        <span className="text-xs uppercase text-slate-500 tracking-wider">{label}</span>
    </div>
);

const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDate }) => {
    const calculateTimeLeft = () => {
        const difference = +new Date(targetDate) - +new Date();
        let timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

        if (difference > 0) {
            timeLeft = {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
            };
        }
        return timeLeft;
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearTimeout(timer);
    });
    
    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="text-center font-bold text-slate-800 mb-4">Czas do Waszego Dnia</h3>
            <div className="flex justify-around items-center">
                <TimeSegment value={timeLeft.days} label="Dni" />
                <span className="text-3xl font-light text-slate-300 -mt-3">:</span>
                <TimeSegment value={timeLeft.hours} label="Godzin" />
                <span className="text-3xl font-light text-slate-300 -mt-3">:</span>
                <TimeSegment value={timeLeft.minutes} label="Minut" />
                 <span className="text-3xl font-light text-slate-300 -mt-3">:</span>
                <TimeSegment value={timeLeft.seconds} label="Sekund" />
            </div>
        </div>
    );
};

export default CountdownTimer;
