

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Database Configuration & Initialization ---
let pool;

const getPool = () => {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error("FATAL ERROR: DATABASE_URL is not set.");
        }
        console.log("Initializing new database connection pool...");
        pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });

        // The 'error' event on a pool is for errors that happen on idle clients
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client in pool', err);
            // For serverless, it's often best to tear down the pool and recreate it.
            pool = null; 
        });
    }
    return pool;
};


// --- JWT & Config Middleware ---
const checkConfig = (req, res, next) => {
    try {
        getPool(); // This will throw if DATABASE_URL is not set
    } catch(err) {
         return res.status(500).send(err.message);
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
        const res = await getPool().query('SELECT * FROM access_keys WHERE key = $1', [key]);
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
        const res = await getPool().query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
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
        const result = await getPool().query('SELECT * FROM access_keys WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            res.json({ valid: true });
        } else {
            res.status(404).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, subject, message } = req.body;

        if (!firstName || !lastName || !email || !message || !subject) {
            return res.status(400).json({ message: 'Proszę wypełnić wszystkie wymagane pola.' });
        }
        
        // 1. Save message to the database
        await getPool().query(
            `INSERT INTO contact_messages (first_name, last_name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [firstName, lastName, email, phone, subject, message]
        );

        // 2. Send email notification via Resend
        if (resend) {
            try {
                const adminRes = await getPool().query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
                const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
                
                if (adminEmail) {
                    await resend.emails.send({
                        from: 'Formularz Kontaktowy <powiadomienia@dreamcatcherfilm.co.uk>',
                        to: adminEmail,
                        reply_to: email,
                        subject: `Nowe zapytanie z formularza: ${subject}`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                                <h2 style="color: #1e293b;">Otrzymano nowe zapytanie ze strony!</h2>
                                <p><strong>Od:</strong> ${firstName} ${lastName}</p>
                                <p><strong>E-mail:</strong> ${email}</p>
                                <p><strong>Telefon:</strong> ${phone || 'Nie podano'}</p>
                                <p><strong>Temat:</strong> ${subject}</p>
                                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                                <p style="font-weight: bold;">Treść wiadomości:</p>
                                <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${message}</div>
                            </div>
                        `,
                    });
                }
            } catch (emailError) {
                console.error("Contact form - failed to send email notification:", emailError);
            }
        } else {
             console.warn("RESEND_API_KEY is not configured. Skipping email notification for contact form.");
        }

        res.status(200).json({ message: 'Wiadomość została wysłana pomyślnie.' });

    } catch (err) {
        console.error('Contact form error:', err);
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.post('/api/bookings', async (req, res) => {
    try {
        const { accessKey, password, ...bookingData } = req.body;
        const keyCheck = await getPool().query('SELECT * FROM access_keys WHERE key = $1', [accessKey]);
        if (keyCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const clientId = await generateUniqueClientId(4);

        const result = await getPool().query(
            `INSERT INTO bookings (access_key, password_hash, client_id, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, locations, schedule, email, phone_number, additional_info, discount_code) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
            [accessKey, hashedPassword, clientId, bookingData.packageName, bookingData.totalPrice, bookingData.selectedItems, bookingData.brideName, bookingData.groomName, bookingData.weddingDate, bookingData.brideAddress, bookingData.groomAddress, bookingData.locations, bookingData.schedule, bookingData.email, bookingData.phoneNumber, bookingData.additionalInfo, bookingData.discountCode]
        );
        
        if (bookingData.discountCode) {
            await getPool().query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [bookingData.discountCode]);
        }
        
        await getPool().query('DELETE FROM access_keys WHERE key = $1', [accessKey]);

        res.status(201).json({ bookingId: result.rows[0].id, clientId });
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.get('/api/packages', async (req, res) => {
    try {
        const packagesRes = await getPool().query('SELECT * FROM packages ORDER BY price DESC');
        const addonsRes = await getPool().query('SELECT * FROM addons ORDER BY name');
        const relationsRes = await getPool().query('SELECT * FROM package_addons');
        
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
        const result = await getPool().query('SELECT * FROM discount_codes WHERE code = $1', [code]);
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
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching public gallery: ${err.message}`);
    }
});

app.get('/api/contact-details', async (req, res) => {
    try {
        const result = await getPool().query('SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3, $4)', [
            'contact_email', 'contact_phone', 'contact_address', 'google_maps_api_key'
        ]);
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (err) {
        res.status(500).send(`Error fetching contact details: ${err.message}`);
    }
});


// Client Login & Panel
app.post('/api/login', async (req, res) => {
    try {
        const { clientId, password } = req.body;
        if (!clientId || !password) return res.status(400).json({ message: 'Numer klienta i hasło są wymagane.' });
        
        const result = await getPool().query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
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
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.user.bookingId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.patch('/api/my-booking', verifyToken, async (req, res) => {
    try {
        const { bride_address, groom_address, locations, schedule, additional_info } = req.body;
        const result = await getPool().query(
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
        if (!email || !password) return res.status(400).json({ message: 'Email i hasło są wymagane.' });
        
        const result = await getPool().query('SELECT * FROM admins WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        
        const token = jwt.sign({ adminId: admin.id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) {
        res.status(500).send(`Server error: ${err.message}`);
    }
});


app.post('/api/admin/setup-database', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
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
                client_id VARCHAR(255) UNIQUE,
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
                amount_paid NUMERIC(10, 2) DEFAULT 0.00,
                payment_intent_id VARCHAR(255)
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

            CREATE TABLE IF NOT EXISTS homepage_carousel_slides (
                id SERIAL PRIMARY KEY,
                image_url TEXT NOT NULL,
                title TEXT,
                subtitle TEXT,
                button_text TEXT,
                button_link TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS homepage_testimonials (
                id SERIAL PRIMARY KEY,
                author VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS homepage_instagram_posts (
                id SERIAL PRIMARY KEY,
                post_url TEXT NOT NULL,
                image_url TEXT NOT NULL,
                caption TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- MIGRATIONS ---
        const bookingsClientIdColumnCheck = await client.query(`SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'client_id'`);
        if (bookingsClientIdColumnCheck.rows.length > 0 && bookingsClientIdColumnCheck.rows[0].character_maximum_length < 255) {
            await client.query(`ALTER TABLE bookings ALTER COLUMN client_id TYPE VARCHAR(255);`);
            console.log("MIGRATION APPLIED: Expanded 'client_id' column in 'bookings' table to VARCHAR(255).");
        }
        
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
        
        const bookingsPaymentIntentColumnCheck = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'payment_intent_id'`);
        if (bookingsPaymentIntentColumnCheck.rows.length === 0) {
            await client.query(`ALTER TABLE bookings ADD COLUMN payment_intent_id VARCHAR(255);`);
            console.log("MIGRATION APPLIED: Added 'payment_intent_id' column to 'bookings' table.");
        }

        const accessKeyConstraintCheck = await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'access_key'`);
        if (accessKeyConstraintCheck.rows.length > 0 && accessKeyConstraintCheck.rows[0].is_nullable === 'NO') {
            await client.query(`ALTER TABLE bookings ALTER COLUMN access_key DROP NOT NULL;`);
            console.log("MIGRATION APPLIED: Made 'access_key' column in 'bookings' table nullable.");
        }

        const phoneNumberConstraintCheck = await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'phone_number'`);
        if (phoneNumberConstraintCheck.rows.length > 0 && phoneNumberConstraintCheck.rows[0].is_nullable === 'NO') {
            await client.query(`ALTER TABLE bookings ALTER COLUMN phone_number DROP NOT NULL;`);
            console.log("MIGRATION APPLIED: Made 'phone_number' column in 'bookings' table nullable.");
        }
        
        // --- SEEDING ---
        const adminRes = await client.query('SELECT * FROM admins');
        if (adminRes.rows.length === 0) {
            const adminPassword = 'adminpassword';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await client.query('INSERT INTO admins (email, password_hash, notification_email) VALUES ($1, $2, $3)', ['admin@dreamcatcher.com', hashedPassword, 'admin@dreamcatcher.com']);
        } else {
            await client.query("UPDATE admins SET notification_email = email WHERE notification_email IS NULL");
        }
        
        // Remove old CONTACTFORM booking if it exists
        await client.query("DELETE FROM bookings WHERE client_id = 'CONTACTFORM'");

        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_email', 'info@dreamcatcherfilm.co.uk') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_phone', '+48 123 456 789') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_address', 'ul. Filmowa 123, 00-001 Warszawa, Polska') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('google_maps_api_key', '') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_title', 'Kilka słów o nas') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_text', 'Jesteśmy pasjonatami opowiadania historii. Każdy ślub to dla nas unikalna opowieść, którą staramy się uchwycić w najbardziej autentyczny i emocjonalny sposób. Naszym celem jest stworzenie pamiątki, która przetrwa próbę czasu i będziecie do niej wracać z uśmiechem przez lata.') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_image_url', '') ON CONFLICT (key) DO NOTHING;`);


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
        const result = await getPool().query("SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at FROM bookings WHERE client_id <> 'CONTACTFORM' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching bookings for admin: ${err.message}`);
    }
});

app.get('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error fetching booking details for admin: ${err.message}`);
    }
});

app.delete('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getPool().query('DELETE FROM bookings WHERE id = $1', [id]);
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
        const result = await getPool().query(
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
        const result = await getPool().query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching access keys for admin: ${err.message}`);
    }
});

app.post('/api/admin/access-keys', verifyAdminToken, async (req, res) => {
    try {
        const { client_name } = req.body;
        const key = await generateUniqueKey(4);
        const result = await getPool().query(
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
        await getPool().query('DELETE FROM access_keys WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd podczas usuwania klucza: ${err.message}`);
    }
});

app.get('/api/admin/availability', verifyAdminToken, async (req, res) => {
    try {
        const eventsRes = await getPool().query('SELECT * FROM availability');
        const bookingsRes = await getPool().query("SELECT id, wedding_date, bride_name, groom_name FROM bookings WHERE client_id <> 'CONTACTFORM'");
        
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
        const result = await getPool().query(
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
        const result = await getPool().query(
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
        await getPool().query('DELETE FROM availability WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania wydarzenia: ${err.message}`);
    }
});

app.get('/api/admin/galleries', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
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
        const result = await getPool().query(
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
        const itemRes = await getPool().query('SELECT image_url FROM galleries WHERE id = $1', [req.params.id]);
        if (itemRes.rows.length > 0) {
            await del(itemRes.rows[0].image_url);
        }
        await getPool().query('DELETE FROM galleries WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania elementu galerii: ${err.message}`);
    }
});

app.get('/api/admin/packages', verifyAdminToken, async (req, res) => {
     try {
        const packagesRes = await getPool().query('SELECT * FROM packages ORDER BY price DESC');
        const relationsRes = await getPool().query('SELECT pa.*, a.name, a.price FROM package_addons pa JOIN addons a ON pa.addon_id = a.id');
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
        const result = await getPool().query('SELECT * FROM addons ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania dodatków: ${err.message}`);
    }
});

app.post('/api/admin/packages', verifyAdminToken, async (req, res) => {
    const { name, description, price, addons } = req.body;
    const client = await getPool().connect();
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
    const client = await getPool().connect();
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
        await getPool().query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania pakietu: ${err.message}`);
    }
});

app.get('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania kodów: ${err.message}`);
    }
});

app.post('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const { code, type, value, usage_limit, expires_at } = req.body;
        const result = await getPool().query(
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
        await getPool().query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania kodu: ${err.message}`);
    }
});

app.get('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM production_stages ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Błąd pobierania szablonów etapów: ${err.message}`);
    }
});

app.post('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await getPool().query(
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
        await getPool().query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania szablonu etapu: ${err.message}`);
    }
});

app.get('/api/admin/booking-stages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query(
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
        const result = await getPool().query(
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
        const result = await getPool().query(
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
        await getPool().query('DELETE FROM booking_stages WHERE id = $1', [req.params.stageId]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania etapu z projektu: ${err.message}`);
    }
});


app.get('/api/booking-stages', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query(
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
        const result = await getPool().query(
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
        const result = await getPool().query(
            'UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3 RETURNING payment_status, amount_paid',
            [payment_status, amount_paid, req.params.id]
        );
        res.json({ payment_details: result.rows[0] });
    } catch (err) {
        res.status(500).send(`Błąd podczas aktualizacji płatności (id: ${req.params.id}): ${err.message}`);
    }
});

// --- INBOX & MESSAGING ENDPOINTS ---
app.get('/api/admin/inbox', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching inbox messages: ${err.message}`);
    }
});

app.patch('/api/admin/inbox/:id/read', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error marking message as read: ${err.message}`);
    }
});

app.delete('/api/admin/inbox/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error deleting inbox message: ${err.message}`);
    }
});

// Communication & Notification Endpoints
app.get('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching messages: ${err.message}`);
    }
});

app.post('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await getPool().query(
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
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching messages: ${err.message}`);
    }
});

app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content) VALUES ($1, $2, $3) RETURNING *',
            [req.user.bookingId, 'client', content]
        );
        
        // --- Real Email Notification ---
        if (resend) {
            try {
                const adminRes = await getPool().query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
                const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
                
                const bookingRes = await getPool().query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.bookingId]);
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
        const result = await getPool().query(`
            SELECT 
                (SELECT COUNT(*) FROM messages WHERE sender = 'client' AND is_read_by_admin = FALSE) as client_messages,
                (SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE) as inbox_messages
        `);
        const count = parseInt(result.rows[0].client_messages, 10) + parseInt(result.rows[0].inbox_messages, 10);
        res.json({ count });
    } catch (err) {
        res.status(500).send(`Error fetching notification count: ${err.message}`);
    }
});

app.get('/api/admin/notifications', verifyAdminToken, async (req, res) => {
    try {
        const clientMessagesQuery = `
            SELECT
                'client_message' as type,
                b.id AS booking_id,
                b.bride_name || ' & ' || b.groom_name AS sender_name,
                COUNT(m.id) AS unread_count,
                (array_agg(m.content ORDER BY m.created_at DESC))[1] AS preview,
                MAX(m.created_at) as created_at
            FROM messages m
            JOIN bookings b ON m.booking_id = b.id
            WHERE m.sender = 'client' AND m.is_read_by_admin = FALSE AND b.client_id <> 'CONTACTFORM'
            GROUP BY b.id, b.bride_name, b.groom_name
        `;
        
        const inboxMessagesQuery = `
            SELECT
                'inbox_message' as type,
                id as message_id,
                first_name || ' ' || last_name AS sender_name,
                message AS preview,
                created_at
            FROM contact_messages
            WHERE is_read = FALSE
        `;

        const clientRes = await getPool().query(clientMessagesQuery);
        const inboxRes = await getPool().query(inboxMessagesQuery);

        const allNotifications = [...clientRes.rows, ...inboxRes.rows]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(allNotifications);
    } catch (err) {
        res.status(500).send(`Error fetching notifications: ${err.message}`);
    }
});

app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query(
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
        const result = await getPool().query('SELECT email, notification_email FROM admins WHERE id = $1', [req.user.adminId]);
        if (result.rows.length === 0) return res.status(404).send('Admin not found.');
        res.json({ 
            loginEmail: result.rows[0].email,
            notificationEmail: result.rows[0].notification_email 
        });
    } catch (err) {
        res.status(500).send(`Error fetching admin settings: ${err.message}`);
    }
});


app.patch('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).send('Email is required.');
        await getPool().query('UPDATE admins SET notification_email = $1 WHERE id = $2', [email, req.user.adminId]);
        res.status(200).json({ message: 'Notification email updated successfully.' });
    } catch (err) {
        res.status(500).send(`Error updating admin settings: ${err.message}`);
    }
});

app.patch('/api/admin/credentials', verifyAdminToken, async (req, res) => {
    const { currentPassword, newEmail, newPassword } = req.body;
    const { adminId } = req.user;

    if (!currentPassword || !newEmail) {
        return res.status(400).send('Bieżące hasło i nowy e-mail są wymagane.');
    }

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        const adminRes = await client.query('SELECT * FROM admins WHERE id = $1', [adminId]);
        if (adminRes.rows.length === 0) {
            return res.status(404).send('Administrator nie znaleziony.');
        }
        const admin = adminRes.rows[0];

        const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isMatch) {
            return res.status(401).send('Nieprawidłowe bieżące hasło.');
        }

        await client.query('UPDATE admins SET email = $1 WHERE id = $2', [newEmail, adminId]);

        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await client.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hashedPassword, adminId]);
        }
        
        await client.query('COMMIT');
        res.status(200).json({ message: 'Dane logowania zostały pomyślnie zaktualizowane.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating credentials:', err);
        res.status(500).send(`Błąd podczas aktualizacji danych logowania: ${err.message}`);
    } finally {
        client.release();
    }
});


app.get('/api/admin/contact-settings', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT key, value FROM app_settings');
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (err) {
        res.status(500).send(`Error fetching contact settings: ${err.message}`);
    }
});

app.patch('/api/admin/contact-settings', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const settingsToUpdate = req.body;
        for (const key in settingsToUpdate) {
            if (Object.prototype.hasOwnProperty.call(settingsToUpdate, key)) {
                await client.query(
                    'UPDATE app_settings SET value = $1 WHERE key = $2',
                    [settingsToUpdate[key], key]
                );
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Contact settings updated successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Error updating contact settings: ${err.message}`);
    } finally {
        client.release();
    }
});

// --- DYNAMIC HOMEPAGE ENDPOINTS ---

// Public endpoint to fetch all content for the homepage
app.get('/api/homepage-content', async (req, res) => {
    try {
        const slidesRes = await getPool().query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC');
        const testimonialsRes = await getPool().query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC');
        const aboutRes = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'about_us_%'");
        const instagramRes = await getPool().query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC');
        
        const aboutSection = aboutRes.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        res.json({
            slides: slidesRes.rows,
            testimonials: testimonialsRes.rows,
            instagramPosts: instagramRes.rows,
            aboutSection,
        });
    } catch (err) {
        res.status(500).send(`Error fetching homepage content: ${err.message}`);
    }
});

// Admin endpoints for managing homepage content
app.get('/api/admin/homepage/slides', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching slides: ${err.message}`);
    }
});

app.post('/api/admin/homepage/slides/upload', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'slide.jpg';
        const blob = await put(`homepage/${filename}`, req, { access: 'public' });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania pliku slajdu: ${err.message}`);
    }
});

app.post('/api/admin/homepage/slides', verifyAdminToken, async (req, res) => {
    try {
        const { image_url, title, subtitle, button_text, button_link } = req.body;
        const result = await getPool().query(
            'INSERT INTO homepage_carousel_slides (image_url, title, subtitle, button_text, button_link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [image_url, title, subtitle, button_text, button_link]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error creating slide: ${err.message}`);
    }
});

app.patch('/api/admin/homepage/slides/:id', verifyAdminToken, async (req, res) => {
    try {
        const { title, subtitle, button_text, button_link } = req.body;
        const result = await getPool().query(
            'UPDATE homepage_carousel_slides SET title=$1, subtitle=$2, button_text=$3, button_link=$4 WHERE id=$5 RETURNING *',
            [title, subtitle, button_text, button_link, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error updating slide: ${err.message}`);
    }
});

app.post('/api/admin/homepage/slides/order', verifyAdminToken, async (req, res) => {
    const { orderedIds } = req.body; // array of slide IDs in the new order
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_carousel_slides SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.status(200).send('Order updated successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Error updating slide order: ${err.message}`);
    } finally {
        client.release();
    }
});

app.delete('/api/admin/homepage/slides/:id', verifyAdminToken, async (req, res) => {
    try {
        const slideRes = await getPool().query('SELECT image_url FROM homepage_carousel_slides WHERE id = $1', [req.params.id]);
        if (slideRes.rows.length > 0) {
            await del(slideRes.rows[0].image_url);
        }
        await getPool().query('DELETE FROM homepage_carousel_slides WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error deleting slide: ${err.message}`);
    }
});

app.get('/api/admin/homepage/about', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'about_us_%'");
        const aboutSection = result.rows.reduce((acc, row) => {
            acc[row.key.replace('about_us_', '')] = row.value;
            return acc;
        }, {});
        res.json(aboutSection);
    } catch (err) {
        res.status(500).send(`Error fetching about section: ${err.message}`);
    }
});

app.post('/api/admin/homepage/about/upload', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'about.jpg';
        const blob = await put(`about/${filename}`, req, { access: 'public' });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania pliku: ${err.message}`);
    }
});

app.patch('/api/admin/homepage/about', verifyAdminToken, async (req, res) => {
    const { title, text, image_url } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_title'", [title]);
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_text'", [text]);
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_image_url'", [image_url]);
        await client.query('COMMIT');
        res.status(200).send('About section updated successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Error updating about section: ${err.message}`);
    } finally {
        client.release();
    }
});

app.get('/api/admin/homepage/testimonials', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching testimonials: ${err.message}`);
    }
});

app.post('/api/admin/homepage/testimonials', verifyAdminToken, async (req, res) => {
    try {
        const { author, content } = req.body;
        const result = await getPool().query('INSERT INTO homepage_testimonials (author, content) VALUES ($1, $2) RETURNING *', [author, content]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error creating testimonial: ${err.message}`);
    }
});

app.patch('/api/admin/homepage/testimonials/:id', verifyAdminToken, async (req, res) => {
    try {
        const { author, content } = req.body;
        const result = await getPool().query('UPDATE homepage_testimonials SET author=$1, content=$2 WHERE id=$3 RETURNING *', [author, content, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error updating testimonial: ${err.message}`);
    }
});

app.delete('/api/admin/homepage/testimonials/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM homepage_testimonials WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error deleting testimonial: ${err.message}`);
    }
});

app.get('/api/admin/homepage/instagram', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(`Error fetching instagram posts: ${err.message}`);
    }
});

app.post('/api/admin/homepage/instagram/upload', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'instagram.jpg';
        const blob = await put(`instagram/${filename}`, req, { access: 'public' });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania pliku do feedu: ${err.message}`);
    }
});

app.post('/api/admin/homepage/instagram', verifyAdminToken, async (req, res) => {
    try {
        const { image_url, post_url, caption } = req.body;
        const result = await getPool().query(
            'INSERT INTO homepage_instagram_posts (image_url, post_url, caption) VALUES ($1, $2, $3) RETURNING *',
            [image_url, post_url, caption]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Error creating instagram post entry: ${err.message}`);
    }
});

app.post('/api/admin/homepage/instagram/order', verifyAdminToken, async (req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_instagram_posts SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.status(200).send('Instagram posts order updated successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Error updating instagram posts order: ${err.message}`);
    } finally {
        client.release();
    }
});

app.delete('/api/admin/homepage/instagram/:id', verifyAdminToken, async (req, res) => {
    try {
        const postRes = await getPool().query('SELECT image_url FROM homepage_instagram_posts WHERE id = $1', [req.params.id]);
        if (postRes.rows.length > 0) {
            await del(postRes.rows[0].image_url);
        }
        await getPool().query('DELETE FROM homepage_instagram_posts WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error deleting instagram post: ${err.message}`);
    }
});


// Export the app for Vercel
export default app;
