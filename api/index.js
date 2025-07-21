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
app.use(express.json({ limit: '6mb' })); // Increase limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '6mb' }));


const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Database Configuration & Initialization ---
let pool;
let initializationPromise = null;

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
                is_all_day BOOLEAN DEFAULT FALSE
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

            CREATE TABLE IF NOT EXISTS package_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                icon_name VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS packages (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              price NUMERIC(10, 2) NOT NULL,
              category_id INTEGER REFERENCES package_categories(id) ON DELETE SET NULL,
              is_published BOOLEAN DEFAULT FALSE,
              rich_description TEXT,
              rich_description_image_url TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS package_addons (
              package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
              addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
              is_locked BOOLEAN NOT NULL DEFAULT FALSE,
              PRIMARY KEY (package_id, addon_id)
            );
            
             CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                client_id VARCHAR(255) UNIQUE,
                access_key VARCHAR(4),
                package_name VARCHAR(255) NOT NULL,
                total_price NUMERIC(10, 2) NOT NULL,
                selected_items JSONB NOT NULL,
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
                password_hash VARCHAR(255) NOT NULL,
                discount_code VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                payment_status VARCHAR(50) DEFAULT 'pending',
                amount_paid NUMERIC(10, 2) DEFAULT 0.00,
                payment_intent_id VARCHAR(255)
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
                is_read_by_client BOOLEAN DEFAULT FALSE,
                attachment_url TEXT,
                attachment_type VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // --- MIGRATIONS ---
        const typeColCheck = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name='packages_old'`);
        if (typeColCheck.rows.length === 0) {
            const oldPackagesExist = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name='packages'`);
            const oldTypeColExist = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name='packages' AND column_name='type'`);

            if (oldPackagesExist.rows.length > 0 && oldTypeColExist.rows.length > 0) {
                console.log("MIGRATION: Starting package structure migration...");
                await client.query(`ALTER TABLE packages RENAME TO packages_old;`);
                await client.query(`
                    CREATE TABLE packages (
                      id SERIAL PRIMARY KEY,
                      name VARCHAR(255) NOT NULL,
                      description TEXT,
                      price NUMERIC(10, 2) NOT NULL,
                      category_id INTEGER REFERENCES package_categories(id) ON DELETE SET NULL,
                      is_published BOOLEAN DEFAULT FALSE,
                      rich_description TEXT,
                      rich_description_image_url TEXT,
                      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                
                await client.query(`INSERT INTO package_categories (name, icon_name) VALUES ('Film', 'FilmIcon') ON CONFLICT (name) DO NOTHING;`);
                await client.query(`INSERT INTO package_categories (name, icon_name) VALUES ('Fotografia', 'CameraIcon') ON CONFLICT (name) DO NOTHING;`);
                await client.query(`INSERT INTO package_categories (name, icon_name) VALUES ('Film + Fotografia', 'FilmCameraIcon') ON CONFLICT (name) DO NOTHING;`);

                await client.query(`
                    INSERT INTO packages (id, name, description, price, category_id, is_published)
                    SELECT 
                        id, name, description, price,
                        CASE 
                            WHEN type = 'film' THEN (SELECT id FROM package_categories WHERE name = 'Film')
                            WHEN type = 'photo' THEN (SELECT id FROM package_categories WHERE name = 'Fotografia')
                            ELSE (SELECT id FROM package_categories WHERE name = 'Film + Fotografia')
                        END as category_id,
                        TRUE as is_published
                    FROM packages_old;
                `);

                await client.query(`SELECT setval('packages_id_seq', (SELECT MAX(id) FROM packages));`);
                console.log("MIGRATION: Package structure migration completed.");
            }
        }

        const bookingsColumnsCheck = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='locations'`);
        if (bookingsColumnsCheck.rows.length > 0) {
            console.log("MIGRATION: Splitting locations column in bookings table.");
            await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS church_location TEXT;`);
            await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS venue_location TEXT;`);
            await client.query(`ALTER TABLE bookings DROP COLUMN locations;`);
            console.log("MIGRATION: Locations column split complete.");
        }
        await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read_by_client BOOLEAN DEFAULT FALSE;`);
        await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;`);
        await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50);`);
        
        // --- SEEDING ---
        const adminRes = await client.query('SELECT * FROM admins');
        if (adminRes.rows.length === 0) {
            const adminPassword = 'adminpassword';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await client.query('INSERT INTO admins (email, password_hash, notification_email) VALUES ($1, $2, $3)', ['admin@dreamcatcher.com', hashedPassword, 'admin@dreamcatcher.com']);
        } else {
            await client.query("UPDATE admins SET notification_email = email WHERE notification_email IS NULL");
        }
        
        await client.query("DELETE FROM bookings WHERE client_id = 'CONTACTFORM'");

        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_email', 'info@dreamcatcherfilm.co.uk') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_phone', '+48 123 456 789') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_address', 'ul. Filmowa 123, 00-001 Warszawa, Polska') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('google_maps_api_key', '') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_title', 'Kilka słów o nas') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_text', 'Jesteśmy pasjonatami opowiadania historii. Każdy ślub to dla nas unikalna opowieść, którą staramy się uchwycić w najbardziej autentyczny i emocjonalny sposób. Naszym celem jest stworzenie pamiątki, która przetrwa próbę czasu i będziecie do niej wracać z uśmiechem przez lata.') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_image_url', '') ON CONFLICT (key) DO NOTHING;`);

        await client.query('COMMIT');
        return { success: true, message: 'Database schema initialized and migrated successfully.' };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database setup error:', err);
        throw new Error(`Error setting up database schema: ${err.message}`);
    } finally {
        client.release();
    }
};

const initializeDatabase = () => {
    if (initializationPromise) {
        return initializationPromise;
    }
    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            getPool(); // This will throw if DATABASE_URL is not set
            console.log("Running automatic database setup on cold start...");
            await runDbSetup();
            console.log("Automatic database setup finished successfully.");
            resolve();
        } catch (error) {
            console.error("AUTOMATIC DATABASE SETUP FAILED:", error);
            reject(error);
        }
    });
    return initializationPromise;
};

// Start initialization on module load.
initializeDatabase();

const awaitDbInitialization = async (req, res, next) => {
    try {
        await initializationPromise;
        next();
    } catch (error) {
        res.status(503).send("Service temporarily unavailable due to a database initialization error. Please check the function logs.");
    }
};


// --- JWT & Config Middleware ---
const checkConfig = (req, res, next) => {
    try {
        getPool();
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

// Apply middleware. This ensures DB is ready before any route is handled.
app.use(awaitDbInitialization);
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
            const adminRes = await getPool().query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
            const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
            
            if (adminEmail) {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films (Kontakt) <powiadomienia@dreamcatcherfilms.co.uk>',
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
                if (error) {
                    const errorMessage = error.message || JSON.stringify(error);
                    console.error(`Contact form - Resend API error: ${errorMessage}`);
                } else if (!data || !data.id) {
                    console.warn("Contact form - Resend API returned success but no data ID.", data);
                } else {
                    console.log("Contact form - notification email sent:", data.id);
                }
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
            `INSERT INTO bookings (access_key, password_hash, client_id, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, email, phone_number, additional_info, discount_code) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
            [accessKey, hashedPassword, clientId, bookingData.packageName, bookingData.totalPrice, JSON.stringify(bookingData.selectedItems), bookingData.brideName, bookingData.groomName, bookingData.weddingDate, bookingData.brideAddress, bookingData.groomAddress, bookingData.churchLocation, bookingData.venueLocation, bookingData.schedule, bookingData.email, bookingData.phoneNumber, bookingData.additionalInfo, bookingData.discountCode]
        );
        const newBookingId = result.rows[0].id;
        
        if (bookingData.discountCode) {
            await getPool().query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [bookingData.discountCode]);
        }
        
        await getPool().query('DELETE FROM access_keys WHERE key = $1', [accessKey]);

        // --- Send confirmation email to client ---
        if (resend) {
            const appUrl = `${req.protocol}://${req.get('host')}`;
            const { data, error } = await resend.emails.send({
                from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                to: bookingData.email,
                subject: `Witaj w Dreamcatcher Film! Twoje konto zostało utworzone.`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                        <h2 style="color: #1e293b;">Witaj ${bookingData.brideName}!</h2>
                        <p>Dziękujemy za zaufanie i rezerwację terminu w Dreamcatcher Film. Twoje konto w panelu klienta zostało pomyślnie utworzone.</p>
                        <p>Poniżej znajdziesz swoje dane do logowania. Zapisz je w bezpiecznym miejscu.</p>
                        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Numer Klienta (login):</strong> <span style="font-family: monospace; font-size: 1.2em; color: #4f46e5; font-weight: bold;">${clientId}</span></p>
                            <p style="margin: 0;"><strong>Twoje hasło:</strong> <span style="font-family: monospace; font-size: 1.2em; color: #4f46e5; font-weight: bold;">${password}</span></p>
                        </div>
                        <p>Możesz teraz zalogować się do swojego panelu, aby zobaczyć szczegóły rezerwacji, śledzić postępy i komunikować się z nami.</p>
                        <a href="${appUrl}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; margin-top: 15px; font-weight: bold;">Przejdź do Panelu Klienta</a>
                        <p style="margin-top: 30px; font-size: 0.9em; color: #64748b;">Z pozdrowieniami,<br/>Zespół Dreamcatcher Film</p>
                    </div>
                `,
            });
            if (error) {
                const errorMessage = error.message || JSON.stringify(error);
                console.error(`Failed to send confirmation email to ${bookingData.email}: ${errorMessage}`);
            } else if (!data || !data.id) {
                console.warn(`Confirmation email to ${bookingData.email} - Resend API returned success but no data ID.`, data);
            } else {
                console.log(`Confirmation email sent successfully to ${bookingData.email}, ID: ${data.id}`);
            }
        } else {
            console.warn("RESEND_API_KEY is not configured. Skipping client confirmation email.");
        }
        
        res.status(201).json({ bookingId: newBookingId, clientId });
    } catch (err) {
        console.error('Error in /api/bookings:', err);
        res.status(500).send(`Server error: ${err.message}`);
    }
});

app.get('/api/packages', async (req, res) => {
    try {
        const categoriesRes = await getPool().query('SELECT * FROM package_categories ORDER BY id');
        const packagesRes = await getPool().query('SELECT * FROM packages WHERE is_published = TRUE ORDER BY price DESC');
        const addonsRes = await getPool().query('SELECT * FROM addons ORDER BY name');
        const relationsRes = await getPool().query('SELECT * FROM package_addons');
        
        const addonsMap = new Map(addonsRes.rows.map(a => [a.id, a]));
        const packages = packagesRes.rows.map(p => {
            const included = relationsRes.rows
                .filter(r => r.package_id === p.id)
                .map(r => ({ ...addonsMap.get(r.addon_id), locked: r.is_locked }));
            return { ...p, included };
        });

        res.json({ categories: categoriesRes.rows, packages, allAddons: addonsRes.rows });
    } catch (err) {
        res.status(500).send(`Error fetching offer for calculator: ${err.message}`);
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
        const { bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
        const result = await getPool().query(
            `UPDATE bookings SET bride_address = $1, groom_address = $2, church_location = $3, venue_location = $4, schedule = $5, additional_info = $6 WHERE id = $7 RETURNING *`,
            [bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.user.bookingId]
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
    try {
        console.log("Manual database setup triggered by admin.");
        const result = await runDbSetup();
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, error: err });
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

app.post('/api/admin/bookings/:id/resend-credentials', verifyAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        const bookingRes = await getPool().query('SELECT client_id, email, bride_name FROM bookings WHERE id = $1', [id]);
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }

        const booking = bookingRes.rows[0];

        if (!resend) {
            return res.status(503).json({ message: 'Usługa e-mail jest nieskonfigurowana.' });
        }

        const appUrl = `${req.protocol}://${req.get('host')}`;
        const { data, error } = await resend.emails.send({
            from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
            to: booking.email,
            subject: 'Twoje dane do logowania do panelu Dreamcatcher Film',
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                    <h2 style="color: #1e293b;">Witaj ${booking.bride_name}!</h2>
                    <p>Na prośbę administratora, ponownie wysyłamy Twoje dane logowania do panelu klienta.</p>
                    <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><strong>Twój numer klienta (login):</strong> <span style="font-family: monospace; font-size: 1.2em; color: #4f46e5; font-weight: bold;">${booking.client_id}</span></p>
                    </div>
                    <p>Twoje hasło to to, które zostało ustawione podczas tworzenia rezerwacji. Jeśli go nie pamiętasz, skontaktuj się z nami w celu jego zresetowania.</p>
                    <a href="${appUrl}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; margin-top: 15px; font-weight: bold;">Przejdź do Panelu Klienta</a>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #64748b;">Z pozdrowieniami,<br/>Zespół Dreamcatcher Film</p>
                </div>
            `,
        });

        if (error) {
            const errorMessage = error.message || JSON.stringify(error);
            console.error(`Resend API Error for booking #${id}: ${errorMessage}`, error);
            return res.status(500).json({ message: `Błąd API Resend: ${errorMessage}` });
        }
        
        if (!data || !data.id) {
            console.error(`Resend API returned success status but no data ID for booking #${id}. Response:`, data);
            return res.status(500).json({ message: 'Nieprawidłowa odpowiedź z API Resend.' });
        }

        res.status(200).json({ message: 'Email z danymi logowania został wysłany pomyślnie.' });

    } catch (err) {
        console.error(`Error resending credentials for booking #${id}:`, err);
        res.status(500).json({ message: `Błąd serwera: ${err.message}` });
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
        const { bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
        const result = await getPool().query(
            `UPDATE bookings SET bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5, bride_address = $6, groom_address = $7, church_location = $8, venue_location = $9, schedule = $10, additional_info = $11 WHERE id = $12 RETURNING *`,
            [bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.params.id]
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

// Admin Offer Management
app.get('/api/admin/offer-data', verifyAdminToken, async (req, res) => {
     try {
        const packagesRes = await getPool().query('SELECT p.*, c.name as category_name FROM packages p LEFT JOIN package_categories c ON p.category_id = c.id ORDER BY p.id ASC');
        const addonsRes = await getPool().query('SELECT * FROM addons ORDER BY name');
        const categoriesRes = await getPool().query('SELECT * FROM package_categories ORDER BY id ASC');
        const relationsRes = await getPool().query('SELECT * FROM package_addons');

        const packages = packagesRes.rows.map(p => ({
            ...p,
            addons: relationsRes.rows.filter(r => r.package_id === p.id).map(r => ({id: r.addon_id, is_locked: r.is_locked}))
        }));
        
        res.json({ packages, addons: addonsRes.rows, categories: categoriesRes.rows });
    } catch (err) {
        res.status(500).send(`Błąd pobierania danych oferty: ${err.message}`);
    }
});

// Categories CRUD
app.post('/api/admin/categories', verifyAdminToken, async (req, res) => {
    const { name, description, icon_name } = req.body;
    try {
        const result = await getPool().query('INSERT INTO package_categories (name, description, icon_name) VALUES ($1, $2, $3) RETURNING *', [name, description, icon_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd tworzenia kategorii: ${err.message}`);
    }
});
app.patch('/api/admin/categories/:id', verifyAdminToken, async (req, res) => {
    const { name, description, icon_name } = req.body;
    try {
        const result = await getPool().query('UPDATE package_categories SET name=$1, description=$2, icon_name=$3 WHERE id=$4 RETURNING *', [name, description, icon_name, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd aktualizacji kategorii: ${err.message}`);
    }
});
app.delete('/api/admin/categories/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM package_categories WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania kategorii: ${err.message}`);
    }
});

// Addons CRUD
app.post('/api/admin/addons', verifyAdminToken, async (req, res) => {
    const { name, price } = req.body;
    try {
        const result = await getPool().query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING *', [name, price]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd tworzenia dodatku: ${err.message}`);
    }
});
app.patch('/api/admin/addons/:id', verifyAdminToken, async (req, res) => {
    const { name, price } = req.body;
    try {
        const result = await getPool().query('UPDATE addons SET name=$1, price=$2 WHERE id=$3 RETURNING *', [name, price, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(`Błąd aktualizacji dodatku: ${err.message}`);
    }
});
app.delete('/api/admin/addons/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM addons WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Błąd usuwania dodatku: ${err.message}`);
    }
});

// Packages CRUD
app.post('/api/admin/packages', verifyAdminToken, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const pkgRes = await client.query(
            'INSERT INTO packages (name, description, price, category_id, is_published, rich_description, rich_description_image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url]
        );
        const newPackage = pkgRes.rows[0];

        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [newPackage.id, addon.id, addon.is_locked]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json(newPackage);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(`Błąd tworzenia pakietu: ${err.message}`);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/packages/:id', verifyAdminToken, async (req, res) => {
    const packageId = req.params.id;
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const pkgRes = await client.query(
            'UPDATE packages SET name=$1, description=$2, price=$3, category_id=$4, is_published=$5, rich_description=$6, rich_description_image_url=$7 WHERE id=$8 RETURNING *',
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url, packageId]
        );
        
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [packageId]);
        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [packageId, addon.id, addon.is_locked]);
            }
        }
        await client.query('COMMIT');
        res.status(200).json(pkgRes.rows[0]);
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

app.post('/api/admin/packages/upload-image', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'package-image.jpg';
        const blob = await put(`packages/${filename}`, req, { access: 'public' });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania zdjęcia pakietu: ${err.message}`);
    }
});

// -- END -- Admin Offer Management


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

app.post('/api/admin/messages/upload', verifyAdminToken, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'attachment';
        const contentType = req.headers['content-type'] || 'application/octet-stream';
        const fileSize = parseInt(req.headers['content-length'] || '0');

        if (fileSize > 5 * 1024 * 1024) { // 5MB limit
            return res.status(413).send('Plik przekracza limit 5MB.');
        }

        const blob = await put(`attachments/${filename}`, req, { 
            access: 'public', 
            addRandomSuffix: true,
            contentType
        });
        res.status(200).json(blob);
    } catch (err) {
        res.status(500).send(`Błąd wysyłania pliku: ${err.message}`);
    }
});


app.post('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { content, attachment_url, attachment_type } = req.body;
        if(!content && !attachment_url) return res.status(400).send('Wiadomość musi zawierać treść lub załącznik.');
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, attachment_url, attachment_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.params.bookingId, 'admin', content || '', attachment_url, attachment_type]
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

app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query("SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = 'admin' AND is_read_by_client = FALSE", [req.user.bookingId]);
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).send(`Error fetching unread message count: ${err.message}`);
    }
});

app.patch('/api/messages/mark-as-read', verifyToken, async (req, res) => {
    try {
        await getPool().query("UPDATE messages SET is_read_by_client = TRUE WHERE booking_id = $1 AND sender = 'admin'", [req.user.bookingId]);
        res.status(204).send();
    } catch (err) {
        res.status(500).send(`Error marking messages as read: ${err.message}`);
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
            const adminRes = await getPool().query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
            const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
            
            const bookingRes = await getPool().query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.bookingId]);
            const clientName = bookingRes.rows.length > 0 ? `${bookingRes.rows[0].bride_name} & ${bookingRes.rows[0].groom_name}` : 'Klient';

            if (adminEmail) {
                const { data, error } = await resend.emails.send({
                    from: 'Powiadomienia Dreamcatcher <powiadomienia@dreamcatcherfilms.co.uk>',
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
                if (error) {
                    const errorMessage = error.message || JSON.stringify(error);
                    console.error(`Failed to send email notification: ${errorMessage}`);
                } else if (!data || !data.id) {
                    console.warn(`Email notification - Resend API returned success but no data ID.`, data);
                } else {
                    console.log(`Email notification sent successfully to ${adminEmail}, ID: ${data.id}`);
                }
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

app.get('/api/admin/bookings/:bookingId/unread-count', verifyAdminToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const result = await getPool().query(
            "SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = 'client' AND is_read_by_admin = FALSE",
            [bookingId]
        );
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).send(`Error fetching unread count for booking: ${err.message}`);
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
