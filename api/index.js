

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';

// --- Environment Variable Validation ---
const requiredEnvVars = ['DATABASE_URL', 'ADMIN_JWT_SECRET', 'JWT_SECRET', 'RESEND_API_KEY', 'BLOB_READ_WRITE_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    const errorMessage = `FATAL ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}. Please set these in your Vercel project settings.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
const rawBodyParser = express.raw({ type: '*/*', limit: '6mb' });

const resend = new Resend(process.env.RESEND_API_KEY);

// --- Database Configuration & Initialization ---
let pool;
let initializationPromise = null;

const getPool = () => {
    if (!pool) {
        console.log("Initializing new database connection pool...");
        pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client in pool', err);
            pool = null; 
        });
    }
    return pool;
};

const runDbSetup = async (shouldDrop = false) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        if (shouldDrop) {
            console.log("Dropping all tables...");
             const tables = ['guests', 'films', 'messages', 'booking_stages', 'bookings', 'homepage_instagram', 'homepage_testimonials', 'homepage_slides', 'package_addons', 'addon_categories', 'packages', 'categories', 'app_settings', 'contact_messages', 'production_stages', 'discount_codes', 'addons', 'galleries', 'availability', 'admins', 'access_keys'];
             for (const table of tables) {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
             }
        }
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS access_keys (id SERIAL PRIMARY KEY, key VARCHAR(4) UNIQUE NOT NULL, client_name VARCHAR(255) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, notification_email VARCHAR(255), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS availability (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT, start_time TIMESTAMP WITH TIME ZONE NOT NULL, end_time TIMESTAMP WITH TIME ZONE NOT NULL, is_all_day BOOLEAN DEFAULT FALSE, resource JSONB);
            CREATE TABLE IF NOT EXISTS galleries (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT, image_url TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS addons (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, price NUMERIC(10, 2) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS discount_codes (id SERIAL PRIMARY KEY, code VARCHAR(255) UNIQUE NOT NULL, type VARCHAR(50) NOT NULL, value NUMERIC(10, 2) NOT NULL, usage_limit INTEGER, times_used INTEGER DEFAULT 0, expires_at TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS production_stages (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS contact_messages (id SERIAL PRIMARY KEY, first_name VARCHAR(255) NOT NULL, last_name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, phone VARCHAR(255), subject TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(255) PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, description TEXT, icon_name VARCHAR(255));
            CREATE TABLE IF NOT EXISTS packages (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price NUMERIC(10, 2) NOT NULL, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, is_published BOOLEAN DEFAULT FALSE, rich_description TEXT, rich_description_image_url TEXT);
            CREATE TABLE IF NOT EXISTS package_addons (package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE, addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE, PRIMARY KEY (package_id, addon_id));
            CREATE TABLE IF NOT EXISTS addon_categories (addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE, category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE, PRIMARY KEY (addon_id, category_id));
            CREATE TABLE IF NOT EXISTS homepage_slides (id SERIAL PRIMARY KEY, image_url TEXT NOT NULL, title VARCHAR(255), subtitle VARCHAR(255), button_text VARCHAR(255), button_link VARCHAR(255), sort_order INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS homepage_testimonials (id SERIAL PRIMARY KEY, author VARCHAR(255) NOT NULL, content TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS homepage_instagram (id SERIAL PRIMARY KEY, post_url TEXT NOT NULL, image_url TEXT NOT NULL, caption TEXT, sort_order INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, access_key VARCHAR(4) REFERENCES access_keys(key), client_id VARCHAR(4) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, package_name VARCHAR(255) NOT NULL, total_price NUMERIC(10, 2) NOT NULL, selected_items JSONB, bride_name VARCHAR(255) NOT NULL, groom_name VARCHAR(255) NOT NULL, wedding_date DATE NOT NULL, bride_address TEXT, groom_address TEXT, church_location TEXT, venue_location TEXT, schedule TEXT, email VARCHAR(255) NOT NULL, phone_number VARCHAR(255), additional_info TEXT, discount_code VARCHAR(255), payment_status VARCHAR(50) DEFAULT 'pending', amount_paid NUMERIC(10, 2) DEFAULT 0.00, couple_photo_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS booking_stages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, stage_id INTEGER REFERENCES production_stages(id), status VARCHAR(50) DEFAULT 'pending', completed_at TIMESTAMP WITH TIME ZONE);
            CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, sender VARCHAR(50) NOT NULL, content TEXT, attachment_url TEXT, attachment_type VARCHAR(100), is_read_by_admin BOOLEAN DEFAULT FALSE, is_read_by_client BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS films (id SERIAL PRIMARY KEY, youtube_url TEXT NOT NULL, title VARCHAR(255) NOT NULL, description TEXT, thumbnail_url TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                rsvp_status VARCHAR(50) DEFAULT 'pending' NOT NULL,
                rsvp_token UUID DEFAULT gen_random_uuid() NOT NULL,
                notes TEXT,
                group_name VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        const adminRes = await client.query('SELECT 1 FROM admins LIMIT 1');
        if (adminRes.rowCount === 0) {
            const defaultEmail = 'admin@dreamcatcher.com';
            const defaultPassword = 'password';
            const passwordHash = await bcrypt.hash(defaultPassword, 10);
            await client.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [defaultEmail, passwordHash]);
            console.log(`Default admin created: ${defaultEmail} / ${defaultPassword}. Please change this immediately.`);
        }
        
        await client.query('COMMIT');
        console.log("Database setup/check complete.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Database setup failed:", e);
        throw e;
    } finally {
        client.release();
    }
};

const initialize = async (shouldDrop = false) => {
    if (!initializationPromise || shouldDrop) {
        initializationPromise = runDbSetup(shouldDrop).catch(err => {
            initializationPromise = null;
            throw err;
        });
    }
    return initializationPromise;
};

app.use(async (req, res, next) => {
    try {
        await initialize();
        next();
    } catch (error) {
        res.status(500).send('Database initialization failed.');
    }
});

// --- Authentication Middleware ---
const authenticateClient = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Brak nagłówka autoryzacyjnego.' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nie został dostarczony.' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Client JWT verification error:", error.message);
        return res.status(403).json({ message: 'Nieprawidłowy token.' });
    }
};

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Brak nagłówka autoryzacyjnego.' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nie został dostarczony.' });
    try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        console.error("Admin JWT verification error:", error.message);
        return res.status(403).json({ message: 'Nieprawidłowy token.' });
    }
};

// --- YouTube Helper ---
const getYouTubeVideoId = (url) => {
    let videoId = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
            videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname === 'youtu.be') {
            videoId = urlObj.pathname.substring(1);
        }
    } catch (e) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        if (match) {
            videoId = match[1];
        }
    }
    return videoId;
};

// --- PUBLIC ROUTES ---

app.get('/api/homepage-content', async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const [slidesRes, aboutRes, testimonialsRes, instagramRes] = await Promise.all([
                client.query('SELECT * FROM homepage_slides ORDER BY sort_order ASC'),
                client.query("SELECT key, value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')"),
                client.query('SELECT * FROM homepage_testimonials ORDER BY id ASC'),
                client.query('SELECT * FROM homepage_instagram ORDER BY sort_order ASC'),
            ]);
            
            const aboutSection = aboutRes.rows.reduce((acc, row) => {
                acc[row.key] = row.value;
                return acc;
            }, {});

            res.json({
                slides: slidesRes.rows,
                aboutSection: {
                    about_us_title: aboutSection.about_us_title || 'Dreamcatcher powstał z pasji do opowiadania historii obrazem',
                    about_us_text: aboutSection.about_us_text || 'Opis domyślny...',
                    about_us_image_url: aboutSection.about_us_image_url || null
                },
                testimonials: testimonialsRes.rows,
                instagramPosts: instagramRes.rows,
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching homepage content:', error);
        res.status(500).json({ message: 'Błąd pobierania zawartości strony głównej.' });
    }
});

app.get('/api/packages', async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const [categoriesRes, packagesRes, addonsRes, packageAddonsRes] = await Promise.all([
                client.query('SELECT * FROM categories ORDER BY id'),
                client.query('SELECT * FROM packages WHERE is_published = TRUE ORDER BY price ASC'),
                client.query('SELECT * FROM addons ORDER BY name ASC'),
                client.query('SELECT * FROM package_addons')
            ]);

            const allAddons = addonsRes.rows;
            const packagesWithAddons = packagesRes.rows.map(pkg => {
                const includedAddonIds = packageAddonsRes.rows
                    .filter(pa => pa.package_id === pkg.id)
                    .map(pa => pa.addon_id);
                const included = allAddons
                    .filter(addon => includedAddonIds.includes(addon.id))
                    .map(addon => ({ ...addon, locked: true }));
                return { ...pkg, included };
            });

            res.json({
                categories: categoriesRes.rows,
                packages: packagesWithAddons,
                allAddons: allAddons
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).json({ message: 'Błąd pobierania oferty.' });
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({ message: 'Błąd pobierania galerii.' });
    }
});

app.get('/api/contact-details', async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const details = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(details);
    } catch (error) {
        console.error('Error fetching contact details:', error);
        res.status(500).json({ message: 'Błąd pobierania danych kontaktowych.' });
    }
});

app.post('/api/validate-key', async (req, res) => {
    const { key } = req.body;
    try {
        const result = await getPool().query('SELECT * FROM access_keys WHERE key = $1', [key]);
        if (result.rowCount > 0) {
            res.json({ valid: true });
        } else {
            res.status(404).json({--- START OF FILE src/pages/AdminPackagesPage.tsx ---

import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, PencilSquareIcon, PlusCircleIcon, TagIcon, CircleStackIcon, XMarkIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- TYPES ---
interface Category {
    id: number;
    name: string;
    description: string;
    icon_name: string;
}

interface Addon {
    id: number;
    name: string;
    price: number;
    category_ids?: number[];
}

interface PackageAddon {
    id: number;
}

interface Package {
    id?: number;
    name: string;
    description: string;
    price: number;
    category_id: number | null;
    category_name?: string;
    is_published: boolean;
    rich_description: string;
    rich_description_image_url: string;
    addons: PackageAddon[];
}

type AdminTab = 'packages' | 'addons' | 'categories';

const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

// --- MAIN COMPONENT ---
const AdminPackagesPage: FC = () => {
    const [activeTab, setActiveTab] = useState<AdminTab>('packages');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [packages, setPackages] = useState<Package[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    const token = localStorage.getItem('adminAuthToken');

    const fetchData = async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/offer-data', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(await response.text() || 'Błąd ładowania danych oferty.');
            const data = await response.json();
            setPackages(data.packages);
            setAddons(data.addons);
            setCategories(data.categories);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const renderContent = () => {
        if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
        if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center">{error}</p>;

        switch (activeTab) {
            case 'packages': return <PackagesManager packages={packages} addons={addons} categories={categories} onDataChange={fetchData} token={token} />;
            case 'addons': return <AddonsManager addons={addons} categories={categories} onDataChange={fetchData} token={token} />;
            case 'categories': return <CategoriesManager categories={categories} onDataChange={fetchData} token={token} />;
            default: return null;
        }
    };
    
    return (
        <div>
            <div className="border-b border-slate-200 mb-6">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('packages')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'packages' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Pakiety</button>
                    <button onClick={() => setActiveTab('addons')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'addons' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Dodatki</button>
                    <button onClick={() => setActiveTab('categories')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'categories' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Kategorie</button>
                </nav>
            </div>
            {renderContent()}
        </div>
    );
};

// --- MODAL WRAPPER ---
const Modal: FC<{ children: React.ReactNode, onClose: () => void, size?: 'md' | 'lg' | 'xl' }> = ({ children, onClose, size = 'lg' }) => {
    const sizeClasses = {
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl'
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className={`bg-white rounded-2xl shadow-2xl p-6 w-full relative animate-modal-in ${sizeClasses[size]}`} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <XMarkIcon className="w-6 h-6"/>
                </button>
                {children}
            </div>
        </div>
    );
};

// --- PACKAGES MANAGER ---
const PackagesManager: FC<{ packages: Package[], addons: Addon[], categories: Category[], onDataChange: () => void, token: string | null }> = ({ packages, addons, categories, onDataChange, token }) => {
    const [editingPackage, setEditingPackage] = useState<Package | null>(null);

    const handleDelete = async (id: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten pakiet?')) return;
        try {
            const res = await fetch(`/api/admin/packages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(await res.text());
            onDataChange();
        } catch (err) {
            alert((err as Error).message);
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">Zarządzaj Pakietami</h3>
                <button onClick={() => setEditingPackage({ name: '', description: '', price: 0, addons: [], category_id: null, is_published: false, rich_description: '', rich_description_image_url: '' })} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Pakiet
                </button>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
                <ul className="divide-y divide-slate-200">
                     {packages.map(pkg => (
                        <li key={pkg.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                            <div className="flex items-center gap-4">
                                <span className={`w-3 h-3 rounded-full ${pkg.is_published ? 'bg-green-500' : 'bg-slate-400'}`} title={pkg.is_published ? 'Opublikowany' : 'Szkic'}></span>
                                <div>
                                    <p className="font-bold text-slate-800">{pkg.name}</p>
                                    <p className="text-sm text-slate-500">{pkg.category_name || 'Brak kategorii'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-indigo-600">{formatCurrency(pkg.price)}</span>
                                <button onClick={() => setEditingPackage(pkg)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50"><PencilSquareIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleDelete(pkg.id!)} className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </li>
                     ))}
                </ul>
            </div>
            {editingPackage && <PackageEditor pkg={editingPackage} allAddons={addons} allCategories={categories} onClose={() => setEditingPackage(null)} onSave={onDataChange} token={token} />}
        </div>
    );
};

// --- ADDONS MANAGER ---
const AddonsManager: FC<{ addons: Addon[], categories: Category[], onDataChange: () => void, token: string | null }> = ({ addons, categories, onDataChange, token }) => {
    const [editingAddon, setEditingAddon] = useState<Partial<Addon> | null>(null);

    const handleSave = async (addon: Partial<Addon>) => {
        const endpoint = addon.id ? `/api/admin/addons/${addon.id}` : '/api/admin/addons';
        const method = addon.id ? 'PATCH' : 'POST';
        try {
            const res = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(addon) });
            if (!res.ok) throw new Error(await res.text());
            onDataChange();
            setEditingAddon(null);
        } catch (err) {
            alert((err as Error).message);
        }
    };
    
     const handleDelete = async (id: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten dodatek?')) return;
        try {
            const res = await fetch(`/api/admin/addons/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(await res.text());
            onDataChange();
        } catch (err) {
            alert((err as Error).message);
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">Zarządzaj Dodatkami</h3>
                <button onClick={() => setEditingAddon({ name: '', price: 0, category_ids: [] })} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Dodatek
                </button>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
                <ul className="divide-y divide-slate-200">
                    {addons.map(addon => (
                        <li key={addon.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                            <div>
                                <p className="font-medium text-slate-800">{addon.name}</p>
                                <p className="text-xs text-slate-500">
                                    Dostępny w: {
                                        addon.category_ids && addon.category_ids.length > 0 
                                        ? addon.category_ids.map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join(', ')
                                        : 'Wszystkie kategorie'
                                    }
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="font-semibold text-slate-700">{formatCurrency(addon.price)}</span>
                                <button onClick={() => setEditingAddon(addon)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50"><PencilSquareIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleDelete(addon.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            {editingAddon && <AddonEditor addon={editingAddon} allCategories={categories} onClose={() => setEditingAddon(null)} onSave={handleSave} />}
        </div>
    );
};

// --- CATEGORIES MANAGER ---
const CategoriesManager: FC<{ categories: Category[], onDataChange: () => void, token: string | null }> = ({ categories, onDataChange, token }) => {
    const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

    const handleSave = async (category: Partial<Category>) => {
        const endpoint = category.id ? `/api/admin/categories/${category.id}` : '/api/admin/categories';
        const method = category.id ? 'PATCH' : 'POST';
        try {
            const res = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(category) });
            if (!res.ok) throw new Error(await res.text());
            onDataChange();
            setEditingCategory(null);
        } catch (err) {
            alert((err as Error).message);
        }
    };
    
    const handleDelete = async (id: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć tę kategorię?')) return;
        try {
            const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(await res.text());
            onDataChange();
        } catch (err) {
            alert((err as Error).message);
        }
    };
    
    return (
        <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">Zarządzaj Kategoriami</h3>
                <button onClick={() => setEditingCategory({})} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Kategorię
                </button>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
                <ul className="divide-y divide-slate-200">
                    {categories.map(cat => (
                        <li key={cat.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                            <div>
                                <p className="font-medium text-slate-800">{cat.name}</p>
                                <p className="text-sm text-slate-500">{cat.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setEditingCategory(cat)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50"><PencilSquareIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleDelete(cat.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            {editingCategory && <SimpleEditor item={editingCategory} onClose={() => setEditingCategory(null)} onSave={handleSave} title="Kategoria" fields={[{ name: 'name', label: 'Nazwa' }, { name: 'description', label: 'Opis' }, { name: 'icon_name', label: 'Nazwa ikony' }]} />}
        </div>
    );
};

// --- ADDON EDITOR MODAL ---
const AddonEditor: FC<{ addon: Partial<Addon>, allCategories: Category[], onClose: () => void, onSave: (data: Partial<Addon>) => void }> = ({ addon, allCategories, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        ...addon,
        category_ids: addon.category_ids || []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleCategoryToggle = (categoryId: number) => {
        setFormData(prev => {
            const newCategoryIds = prev.category_ids!.includes(categoryId)
                ? prev.category_ids!.filter(id => id !== categoryId)
                : [...prev.category_ids!, categoryId];
            return { ...prev, category_ids: newCategoryIds };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave(formData);
        setIsSubmitting(false);
    };

    return (
        <Modal onClose={onClose} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800">{addon.id ? `Edytuj Dodatek` : `Nowy Dodatek`}</h3>
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700">Nazwa</label>
                    <input name="name" type="text" value={formData.name || ''} onChange={handleChange} className={inputClasses} required />
                </div>
                 <div>
                    <label htmlFor="price" className="block text-sm font-medium text-slate-700">Cena</label>
                    <input name="price" type="number" step="0.01" value={formData.price || ''} onChange={handleChange} className={inputClasses} required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Dostępny w kategoriach</label>
                    <p className="text-xs text-slate-500 mb-2">Jeśli żadna kategoria nie jest zaznaczona, dodatek będzie dostępny dla wszystkich pakietów.</p>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                        {allCategories.map(cat => (
                            <label key={cat.id} className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={formData.category_ids!.includes(cat.id)}
                                    onChange={() => handleCategoryToggle(cat.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="ml-2 text-sm text-slate-800">{cat.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                 <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};


// --- SIMPLE EDITOR MODAL (for Categories) ---
const SimpleEditor: FC<{ item: any, onClose: () => void, onSave: (item: any) => void, title: string, fields: {name: string, label: string, type?: string}[] }> = ({ item, onClose, onSave, title, fields }) => {
    const [formData, setFormData] = useState(item);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave(formData);
        setIsSubmitting(false);
    };

    return (
        <Modal onClose={onClose} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800">{item.id ? `Edytuj ${title}` : `Nowy ${title}`}</h3>
                {fields.map(field => (
                    <div key={field.name}>
                        <label htmlFor={field.name} className="block text-sm font-medium text-slate-700">{field.label}</label>
                        <input name={field.name} type={field.type || 'text'} value={formData[field.name] || ''} onChange={handleChange} className={inputClasses} required />
                    </div>
                ))}
                 <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};


// --- ADVANCED PACKAGE EDITOR ---
const PackageEditor: FC<{ pkg: Package, allAddons: Addon[], allCategories: Category[], onClose: () => void, onSave: () => void, token: string | null }> = ({ pkg, allAddons, allCategories, onClose, onSave, token }) => {
    const [formData, setFormData] = useState<Package>(pkg);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    
    const isEditing = !!formData.id;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setFormData(p => ({ ...p, [name]: (e.target as HTMLInputElement).checked }));
        } else {
             setFormData(p => ({ ...p, [name]: name === 'price' || name === 'category_id' ? Number(value) : value }));
        }
    };

    const handleAddonToggle = (addonId: number) => {
        const isIncluded = formData.addons.some(a => a.id === addonId);
        if (isIncluded) {
            setFormData(p => ({...p, addons: p.addons.filter(a => a.id !== addonId)}));
        } else {
            setFormData(p => ({...p, addons: [...p.addons, { id: addonId }]}));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        try {
            let imageUrl = formData.rich_description_image_url;
            if (imageFile) {
                const uploadRes = await fetch('/api/admin/packages/upload-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'x-vercel-filename': imageFile.name },
                    body: imageFile
                });
                if (!uploadRes.ok) throw new Error('Błąd wysyłania zdjęcia.');
                const blob = await uploadRes.json();
                imageUrl = blob.url;
            }

            const endpoint = isEditing ? `/api/admin/packages/${formData.id}` : '/api/admin/packages';
            const method = isEditing ? 'PATCH' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, rich_description_image_url: imageUrl })
            });
            if (!res.ok) {
                const errText = await res.text();
                 throw new Error(errText || 'Błąd zapisu pakietu.');
            }
            
            onSave();
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const includedAddonIds = new Set(formData.addons.map(a => a.id));

    const availableAddons = allAddons.filter(a => {
        if (includedAddonIds.has(a.id)) return false;
        if (!formData.category_id) return false;
        if (!a.category_ids || a.category_ids.length === 0) return true; // Universal addons
        return a.category_ids.includes(formData.category_id);
    });

    return (
        <Modal onClose={onClose} size="xl">
            <form onSubmit={handleSubmit} className="space-y-6">
                 <h3 className="text-xl font-bold text-slate-800">{isEditing ? 'Edytuj Pakiet' : 'Nowy Pakiet'}</h3>
                 {error && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm">{error}</p>}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Nazwa pakietu" className={inputClasses} required />
                    <input name="price" type="number" step="0.01" value={formData.price} onChange={handleChange} placeholder="Cena bazowa" className={inputClasses} required />
                     <select name="category_id" value={formData.category_id || ''} onChange={handleChange} className={inputClasses} required>
                        <option value="">-- Wybierz kategorię --</option>
                        {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Krótki opis (dla listy)" className={inputClasses} rows={2}></textarea>
                
                <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-2">Treść Marketingowa (dla klienta)</h4>
                     <textarea name="rich_description" value={formData.rich_description} onChange={handleChange} placeholder="Szczegółowy opis marketingowy pakietu (obsługuje Markdown)" className={inputClasses} rows={5}></textarea>
                    <div className="flex items-center gap-4 mt-2">
                        {formData.rich_description_image_url && <img src={formData.rich_description_image_url} alt="Podgląd" className="w-24 h-24 object-cover rounded-md" />}
                        <input type="file" onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)} accept="image/*" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                    </div>
                </div>

                <div className="pt-4 border-t grid grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-semibold mb-2">Dostępne dodatki</h4>
                        {!formData.category_id ? (
                            <div className="text-center p-4 border rounded-lg bg-slate-50 text-slate-500 text-sm">
                                Wybierz kategorię pakietu, aby zobaczyć dostępne dodatki.
                            </div>
                        ) : (
                            <ul className="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-lg p-2">
                                {availableAddons.map(addon => (
                                    <li key={addon.id} className="flex justify-between items-center p-2 rounded-md hover:bg-slate-50">
                                        <span>{addon.name} ({formatCurrency(addon.price)})</span>
                                        <button type="button" onClick={() => handleAddonToggle(addon.id)} className="p-1 text-green-500 hover:text-green-700"><PlusCircleIcon/></button>
                                    </li>
                                ))}
                                {availableAddons.length === 0 && <p className="text-center text-sm text-slate-400 p-2">Brak dostępnych dodatków dla tej kategorii.</p>}
                            </ul>
                        )}
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">Dodatki w pakiecie</h4>
                        <ul className="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-lg p-2">
                            {formData.addons.map(includedAddon => {
                                const addonDetails = allAddons.find(a => a.id === includedAddon.id);
                                if (!addonDetails) return null;
                                return (
                                    <li key={includedAddon.id} className="flex justify-between items-center p-2 bg-indigo-50 rounded-md">
                                        <div className="flex-grow">
                                            <span>{addonDetails.name}</span>
                                            {parseFloat(addonDetails.price.toString()) === 0 && (
                                                <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">Darmowy</span>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => handleAddonToggle(includedAddon.id)} className="p-1 text-red-500 hover:text-red-700"><TrashIcon/></button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
                
                 <div className="flex justify-between items-center pt-4 border-t">
                     <label className="flex items-center gap-2 text-sm cursor-pointer font-semibold">
                        <input type="checkbox" name="is_published" checked={formData.is_published} onChange={handleChange} className="rounded w-5 h-5" />
                        Opublikowany
                    </label>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                        <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                            {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default AdminPackagesPage;
