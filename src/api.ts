// --- HELPER FUNCTIONS ---

const getAdminToken = () => localStorage.getItem('adminAuthToken');
const getClientToken = () => localStorage.getItem('authToken');

const apiFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try {
            errorJson = JSON.parse(errorText);
        } catch (e) {
            // Not a JSON error
        }
        const message = errorJson?.message || errorText || `Request failed with status ${response.status}`;
        throw new Error(message);
    }
    // Handle cases where response might be empty (e.g., DELETE with 204)
    if (response.status === 204) {
        return null;
    }
    return response.json();
};

const apiFetchNoJson = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    return response;
};

// --- PUBLIC API ---

export const getPackages = () => apiFetch('/api/packages');
export const validateAccessKey = (key: string) => apiFetch('/api/validate-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
});
export const createBooking = (bookingData: any) => apiFetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
});
export const validateDiscount = (code: string) => apiFetch('/api/validate-discount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
});
export const getGallery = () => apiFetch('/api/gallery');
export const submitContactForm = (formData: any) => apiFetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
});
export const getContactDetails = () => apiFetch('/api/contact-details');
export const getHomepageContent = () => apiFetch('/api/homepage-content');

// --- AUTHENTICATION API ---

export const loginClient = (credentials: { clientId: string, password: string }) => apiFetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
});

export const loginAdmin = (credentials: { email: string, password: string }) => apiFetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
});


// --- CLIENT-AUTHENTICATED API ---

export const getMyBooking = () => apiFetch('/api/my-booking', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
export const updateMyBooking = (data: any) => apiFetch('/api/my-booking', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getClientToken()}` },
    body: JSON.stringify(data),
});
export const uploadCouplePhoto = async (file: File) => {
    const response = await fetch('/api/my-booking/photo', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getClientToken()}`,
            'x-vercel-filename': file.name,
            'Content-Type': file.type,
        },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

export const getBookingStages = () => apiFetch('/api/booking-stages', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
export const approveBookingStage = (stageId: number) => apiFetch(`/api/booking-stages/${stageId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${getClientToken()}` },
});
export const getMessages = () => apiFetch('/api/messages', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
export const getUnreadMessageCount = () => apiFetch('/api/messages/unread-count', { headers: { 'Authorization': `Bearer ${getClientToken()}` } });
export const markMessagesAsRead = () => apiFetch(`/api/messages/mark-as-read`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${getClientToken()}` },
});
export const sendClientMessage = (content: string) => apiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getClientToken()}` },
    body: JSON.stringify({ content }),
});

export const getClientPanelData = async () => {
    const [booking, stages, messages, unreadCount] = await Promise.all([
        getMyBooking(),
        getBookingStages(),
        getMessages(),
        getUnreadMessageCount(),
    ]);
    return { booking, stages, messages, unreadCount };
};

// --- ADMIN-AUTHENTICATED API ---

// Bookings
export const getAdminBookings = () => apiFetch('/api/admin/bookings', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const getAdminBookingDetails = (id: string) => apiFetch(`/api/admin/bookings/${id}`, { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const deleteAdminBooking = (id: number) => apiFetchNoJson(`/api/admin/bookings/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const updateAdminBooking = ({ id, data }: { id: string, data: any }) => apiFetch(`/api/admin/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const updateBookingPayment = ({ id, data }: { id: string, data: any }) => apiFetch(`/api/admin/bookings/${id}/payment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const resendCredentials = (id: string) => apiFetch(`/api/admin/bookings/${id}/resend-credentials`, { method: 'POST', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Access Keys
export const getAccessKeys = () => apiFetch('/api/admin/access-keys', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const createAccessKey = (clientName: string) => apiFetch('/api/admin/access-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify({ client_name: clientName }),
});
export const deleteAccessKey = (id: number) => apiFetchNoJson(`/api/admin/access-keys/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Availability
export const getAvailability = () => apiFetch('/api/admin/availability', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const createAvailability = (data: any) => apiFetch('/api/admin/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const updateAvailability = ({ id, data }: { id: any, data: any }) => apiFetch(`/api/admin/availability/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const deleteAvailability = (id: any) => apiFetchNoJson(`/api/admin/availability/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Gallery
export const getAdminGallery = () => apiFetch('/api/admin/galleries', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const uploadGalleryImage = async (file: File) => {
    const response = await fetch('/api/admin/galleries/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const createGalleryItem = (data: { title: string, description: string, image_url: string }) => apiFetch('/api/admin/galleries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const deleteGalleryItem = (id: number) => apiFetchNoJson(`/api/admin/galleries/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Offer Data (Packages, Addons, Categories)
export const getOfferData = () => apiFetch('/api/admin/offer-data', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Categories
export const createCategory = (data: any) => apiFetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updateCategory = ({ id, data }: { id: number, data: any }) => apiFetch(`/api/admin/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteCategory = (id: number) => apiFetchNoJson(`/api/admin/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Addons
export const createAddon = (data: any) => apiFetch('/api/admin/addons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updateAddon = ({ id, data }: { id: number, data: any }) => apiFetch(`/api/admin/addons/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteAddon = (id: number) => apiFetchNoJson(`/api/admin/addons/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Packages
export const uploadPackageImage = async (file: File) => {
    const response = await fetch('/api/admin/packages/upload-image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name },
        body: file
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const createPackage = (data: any) => apiFetch('/api/admin/packages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updatePackage = ({ id, data }: { id: any, data: any }) => apiFetch(`/api/admin/packages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deletePackage = (id: number) => apiFetchNoJson(`/api/admin/packages/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Discounts
export const getDiscounts = () => apiFetch('/api/admin/discounts', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const createDiscount = (data: any) => apiFetch('/api/admin/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteDiscount = (id: number) => apiFetchNoJson(`/api/admin/discounts/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Production Stages
export const getStages = () => apiFetch('/api/admin/stages', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const createStage = (data: { name: string, description: string }) => apiFetch('/api/admin/stages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteStage = (id: number) => apiFetchNoJson(`/api/admin/stages/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Booking Stages
export const getBookingStagesForAdmin = (bookingId: string) => apiFetch(`/api/admin/booking-stages/${bookingId}`, { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const addStageToBooking = ({ bookingId, stage_id }: { bookingId: string, stage_id: string }) => apiFetch(`/api/admin/booking-stages/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify({ stage_id }),
});
export const updateBookingStageStatus = ({ stageId, status }: { stageId: number, status: string }) => apiFetch(`/api/admin/booking-stages/${stageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify({ status }),
});
export const removeStageFromBooking = (stageId: number) => apiFetchNoJson(`/api/admin/booking-stages/${stageId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Settings
export const initializeDb = () => apiFetch('/api/admin/setup-database', { method: 'POST', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const resetDb = () => apiFetch('/api/admin/reset-database', { method: 'POST', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const getAdminSettings = () => apiFetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const updateAdminSettings = (data: { email: string }) => apiFetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updateAdminCredentials = (data: any) => apiFetch('/api/admin/credentials', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const getAdminContactSettings = () => apiFetch('/api/admin/contact-settings', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const updateAdminContactSettings = (data: any) => apiFetch('/api/admin/contact-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });

// Admin Messaging
export const getAdminMessages = (bookingId: string) => apiFetch(`/api/admin/messages/${bookingId}`, { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const uploadAdminAttachment = async (file: File) => {
    const response = await fetch('/api/admin/messages/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name, 'Content-Type': file.type },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const sendAdminMessage = ({ bookingId, data }: { bookingId: string, data: any }) => apiFetch(`/api/admin/messages/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
    body: JSON.stringify(data),
});
export const getAdminUnreadCount = (bookingId: string) => apiFetch(`/api/admin/bookings/${bookingId}/unread-count`, { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const markAdminMessagesAsRead = (bookingId: string) => apiFetch(`/api/admin/bookings/${bookingId}/messages/mark-as-read`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${getAdminToken()}` },
});

// Admin Homepage
export const getHomepageSlides = () => apiFetch('/api/admin/homepage/slides', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const uploadHomepageSlideImage = async (file: File) => {
    const response = await fetch('/api/admin/homepage/slides/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const createHomepageSlide = (data: any) => apiFetch('/api/admin/homepage/slides', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updateHomepageSlide = ({ id, data }: { id: any, data: any }) => apiFetch(`/api/admin/homepage/slides/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteHomepageSlide = (id: number) => apiFetchNoJson(`/api/admin/homepage/slides/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const reorderHomepageSlides = (orderedIds: number[]) => apiFetch('/api/admin/homepage/slides/order', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify({ orderedIds }) });

export const getHomepageAbout = () => apiFetch('/api/admin/homepage/about', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const uploadHomepageAboutImage = async (file: File) => {
    const response = await fetch('/api/admin/homepage/about/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const updateHomepageAbout = (data: any) => apiFetch('/api/admin/homepage/about', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });

export const getHomepageTestimonials = () => apiFetch('/api/admin/homepage/testimonials', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const createHomepageTestimonial = (data: any) => apiFetch('/api/admin/homepage/testimonials', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const updateHomepageTestimonial = ({ id, data }: { id: any, data: any }) => apiFetch(`/api/admin/homepage/testimonials/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteHomepageTestimonial = (id: number) => apiFetchNoJson(`/api/admin/homepage/testimonials/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

export const getHomepageInstagram = () => apiFetch('/api/admin/homepage/instagram', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const uploadHomepageInstagramImage = async (file: File) => {
    const response = await fetch('/api/admin/homepage/instagram/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}`, 'x-vercel-filename': file.name },
        body: file,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
export const createHomepageInstagramPost = (data: any) => apiFetch('/api/admin/homepage/instagram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify(data) });
export const deleteHomepageInstagramPost = (id: number) => apiFetchNoJson(`/api/admin/homepage/instagram/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const reorderHomepageInstagramPosts = (orderedIds: number[]) => apiFetch('/api/admin/homepage/instagram/order', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` }, body: JSON.stringify({ orderedIds }) });

// Admin Inbox
export const getInboxMessages = () => apiFetch('/api/admin/inbox', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const markInboxMessageAsRead = (id: number) => apiFetchNoJson(`/api/admin/inbox/${id}/read`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const deleteInboxMessage = (id: number) => apiFetchNoJson(`/api/admin/inbox/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAdminToken()}` } });

// Admin Notifications
export const getNotifications = () => apiFetch('/api/admin/notifications', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
export const getNotificationCount = () => apiFetch('/api/admin/notifications/count', { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
