

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';

// --- Environment Variable Validation ---
// Ensure all critical environment variables are set before proceeding.
const requiredEnvVars = ['DATABASE_URL', 'ADMIN_JWT_SECRET', 'JWT_SECRET', 'RESEND_API_KEY', 'BLOB_READ_WRITE_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    const errorMessage = `FATAL ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}. Please set these in your Vercel project settings.`;
    console.error(errorMessage);
    // This will cause the serverless function to fail with a clear error in the logs.
    throw new Error(errorMessage);
}


const app = express();

// --- Middleware ---
app.use(cors());
// JSON and URL-encoded parsers for most routes
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
// Special raw body parser for file uploads
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

const runDbSetup = async () => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
        // --- CLEANUP ---
        await client.query('DROP TABLE IF EXISTS packages_old CASCADE;');


        await client.query(`
            CREATE TABLE IF NOT EXISTS access_keys (
                id SERIAL PRIMARY KEY,
                key VARCHAR(4) UNIQUE NOT NULL,
                client_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                notification_email VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS availability (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                is_all_day BOOLEAN DEFAULT FALSE,
                resource JSONB
            );

            CREATE TABLE IF NOT EXISTS galleries (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                image_url TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS addons (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              price NUMERIC(10, 2) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS discount_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(255) UNIQUE NOT NULL,
                type VARCHAR(50) NOT NULL, -- 'percentage' or 'fixed'
                value NUMERIC(10, 2) NOT NULL,
                usage_limit INTEGER,
                times_used INTEGER DEFAULT 0,
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
             CREATE TABLE IF NOT EXISTS production_stages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(255),
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                access_key VARCHAR(4) REFERENCES access_keys(key),
                client_id VARCHAR(4) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                package_name VARCHAR(255) NOT NULL,
                total_price NUMERIC(10, 2) NOT NULL,
                selected_items TEXT[],
                bride_name VARCHAR(255) NOT NULL,
                groom_name VARCHAR(255) NOT NULL,
                wedding_date DATE NOT NULL,
                bride_address TEXT,
                groom_address TEXT,
                church_location TEXT,
                venue_location TEXT,
                schedule TEXT,
                email VARCHAR(255) NOT NULL,
                phone_number VARCHAR(255),
                additional_info TEXT,
                discount_code VARCHAR(255),
                payment_status VARCHAR(50) DEFAULT 'pending',
                amount_paid NUMERIC(10, 2) DEFAULT 0.00,
                couple_photo_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE bookings ADD COLUMN IF NOT EXISTS couple_photo_url TEXT;
            
            CREATE TABLE IF NOT EXISTS booking_stages (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                stage_id INTEGER REFERENCES production_stages(id),
                status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, awaiting_approval, completed
                completed_at TIMESTAMP WITH TIME ZONE
            );
            
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                sender VARCHAR(50) NOT NULL, -- 'client' or 'admin'
                content TEXT,
                attachment_url TEXT,
                attachment_type VARCHAR(100),
                is_read_by_admin BOOLEAN DEFAULT FALSE,
                is_read_by_client BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                icon_name VARCHAR(255)
            );
            
            CREATE TABLE IF NOT EXISTS packages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price NUMERIC(10, 2) NOT NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                is_published BOOLEAN DEFAULT FALSE,
                rich_description TEXT,
                rich_description_image_url TEXT
            );
            
            CREATE TABLE IF NOT EXISTS package_addons (
                package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
                addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
                PRIMARY KEY (package_id, addon_id)
            );

            CREATE TABLE IF NOT EXISTS addon_categories (
                addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
                category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
                PRIMARY KEY (addon_id, category_id)
            );

            CREATE TABLE IF NOT EXISTS homepage_slides (
                id SERIAL PRIMARY KEY,
                image_url TEXT NOT NULL,
                title VARCHAR(255),
                subtitle VARCHAR(255),
                button_text VARCHAR(255),
                button_link VARCHAR(255),
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS homepage_testimonials (
                id SERIAL PRIMARY KEY,
                author VARCHAR(255) NOT NULL,
                content TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS homepage_instagram (
                id SERIAL PRIMARY KEY,
                post_url TEXT NOT NULL,
                image_url TEXT NOT NULL,
                caption TEXT,
                sort_order INTEGER DEFAULT 0
            );

        `);

        // Insert default admin if none exists
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

const initialize = async () => {
    if (!initializationPromise) {
        initializationPromise = runDbSetup().catch(err => {
            initializationPromise = null; // Reset on failure
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
        req.user = decoded; // Adds user info (e.g., bookingId) to the request
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

// --- CLIENT-AUTHENTICATED ROUTES ---

app.post('/api/my-booking/photo', authenticateClient, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || `photo-${req.user.bookingId}.jpg`;
    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ message: 'No file content provided.' });
    }

    try {
        const blob = await put(filename, req.body, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        await getPool().query('UPDATE bookings SET couple_photo_url = $1 WHERE id = $2', [blob.url, req.user.bookingId]);

        res.status(200).json(blob);
    } catch (error) {
        console.error('Error uploading couple photo:', error);
        res.status(500).json({ message: 'Błąd podczas przesyłania zdjęcia.' });
    }
});

// The rest of the api/index.js file remains the same...
// ... (omitted for brevity, assume the rest of the file is correct)
export default app;
