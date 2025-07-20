
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';

const { Pool } = pg;
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Database Configuration & Initialization ---
let pool;

const initializeDatabase = async () => {
    if (!process.env.DATABASE_URL) {
        console.error("FATAL ERROR: DATABASE_URL is not set.");
        return;
    }
    
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }, // Required for Supabase on Vercel
        });

        // Test the connection
        const client = await pool.connect();
        console.log('Successfully connected to the database pool!');
        client.release();

    } catch (err) {
        console.error('Database connection pool initialization error:', err.stack);
        pool = null; // Set pool to null on failure
    }
};

initializeDatabase();


// --- JWT & Config Middleware ---
const checkConfig = (req, res, next) => {
    if (!pool) {
        return res.status(500).send('FATAL ERROR: Database is not connected.');
    }
    if (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET) {
        return res.status(500).send('FATAL ERROR: JWT secrets are not configured in environment variables.');
    }
    next();
};

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).send('A token is required for authentication');
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).send('Invalid Token');
    }
};

const verifyAdminToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).send('A token is required for authentication');

    try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).send('Invalid Token');
    }
};

// Apply config check to all routes
app.use(checkConfig);

// --- Helper Functions ---
const generateUniqueKey = async (length) => {
    let key;
    let isUnique = false;
    while (!isUnique) {
        key = Math.floor(Math.random() * (10 ** length)).toString().padStart(length, '0');
        const res = await pool.query('SELECT * FROM access_keys WHERE key = $1', [key]);
        if (res.rows.length === 0) {
            isUnique = true;
        }
    }
    return key;
};

const generateUniqueClientId = async (length) => {
    let clientId;
    let isUnique = false;
    while (!isUnique) {
        clientId = Math.floor(Math.random() * (10 ** length)).toString().padStart(length, '0');
        const res = await pool.query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
        if (res.rows.length === 0) {
            isUnique = true;
        }
    }
    return clientId;
};

// --- API Endpoints ---
// Public Endpoints
app.get('/api/health', (req, res) => res.status(200).send('API is healthy.'));
app.post('/api/validate-key', async (req, res) => {
    try {
        const { key } = req.body;
        const result = await pool.query('SELECT * FROM access_keys WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            res.json({ valid: true });
        } else {
            res.status(404).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.post('/api/bookings', async (req, res) => {
    try {
        const { accessKey, password, ...bookingData } = req.body;
        const keyCheck = await pool.query('SELECT * FROM access_keys WHERE key = $1', [accessKey]);
        if (keyCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const clientId = await generateUniqueClientId(4);

        const result = await pool.query(
            `INSERT INTO bookings (access_key, password_hash, client_id, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, locations, schedule, email, phone_number, additional_info, discount_code) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
            [accessKey, hashedPassword, clientId, bookingData.packageName, bookingData.totalPrice, bookingData.selectedItems, bookingData.brideName, bookingData.groomName, bookingData.weddingDate, bookingData.brideAddress, bookingData.groomAddress, bookingData.locations, bookingData.schedule, bookingData.email, bookingData.phoneNumber, bookingData.additionalInfo, bookingData.discountCode]
        );
        
        if (bookingData.discountCode) {
            await pool.query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [bookingData.discountCode]);
        }
        
        await pool.query('DELETE FROM access_keys WHERE key = $1', [accessKey]);

        res.status(201).json({ bookingId: result.rows[0].id, clientId });
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.get('/api/packages', async (req, res) => {
    try {
        const packagesRes = await pool.query('SELECT * FROM packages ORDER BY price DESC');
        const addonsRes = await pool.query('SELECT * FROM addons ORDER BY name');
        const relationsRes = await pool.query('SELECT * FROM package_addons');
        
        const addonsMap = new Map(addonsRes.rows.map(a => [a.id, a]));
        const packages = packagesRes.rows.map(p => {
            const included = relationsRes.rows
                .filter(r => r.package_id === p.id)
                .map(r => ({ ...addonsMap.get(r.addon_id), locked: r.is_locked }));
            return { ...p, included };
        });

        res.json({ packages, allAddons: addonsRes.rows });
    } catch (err) {
        res.status(500).send(`Error fetching packages and addons: ${err.message}`);
    }
});

app.post('/api/validate-discount', async (req, res) => {
    try {
        const { code } = req.body;
        const result = await pool.query('SELECT * FROM discount_codes WHERE code = $1', [code]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Kod nie istnieje.' });
        
        const discount = result.rows[0];
        if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Kod wygasł.' });
        }
        if (discount.usage_limit && discount.times_used >= discount.usage_limit) {
            return res.status(400).json({ message: 'Limit użycia kodu został wyczerpany.' });
        }
        res.json(discount);
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching public gallery: ${err.message}`);
    }
});

// Client Login & Panel
app.post('/api/login', async (req, res) => {
    try {
        const { clientId, password } = req.body;
        if (!clientId || !password) return res.status(400).json({ message: 'Numer klienta i hasło są wymagane.' });
        
        const result = await pool.query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        
        const booking = result.rows[0];
        const isMatch = await bcrypt.compare(password, booking.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        
        const token = jwt.sign({ clientId: booking.client_id, bookingId: booking.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.get('/api/my-booking', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.user.bookingId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.patch('/api/my-booking', verifyToken, async (req, res) => {
    try {
        const { bride_address, groom_address, locations, schedule, additional_info } = req.body;
        const result = await pool.query(
            `UPDATE bookings SET bride_address = $1, groom_address = $2, locations = $3, schedule = $4, additional_info = $5 WHERE id = $6 RETURNING *`,
            [bride_address, groom_address, locations, schedule, additional_info, req.user.bookingId]
        );
        res.json({ booking: result.rows[0] });
    } catch (err) {
        res.status(500).send(`Server error during update: ${err.message}`);
    }
});

// Admin Login & Setup
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        
        const token = jwt.sign({ adminId: admin.id, email: admin.email }, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.post('/api/admin/setup-database', verifyAdminToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS access_keys (
                id SERIAL PRIMARY KEY,
                key VARCHAR(4) UNIQUE NOT NULL,
                client_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                client_id VARCHAR(4) UNIQUE,
                access_key VARCHAR(4),
                package_name VARCHAR(255) NOT NULL,
                total_price NUMERIC(10, 2) NOT NULL,
                selected_items TEXT[] NOT NULL,
                bride_name VARCHAR(255) NOT NULL,
                groom_name VARCHAR(255) NOT NULL,
                wedding_date DATE NOT NULL,
                bride_address TEXT,
                groom_address TEXT,
                locations TEXT,
                schedule TEXT,
                email VARCHAR(255) NOT NULL,
                phone_number VARCHAR(255),
                additional_info TEXT,
                password_hash VARCHAR(255) NOT NULL,
                discount_code VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                payment_status VARCHAR(50) DEFAULT 'pending',
                amount_paid NUMERIC(10, 2) DEFAULT 0.00
            );

            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS availability (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                is_all_day BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS galleries (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                image_url TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS packages (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              price NUMERIC(10, 2) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS addons (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              price NUMERIC(10, 2) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS package_addons (
              package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
              addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
              is_locked BOOLEAN NOT NULL DEFAULT FALSE,
              PRIMARY KEY (package_id, addon_id)
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

            CREATE TABLE IF NOT EXISTS booking_stages (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                stage_id INTEGER REFERENCES production_stages(id),
                status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, awaiting_approval, completed
                completed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                sender VARCHAR(50) NOT NULL, -- 'client' or 'admin'
                content TEXT NOT NULL,
                is_read_by_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- MIGRATION: Add columns if they don't exist ---
        const messagesColumnCheck = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'is_read_by_admin'`);
        if (messagesColumnCheck.rows.length === 0) {
            await client.query(`ALTER TABLE messages ADD COLUMN is_read_by_admin BOOLEAN DEFAULT FALSE;`);
            console.log("MIGRATION APPLIED: Added 'is_read_by_admin' column to 'messages' table.");
        }

        const adminsColumnCheck = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'notification_email'`);
        if (adminsColumnCheck.rows.length === 0) {
            await client.query(`ALTER TABLE admins ADD COLUMN notification_email VARCHAR(255);`);
            console.log("MIGRATION APPLIED: Added 'notification_email' column to 'admins' table.");
        }
        
        // Seed default admin
        const adminRes = await client.query('SELECT * FROM admins');
        if (adminRes.rows.length === 0) {
            const adminPassword = 'adminpassword';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await client.query('INSERT INTO admins (email, password_hash, notification_email) VALUES ($1, $2, $3)', ['admin@dreamcatcher.com', hashedPassword, 'admin@dreamcatcher.com']);
        } else {
            // Ensure existing admin has a default notification email if it's NULL
            await client.query("UPDATE admins SET notification_email = email WHERE notification_email IS NULL");
        }
        
        // Seed test booking
        const testBookingRes = await client.query("SELECT * FROM bookings WHERE client_id = '9999'");
        if (testBookingRes.rows.length === 0) {
            const testPassword = await bcrypt.hash('password123', 10);
            await client.query(
              `INSERT INTO bookings (client_id, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, email, password_hash, payment_status, amount_paid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              ['9999', 'Test Package', 5000.00, '{"Test Item 1", "Test Item 2"}', 'Janina', 'Krzysztof', '2025-10-10', 'test@example.com', testPassword, 'partial', 1000.00]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Database schema initialized and migrated successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database setup error:', err);
        res.status(500).json({ message: 'Error setting up database schema.', error: err.message });
    } finally {
        client.release();
    }
});


// Admin Endpoints - All protected
app.get('/api/admin/bookings', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at FROM bookings ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching bookings for admin: ${err.message}`);
    }
});

app.get('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error fetching booking details for admin: ${err.message}`);
    }
});

app.delete('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Rezerwacja nie znaleziona.' });
        }
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd podczas usuwania rezerwacji: ${err.message}`);
    }
});

app.patch('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const { bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, locations, schedule, additional_info } = req.body;
        const result = await pool.query(
            `UPDATE bookings SET bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5, bride_address = $6, groom_address = $7, locations = $8, schedule = $9, additional_info = $10 WHERE id = $11 RETURNING *`,
            [bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, locations, schedule, additional_info, req.params.id]
        );
        res.json({ booking: result.rows[0] });
    } catch (err) {
        res.status(500).send(`Błąd podczas aktualizacji: ${err.message}`);
    }
});

app.get('/api/admin/access-keys', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching access keys for admin: ${err.message}`);
    }
});

app.post('/api/admin/access-keys', verifyAdminToken, async (req, res) => {
    try {
        const { client_name } = req.body;
        const key = await generateUniqueKey(4);
        const result = await pool.query(
            'INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *',
            [key, client_name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd podczas tworzenia klucza: ${err.message}`);
    }
});

app.delete('/api/admin/access-keys/:id', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM access_keys WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd podczas usuwania klucza: ${err.message}`);
    }
});

app.get('/api/admin/availability', verifyAdminToken, async (req, res) => {
    try {
        const eventsRes = await pool.query('SELECT * FROM availability');
        const bookingsRes = await pool.query('SELECT id, wedding_date, bride_name, groom_name FROM bookings');
        
        const calendarEvents = eventsRes.rows.map(e => ({
            id: e.id,
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            allDay: e.is_all_day,
            description: e.description,
            resource: { type: 'event' }
        }));

        const bookingEvents = bookingsRes.rows.map(b => ({
            id: `booking-${b.id}`,
            title: `Ślub: ${b.bride_name} i ${b.groom_name}`,
            start: new Date(b.wedding_date),
            end: new Date(b.wedding_date),
            allDay: true,
            resource: { type: 'booking', bookingId: b.id }
        }));
        
        res.json([...calendarEvents, ...bookingEvents]);
    } catch (err) {
        res.status(500).send(`Błąd pobierania wydarzeń: ${err.message}`);
    }
});

app.post('/api/admin/availability', verifyAdminToken, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await pool.query(
            `INSERT INTO availability (title, description, start_time, end_time, is_all_day) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, description, start_time, end_time, is_all_day]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd tworzenia wydarzenia: ${err.message}`);
    }
});

app.patch('/api/admin/availability/:id', verifyAdminToken, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await pool.query(
            `UPDATE availability SET title = $1, description = $2, start_time = $3, end_time = $4, is_all_day = $5 WHERE id = $6 RETURNING *`,
            [title, description, start_time, end_time, is_all_day, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd aktualizacji wydarzenia: ${err.message}`);
    }
});

app.delete('/api/admin/availability/:id', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM availability WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania wydarzenia: ${err.message}`);
    }
});

app.get('/api/admin/galleries', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania galerii: ${err.message}`);
    }
});

app.post('/api/admin/galleries/upload', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'image.jpg';
        const blob = await put(filename, req, { access: 'public' });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania pliku: ${err.message}`);
    }
});

app.post('/api/admin/galleries', verifyAdminToken, async (req, res) => {
    try {
        const { title, description, image_url } = req.body;
        const result = await pool.query(
            'INSERT INTO galleries (title, description, image_url) VALUES ($1, $2, $3) RETURNING *',
            [title, description, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd zapisu galerii: ${err.message}`);
    }
});

app.delete('/api/admin/galleries/:id', verifyAdminToken, async (req, res) => {
    try {
        const itemRes = await pool.query('SELECT image_url FROM galleries WHERE id = $1', [req.params.id]);
        if (itemRes.rows.length > 0) {
            await del(itemRes.rows[0].image_url);
        }
        await pool.query('DELETE FROM galleries WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania elementu galerii: ${err.message}`);
    }
});

app.get('/api/admin/packages', verifyAdminToken, async (req, res) => {
     try {
        const packagesRes = await pool.query('SELECT * FROM packages ORDER BY price DESC');
        const relationsRes = await pool.query('SELECT pa.*, a.name, a.price FROM package_addons pa JOIN addons a ON pa.addon_id = a.id');
        const packages = packagesRes.rows.map(p => ({
            ...p,
            addons: relationsRes.rows.filter(r => r.package_id === p.id)
        }));
        res.json(packages);
    } catch (err) {
        res.status(500).send(`Błąd pobierania pakietów: ${err.message}`);
    }
});

app.get('/api/admin/addons', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM addons ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania dodatków: ${err.message}`);
    }
});

app.post('/api/admin/packages', verifyAdminToken, async (req, res) => {
    const { name, description, price, addons } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pkgRes = await client.query('INSERT INTO packages (name, description, price) VALUES ($1, $2, $3) RETURNING id', [name, description, price]);
        const packageId = pkgRes.rows[0].id;

        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [packageId, addon.id, addon.is_locked]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ id: packageId, ...req.body });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Błąd tworzenia pakietu: ${err.message}`);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/packages/:id', verifyAdminToken, async (req, res) => {
    const packageId = req.params.id;
    const { name, description, price, addons } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE packages SET name = $1, description = $2, price = $3 WHERE id = $4', [name, description, price, packageId]);
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [packageId]);

        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [packageId, addon.id, addon.is_locked]);
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ id: packageId, ...req.body });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Błąd aktualizacji pakietu: ${err.message}`);
    } finally {
        client.release();
    }
});

app.delete('/api/admin/packages/:id', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania pakietu: ${err.message}`);
    }
});

app.get('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania kodów: ${err.message}`);
    }
});

app.post('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const { code, type, value, usage_limit, expires_at } = req.body;
        const result = await pool.query(
            'INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code, type, value, usage_limit, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd tworzenia kodu: ${err.message}`);
    }
});

app.delete('/api/admin/discounts/:id', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania kodu: ${err.message}`);
    }
});

app.get('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM production_stages ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania szablonów etapów: ${err.message}`);
    }
});

app.post('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await pool.query(
            'INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *',
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd tworzenia szablonu etapu: ${err.message}`);
    }
});

app.delete('/api/admin/stages/:id', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania szablonu etapu: ${err.message}`);
    }
});

app.get('/api/admin/booking-stages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at 
             FROM booking_stages bs 
             JOIN production_stages ps ON bs.stage_id = ps.id 
             WHERE bs.booking_id = $1 ORDER BY bs.id`,
            [req.params.bookingId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania etapów projektu: ${err.message}`);
    }
});

app.post('/api/admin/booking-stages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { stage_id } = req.body;
        const result = await pool.query(
            'INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2) RETURNING *',
            [req.params.bookingId, stage_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd dodawania etapu do projektu: ${err.message}`);
    }
});

app.patch('/api/admin/booking-stages/:stageId', verifyAdminToken, async (req, res) => {
    try {
        const { status } = req.body;
        const completed_at = status === 'completed' ? new Date() : null;
        const result = await pool.query(
            'UPDATE booking_stages SET status = $1, completed_at = $2 WHERE id = $3 RETURNING *',
            [status, completed_at, req.params.stageId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd aktualizacji statusu etapu: ${err.message}`);
    }
});

app.delete('/api/admin/booking-stages/:stageId', verifyAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM booking_stages WHERE id = $1', [req.params.stageId]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania etapu z projektu: ${err.message}`);
    }
});


app.get('/api/booking-stages', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at 
             FROM booking_stages bs 
             JOIN production_stages ps ON bs.stage_id = ps.id 
             WHERE bs.booking_id = $1 ORDER BY bs.id`,
            [req.user.bookingId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania etapów projektu: ${err.message}`);
    }
});

app.patch('/api/booking-stages/:stageId/approve', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE booking_stages SET status = $1, completed_at = $2 WHERE id = $3 AND booking_id = $4 AND status = $5 RETURNING *',
            ['completed', new Date(), req.params.stageId, req.user.bookingId, 'awaiting_approval']
        );
        if (result.rows.length === 0) return res.status(400).send('Etap nie mógł zostać zatwierdzony.');
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd zatwierdzania etapu: ${err.message}`);
    }
});

app.patch('/api/admin/bookings/:id/payment', verifyAdminToken, async (req, res) => {
    try {
        const { payment_status, amount_paid } = req.body;
        const result = await pool.query(
            'UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3 RETURNING payment_status, amount_paid',
            [payment_status, amount_paid, req.params.id]
        );
        res.json({ payment_details: result.rows[0] });
    } catch (err) {
        res.status(500).send(`Błąd podczas aktualizacji płatności (id: ${req.params.id}): ${err.message}`);
    }
});

// Communication & Notification Endpoints
app.get('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching messages: ${err.message}`);
    }
});

app.post('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await pool.query(
            'INSERT INTO messages (booking_id, sender, content) VALUES ($1, $2, $3) RETURNING *',
            [req.params.bookingId, 'admin', content]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error sending message: ${err.message}`);
    }
});

app.get('/api/messages', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching messages: ${err.message}`);
    }
});

app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await pool.query(
            'INSERT INTO messages (booking_id, sender, content) VALUES ($1, $2, $3) RETURNING *',
            [req.user.bookingId, 'client', content]
        );
        
        // --- Real Email Notification ---
        if (resend) {
            try {
                const adminRes = await pool.query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
                const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
                
                const bookingRes = await pool.query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.bookingId]);
                const clientName = bookingRes.rows.length > 0 ? `${bookingRes.rows[0].bride_name} & ${bookingRes.rows[0].groom_name}` : 'Klient';

                if (adminEmail) {
                    await resend.emails.send({
                        from: 'Powiadomienia <powiadomienia@dreamcatcherfilm.co.uk>',
                        to: adminEmail,
                        subject: `Nowa wiadomość od ${clientName} (Rezerwacja #${req.user.bookingId})`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                <h2 style="color: #1e293b;">Otrzymano nową wiadomość!</h2>
                                <p><strong>Klient:</strong> ${clientName}</p>
                                <p><strong>Numer rezerwacji:</strong> #${req.user.bookingId}</p>
                                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                                <p style="font-weight: bold;">Wiadomość:</p>
                                <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${content}</div>
                                <p style="margin-top: 20px;">Możesz odpowiedzieć klientowi w panelu administratora.</p>
                            </div>
                        `,
                    });
                     console.log(`Email notification sent successfully to ${adminEmail}`);
                }
            } catch (emailError) {
                console.error("Failed to send email notification:", emailError);
            }
        } else {
             console.warn("RESEND_API_KEY is not configured. Skipping email notification.");
        }
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error sending message: ${err.message}`);
    }
});

app.get('/api/admin/notifications/count', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM messages WHERE sender = 'client' AND is_read_by_admin = FALSE");
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).send(`Error fetching notification count: ${err.message}`);
    }
});

app.get('/api/admin/notifications', verifyAdminToken, async (req, res) => {
    try {
        const query = `
            SELECT
                b.id AS booking_id,
                b.bride_name,
                b.groom_name,
                COUNT(m.id) AS unread_count,
                (array_agg(m.content ORDER BY m.created_at DESC))[1] AS latest_message_preview
            FROM messages m
            JOIN bookings b ON m.booking_id = b.id
            WHERE m.sender = 'client' AND m.is_read_by_admin = FALSE
            GROUP BY b.id, b.bride_name, b.groom_name
            ORDER BY MAX(m.created_at) DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching notifications: ${err.message}`);
    }
});

app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', verifyAdminToken, async (req, res) => {
    try {
        await pool.query(
            "UPDATE messages SET is_read_by_admin = TRUE WHERE booking_id = $1 AND sender = 'client'",
            [req.params.bookingId]
        );
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error marking messages as read: ${err.message}`);
    }
});

app.get('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT notification_email FROM admins WHERE id = $1', [req.user.adminId]);
        if (result.rows.length === 0) return res.status(404).send('Admin not found.');
        res.json({ email: result.rows[0].notification_email });
    } catch (err) {
        res.status(500).send(`Error fetching admin settings: ${err.message}`);
    }
});

app.patch('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).send('Email is required.');
        await pool.query('UPDATE admins SET notification_email = $1 WHERE id = $2', [email, req.user.adminId]);
        res.status(200).json({ message: 'Notification email updated successfully.' });
    } catch (err) {
        res.status(500).send(`Error updating admin settings: ${err.message}`);
    }
});


// Export the app for Vercel
export default app;
