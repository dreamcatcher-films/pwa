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
              PRIMARY KEY (package_id, addon_id)
            );

            CREATE TABLE IF NOT EXISTS addon_categories (
              addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
              category_id INTEGER REFERENCES package_categories(id) ON DELETE CASCADE,
              PRIMARY KEY (addon_id, category_id)
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
                
                // FIX: Correct the foreign key on package_addons to point to the new packages table
                const fkCheckRes = await client.query(`
                    SELECT 1
                    FROM pg_constraint
                    JOIN pg_class AS to_tbl ON to_tbl.oid = pg_constraint.confrelid
                    WHERE pg_constraint.conname = 'package_addons_package_id_fkey'
                      AND to_tbl.relname = 'packages_old'
                `);
        
                if (fkCheckRes.rows.length > 0) {
                    console.log("MIGRATION: Fixing foreign key constraint on package_addons...");
                    await client.query('ALTER TABLE package_addons DROP CONSTRAINT package_addons_package_id_fkey;');
                    await client.query(`
                        ALTER TABLE package_addons 
                        ADD CONSTRAINT package_addons_package_id_fkey 
                        FOREIGN KEY (package_id) 
                        REFERENCES packages(id) 
                        ON DELETE CASCADE;
                    `);
                    console.log("MIGRATION: Foreign key constraint on package_addons fixed.");
                }

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
        await client.query(`ALTER TABLE package_addons DROP COLUMN IF EXISTS is_locked;`);
        
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
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        const { accessKey, password, selectedItems, ...bookingData } = req.body;
        
        const keyCheck = await client.query('SELECT * FROM access_keys WHERE key = $1', [accessKey]);
        if (keyCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const clientId = await generateUniqueClientId(4);

        const result = await client.query(
            `INSERT INTO bookings (access_key, password_hash, client_id, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, email, phone_number, additional_info, discount_code) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
            [
                accessKey, hashedPassword, clientId, bookingData.packageName, bookingData.totalPrice, JSON.stringify(bookingData.selectedItems),
                bookingData.brideName, bookingData.groomName, bookingData.weddingDate, bookingData.brideAddress,
                bookingData.groomAddress, bookingData.churchLocation, bookingData.venueLocation, bookingData.schedule,
                bookingData.email, bookingData.phoneNumber, bookingData.additionalInfo, bookingData.discountCode
            ]
        );
        const newBookingId = result.rows[0].id;

        // Add booking to calendar
        await client.query(
            `INSERT INTO availability (title, start_time, end_time, is_all_day, description, resource) VALUES ($1, $2, $3, true, $4, $5)`,
            [
                `Rezerwacja: ${bookingData.brideName} & ${bookingData.groomName}`,
                bookingData.weddingDate,
                bookingData.weddingDate,
                `Pakiet: ${bookingData.packageName}`,
                JSON.stringify({ type: 'booking', bookingId: newBookingId })
            ]
        );

        await client.query('DELETE FROM access_keys WHERE key = $1', [accessKey]);
        
        // Send confirmation email
        if (resend) {
            const { data, error } = await resend.emails.send({
                from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                to: bookingData.email,
                subject: 'Potwierdzenie Rezerwacji w Dreamcatcher Films!',
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333;">
                        <h2>Witaj ${bookingData.brideName}!</h2>
                        <p>Dziękujemy za dokonanie rezerwacji. Twoje konto w naszym panelu klienta zostało pomyślnie utworzone.</p>
                        <p><strong>Oto Twoje dane do logowania:</strong></p>
                        <ul>
                            <li><strong>Numer Klienta (login):</strong> <span style="font-weight: bold; font-size: 1.2em;">${clientId}</span></li>
                            <li><strong>Hasło:</strong> [Twoje hasło podane podczas rejestracji]</li>
                        </ul>
                        <p>Możesz zalogować się do swojego panelu, aby śledzić postępy i zarządzać swoją rezerwacją.</p>
                        <a href="${req.protocol}://${req.get('host')}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; margin-top: 20px;">Przejdź do Panelu Klienta</a>
                        <p style="margin-top: 30px; font-size: 0.9em; color: #666;">Pozdrawiamy,<br>Zespół Dreamcatcher Films</p>
                    </div>
                `,
            });
            if (error) {
                const errorMessage = error.message || JSON.stringify(error);
                console.error(`Booking confirmation - Resend API error: ${errorMessage}`);
                // Don't fail the whole request, just log it.
            } else if (!data || !data.id) {
                 console.warn("Booking confirmation - Resend API returned success but no data ID.", data);
            } else {
                 console.log("Booking confirmation email sent:", data.id);
            }
        } else {
            console.warn("RESEND_API_KEY is not configured. Skipping booking confirmation email.");
        }

        await client.query('COMMIT');

        res.status(201).json({ bookingId: newBookingId, clientId: clientId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Booking creation error:', err);
        res.status(500).json({ message: `Błąd serwera: ${err.message}` });
    } finally {
        client.release();
    }
});

app.post('/api/validate-discount', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ message: 'Kod rabatowy jest wymagany.' });
        }

        const result = await getPool().query('SELECT * FROM discount_codes WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW())', [code.toUpperCase()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kod rabatowy jest nieprawidłowy lub wygasł.' });
        }

        const discount = result.rows[0];
        if (discount.usage_limit !== null && discount.times_used >= discount.usage_limit) {
            return res.status(403).json({ message: 'Limit wykorzystania tego kodu rabatowego został osiągnięty.' });
        }

        res.json({
            code: discount.code,
            type: discount.type,
            value: parseFloat(discount.value)
        });
    } catch (err) {
        console.error('Discount validation error:', err);
        res.status(500).json({ message: 'Wystąpił błąd serwera przy walidacji kodu.' });
    }
});

// Homepage content
app.get('/api/homepage-content', async (req, res) => {
    try {
        const [slidesRes, aboutRes, testimonialsRes, instagramRes] = await Promise.all([
            getPool().query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC'),
            getPool().query("SELECT key, value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')"),
            getPool().query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC'),
            getPool().query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC')
        ]);
        
        const aboutSection = aboutRes.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        res.json({
            slides: slidesRes.rows,
            aboutSection: {
                about_us_title: aboutSection.about_us_title,
                about_us_text: aboutSection.about_us_text,
                about_us_image_url: aboutSection.about_us_image_url
            },
            testimonials: testimonialsRes.rows,
            instagramPosts: instagramRes.rows,
        });
    } catch(err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Gallery content
app.get('/api/gallery', async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Contact page details
app.get('/api/contact-details', async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const details = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(details);
    } catch(err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Packages & addons for calculator
app.get('/api/packages', async (req, res) => {
    try {
        const [categoriesRes, packagesRes, addonsRes, packageAddonsRes] = await Promise.all([
            getPool().query('SELECT * FROM package_categories ORDER BY id'),
            getPool().query('SELECT * FROM packages WHERE is_published = TRUE ORDER BY price'),
            getPool().query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id GROUP BY a.id ORDER BY a.price'),
            getPool().query('SELECT * FROM package_addons')
        ]);

        const allAddons = addonsRes.rows;
        
        const packagesWithAddons = packagesRes.rows.map(p => {
            const includedAddonIds = packageAddonsRes.rows
                .filter(pa => pa.package_id === p.id)
                .map(pa => pa.addon_id);
            
            const includedAddons = allAddons
                .filter(a => includedAddonIds.includes(a.id))
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    price: parseFloat(a.price),
                    locked: parseFloat(a.price) === 0
                }));
            
            return {
                ...p,
                price: parseFloat(p.price),
                included: includedAddons
            };
        });

        res.json({
            categories: categoriesRes.rows,
            packages: packagesWithAddons,
            allAddons: allAddons.map(a => ({...a, price: parseFloat(a.price)})),
        });
    } catch(err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Client Login Endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { clientId, password } = req.body;
        const result = await getPool().query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }
        
        const booking = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, booking.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }
        
        const token = jwt.sign({ bookingId: booking.id, clientId: booking.client_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// --- CLIENT AUTHENTICATED Endpoints ---
app.get('/api/my-booking', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.user.bookingId]);
        if (result.rows.length === 0) {
            return res.status(404).send('Booking not found.');
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/my-booking', verifyToken, async (req, res) => {
    try {
        const { bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
        const result = await getPool().query(
            `UPDATE bookings SET 
                bride_address = $1, groom_address = $2, church_location = $3, 
                venue_location = $4, schedule = $5, additional_info = $6
             WHERE id = $7 RETURNING *`,
            [bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.user.bookingId]
        );
        res.json({ message: 'Dane zaktualizowane pomyślnie.', booking: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/booking-stages', verifyToken, async (req, res) => {
     try {
        const result = await getPool().query(
            `SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at
             FROM booking_stages bs
             JOIN production_stages ps ON bs.stage_id = ps.id
             WHERE bs.booking_id = $1
             ORDER BY ps.id`,
            [req.user.bookingId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/booking-stages/:stageId/approve', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query(
            `UPDATE booking_stages SET status = 'completed', completed_at = NOW() 
             WHERE id = $1 AND booking_id = $2 AND status = 'awaiting_approval' RETURNING *`,
            [req.params.stageId, req.user.bookingId]
        );
        if (result.rowCount === 0) {
            return res.status(404).send('Nie znaleziono etapu lub nie można go zatwierdzić.');
        }
        res.json({ message: 'Etap został zatwierdzony.' });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/messages', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, is_read_by_admin) VALUES ($1, $2, $3, TRUE) RETURNING *',
            [req.user.bookingId, 'client', content]
        );
        
        // Notify admin via email
        if (resend) {
            const bookingRes = await getPool().query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.bookingId]);
            const adminRes = await getPool().query('SELECT notification_email FROM admins ORDER BY id LIMIT 1');
            const adminEmail = adminRes.rows.length > 0 ? adminRes.rows[0].notification_email : null;
            const clientName = bookingRes.rows.length > 0 ? `${bookingRes.rows[0].bride_name} & ${bookingRes.rows[0].groom_name}` : `Klient #${req.user.clientId}`;

            if (adminEmail) {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films (Powiadomienia) <powiadomienia@dreamcatcherfilms.co.uk>',
                    to: adminEmail,
                    subject: `Nowa wiadomość od ${clientName}`,
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333;">
                            <h2>Otrzymano nową wiadomość w panelu klienta!</h2>
                            <p><strong>Klient:</strong> ${clientName} (Rezerwacja #${req.user.bookingId})</p>
                            <p><strong>Treść wiadomości:</strong></p>
                            <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px;">${content}</div>
                            <a href="${req.protocol}://${req.get('host')}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; margin-top: 20px;">Przejdź do Panelu Administratora</a>
                        </div>
                    `,
                });
                if (error) {
                    const errorMessage = error.message || JSON.stringify(error);
                    console.error(`Client message notification - Resend API error: ${errorMessage}`);
                } else if (!data || !data.id) {
                     console.warn("Client message notification - Resend API returned success but no data ID.", data);
                } else {
                     console.log("Client message notification email sent:", data.id);
                }
            }
        }
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
    try {
        const result = await getPool().query(
            'SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = $2 AND is_read_by_client = FALSE',
            [req.user.bookingId, 'admin']
        );
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/messages/mark-as-read', verifyToken, async (req, res) => {
    try {
        await getPool().query(
            'UPDATE messages SET is_read_by_client = TRUE WHERE booking_id = $1 AND sender = $2',
            [req.user.bookingId, 'admin']
        );
        res.status(200).send('Messages marked as read.');
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// --- ADMIN LOGIN ---
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await getPool().query('SELECT * FROM admins WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        
        const admin = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        
        const token = jwt.sign({ adminId: admin.id, email: admin.email }, process.env.ADMIN_JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// --- ADMIN AUTHENTICATED Endpoints ---
app.get('/api/admin/bookings', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at FROM bookings ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).send('Rezerwacja nieznaleziona.');
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM messages WHERE booking_id = $1', [req.params.id]);
        await client.query('DELETE FROM booking_stages WHERE booking_id = $1', [req.params.id]);
        await client.query('DELETE FROM availability WHERE resource->>\'bookingId\' = $1', [req.params.id]);
        const result = await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).send('Rezerwacja nieznaleziona.');
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Rezerwacja została pomyślnie usunięta.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:id', verifyAdminToken, async (req, res) => {
    try {
        const {
            bride_name, groom_name, wedding_date, bride_address, groom_address,
            church_location, venue_location, schedule, email, phone_number, additional_info
        } = req.body;

        const result = await getPool().query(
            `UPDATE bookings SET
                bride_name = $1, groom_name = $2, wedding_date = $3, bride_address = $4,
                groom_address = $5, church_location = $6, venue_location = $7,
                schedule = $8, email = $9, phone_number = $10, additional_info = $11
             WHERE id = $12 RETURNING *`,
            [
                bride_name, groom_name, wedding_date, bride_address, groom_address,
                church_location, venue_location, schedule, email, phone_number,
                additional_info, req.params.id
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Rezerwacja nieznaleziona.');
        }
        res.json({ message: 'Dane rezerwacji zaktualizowane.', booking: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/bookings/:id/resend-credentials', verifyAdminToken, async (req, res) => {
    if (!resend) {
        return res.status(503).json({ message: 'Usługa e-mail nie jest skonfigurowana.' });
    }
    try {
        const bookingRes = await getPool().query('SELECT client_id, bride_name, email FROM bookings WHERE id = $1', [req.params.id]);
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        const { client_id, bride_name, email } = bookingRes.rows[0];

        const { data, error } = await resend.emails.send({
            from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
            to: email,
            subject: 'Twoje dane do logowania - Dreamcatcher Films',
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Witaj ${bride_name},</h2>
                    <p>Zgodnie z Twoją prośbą, przesyłamy ponownie Twoje dane do logowania do panelu klienta.</p>
                    <p><strong>Twój numer klienta (login):</strong> <span style="font-weight: bold; font-size: 1.2em;">${client_id}</span></p>
                    <p>Hasło zostało ustawione przez Ciebie podczas procesu rezerwacji. Jeśli go nie pamiętasz, skontaktuj się z nami bezpośrednio.</p>
                    <a href="${req.protocol}://${req.get('host')}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; margin-top: 20px;">Przejdź do Panelu Klienta</a>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #666;">Pozdrawiamy,<br>Zespół Dreamcatcher Films</p>
                </div>
            `,
        });

        if (error) {
            const errorMessage = error.message || JSON.stringify(error);
            return res.status(500).json({ message: `Błąd API Resend: ${errorMessage}` });
        }
        if (!data || !data.id) {
            return res.status(500).json({ message: "Resend API zwróciło sukces, ale bez ID wiadomości." });
        }

        res.status(200).json({ message: 'E-mail został pomyślnie wysłany.' });

    } catch (err) {
        console.error('Resend credentials error:', err);
        res.status(500).json({ message: `Błąd serwera: ${err.message}` });
    }
});


app.patch('/api/admin/bookings/:id/payment', verifyAdminToken, async (req, res) => {
    try {
        const { payment_status, amount_paid } = req.body;
        const result = await getPool().query(
            `UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3 RETURNING payment_status, amount_paid`,
            [payment_status, amount_paid, req.params.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).send('Rezerwacja nieznaleziona.');
        }
        res.json({ message: 'Status płatności zaktualizowany.', payment_details: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Access Keys
app.get('/api/admin/access-keys', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/access-keys', verifyAdminToken, async (req, res) => {
    try {
        const { client_name } = req.body;
        const newKey = await generateUniqueKey(4);
        const result = await getPool().query('INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *', [newKey, client_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/access-keys/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM access_keys WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Availability
app.get('/api/admin/availability', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT id, title, description, start_time as start, end_time as end, is_all_day as "allDay", resource FROM availability');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/availability', verifyAdminToken, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await getPool().query(
            'INSERT INTO availability (title, description, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [title, description, start_time, end_time, is_all_day, JSON.stringify({ type: 'event' })]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/availability/:id', verifyAdminToken, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await getPool().query(
            'UPDATE availability SET title = $1, description = $2, start_time = $3, end_time = $4, is_all_day = $5 WHERE id = $6 AND resource->>\'type\' = \'event\' RETURNING *',
            [title, description, start_time, end_time, is_all_day, req.params.id]
        );
         if (result.rowCount === 0) return res.status(404).send('Nie znaleziono wydarzenia lub nie można go edytować (np. jest to rezerwacja).');
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/availability/:id', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('DELETE FROM availability WHERE id = $1 AND resource->>\'type\' = \'event\'', [req.params.id]);
         if (result.rowCount === 0) return res.status(404).send('Nie znaleziono wydarzenia lub nie można go usunąć.');
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Gallery
app.get('/api/admin/galleries', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/galleries/upload', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename header' });
    try {
        const blob = await put(`gallery/${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch(err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
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
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/galleries/:id', verifyAdminToken, async (req, res) => {
    try {
        const itemRes = await getPool().query('SELECT image_url FROM galleries WHERE id = $1', [req.params.id]);
        if (itemRes.rows.length === 0) return res.status(404).send('Nie znaleziono elementu.');
        
        await del(itemRes.rows[0].image_url); // Delete from Vercel Blob
        await getPool().query('DELETE FROM galleries WHERE id = $1', [req.params.id]); // Delete from DB
        
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Offer management
app.get('/api/admin/offer-data', verifyAdminToken, async (req, res) => {
    try {
        const [packagesRes, addonsRes, categoriesRes] = await Promise.all([
             getPool().query(`
                SELECT p.*, c.name as category_name 
                FROM packages p 
                LEFT JOIN package_categories c ON p.category_id = c.id 
                ORDER BY p.id
            `),
            getPool().query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id GROUP BY a.id ORDER BY a.id'),
            getPool().query('SELECT * FROM package_categories ORDER BY id')
        ]);
        
        const packagesWithAddons = await Promise.all(packagesRes.rows.map(async (pkg) => {
            const addonsForPackage = await getPool().query('SELECT addon_id FROM package_addons WHERE package_id = $1', [pkg.id]);
            return {
                ...pkg,
                addons: addonsForPackage.rows.map(r => ({ id: r.addon_id }))
            };
        }));
        
        res.json({
            packages: packagesWithAddons,
            addons: addonsRes.rows.map(a => ({...a, category_ids: a.category_ids.filter(id => id !== null)})),
            categories: categoriesRes.rows,
        });

    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Packages
app.post('/api/admin/packages', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
        
        const packageRes = await client.query(
            `INSERT INTO packages (name, description, price, category_id, is_published, rich_description, rich_description_image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url]
        );
        const newPackage = packageRes.rows[0];
        
        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query(`INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)`, [newPackage.id, addon.id]);
            }
        }
        
        await client.query('COMMIT');
        res.status(201).json(newPackage);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error creating package:", err);
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/packages/:id', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
        const packageId = req.params.id;

        const updatedPackageRes = await client.query(
            `UPDATE packages SET name=$1, description=$2, price=$3, category_id=$4, is_published=$5, rich_description=$6, rich_description_image_url=$7 
             WHERE id=$8 RETURNING *`,
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url, packageId]
        );
        
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [packageId]);
        if (addons && addons.length > 0) {
             for (const addon of addons) {
                await client.query(`INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)`, [packageId, addon.id]);
            }
        }
        
        await client.query('COMMIT');
        res.status(200).json(updatedPackageRes.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error updating package:`, err);
        res.status(500).json({ message: `Error updating package: ${err.message}` });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/packages/:id', verifyAdminToken, async (req, res) => {
     const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [req.params.id]);
        await client.query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.post('/api/admin/packages/upload-image', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename header' });
    try {
        const blob = await put(`packages/${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch(err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
    }
});

// Addons
app.post('/api/admin/addons', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const { name, price, category_ids } = req.body;
        const addonRes = await getPool().query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING id', [name, price]);
        const newAddonId = addonRes.rows[0].id;
        
        if (category_ids && category_ids.length > 0) {
            const catValues = category_ids.map(catId => `(${newAddonId}, ${catId})`).join(',');
            await client.query(`INSERT INTO addon_categories (addon_id, category_id) VALUES ${catValues}`);
        }

        await client.query('COMMIT');
        res.status(201).json({ id: newAddonId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/addons/:id', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const { name, price, category_ids } = req.body;
        const addonId = req.params.id;

        await client.query('UPDATE addons SET name=$1, price=$2 WHERE id=$3', [name, price, addonId]);
        
        await client.query('DELETE FROM addon_categories WHERE addon_id = $1', [addonId]);
        if (category_ids && category_ids.length > 0) {
            const catValues = category_ids.map(catId => `(${addonId}, ${catId})`).join(',');
            await client.query(`INSERT INTO addon_categories (addon_id, category_id) VALUES ${catValues}`);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Dodatek zaktualizowany.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/addons/:id', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM addon_categories WHERE addon_id = $1', [req.params.id]);
        await client.query('DELETE FROM package_addons WHERE addon_id = $1', [req.params.id]);
        await client.query('DELETE FROM addons WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

// Categories
app.post('/api/admin/categories', verifyAdminToken, async (req, res) => {
    try {
        const { name, description, icon_name } = req.body;
        const result = await getPool().query('INSERT INTO package_categories (name, description, icon_name) VALUES ($1, $2, $3) RETURNING *', [name, description, icon_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/categories/:id', verifyAdminToken, async (req, res) => {
    try {
        const { name, description, icon_name } = req.body;
        await getPool().query('UPDATE package_categories SET name=$1, description=$2, icon_name=$3 WHERE id=$4', [name, description, icon_name, req.params.id]);
        res.status(200).json({ message: 'Kategoria zaktualizowana.' });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/categories/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM package_categories WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Discount Codes
app.get('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/discounts', verifyAdminToken, async (req, res) => {
    try {
        const { code, type, value, usage_limit, expires_at } = req.body;
        const result = await getPool().query(
            'INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code.toUpperCase(), type, value, usage_limit, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Ten kod rabatowy już istnieje.'});
        }
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/discounts/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Production Stages
app.get('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM production_stages ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/stages', verifyAdminToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await getPool().query('INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *', [name, description]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/stages/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Booking Stages Management
app.get('/api/admin/booking-stages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query(
            `SELECT bs.id, ps.name, bs.status FROM booking_stages bs
             JOIN production_stages ps ON bs.stage_id = ps.id
             WHERE bs.booking_id = $1 ORDER BY ps.id`,
            [req.params.bookingId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/booking-stages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { stage_id } = req.body;
        await getPool().query('INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2)', [req.params.bookingId, stage_id]);
        res.status(201).send();
    } catch (err) {
        if (err.code === '23505') return res.status(409).send('Ten etap jest już dodany do projektu.');
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/booking-stages/:stageId', verifyAdminToken, async (req, res) => {
    try {
        const { status } = req.body;
        await getPool().query('UPDATE booking_stages SET status = $1 WHERE id = $2', [status, req.params.stageId]);
        res.status(200).json({ message: 'Status etapu zaktualizowany.' });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/booking-stages/:stageId', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM booking_stages WHERE id = $1', [req.params.stageId]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Settings
app.post('/api/admin/setup-database', verifyAdminToken, async (req, res) => {
    try {
        const result = await runDbSetup();
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT email, notification_email FROM admins WHERE id = $1', [req.user.adminId]);
        if (result.rows.length === 0) return res.status(404).send('Admin not found.');
        res.json({ loginEmail: result.rows[0].email, notificationEmail: result.rows[0].notification_email });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const { email } = req.body;
        await getPool().query('UPDATE admins SET notification_email = $1 WHERE id = $2', [email, req.user.adminId]);
        res.json({ message: 'E-mail for notifications updated.' });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/admin/contact-settings', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const settings = result.rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/contact-settings', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const settings = req.body;
        for (const key in settings) {
            await client.query('UPDATE app_settings SET value = $1 WHERE key = $2', [settings[key], key]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Contact settings updated.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/credentials', verifyAdminToken, async (req, res) => {
    try {
        const { currentPassword, newEmail, newPassword } = req.body;

        const adminRes = await getPool().query('SELECT * FROM admins WHERE id = $1', [req.user.adminId]);
        if (adminRes.rows.length === 0) return res.status(404).json({ message: "Administrator not found." });
        
        const admin = adminRes.rows[0];
        const isPasswordValid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: "Bieżące hasło jest nieprawidłowe." });

        let query = 'UPDATE admins SET ';
        const params = [];
        let paramIndex = 1;

        if (newEmail && newEmail !== admin.email) {
            query += `email = $${paramIndex++} `;
            params.push(newEmail);
        }

        if (newPassword) {
            if (newPassword.length < 8) return res.status(400).json({ message: "Nowe hasło musi mieć co najmniej 8 znaków." });
            const newHashedPassword = await bcrypt.hash(newPassword, 10);
            if (params.length > 0) query += ', ';
            query += `password_hash = $${paramIndex++} `;
            params.push(newHashedPassword);
        }
        
        if (params.length === 0) {
            return res.status(200).json({ message: "Nie wprowadzono żadnych zmian." });
        }

        query += `WHERE id = $${paramIndex++}`;
        params.push(req.user.adminId);

        await getPool().query(query, params);

        res.json({ message: "Dane logowania zaktualizowane." });

    } catch (err) {
         if (err.code === '23505') return res.status(409).json({ message: 'Ten adres e-mail jest już zajęty.'});
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Inbox
app.get('/api/admin/inbox', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/inbox/:id/read', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.delete('/api/admin/inbox/:id', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Notifications
app.get('/api/admin/notifications/count', verifyAdminToken, async (req, res) => {
    try {
        const [msgRes, inboxRes] = await Promise.all([
            getPool().query('SELECT COUNT(*) FROM messages WHERE is_read_by_admin = FALSE AND sender = $1', ['client']),
            getPool().query('SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE')
        ]);
        const total = parseInt(msgRes.rows[0].count, 10) + parseInt(inboxRes.rows[0].count, 10);
        res.json({ count: total });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/admin/notifications', verifyAdminToken, async (req, res) => {
    try {
        // Unread client messages, grouped by booking
        const msgQuery = `
            SELECT 'client_message' as type, m.booking_id, b.bride_name || ' & ' || b.groom_name as sender_name,
                   COUNT(*) as unread_count, (array_agg(m.content ORDER BY m.created_at DESC))[1] as preview
            FROM messages m
            JOIN bookings b ON m.booking_id = b.id
            WHERE m.is_read_by_admin = FALSE AND m.sender = 'client'
            GROUP BY m.booking_id, sender_name;
        `;
        
        // Unread inbox messages
        const inboxQuery = `
            SELECT 'inbox_message' as type, id as message_id, first_name || ' ' || last_name as sender_name,
                   LEFT(subject, 50) as preview
            FROM contact_messages
            WHERE is_read = FALSE
            ORDER BY created_at DESC;
        `;

        const [msgRes, inboxRes] = await Promise.all([ getPool().query(msgQuery), getPool().query(inboxQuery) ]);

        const notifications = [...msgRes.rows, ...inboxRes.rows];
        
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

// Admin Chat
app.get('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/messages/:bookingId', verifyAdminToken, async (req, res) => {
    try {
        const { content, attachment_url, attachment_type } = req.body;
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, is_read_by_client, attachment_url, attachment_type) VALUES ($1, $2, $3, FALSE, $4, $5) RETURNING *',
            [req.params.bookingId, 'admin', content, attachment_url, attachment_type]
        );
        
        if (resend) {
            const bookingRes = await getPool().query('SELECT bride_name, email FROM bookings WHERE id = $1', [req.params.bookingId]);
            const clientEmail = bookingRes.rows[0].email;
            
            await resend.emails.send({
                from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                to: clientEmail,
                subject: 'Otrzymałeś nową wiadomość od Dreamcatcher Films',
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333;">
                        <h2>Otrzymałeś nową wiadomość</h2>
                        <p>Zaloguj się do swojego panelu klienta, aby ją odczytać.</p>
                        ${content ? `<div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 10px;">${content}</div>` : ''}
                        ${attachment_url ? `<p style="margin-top: 10px;">Dołączono załącznik.</p>` : ''}
                        <a href="${req.protocol}://${req.get('host')}" style="display: inline-block; background-color: #0F3E34; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; margin-top: 20px;">Przejdź do Panelu Klienta</a>
                    </div>
                `,
            });
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.get('/api/admin/bookings/:bookingId/unread-count', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query(
            'SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = $2 AND is_read_by_admin = FALSE',
            [req.params.bookingId, 'client']
        );
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', verifyAdminToken, async (req, res) => {
    try {
        await getPool().query(
            'UPDATE messages SET is_read_by_admin = TRUE WHERE booking_id = $1 AND sender = $2',
            [req.params.bookingId, 'client']
        );
        res.status(200).send('Messages marked as read.');
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});

app.post('/api/admin/messages/upload', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename header' });
    try {
        const blob = await put(`attachments/${Date.now()}-${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch(err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
    }
});


// Homepage Management
app.get('/api/admin/homepage/slides', verifyAdminToken, async(req,res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch(err) {
        res.status(500).json({message: `Server Error: ${err.message}`});
    }
});
app.post('/api/admin/homepage/slides', verifyAdminToken, async(req,res) => {
    try {
        const { image_url, title, subtitle, button_text, button_link } = req.body;
        await getPool().query(
            `INSERT INTO homepage_carousel_slides (image_url, title, subtitle, button_text, button_link) VALUES ($1, $2, $3, $4, $5)`,
            [image_url, title, subtitle, button_text, button_link]
        );
        res.status(201).send();
    } catch(err) {
        res.status(500).json({message: `Server Error: ${err.message}`});
    }
});
app.patch('/api/admin/homepage/slides/:id', verifyAdminToken, async(req,res) => {
     try {
        const { image_url, title, subtitle, button_text, button_link } = req.body;
        await getPool().query(
            `UPDATE homepage_carousel_slides SET image_url=$1, title=$2, subtitle=$3, button_text=$4, button_link=$5 WHERE id=$6`,
            [image_url, title, subtitle, button_text, button_link, req.params.id]
        );
        res.status(200).send();
    } catch(err) {
        res.status(500).json({message: `Server Error: ${err.message}`});
    }
});
app.delete('/api/admin/homepage/slides/:id', verifyAdminToken, async(req,res) => {
     try {
        const slideRes = await getPool().query('SELECT image_url FROM homepage_carousel_slides WHERE id=$1', [req.params.id]);
        if(slideRes.rows.length > 0) await del(slideRes.rows[0].image_url);
        await getPool().query('DELETE FROM homepage_carousel_slides WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch(err) {
        res.status(500).json({message: `Server Error: ${err.message}`});
    }
});
app.post('/api/admin/homepage/slides/upload', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename' });
    try {
        const blob = await put(`homepage/${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch (err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
    }
});
app.post('/api/admin/homepage/slides/order', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        const { orderedIds } = req.body; // Array of slide IDs in the new order
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_carousel_slides SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.status(200).send('Order updated successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server Error: ${err.message}` });
    } finally {
        client.release();
    }
});


app.get('/api/admin/homepage/about', verifyAdminToken, async (req,res) => {
     try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')");
        const data = result.rows.reduce((acc, row) => ({...acc, [row.key.replace('about_us_','')]: row.value}), {});
        res.json(data);
    } catch(err) {
        res.status(500).json({message: `Server Error: ${err.message}`});
    }
});
app.patch('/api/admin/homepage/about', verifyAdminToken, async (req,res) => {
    const client = await getPool().connect();
    try {
        const { title, text, image_url } = req.body;
        await client.query('BEGIN');
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_title'", [title]);
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_text'", [text]);
        await client.query("UPDATE app_settings SET value=$1 WHERE key='about_us_image_url'", [image_url]);
        await client.query('COMMIT');
        res.status(200).send();
    } catch(err) {
        await client.query('ROLLBACK');
        res.status(500).json({message: `Server Error: ${err.message}`});
    } finally {
        client.release();
    }
});
app.post('/api/admin/homepage/about/upload', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename' });
    try {
        const oldImageRes = await getPool().query("SELECT value FROM app_settings WHERE key='about_us_image_url'");
        if(oldImageRes.rows.length > 0 && oldImageRes.rows[0].value) await del(oldImageRes.rows[0].value);

        const blob = await put(`homepage/about/${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch (err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
    }
});

app.get('/api/admin/homepage/testimonials', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(err) { res.status(500).json({message: `Server Error: ${err.message}`}); }
});
app.post('/api/admin/homepage/testimonials', verifyAdminToken, async (req, res) => {
    try {
        const { author, content } = req.body;
        await getPool().query('INSERT INTO homepage_testimonials (author, content) VALUES ($1, $2)', [author, content]);
        res.status(201).send();
    } catch(err) { res.status(500).json({message: `Server Error: ${err.message}`}); }
});
app.patch('/api/admin/homepage/testimonials/:id', verifyAdminToken, async (req, res) => {
     try {
        const { author, content } = req.body;
        await getPool().query('UPDATE homepage_testimonials SET author=$1, content=$2 WHERE id=$3', [author, content, req.params.id]);
        res.status(200).send();
    } catch(err) { res.status(500).json({message: `Server Error: ${err.message}`}); }
});
app.delete('/api/admin/homepage/testimonials/:id', verifyAdminToken, async (req, res) => {
     try {
        await getPool().query('DELETE FROM homepage_testimonials WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch(err) { res.status(500).json({message: `Server Error: ${err.message}`}); }
});

app.get('/api/admin/homepage/instagram', verifyAdminToken, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});
app.post('/api/admin/homepage/instagram', verifyAdminToken, async (req, res) => {
    try {
        const { post_url, image_url, caption } = req.body;
        await getPool().query(
            'INSERT INTO homepage_instagram_posts (post_url, image_url, caption) VALUES ($1, $2, $3)',
            [post_url, image_url, caption]
        );
        res.status(201).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});
app.delete('/api/admin/homepage/instagram/:id', verifyAdminToken, async (req, res) => {
    try {
        const postRes = await getPool().query('SELECT image_url FROM homepage_instagram_posts WHERE id=$1', [req.params.id]);
        if (postRes.rows.length > 0) await del(postRes.rows[0].image_url);
        await getPool().query('DELETE FROM homepage_instagram_posts WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: `Server error: ${err.message}` });
    }
});
app.post('/api/admin/homepage/instagram/upload', verifyAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) return res.status(400).json({ message: 'Missing filename' });
    try {
        const blob = await put(`homepage/instagram/${filename}`, req, { access: 'public' });
        res.json(blob);
    } catch (err) {
        res.status(500).json({ message: `Upload error: ${err.message}` });
    }
});
app.post('/api/admin/homepage/instagram/order', verifyAdminToken, async (req, res) => {
    const client = await getPool().connect();
    try {
        const { orderedIds } = req.body;
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_instagram_posts SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.status(200).send('Order updated successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: `Server Error: ${err.message}` });
    } finally {
        client.release();
    }
});

app.get('/api/validate-discount', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Kod rabatowy jest wymagany.' });
    }
    const result = await getPool().query('SELECT * FROM discount_codes WHERE code = $1', [code]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ message: 'Nieprawidłowy kod rabatowy.' });
    }
  } catch (err) {
    res.status(500).send(`Server error: ${err.message}`);
  }
});
export default app;
