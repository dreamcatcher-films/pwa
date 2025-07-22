import React, { useState, useEffect, useCallback, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer, Views, EventProps } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { pl } from 'date-fns/locale/pl';
import { LoadingSpinner } from '../components/Icons.tsx';
import EventModal from '../components/EventModal.tsx';

interface CalendarEvent {
    id: number | string;
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    description?: string;
    resource?: {
        type: 'event' | 'booking';
        bookingId?: number;
    };
}

const locales = {
    'pl': pl,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const messages = {
    allDay: 'Cały dzień',
    previous: '<',
    next: '>',
    today: 'Dziś',
    month: 'Miesiąc',
    week: 'Tydzień',
    day: 'Dzień',
    agenda: 'Agenda',
    date: 'Data',
    time: 'Czas',
    event: 'Wydarzenie',
    noEventsInRange: 'Brak wydarzeń w tym zakresie.',
    showMore: (total: number) => `+ Pokaż więcej (${total})`,
};

const CustomEvent: FC<EventProps<CalendarEvent>> = ({ event, title }) => {
    const isBooking = event.resource?.type === 'booking';
    return (
        <div className={`text-xs p-1 ${isBooking ? 'bg-green-500' : 'bg-indigo-500'} rounded`}>
            <strong>{title}</strong>
            {event.description && <p>{event.description}</p>}
        </div>
    );
};

const AdminAvailabilityPage: React.FC = () => {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Partial<CalendarEvent> | null>(null);

    const fetchEvents = useCallback(async () => {
        setIsLoading(true);
        const token = localStorage.getItem('adminAuthToken');
        try {
            const response = await fetch('/api/admin/availability', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd pobierania wydarzeń.');
            }
            const data = await response.json();
            const formattedEvents = data.map((event: any) => ({
                ...event,
                start: new Date(event.start),
                end: new Date(event.end),
            }));
            setEvents(formattedEvents);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
        setSelectedEvent({ start, end });
        setIsModalOpen(true);
    }, []);
    
    const handleSelectEvent = useCallback((event: CalendarEvent) => {
        setSelectedEvent(event);
        setIsModalOpen(true);
    }, []);

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedEvent(null);
    };

    const handleModalSave = () => {
        handleModalClose();
        fetchEvents(); // Refresh events after save or delete
    };
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 text-center py-20">{error}</p>;

    return (
        <div>
            <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: 'calc(100vh - 250px)' }}
                views={[Views.MONTH, Views.WEEK, Views.DAY]}
                messages={messages}
                culture="pl"
                selectable
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                components={{
                    event: CustomEvent,
                }}
                eventPropGetter={(event) => {
                    const isBooking = event.resource?.type === 'booking';
                    return {
                        style: {
                            backgroundColor: isBooking ? '#22c55e' : '#4f46e5',
                            borderColor: isBooking ? '#16a34a' : '#4338ca',
                        }
                    };
                }}
            />
            {isModalOpen && (
                <EventModal
                    event={selectedEvent}
                    onClose={handleModalClose}
                    onSave={handleModalSave}
                />
            )}
        </div>
    );
};

export default AdminAvailabilityPage;
