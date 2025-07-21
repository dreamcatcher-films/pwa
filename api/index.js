

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';

// --- Environment Variable Validation ---
// Ensure all critical environment variables are set before proceeding.
const requiredEnvVars = ['DATABASE_URL', 'ADMIN_JWT_SECRET', 'JWT_SECRET', 'RESEND_API_KEY'];
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
app.use(express.json({ limit: '6mb' })); // Increase limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '6mb' }));


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
              category_id INTEGER, -- FK added later to handle migration
              is_published BOOLEAN DEFAULT FALSE,
              rich_description TEXT,
              rich_description_image_url TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
             
            -- Foreign key for packages.category_id added separately for migration safety
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'packages_category_id_fkey' AND conrelid = 'packages'::regclass
                ) THEN
                    ALTER TABLE packages ADD CONSTRAINT packages_category_id_fkey 
                    FOREIGN KEY (category_id) REFERENCES package_categories(id) ON DELETE SET NULL;
                END IF;
            END;
            $$;

            CREATE TABLE IF NOT EXISTS package_addons (
              package_id INTEGER, -- FK added later
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
        
        // Check for the correct foreign key on package_addons
        const correctFkCheck = await client.query(`
            SELECT 1 
            FROM pg_constraint 
            JOIN pg_class AS t_from ON t_from.oid = conrelid
            JOIN pg_class AS t_to ON t_to.oid = confrelid
            WHERE conname = 'package_addons_package_id_fkey' 
            AND t_from.relname = 'package_addons'
            AND t_to.relname = 'packages'
        `);

        if (correctFkCheck.rows.length === 0) {
             console.log("MIGRATION: Correcting foreign key on 'package_addons'.");
             await client.query(`ALTER TABLE package_addons DROP CONSTRAINT IF EXISTS package_addons_package_id_fkey;`);
             await client.query(`
                ALTER TABLE package_addons 
                ADD CONSTRAINT package_addons_package_id_fkey 
                FOREIGN KEY (package_id) 
                REFERENCES packages(id) 
                ON DELETE CASCADE;
            `);
        }
        
        // MIGRATION: Robustly add the 'resource' column to the 'availability' table
        const availabilityTableExists = await client.query("SELECT to_regclass('public.availability')");
        if(availabilityTableExists.rows[0].to_regclass) {
            const resourceColumnCheck = await client.query(`
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = 'availability' AND column_name = 'resource'
            `);
            if (resourceColumnCheck.rows.length === 0) {
                console.log("MIGRATION: Adding 'resource' column to 'availability' table.");
                await client.query('ALTER TABLE availability ADD COLUMN resource JSONB;');
            }
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
        
        await client.query("DELETE FROM bookings WHERE client_id = 'CONTACTFORM'");

        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_email', 'info@dreamcatcherfilm.co.uk') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_phone', '+48 123 456 789') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('contact_address', 'Warszawa, Polska') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('google_maps_api_key', '') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_title', 'Nasza Historia') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_text', 'Jesteśmy parą filmowców, którzy z pasją i zaangażowaniem tworzą niezapomniane pamiątki. Każdy ślub to dla nas wyjątkowa historia, którą staramy się opowiedzieć w najpiękniejszy możliwy sposób.') ON CONFLICT (key) DO NOTHING;`);
        await client.query(`INSERT INTO app_settings (key, value) VALUES ('about_us_image_url', 'https://images.unsplash.com/photo-1515934751635-481d608ddb38?q=80&w=2070&auto=format&fit=crop') ON CONFLICT (key) DO NOTHING;`);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database setup error:', err);
        throw new Error(`Error setting up database schema: ${err.message}`);
    } finally {
        client.release();
        console.log("Database setup check complete. Connection released.");
    }
};

const ensureDbInitialized = async (req, res, next) => {
    try {
        if (!initializationPromise) {
            console.log("No initialization promise found, starting DB setup...");
            initializationPromise = runDbSetup();
        }
        await initializationPromise;
        next();
    } catch (error) {
        console.error("CRITICAL: Database initialization failed.", error.message);
        res.status(503).send('Service Unavailable: Could not initialize database.');
    }
};

app.use(ensureDbInitialized);

// --- JWT Middleware ---
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.ADMIN_JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authenticateClient = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- Helper Functions ---
const generateUniqueClientId = async (client) => {
    let clientId;
    let isUnique = false;
    while (!isUnique) {
        clientId = Math.floor(1000 + Math.random() * 9000).toString();
        const { rows } = await client.query('SELECT 1 FROM bookings WHERE client_id = $1', [clientId]);
        if (rows.length === 0) {
            isUnique = true;
        }
    }
    return clientId;
};

const getAdminNotificationEmail = async (client) => {
    const res = await client.query("SELECT notification_email FROM admins LIMIT 1");
    return res.rows[0]?.notification_email || null;
}

// --- PUBLIC API ENDPOINTS ---

app.get('/api/packages', async (req, res) => {
    const client = await getPool().connect();
    try {
        const categoriesRes = await client.query('SELECT * FROM package_categories ORDER BY id');
        const packagesRes = await client.query(`
            SELECT p.*, pa.addons 
            FROM packages p
            LEFT JOIN (
                SELECT package_id, json_agg(json_build_object('id', a.id, 'name', a.name, 'price', a.price, 'locked', true)) as addons
                FROM package_addons pa
                JOIN addons a ON pa.addon_id = a.id
                GROUP BY pa.package_id
            ) pa ON p.id = pa.package_id
            WHERE p.is_published = TRUE
            ORDER BY p.price;
        `);
        const allAddonsRes = await client.query('SELECT * FROM addons ORDER BY price');

        const transformedPackages = packagesRes.rows.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            category_id: p.category_id,
            included: p.addons || [],
            rich_description: p.rich_description,
            rich_description_image_url: p.rich_description_image_url
        }));

        res.json({
            categories: categoriesRes.rows,
            packages: transformedPackages,
            allAddons: allAddonsRes.rows
        });
    } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).send('Error fetching packages data.');
    } finally {
        client.release();
    }
});

app.post('/api/validate-key', async (req, res) => {
    const { key } = req.body;
    if (!key || key.length !== 4) {
        return res.status(400).json({ message: 'Nieprawidłowy format klucza.' });
    }
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT id FROM access_keys WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            res.json({ message: 'Klucz jest poprawny.' });
        } else {
            res.status(404).json({ message: 'Nie znaleziono takiego klucza dostępu.' });
        }
    } catch (error) {
        console.error('Error validating key:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera.' });
    } finally {
        client.release();
    }
});

app.post('/api/bookings', async (req, res) => {
    const {
        accessKey, packageName, totalPrice, selectedItems,
        brideName, groomName, weddingDate, brideAddress,
        groomAddress, churchLocation, venueLocation, schedule, email,
        phoneNumber, additionalInfo, password, discountCode
    } = req.body;

    if (!accessKey || !packageName || !brideName || !groomName || !weddingDate || !email || !password) {
        return res.status(400).send('Brakuje wymaganych pól.');
    }

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        const keyRes = await client.query('SELECT id FROM access_keys WHERE key = $1', [accessKey]);
        if (keyRes.rows.length === 0) {
            return res.status(403).send('Nieprawidłowy lub już wykorzystany klucz dostępu.');
        }

        const clientId = await generateUniqueClientId(client);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const selectedItemsJson = JSON.stringify(selectedItems);

        const newBooking = await client.query(
            `INSERT INTO bookings (client_id, access_key, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, email, phone_number, additional_info, password_hash, discount_code, payment_status, amount_paid)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending', 0)
             RETURNING id`,
            [clientId, accessKey, packageName, totalPrice, selectedItemsJson, brideName, groomName, weddingDate, brideAddress, groomAddress, churchLocation, venueLocation, schedule, email, phoneNumber, additionalInfo, hashedPassword, discountCode]
        );
        const newBookingId = newBooking.rows[0].id;

        await client.query('DELETE FROM access_keys WHERE key = $1', [accessKey]);

        const title = `Rezerwacja: ${brideName} & ${groomName}`;
        const availabilityResult = await client.query(
            'INSERT INTO availability (title, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [title, weddingDate, weddingDate, true, { type: 'booking', bookingId: newBookingId }]
        );
        
        const notificationEmail = await getAdminNotificationEmail(client);
        if (resend && notificationEmail) {
            try {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                    to: notificationEmail,
                    subject: `Nowa rezerwacja #${newBookingId} od ${brideName} i ${groomName}`,
                    html: `<h1>Nowa rezerwacja!</h1><p>Para: <strong>${brideName} i ${groomName}</strong></p><p>Data ślubu: ${weddingDate}</p><p>Pakiet: ${packageName}</p><p>Wartość: ${totalPrice} PLN</p><p>Sprawdź szczegóły w panelu administratora.</p>`,
                });
                if (error) { console.error("Resend error (admin notification):", error); }
            } catch (e) {
                console.error("Failed to send admin notification email:", e);
            }
        }
        
        if (resend) {
             try {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                    to: email,
                    subject: 'Potwierdzenie rezerwacji w Dreamcatcher Films',
                    html: `
                        <h1>Witajcie ${brideName} i ${groomName}!</h1>
                        <p>Dziękujemy za złożenie rezerwacji w Dreamcatcher Films. Wasz termin został pomyślnie zarezerwowany.</p>
                        <p>Poniżej znajdują się dane do logowania do Waszego osobistego panelu klienta:</p>
                        <ul>
                            <li><strong>Numer klienta (login):</strong> ${clientId}</li>
                            <li><strong>Hasło:</strong> [Twoje hasło podane podczas rejestracji]</li>
                        </ul>
                        <p>Możecie zalogować się do panelu, klikając w poniższy link:</p>
                        <a href="https://pwa-git-main-dreamcatcher-films-projects.vercel.app/">Przejdź do Panelu Klienta</a>
                        <p>Wkrótce skontaktujemy się z Wami w celu omówienia dalszych szczegółów.</p>
                        <br/>
                        <p>Pozdrawiamy,</p>
                        <p>Zespół Dreamcatcher Films</p>
                    `,
                });

                if (error) {
                    console.error("Resend API Error on client confirmation:", error.message);
                } else {
                    console.log("Client confirmation email sent successfully:", data);
                }

            } catch (e) {
                console.error("Failed to send client confirmation email:", e);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Rezerwacja zakończona pomyślnie.', bookingId: newBookingId, clientId: clientId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Błąd przy tworzeniu rezerwacji:', error);
        res.status(500).send(`Błąd serwera: ${error.message}`);
    } finally {
        client.release();
    }
});


app.post('/api/validate-discount', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Nie podano kodu.' });

    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT * FROM discount_codes WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW()) AND (usage_limit IS NULL OR times_used < usage_limit)',
            [code]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Kod jest nieprawidłowy lub wygasł.' });
        }
    } catch (error) {
        console.error('Error validating discount code:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera.' });
    } finally {
        client.release();
    }
});


app.get('/api/gallery', async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM galleries ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).send('Błąd pobierania galerii.');
    } finally {
        client.release();
    }
});

app.post('/api/contact', async (req, res) => {
    const { firstName, lastName, email, phone, subject, message } = req.body;
    if (!firstName || !lastName || !email || !subject || !message) {
        return res.status(400).json({ message: 'Wszystkie pola są wymagane.' });
    }
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO contact_messages (first_name, last_name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [firstName, lastName, email, phone, subject, message]
        );
        const newId = result.rows[0].id;
        
        const notificationEmail = await getAdminNotificationEmail(client);
        if (resend && notificationEmail) {
            try {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films Contact <powiadomienia@dreamcatcherfilms.co.uk>',
                    to: notificationEmail,
                    subject: `Nowe zapytanie z formularza: ${subject}`,
                    reply_to: email,
                    html: `
                        <h2>Nowa wiadomość z formularza kontaktowego</h2>
                        <p><strong>Od:</strong> ${firstName} ${lastName}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Telefon:</strong> ${phone || 'Nie podano'}</p>
                        <hr>
                        <p><strong>Temat:</strong> ${subject}</p>
                        <p><strong>Wiadomość:</strong></p>
                        <p style="white-space: pre-wrap;">${message}</p>
                        <hr>
                        <p>Możesz odpowiedzieć na tę wiadomość bezpośrednio lub zarządzać nią w panelu administratora.</p>
                    `,
                });
                if (error) {
                    console.error("Resend API error on contact form:", error.message);
                }
            } catch (e) {
                 console.error("Failed to send contact form email:", e);
            }
        }
        
        await client.query('COMMIT');
        res.status(201).json({ message: 'Wiadomość wysłana pomyślnie.', id: newId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving contact message:', error);
        res.status(500).json({ message: 'Błąd serwera podczas zapisywania wiadomości.' });
    } finally {
        client.release();
    }
});

app.get('/api/contact-details', async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (error) {
        console.error('Error fetching contact details:', error);
        res.status(500).send('Error fetching contact details.');
    } finally {
        client.release();
    }
});

app.get('/api/homepage-content', async (req, res) => {
    const client = await getPool().connect();
    try {
        const [slidesRes, aboutRes, testimonialsRes, instagramRes] = await Promise.all([
            client.query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC, id DESC'),
            client.query("SELECT key, value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')"),
            client.query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC'),
            client.query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC, id DESC'),
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
            instagramPosts: instagramRes.rows
        });

    } catch (error) {
        console.error('Error fetching homepage content:', error.message, error.stack);
        res.status(500).send('Błąd pobierania zawartości strony głównej.');
    } finally {
        client.release();
    }
});


// --- CLIENT-AUTHENTICATED API ENDPOINTS ---

app.post('/api/login', async (req, res) => {
    const { clientId, password } = req.body;
    if (!clientId || !password) {
        return res.status(400).json({ message: 'Numer klienta i hasło są wymagane.' });
    }

    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT id, password_hash FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }
        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }

        const token = jwt.sign({ bookingId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera.' });
    } finally {
        client.release();
    }
});

app.get('/api/my-booking', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM bookings WHERE id = $1', [req.user.bookingId]);
        if (result.rows.length === 0) {
            return res.status(404).send('Nie znaleziono rezerwacji.');
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching booking data:', error);
        res.status(500).send('Błąd pobierania danych rezerwacji.');
    } finally {
        client.release();
    }
});

app.patch('/api/my-booking', authenticateClient, async (req, res) => {
    const { bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    const bookingId = req.user.bookingId;

    const client = await getPool().connect();
    try {
         const result = await client.query(
            `UPDATE bookings SET 
                bride_address = $1, 
                groom_address = $2, 
                church_location = $3, 
                venue_location = $4, 
                schedule = $5, 
                additional_info = $6
             WHERE id = $7 RETURNING bride_address, groom_address, church_location, venue_location, schedule, additional_info`,
            [bride_address, groom_address, church_location, venue_location, schedule, additional_info, bookingId]
        );
        res.json({ message: 'Dane zaktualizowane pomyślnie.', booking: result.rows[0] });
    } catch (error) {
        console.error('Error updating booking data:', error);
        res.status(500).send('Błąd zapisu danych.');
    } finally {
        client.release();
    }
});


app.get('/api/booking-stages', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            `SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at
             FROM booking_stages bs
             JOIN production_stages ps ON bs.stage_id = ps.id
             WHERE bs.booking_id = $1 ORDER BY ps.id ASC`, [req.user.bookingId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching booking stages:', error);
        res.status(500).send('Błąd pobierania etapów projektu.');
    } finally {
        client.release();
    }
});

app.patch('/api/booking-stages/:id/approve', authenticateClient, async (req, res) => {
    const stageId = parseInt(req.params.id, 10);
    const bookingId = req.user.bookingId;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            "UPDATE booking_stages SET status = 'completed', completed_at = NOW() WHERE id = $1 AND booking_id = $2 AND status = 'awaiting_approval' RETURNING id",
            [stageId, bookingId]
        );
        if (result.rowCount === 0) {
            return res.status(404).send('Nie znaleziono etapu lub nie można go zatwierdzić.');
        }
        res.json({ message: 'Etap zatwierdzony pomyślnie.' });
    } catch (error) {
        console.error('Error approving stage:', error);
        res.status(500).send('Błąd podczas zatwierdzania etapu.');
    } finally {
        client.release();
    }
});

app.get('/api/messages', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.bookingId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Błąd pobierania wiadomości.');
    } finally {
        client.release();
    }
});

app.get('/api/messages/unread-count', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = $2 AND is_read_by_client = FALSE', 
            [req.user.bookingId, 'admin']
        );
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (error) {
        console.error('Error fetching unread messages count:', error);
        res.status(500).send('Błąd pobierania licznika wiadomości.');
    } finally {
        client.release();
    }
});

app.patch('/api/messages/mark-as-read', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query(
            'UPDATE messages SET is_read_by_client = TRUE WHERE booking_id = $1 AND sender = $2',
            [req.user.bookingId, 'admin']
        );
        res.sendStatus(204);
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).send('Błąd oznaczania wiadomości jako przeczytane.');
    } finally {
        client.release();
    }
});


app.post('/api/messages', authenticateClient, async (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim() === '') {
        return res.status(400).send('Treść wiadomości nie może być pusta.');
    }

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO messages (booking_id, sender, content, is_read_by_admin)
             VALUES ($1, 'client', $2, FALSE) RETURNING *`,
            [req.user.bookingId, content]
        );
        const newMessage = result.rows[0];
        
        const notificationEmail = await getAdminNotificationEmail(client);
        const bookingInfo = await client.query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.bookingId]);
        const senderName = `${bookingInfo.rows[0].bride_name} & ${bookingInfo.rows[0].groom_name}`;
        
        if (resend && notificationEmail) {
            try {
                const { data, error } = await resend.emails.send({
                    from: 'Dreamcatcher Films System <powiadomienia@dreamcatcherfilms.co.uk>',
                    to: notificationEmail,
                    subject: `Nowa wiadomość od ${senderName} (Rezerwacja #${req.user.bookingId})`,
                    html: `
                        <h2>Otrzymano nową wiadomość</h2>
                        <p><strong>Od:</strong> ${senderName}</p>
                        <p><strong>Rezerwacja:</strong> #${req.user.bookingId}</p>
                        <hr>
                        <p><strong>Wiadomość:</strong></p>
                        <p style="white-space: pre-wrap;">${content}</p>
                        <hr>
                        <p>Zaloguj się do panelu administratora, aby odpowiedzieć.</p>
                    `,
                });
                if (error) {
                    console.error("Resend error on new client message:", error.message);
                }
            } catch (e) {
                 console.error("Failed to send new message notification:", e);
            }
        }
        
        await client.query('COMMIT');
        res.status(201).json(newMessage);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error sending message:', error);
        res.status(500).send('Błąd wysyłania wiadomości.');
    } finally {
        client.release();
    }
});


// --- ADMIN-AUTHENTICATED API ENDPOINTS ---

app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'E-mail i hasło są wymagane.' });
    }

    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT id, password_hash FROM admins WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        const admin = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        const token = jwt.sign({ adminId: admin.id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(`
            SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at 
            FROM bookings ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching admin bookings:', error);
        res.status(500).send('Błąd pobierania rezerwacji.');
    } finally {
        client.release();
    }
});

app.get('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Nie znaleziono rezerwacji.');
        res.json(result.rows[0]);
    } catch (error) {
        console.error(`Error fetching booking #${id}:`, error);
        res.status(500).send('Błąd pobierania szczegółów rezerwacji.');
    } finally {
        client.release();
    }
});

app.delete('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query("DELETE FROM availability WHERE resource->>'type' = 'booking' AND (resource->>'bookingId')::int = $1", [id]);
        const result = await client.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('Nie znaleziono rezerwacji do usunięcia.');
        }
        await client.query('COMMIT');
        res.json({ message: 'Rezerwacja usunięta pomyślnie.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting booking #${id}:`, error);
        res.status(500).send('Błąd podczas usuwania rezerwacji.');
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE bookings SET 
                bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5, 
                bride_address = $6, groom_address = $7, church_location = $8, venue_location = $9, 
                schedule = $10, additional_info = $11
             WHERE id = $12 RETURNING *`,
            [bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info, id]
        );
        
        const title = `Rezerwacja: ${bride_name} & ${groom_name}`;
        await client.query(
            "UPDATE availability SET title = $1, start_time = $2, end_time = $2, is_all_day = true WHERE resource->>'type' = 'booking' AND (resource->>'bookingId')::int = $3",
            [title, wedding_date, id]
        );
        
        await client.query('COMMIT');
        res.json({ message: 'Dane rezerwacji zaktualizowane pomyślnie.', booking: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error updating booking #${id}:`, error);
        res.status(500).send('Błąd zapisu danych.');
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:id/payment', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { payment_status, amount_paid } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3 RETURNING payment_status, amount_paid',
            [payment_status, amount_paid, id]
        );
        res.json({ message: 'Dane płatności zaktualizowane.', payment_details: result.rows[0] });
    } catch (error) {
        console.error(`Error updating payment for booking #${id}:`, error);
        res.status(500).send('Błąd zapisu danych płatności.');
    } finally {
        client.release();
    }
});

app.post('/api/admin/bookings/:id/resend-credentials', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT email, client_id, bride_name, groom_name FROM bookings WHERE id = $1', [id]);
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        const { email, client_id, bride_name, groom_name } = bookingRes.rows[0];

        const { data, error } = await resend.emails.send({
            from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
            to: email,
            subject: 'Twoje dane do logowania - Dreamcatcher Films',
            html: `
                <h1>Cześć ${bride_name}!</h1>
                <p>Na Twoją prośbę, ponownie wysyłamy dane dostępowe do Twojego panelu klienta w Dreamcatcher Films.</p>
                <p>Poniżej znajdują się dane do logowania:</p>
                <ul>
                    <li><strong>Numer klienta (login):</strong> ${client_id}</li>
                    <li><strong>Hasło:</strong> [Twoje hasło podane podczas rejestracji]</li>
                </ul>
                <p>Możesz zalogować się do panelu, klikając w poniższy link:</p>
                <a href="https://pwa-git-main-dreamcatcher-films-projects.vercel.app/">Przejdź do Panelu Klienta</a>
                <br/>
                <p>Pozdrawiamy,</p>
                <p>Zespół Dreamcatcher Films</p>
            `,
        });

        if (error) {
            console.error("Resend API Error on resend credentials:", error.message);
            return res.status(500).json({ message: `Błąd API Resend: ${JSON.stringify(error)}`});
        }

        res.json({ message: 'E-mail został pomyślnie wysłany.' });
    } catch (error) {
        console.error(`Error resending credentials for booking #${id}:`, error);
        res.status(500).json({ message: error.message || 'Wewnętrzny błąd serwera.' });
    } finally {
        client.release();
    }
});

// Access Keys
app.get('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send('Błąd pobierania kluczy.');
    } finally {
        client.release();
    }
});

app.post('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
    const { client_name } = req.body;
    if (!client_name) return res.status(400).send('Nazwa klienta jest wymagana.');
    const client = await getPool().connect();
    try {
        let key;
        let isUnique = false;
        while (!isUnique) {
            key = Math.floor(1000 + Math.random() * 9000).toString();
            const { rows } = await client.query('SELECT 1 FROM access_keys WHERE key = $1', [key]);
            if (rows.length === 0) isUnique = true;
        }
        
        const result = await client.query(
            'INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *',
            [key, client_name]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).send('Błąd tworzenia klucza.');
    } finally {
        client.release();
    }
});

app.delete('/api/admin/access-keys/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('DELETE FROM access_keys WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).send('Nie znaleziono klucza.');
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send('Błąd usuwania klucza.');
    } finally {
        client.release();
    }
});

// Availability
app.get('/api/admin/availability', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT id, title, description, start_time as "start", end_time as "end", is_all_day as "allDay", resource FROM availability');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send('Błąd pobierania wydarzeń.');
    } finally {
        client.release();
    }
});

app.post('/api/admin/availability', authenticateAdmin, async (req, res) => {
    const { title, description, start_time, end_time, is_all_day } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO availability (title, description, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [title, description, start_time, end_time, is_all_day, { type: 'event' }]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).send('Błąd dodawania wydarzenia.');
    } finally {
        client.release();
    }
});

app.patch('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, description, start_time, end_time, is_all_day } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            "UPDATE availability SET title = $1, description = $2, start_time = $3, end_time = $4, is_all_day = $5 WHERE id = $6 AND (resource->>'type' IS NULL OR resource->>'type' = 'event') RETURNING *",
            [title, description, start_time, end_time, is_all_day, id]
        );
        if (result.rowCount === 0) return res.status(404).send('Nie znaleziono wydarzenia lub jest to rezerwacja, której nie można edytować w ten sposób.');
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).send('Błąd aktualizacji wydarzenia.');
    } finally {
        client.release();
    }
});

app.delete('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await getPool().connect();
    try {
        const result = await client.query("DELETE FROM availability WHERE id = $1 AND (resource->>'type' IS NULL OR resource->>'type' = 'event') RETURNING id", [id]);
        if (result.rowCount === 0) return res.status(404).send('Nie znaleziono wydarzenia lub jest to rezerwacja, której nie można usunąć w ten sposób.');
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send('Błąd usuwania wydarzenia.');
    } finally {
        client.release();
    }
});

// Gallery
app.get('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send('Błąd pobierania galerii.');
    } finally {
        client.release();
    }
});

app.post('/api/admin/galleries/upload', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ message: 'Filename is required.' });
    }
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        return res.status(200).json(blob);
    } catch (error) {
        console.error("Blob upload error:", error)
        return res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});

app.post('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    const { title, description, image_url } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO galleries (title, description, image_url) VALUES ($1, $2, $3) RETURNING *',
            [title, description, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).send('Błąd dodawania do galerii.');
    } finally {
        client.release();
    }
});

app.delete('/api/admin/galleries/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const selectRes = await client.query('SELECT image_url FROM galleries WHERE id = $1', [req.params.id]);
        if (selectRes.rows.length > 0) {
            const { image_url } = selectRes.rows[0];
            if (image_url) {
                await del(image_url);
            }
        }
        const deleteRes = await client.query('DELETE FROM galleries WHERE id = $1 RETURNING id', [req.params.id]);
        if (deleteRes.rowCount === 0) return res.status(404).send('Nie znaleziono elementu galerii.');
        await client.query('COMMIT');
        res.sendStatus(204);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).send('Błąd usuwania elementu galerii.');
    } finally {
        client.release();
    }
});


// Packages & Addons
app.get('/api/admin/offer-data', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const packagesRes = await client.query(`
            SELECT p.*, c.name as category_name, pa.addons
            FROM packages p
            LEFT JOIN package_categories c ON p.category_id = c.id
            LEFT JOIN (
                SELECT package_id, json_agg(json_build_object('id', addon_id)) as addons
                FROM package_addons
                GROUP BY package_id
            ) pa ON p.id = pa.package_id
            ORDER BY p.category_id, p.price;
        `);
        const addonsRes = await client.query(`
            SELECT a.*, ac.category_ids
            FROM addons a
            LEFT JOIN (
                SELECT addon_id, array_agg(category_id) as category_ids
                FROM addon_categories
                GROUP BY addon_id
            ) ac ON a.id = ac.addon_id
            ORDER BY a.name;
        `);
        const categoriesRes = await client.query('SELECT * FROM package_categories ORDER BY name;');
        
        res.json({
            packages: packagesRes.rows.map(p => ({...p, addons: p.addons || [] })),
            addons: addonsRes.rows,
            categories: categoriesRes.rows,
        });
    } catch (error) {
        console.error('Error fetching offer data:', error);
        res.status(500).send('Błąd pobierania danych oferty.');
    } finally {
        client.release();
    }
});

// Categories
app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    const { name, description, icon_name } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO package_categories (name, description, icon_name) VALUES ($1, $2, $3) RETURNING *',
            [name, description, icon_name]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, icon_name } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'UPDATE package_categories SET name = $1, description = $2, icon_name = $3 WHERE id = $4 RETURNING *',
            [name, description, icon_name, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.delete('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM package_categories WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

// Addons
app.post('/api/admin/addons', authenticateAdmin, async (req, res) => {
    const { name, price, category_ids = [] } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const addonRes = await client.query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING *', [name, price]);
        const newAddon = addonRes.rows[0];
        
        if (category_ids.length > 0) {
            const categoryValues = category_ids.map(catId => `(${newAddon.id}, ${catId})`).join(',');
            await client.query(`INSERT INTO addon_categories (addon_id, category_id) VALUES ${categoryValues}`);
        }
        
        await client.query('COMMIT');
        res.status(201).json(newAddon);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, price, category_ids = [] } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const addonRes = await client.query('UPDATE addons SET name = $1, price = $2 WHERE id = $3 RETURNING *', [name, price, id]);

        await client.query('DELETE FROM addon_categories WHERE addon_id = $1', [id]);
        if (category_ids.length > 0) {
            const categoryValues = category_ids.map(catId => `(${id}, ${catId})`).join(',');
            await client.query(`INSERT INTO addon_categories (addon_id, category_id) VALUES ${categoryValues}`);
        }

        await client.query('COMMIT');
        res.json(addonRes.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.delete('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM addons WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

// Packages
app.post('/api/admin/packages/upload-image', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename is required.' });
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        return res.status(200).json(blob);
    } catch (error) {
        return res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});

app.post('/api/admin/packages', authenticateAdmin, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
        const packageRes = await client.query(
            `INSERT INTO packages (name, description, price, category_id, is_published, rich_description, rich_description_image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url]
        );
        const newPackageId = packageRes.rows[0].id;

        if (addons && addons.length > 0) {
            const addonValues = addons.map(a => `(${newPackageId}, ${a.id})`).join(',');
            await client.query(`INSERT INTO package_addons (package_id, addon_id) VALUES ${addonValues}`);
        }
        
        await client.query('COMMIT');
        res.status(201).json({ id: newPackageId, message: "Package created successfully" });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error creating package:", error);
        res.status(500).send(`Błąd tworzenia pakietu: ${error.message}`);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
        await client.query(
            `UPDATE packages SET name=$1, description=$2, price=$3, category_id=$4, is_published=$5, rich_description=$6, rich_description_image_url=$7
             WHERE id=$8`,
            [name, description, price, category_id, is_published, rich_description, rich_description_image_url, id]
        );
        
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [id]);
        if (addons && addons.length > 0) {
            const addonValues = addons.map(a => `(${id}, ${a.id})`).join(',');
            await client.query(`INSERT INTO package_addons (package_id, addon_id) VALUES ${addonValues}`);
        }

        await client.query('COMMIT');
        res.json({ message: 'Package updated successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error updating package #${id}:`, error);
        res.status(500).send(`Błąd aktualizacji pakietu: ${error.message}`);
    } finally {
        client.release();
    }
});


app.delete('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

// Discounts
app.get('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

app.post('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    const { code, type, value, usage_limit, expires_at } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code, type, value, usage_limit, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Ten kod już istnieje.' });
        }
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

app.delete('/api/admin/discounts/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

// Production Stages
app.get('/api/admin/stages', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM production_stages ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.post('/api/admin/stages', authenticateAdmin, async (req, res) => {
    const { name, description } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *',
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.delete('/api/admin/stages/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

// Booking Stages
app.get('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            `SELECT bs.id, ps.name, bs.status 
             FROM booking_stages bs
             JOIN production_stages ps ON bs.stage_id = ps.id
             WHERE bs.booking_id = $1 ORDER BY ps.id ASC`, [req.params.bookingId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.post('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    const { stage_id } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2) RETURNING *',
            [req.params.bookingId, stage_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
         if (error.code === '23505') { // unique_violation, assuming (booking_id, stage_id) is unique
            return res.status(409).send('Ten etap jest już dodany do projektu.');
        }
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/booking-stages/:stageId', authenticateAdmin, async (req, res) => {
    const { status } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'UPDATE booking_stages SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.stageId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.delete('/api/admin/booking-stages/:stageId', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM booking_stages WHERE id = $1', [req.params.stageId]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

// Settings
app.post('/api/admin/setup-database', authenticateAdmin, async (req, res) => {
    try {
        // The middleware already ran the setup, so if we get here, it succeeded.
        // We can re-run it for good measure if needed, but it might be redundant.
        console.log("Manual DB setup triggered by admin.");
        initializationPromise = runDbSetup();
        await initializationPromise;
        res.json({ message: 'Schemat bazy danych został pomyślnie zainicjowany/zaktualizowany.' });
    } catch (error) {
        console.error("Manual DB setup failed:", error);
        res.status(500).json({ message: `Błąd inicjalizacji: ${error.message}` });
    }
});

const dropAllKnownTables = async (client) => {
    const tables = [
        'messages', 'booking_stages', 'package_addons', 'addon_categories',
        'homepage_carousel_slides', 'homepage_testimonials', 'homepage_instagram_posts',
        'bookings', 'production_stages', 'packages', 'package_categories', 
        'addons', 'galleries', 'availability', 'admins', 'access_keys', 
        'contact_messages', 'discount_codes', 'app_settings'
    ];
    // Reverse order for dropping to handle dependencies, though CASCADE should handle it.
    for (const table of tables.reverse()) {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
    console.log("All known tables have been dropped.");
};

app.post('/api/admin/reset-database', authenticateAdmin, async (req, res) => {
    console.log("--- DATABASE RESET INITIATED BY ADMIN ---");
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await dropAllKnownTables(client);
        await client.query('COMMIT');
        
        console.log("--- TABLES DROPPED, RE-INITIALIZING SCHEMA ---");
        // Force re-running the setup
        initializationPromise = null;
        await runDbSetup(); 
        
        res.json({ message: 'Baza danych została wyczyszczona i zainicjowana pomyślnie. Odśwież stronę, aby zobaczyć zmiany.' });

    } catch (error) {
        console.error("Database reset failed:", error);
        try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Rollback failed:', rbError); }
        res.status(500).json({ message: `Błąd resetowania bazy danych: ${error.message}` });
    } finally {
        client.release();
    }
});


app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT email, notification_email FROM admins WHERE id = $1', [req.user.adminId]);
        if (result.rows.length === 0) return res.status(404).send('Nie znaleziono administratora.');
        res.json({
            loginEmail: result.rows[0].email,
            notificationEmail: result.rows[0].notification_email
        });
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/settings', authenticateAdmin, async (req, res) => {
    const { email } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('UPDATE admins SET notification_email = $1 WHERE id = $2', [email, req.user.adminId]);
        res.json({ message: 'Zaktualizowano e-mail do powiadomień.' });
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/credentials', authenticateAdmin, async (req, res) => {
    const { currentPassword, newEmail, newPassword } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT password_hash, email FROM admins WHERE id = $1', [req.user.adminId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Nie znaleziono konta administratora." });
        }
        const admin = result.rows[0];

        const isPasswordValid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isPasswordValid) {
            return res.status(403).json({ message: 'Bieżące hasło jest nieprawidłowe.' });
        }

        if (newEmail && newEmail !== admin.email) {
            await client.query('UPDATE admins SET email = $1 WHERE id = $2', [newEmail, req.user.adminId]);
        }

        if (newPassword) {
            if (newPassword.length < 8) {
                return res.status(400).json({ message: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
            }
            const newHashedPassword = await bcrypt.hash(newPassword, 10);
            await client.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newHashedPassword, req.user.adminId]);
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Dane logowania zostały pomyślnie zaktualizowane.' });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Ten adres e-mail jest już zajęty.' });
        }
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
    }
});

app.get('/api/admin/contact-settings', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.patch('/api/admin/contact-settings', authenticateAdmin, async (req, res) => {
    const settings = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (const key in settings) {
            await client.query('UPDATE app_settings SET value = $1 WHERE key = $2', [settings[key], key]);
        }
        await client.query('COMMIT');
        res.json({ message: "Zaktualizowano ustawienia." });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).send(error.message);
    } finally { client.release(); }
});

// Admin Messaging
app.get('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.post('/api/admin/messages/upload', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename required' });
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});


app.post('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    const { content, attachment_url, attachment_type } = req.body;
    if (!content && !attachment_url) return res.status(400).send('Wiadomość nie może być pusta.');
    
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO messages (booking_id, sender, content, is_read_by_client, attachment_url, attachment_type)
             VALUES ($1, 'admin', $2, FALSE, $3, $4) RETURNING *`,
            [req.params.bookingId, content || '', attachment_url, attachment_type]
        );
        const newMessage = result.rows[0];
        
        const bookingInfo = await client.query('SELECT email, bride_name, groom_name FROM bookings WHERE id = $1', [req.params.bookingId]);
        if (bookingInfo.rows.length > 0) {
            const { email, bride_name } = bookingInfo.rows[0];
            if (resend) {
                 try {
                    const { data, error } = await resend.emails.send({
                        from: 'Dreamcatcher Films <powiadomienia@dreamcatcherfilms.co.uk>',
                        to: email,
                        subject: `Nowa wiadomość w Twoim panelu klienta`,
                        html: `
                            <h1>Cześć ${bride_name}!</h1>
                            <p>Otrzymałaś/eś nową wiadomość w panelu klienta dotyczącą Twojej rezerwacji.</p>
                            <p><strong>Wiadomość:</strong> ${content}</p>
                             ${attachment_url ? `<p><strong>Załącznik:</strong> <a href="${attachment_url}">Zobacz załącznik</a></p>` : ''}
                            <p>Zaloguj się do swojego panelu, aby zobaczyć całą konwersację i odpowiedzieć.</p>
                            <a href="https://pwa-git-main-dreamcatcher-films-projects.vercel.app/">Przejdź do Panelu Klienta</a>
                        `,
                    });
                    if(error) console.error("Resend error sending message to client:", error.message);
                } catch (e) { console.error("Failed to send notification email to client:", e); }
            }
        }
        
        await client.query('COMMIT');
        res.status(201).json(newMessage);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).send(error.message);
    } finally { client.release(); }
});


app.get('/api/admin/bookings/:bookingId/unread-count', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = $2 AND is_read_by_admin = FALSE', 
            [req.params.bookingId, 'client']
        );
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query(
            'UPDATE messages SET is_read_by_admin = TRUE WHERE booking_id = $1 AND sender = $2',
            [req.params.bookingId, 'client']
        );
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
});

// Admin Homepage Content
app.get('/api/admin/homepage/slides', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM homepage_carousel_slides ORDER BY sort_order ASC, id DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/slides/upload', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename required' });
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});
app.post('/api/admin/homepage/slides', authenticateAdmin, async(req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query('INSERT INTO homepage_carousel_slides (image_url, title, subtitle, button_text, button_link) VALUES ($1, $2, $3, $4, $5) RETURNING *', [image_url, title, subtitle, button_text, button_link]);
        res.status(201).json(result.rows[0]);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.patch('/api/admin/homepage/slides/:id', authenticateAdmin, async(req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query('UPDATE homepage_carousel_slides SET image_url=$1, title=$2, subtitle=$3, button_text=$4, button_link=$5 WHERE id=$6 RETURNING *', [image_url, title, subtitle, button_text, button_link, req.params.id]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.delete('/api/admin/homepage/slides/:id', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        const slide = await client.query('SELECT image_url FROM homepage_carousel_slides WHERE id=$1', [req.params.id]);
        if (slide.rows.length > 0 && slide.rows[0].image_url) await del(slide.rows[0].image_url);
        await client.query('DELETE FROM homepage_carousel_slides WHERE id=$1', [req.params.id]);
        res.sendStatus(204);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/slides/order', authenticateAdmin, async(req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_carousel_slides SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.sendStatus(200);
    } catch(e) {
        await client.query('ROLLBACK');
        res.status(500).send(e.message)
    } finally { client.release() }
});


app.get('/api/admin/homepage/about', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query("SELECT key, value FROM app_settings WHERE key LIKE 'about_us_%'");
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key.replace('about_us_', '')] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/about/upload', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename required' });
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});
app.patch('/api/admin/homepage/about', authenticateAdmin, async (req, res) => {
    const { title, text, image_url } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query("UPDATE app_settings SET value = $1 WHERE key = 'about_us_title'", [title]);
        await client.query("UPDATE app_settings SET value = $1 WHERE key = 'about_us_text'", [text]);
        await client.query("UPDATE app_settings SET value = $1 WHERE key = 'about_us_image_url'", [image_url]);
        await client.query('COMMIT');
        res.json({ message: "Updated" });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).send(e.message)
    } finally { client.release() }
});

app.get('/api/admin/homepage/testimonials', authenticateAdmin, async(req, res) => {
     const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM homepage_testimonials ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/testimonials', authenticateAdmin, async(req, res) => {
    const { author, content } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query('INSERT INTO homepage_testimonials (author, content) VALUES ($1, $2) RETURNING *', [author, content]);
        res.status(201).json(result.rows[0]);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.patch('/api/admin/homepage/testimonials/:id', authenticateAdmin, async(req, res) => {
    const { author, content } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query('UPDATE homepage_testimonials SET author=$1, content=$2 WHERE id=$3 RETURNING *', [author, content, req.params.id]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.delete('/api/admin/homepage/testimonials/:id', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM homepage_testimonials WHERE id=$1', [req.params.id]);
        res.sendStatus(204);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});

app.get('/api/admin/homepage/instagram', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM homepage_instagram_posts ORDER BY sort_order ASC, id DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/instagram/upload', authenticateAdmin, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename required' });
    try {
        const blob = await put(filename, req.body, { access: 'public' });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: `Error uploading file: ${error.message}` });
    }
});
app.post('/api/admin/homepage/instagram', authenticateAdmin, async(req, res) => {
    const { post_url, image_url, caption } = req.body;
    const client = await getPool().connect();
    try {
        const result = await client.query('INSERT INTO homepage_instagram_posts (post_url, image_url, caption) VALUES ($1, $2, $3) RETURNING *', [post_url, image_url, caption]);
        res.status(201).json(result.rows[0]);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.delete('/api/admin/homepage/instagram/:id', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        const post = await client.query('SELECT image_url FROM homepage_instagram_posts WHERE id=$1', [req.params.id]);
        if (post.rows.length > 0 && post.rows[0].image_url) await del(post.rows[0].image_url);
        await client.query('DELETE FROM homepage_instagram_posts WHERE id=$1', [req.params.id]);
        res.sendStatus(204);
    } catch (e) { res.status(500).send(e.message) } finally { client.release() }
});
app.post('/api/admin/homepage/instagram/order', authenticateAdmin, async(req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_instagram_posts SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.sendStatus(200);
    } catch(e) {
        await client.query('ROLLBACK');
        res.status(500).send(e.message)
    } finally { client.release() }
});

// Admin Inbox
app.get('/api/admin/inbox', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});
app.patch('/api/admin/inbox/:id/read', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});
app.delete('/api/admin/inbox/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

// Admin Notifications
app.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const unreadClientMessages = await client.query(`
            SELECT 
                'client_message' as type,
                m.booking_id,
                b.bride_name || ' & ' || b.groom_name as sender_name,
                COUNT(m.id) as unread_count,
                (array_agg(m.content ORDER BY m.created_at DESC))[1] as preview
            FROM messages m
            JOIN bookings b ON m.booking_id = b.id
            WHERE m.sender = 'client' AND m.is_read_by_admin = FALSE
            GROUP BY m.booking_id, sender_name;
        `);
        const unreadInboxMessages = await client.query(`
            SELECT 
                'inbox_message' as type,
                id as message_id,
                first_name || ' ' || last_name as sender_name,
                message as preview
            FROM contact_messages
            WHERE is_read = FALSE
            ORDER BY created_at DESC;
        `);

        res.json([...unreadClientMessages.rows, ...unreadInboxMessages.rows]);
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});

app.get('/api/admin/notifications/count', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query(`
            SELECT SUM(unread) as total_unread
            FROM (
                SELECT COUNT(*) as unread FROM messages WHERE sender = 'client' AND is_read_by_admin = FALSE
                UNION ALL
                SELECT COUNT(*) as unread FROM contact_messages WHERE is_read = FALSE
            ) as counts;
        `);
        res.json({ count: parseInt(result.rows[0].total_unread || '0', 10) });
    } catch (error) {
        res.status(500).send(error.message);
    } finally { client.release(); }
});


// --- Server Start ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;
