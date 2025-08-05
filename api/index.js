import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';
import { Resend } from 'resend';
import crypto from 'crypto';

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
             const tables = ['password_reset_tokens', 'answers', 'questionnaire_responses', 'questions', 'questionnaire_templates', 'guest_groups', 'guests', 'films', 'messages', 'booking_stages', 'bookings', 'homepage_instagram', 'homepage_testimonials', 'homepage_slides', 'package_addons', 'addon_categories', 'packages', 'categories', 'app_settings', 'contact_messages', 'production_stages', 'discount_codes', 'addons', 'galleries', 'availability', 'admins', 'access_keys'];
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
            CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, access_key VARCHAR(4) REFERENCES access_keys(key), client_id VARCHAR(4) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, package_name VARCHAR(255) NOT NULL, total_price NUMERIC(10, 2) NOT NULL, selected_items JSONB, bride_name VARCHAR(255) NOT NULL, groom_name VARCHAR(255) NOT NULL, wedding_date DATE NOT NULL, bride_address TEXT, groom_address TEXT, church_location TEXT, venue_location TEXT, schedule TEXT, email VARCHAR(255) NOT NULL, phone_number VARCHAR(255), additional_info TEXT, discount_code VARCHAR(255), payment_status VARCHAR(50) DEFAULT 'pending', amount_paid NUMERIC(10, 2) DEFAULT 0.00, couple_photo_url TEXT, invite_message TEXT, invite_image_url TEXT, contract_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS booking_stages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, stage_id INTEGER REFERENCES production_stages(id), status VARCHAR(50) DEFAULT 'pending', completed_at TIMESTAMP WITH TIME ZONE);
            CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, sender VARCHAR(50) NOT NULL, content TEXT, attachment_url TEXT, attachment_type VARCHAR(100), is_read_by_admin BOOLEAN DEFAULT FALSE, is_read_by_client BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS films (id SERIAL PRIMARY KEY, youtube_url TEXT NOT NULL, title VARCHAR(255) NOT NULL, description TEXT, thumbnail_url TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS guest_groups (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE NOT NULL, name VARCHAR(255) NOT NULL);
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                group_id INTEGER REFERENCES guest_groups(id) ON DELETE SET NULL,
                rsvp_status VARCHAR(50) DEFAULT 'pending' NOT NULL,
                rsvp_token UUID DEFAULT gen_random_uuid() NOT NULL,
                notes TEXT,
                allowed_companions INTEGER DEFAULT 0 NOT NULL,
                companion_status JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS questionnaire_templates (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, is_default BOOLEAN DEFAULT FALSE);
            CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, template_id INTEGER REFERENCES questionnaire_templates(id) ON DELETE CASCADE, text TEXT NOT NULL, type VARCHAR(50) NOT NULL, sort_order INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS questionnaire_responses (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, template_id INTEGER REFERENCES questionnaire_templates(id) ON DELETE CASCADE, status VARCHAR(50) DEFAULT 'pending', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS answers (id SERIAL PRIMARY KEY, response_id INTEGER REFERENCES questionnaire_responses(id) ON DELETE CASCADE, question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE, answer_text TEXT, UNIQUE(response_id, question_id));
            CREATE TABLE IF NOT EXISTS password_reset_tokens (email VARCHAR(255) PRIMARY KEY, token_hash VARCHAR(255) NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL);
        `);
        
        // --- Schema Migrations ---
        console.log('Running schema checks and migrations...');
        await client.query('ALTER TABLE guests DROP COLUMN IF EXISTS group_name;');
        await client.query('ALTER TABLE guests ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES guest_groups(id) ON DELETE SET NULL;');
        await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invite_message TEXT;');
        await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invite_image_url TEXT;');
        await client.query('ALTER TABLE guests ADD COLUMN IF NOT EXISTS allowed_companions INTEGER DEFAULT 0 NOT NULL;');
        await client.query('ALTER TABLE guests ADD COLUMN IF NOT EXISTS companion_status JSONB;');
        await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_url TEXT;');
        console.log('Schema checks complete.');

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

// --- Helper Functions ---
const getSenderDetails = async (client) => {
    const settingsRes = await client.query("SELECT * FROM app_settings WHERE key IN ('senderName', 'fromEmail')");
    const senderName = settingsRes.rows.find(r => r.key === 'senderName')?.value || 'Dreamcatcher Film';
    const fromEmail = settingsRes.rows.find(r => r.key === 'fromEmail')?.value || 'no-reply@dreamcatcherfilms.co.uk';
    return { senderName, fromEmail };
};

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
                client.query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id GROUP BY a.id ORDER BY name ASC'),
                client.query('SELECT * FROM package_addons')
            ]);

            const allAddons = addonsRes.rows.map(a => ({
                ...a,
                category_ids: a.category_ids[0] === null ? [] : a.category_ids
            }));

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
            res.status(404).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }
    } catch (error) {
        console.error('Error validating key:', error);
        res.status(500).json({ message: 'Błąd serwera podczas walidacji klucza.' });
    }
});

app.post('/api/validate-discount', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Kod nie został podany.' });
    try {
        const result = await getPool().query(
            'SELECT * FROM discount_codes WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW()) AND (usage_limit IS NULL OR times_used < usage_limit)',
            [code]
        );
        if (result.rowCount > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Kod rabatowy jest nieprawidłowy lub wygasł.' });
        }
    } catch (error) {
        console.error('Error validating discount code:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/bookings', async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const { accessKey, packageName, totalPrice, selectedItems, brideName, groomName, weddingDate, brideAddress, groomAddress, churchLocation, venueLocation, schedule, email, phoneNumber, additionalInfo, password, discountCode } = req.body;

        const keyResult = await client.query('SELECT * FROM access_keys WHERE key = $1', [accessKey]);
        if (keyResult.rowCount === 0) return res.status(400).json({ message: 'Nieprawidłowy klucz dostępu.' });

        let clientId;
        let isUnique = false;
        while (!isUnique) {
            clientId = Math.floor(1000 + Math.random() * 9000).toString();
            const existingClient = await client.query('SELECT 1 FROM bookings WHERE client_id = $1', [clientId]);
            if (existingClient.rowCount === 0) isUnique = true;
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const bookingResult = await client.query(
            'INSERT INTO bookings (access_key, client_id, password_hash, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, email, phone_number, additional_info, discount_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id',
            [accessKey, clientId, passwordHash, packageName, totalPrice, JSON.stringify(selectedItems), brideName, groomName, weddingDate, brideAddress, groomAddress, churchLocation, venueLocation, schedule, email, phoneNumber, additionalInfo, discountCode]
        );
        const bookingId = bookingResult.rows[0].id;

        // Create default guest groups for the new booking
        const defaultGroups = ['Rodzice', 'Przyjaciele', 'Bliższa Rodzina', 'Dalsza Rodzina'];
        for (const groupName of defaultGroups) {
            await client.query('INSERT INTO guest_groups (booking_id, name) VALUES ($1, $2)', [bookingId, groupName]);
        }
        
        // Assign default questionnaire
        const defaultTemplateRes = await client.query('SELECT id FROM questionnaire_templates WHERE is_default = TRUE LIMIT 1');
        if (defaultTemplateRes.rowCount > 0) {
            await client.query('INSERT INTO questionnaire_responses (booking_id, template_id, status) VALUES ($1, $2, $3)', [bookingId, defaultTemplateRes.rows[0].id, 'pending']);
        }
        
        // Assign first production stage
        const firstStageRes = await client.query("SELECT id FROM production_stages WHERE name ILIKE '%ankiet%' LIMIT 1");
        if(firstStageRes.rowCount > 0) {
            await client.query('INSERT INTO booking_stages (booking_id, stage_id, status) VALUES ($1, $2, $3)', [bookingId, firstStageRes.rows[0].id, 'in_progress']);
        }


        if (discountCode) {
            await client.query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [discountCode]);
        }
        await client.query('DELETE FROM access_keys WHERE key = $1', [accessKey]);
        
        // Add booking to calendar
        await client.query(
            'INSERT INTO availability (title, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5)',
            [`Rezerwacja: ${brideName} & ${groomName}`, weddingDate, weddingDate, true, JSON.stringify({ type: 'booking', bookingId })]
        );
        
        // Send confirmation email
        try {
            const { senderName, fromEmail } = await getSenderDetails(client);
            await resend.emails.send({
                from: `${senderName} <${fromEmail}>`,
                to: email,
                subject: 'Potwierdzenie rezerwacji - Dreamcatcher Film',
                html: `<h1>Dziękujemy za rezerwację!</h1><p>Twoje konto w panelu klienta zostało utworzone.</p><p><strong>Numer rezerwacji:</strong> #${bookingId}</p><p><strong>Numer klienta (login):</strong> ${clientId}</p><p><strong>Hasło:</strong> [ustawione podczas rezerwacji]</p><p>Możesz zalogować się na naszej stronie, aby śledzić postępy.</p>`
            });
        } catch (emailError) {
            console.error("Failed to send booking confirmation email:", emailError);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Rezerwacja zakończona sukcesem!', bookingId, clientId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Wystąpił błąd serwera podczas tworzenia rezerwacji.' });
    } finally {
        client.release();
    }
});

app.post('/api/contact', async (req, res) => {
    const { firstName, lastName, email, phone, subject, message } = req.body;
    try {
        await getPool().query('INSERT INTO contact_messages (first_name, last_name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5, $6)', [firstName, lastName, email, phone, subject, message]);
        
        const adminRes = await getPool().query('SELECT notification_email FROM admins LIMIT 1');
        const notificationEmail = adminRes.rows[0]?.notification_email;

        if (notificationEmail) {
            try {
                const { senderName, fromEmail } = await getSenderDetails(await getPool().connect());
                await resend.emails.send({
                    from: `${senderName} <${fromEmail}>`,
                    to: notificationEmail,
                    subject: `Nowa wiadomość z formularza: ${subject}`,
                    html: `<h1>Nowa wiadomość</h1><p><strong>Od:</strong> ${firstName} ${lastName} (${email})</p><p><strong>Telefon:</strong> ${phone || 'Nie podano'}</p><hr><p>${message}</p>`
                });
            } catch (emailError) {
                console.error("Failed to send contact notification email:", emailError);
            }
        }
        res.status(201).json({ message: 'Wiadomość została wysłana.' });
    } catch (error) {
        console.error('Error saving contact message:', error);
        res.status(500).json({ message: 'Błąd serwera podczas wysyłania wiadomości.' });
    }
});

app.get('/api/films', async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const [filmsRes, settingsRes] = await Promise.all([
                client.query('SELECT * FROM films ORDER BY sort_order ASC'),
                client.query("SELECT key, value FROM app_settings WHERE key LIKE 'films_page_%'")
            ]);
            
            const settings = settingsRes.rows.reduce((acc, row) => {
                 acc[row.key.replace('films_page_', '')] = row.value;
                 return acc;
            }, {});

            res.json({
                films: filmsRes.rows,
                settings: settings,
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching films data:', error);
        res.status(500).json({ message: 'Błąd pobierania filmów.' });
    }
});

app.get('/api/public/rsvp/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const guestRes = await getPool().query('SELECT * FROM guests WHERE rsvp_token = $1', [token]);
        if (guestRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono zaproszenia.' });
        const guest = guestRes.rows[0];
        const bookingRes = await getPool().query('SELECT bride_name, groom_name, wedding_date, church_location, venue_location, couple_photo_url FROM bookings WHERE id = $1', [guest.booking_id]);
        if (bookingRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono powiązanej rezerwacji.' });

        res.json({ guest, booking: bookingRes.rows[0] });
    } catch (error) {
        console.error(`Error fetching RSVP data for token ${token}:`, error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/public/rsvp/:token', async (req, res) => {
    const { token } = req.params;
    const { rsvp_status, notes, companion_status } = req.body;
    try {
        const result = await getPool().query('UPDATE guests SET rsvp_status = $1, notes = $2, companion_status = $3 WHERE rsvp_token = $4 RETURNING *', [rsvp_status, notes, JSON.stringify(companion_status), token]);
        if(result.rowCount === 0) return res.status(404).json({message: 'Nie znaleziono zaproszenia.'});
        res.json({ message: 'Dziękujemy za odpowiedź!' });
    } catch (error) {
        console.error(`Error submitting RSVP for token ${token}:`, error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/login', async (req, res) => {
    const { loginIdentifier, password } = req.body;
    try {
        const result = await getPool().query('SELECT id, password_hash FROM bookings WHERE client_id = $1 OR email = $1', [loginIdentifier]);
        if (result.rowCount === 0) return res.status(401).json({ message: 'Nieprawidłowe dane logowania lub hasło.' });

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: 'Nieprawidłowe dane logowania lub hasło.' });

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (error) {
        console.error('Client login error:', error);
        res.status(500).json({ message: 'Błąd serwera podczas logowania.' });
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await getPool().query('SELECT id, password_hash FROM admins WHERE email = $1', [email]);
        if (result.rowCount === 0) return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });

        const admin = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });

        const token = jwt.sign({ adminId: admin.id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Błąd serwera podczas logowania.' });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT id FROM bookings WHERE email = $1', [email]);
        if (bookingRes.rowCount > 0) {
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = await bcrypt.hash(token, 10);
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            await client.query('DELETE FROM password_reset_tokens WHERE email = $1', [email]);
            await client.query('INSERT INTO password_reset_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)', [email, tokenHash, expiresAt]);
            
            const { senderName, fromEmail } = await getSenderDetails(client);
            const resetLink = `https://${req.headers.host}/reset-hasla/${token}`;

            await resend.emails.send({
                from: `${senderName} <${fromEmail}>`,
                to: email,
                subject: 'Reset hasła - Dreamcatcher Film',
                html: `
                    <h1>Reset hasła</h1>
                    <p>Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Panelu Klienta.</p>
                    <p>Kliknij poniższy link, aby ustawić nowe hasło. Link jest ważny przez 30 minut.</p>
                    <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Zresetuj hasło</a>
                    <p>Jeśli to nie Ty prosiłeś/aś o zmianę, zignoruj tę wiadomość.</p>
                `
            });
        }
        // Always send a success response to prevent user enumeration
        res.json({ message: 'Jeśli konto o podanym adresie e-mail istnieje, wysłaliśmy na nie instrukcje.' });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: 'Wystąpił błąd serwera.' });
    } finally {
        client.release();
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Brak tokenu lub hasła.' });

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        // Clean up expired tokens first
        await client.query('DELETE FROM password_reset_tokens WHERE expires_at < NOW()');

        const allTokensRes = await client.query('SELECT email, token_hash FROM password_reset_tokens');
        let validTokenEntry = null;

        for (const row of allTokensRes.rows) {
            if (await bcrypt.compare(token, row.token_hash)) {
                validTokenEntry = row;
                break;
            }
        }

        if (!validTokenEntry) {
            return res.status(400).json({ message: 'Token jest nieprawidłowy lub wygasł.' });
        }

        const newPasswordHash = await bcrypt.hash(password, 10);
        await client.query('UPDATE bookings SET password_hash = $1 WHERE email = $2', [newPasswordHash, validTokenEntry.email]);
        await client.query('DELETE FROM password_reset_tokens WHERE email = $1', [validTokenEntry.email]);

        await client.query('COMMIT');
        res.json({ message: 'Hasło zostało pomyślnie zresetowane.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Reset password error:", error);
        res.status(500).json({ message: 'Wystąpił błąd serwera.' });
    } finally {
        client.release();
    }
});


// --- Vercel Blob Upload Proxies ---
const createUploadHandler = (authMiddleware) => async (req, res) => {
    authMiddleware(req, res, async () => {
        const filename = req.headers['x-vercel-filename'];
        if (!filename) return res.status(400).json({ message: 'x-vercel-filename header is required.' });

        try {
            const blob = await put(filename, req.body, { access: 'public' });
            res.status(200).json(blob);
        } catch (error) {
            console.error('Blob upload error:', error);
            res.status(500).json({ message: 'Error uploading file.', error: error.message });
        }
    });
};

app.post('/api/admin/galleries/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/my-booking/photo', rawBodyParser, createUploadHandler(authenticateClient));
app.post('/api/my-booking/invite-settings/upload', rawBodyParser, createUploadHandler(authenticateClient));
app.post('/api/admin/homepage/slides/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/homepage/about/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/packages/upload-image', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/homepage/instagram/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/films-settings/upload-hero', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/messages/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/bookings/:bookingId/contract/upload', rawBodyParser, createUploadHandler(authenticateAdmin));


// --- CLIENT-PROTECTED ROUTES ---

app.get('/api/my-booking', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1', [req.user.userId]);
        if (bookingRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        
        const booking = bookingRes.rows[0];

        // Fetch questionnaire data
        const responseRes = await client.query('SELECT * FROM questionnaire_responses WHERE booking_id = $1', [req.user.userId]);
        let questionnaireData = null;

        if (responseRes.rowCount > 0) {
            const response = responseRes.rows[0];
            const templateRes = await client.query('SELECT * FROM questionnaire_templates WHERE id = $1', [response.template_id]);
            const questionsRes = await client.query('SELECT * FROM questions WHERE template_id = $1 ORDER BY sort_order', [response.template_id]);
            const answersRes = await client.query('SELECT * FROM answers WHERE response_id = $1', [response.id]);
            
            questionnaireData = {
                response_id: response.id,
                status: response.status,
                template: templateRes.rows[0],
                questions: questionsRes.rows,
                answers: answersRes.rows.reduce((acc, ans) => {
                    acc[ans.question_id] = ans.answer_text;
                    return acc;
                }, {})
            };
        }
        
        res.json({ booking, questionnaire: questionnaireData });
    } catch (error) {
        console.error('Error fetching comprehensive booking data for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    } finally {
        client.release();
    }
});

app.patch('/api/my-booking', authenticateClient, async (req, res) => {
    const { bride_name, groom_name, email, phone_number, bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    try {
        const result = await getPool().query(
            `UPDATE bookings SET 
             bride_name = $1, groom_name = $2, email = $3, phone_number = $4,
             bride_address = $5, groom_address = $6, church_location = $7, 
             venue_location = $8, schedule = $9, additional_info = $10 
             WHERE id = $11 RETURNING *`,
            [bride_name, groom_name, email, phone_number, bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.user.userId]
        );
        res.json({ message: 'Dane zaktualizowane.', booking: result.rows[0] });
    } catch (error) {
        console.error('Error updating booking for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/booking-stages', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query(
            'SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at FROM booking_stages bs JOIN production_stages ps ON bs.stage_id = ps.id WHERE bs.booking_id = $1 ORDER BY ps.id ASC',
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching booking stages for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/booking-stages/:stageId/approve', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('UPDATE booking_stages SET status = $1, completed_at = NOW() WHERE id = $2 AND booking_id = $3 AND status = $4 RETURNING id', ['completed', req.params.stageId, req.user.userId, 'awaiting_approval']);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono etapu lub nie można go zatwierdzić.' });
        res.json({ message: 'Etap został zatwierdzony.' });
    } catch (error) {
        console.error('Error approving stage for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/messages', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/messages/unread-count', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND is_read_by_client = FALSE AND sender = $2', [req.user.userId, 'admin']);
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (error) {
        console.error('Error fetching unread count for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/messages/mark-as-read', authenticateClient, async (req, res) => {
    try {
        await getPool().query('UPDATE messages SET is_read_by_client = TRUE WHERE booking_id = $1', [req.user.userId]);
        res.status(204).send();
    } catch (error) {
        console.error('Error marking messages as read for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/messages', authenticateClient, async (req, res) => {
    const { content } = req.body;
    try {
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, is_read_by_client, is_read_by_admin) VALUES ($1, $2, $3, TRUE, FALSE) RETURNING *',
            [req.user.userId, 'client', content]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error sending message for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// Guest List for Clients
app.get('/api/my-booking/guests', authenticateClient, async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const guests = await client.query('SELECT g.*, gg.name as group_name FROM guests g LEFT JOIN guest_groups gg ON g.group_id = gg.id WHERE g.booking_id = $1 ORDER BY gg.name, g.name', [req.user.userId]);
            res.json(guests.rows);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error getting guests for client:', error);
        res.status(500).json({ message: 'Błąd pobierania gości.' });
    }
});

app.post('/api/my-booking/guests', authenticateClient, async (req, res) => {
    const { name, email, group_id, allowed_companions, companion_status } = req.body;
    try {
        const result = await getPool().query(
            'INSERT INTO guests (booking_id, name, email, group_id, allowed_companions, companion_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.userId, name, email, group_id || null, allowed_companions || 0, JSON.stringify(companion_status)]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding guest:', error);
        res.status(500).json({ message: 'Błąd dodawania gościa.', details: error.message });
    }
});
app.put('/api/my-booking/guests/:id', authenticateClient, async (req, res) => {
    const { name, email, group_id, allowed_companions, rsvp_status, companion_status } = req.body;
    try {
        const result = await getPool().query('UPDATE guests SET name = $1, email = $2, group_id = $3, allowed_companions = $4, rsvp_status = $5, companion_status = $6 WHERE id = $7 AND booking_id = $8 RETURNING *', [name, email, group_id || null, allowed_companions || 0, rsvp_status, JSON.stringify(companion_status), req.params.id, req.user.userId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono gościa.' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Błąd aktualizacji gościa.' });
    }
});
app.delete('/api/my-booking/guests/:id', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('DELETE FROM guests WHERE id = $1 AND booking_id = $2', [req.params.id, req.user.userId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono gościa.' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania gościa.' });
    }
});
app.post('/api/my-booking/guests/send-invites', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1', [req.user.userId]);
        if (bookingRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        const booking = bookingRes.rows[0];

        const guestsRes = await client.query("SELECT * FROM guests WHERE booking_id = $1 AND rsvp_status = 'pending' AND email IS NOT NULL AND email <> ''", [req.user.userId]);
        const guests_to_invite = guestsRes.rows;

        if (guests_to_invite.length === 0) return res.status(400).json({ message: 'Brak gości do zaproszenia (wszyscy już odpowiedzieli lub nie mają podanego adresu e-mail).' });

        const { senderName, fromEmail } = await getSenderDetails(client);
        
        const customImageHtml = booking.invite_image_url ? `<img src="${booking.invite_image_url}" alt="Zaproszenie" style="width:100%;max-width:600px;height:auto;margin-bottom:20px;">` : '';
        const customMessageHtml = booking.invite_message ? `<p>${booking.invite_message.replace(/\n/g, '<br>')}</p>` : '';

        const emails = guests_to_invite.map(guest => ({
            from: `${booking.bride_name} i ${booking.groom_name} <${fromEmail}>`,
            to: guest.email,
            subject: `Zaproszenie na ślub ${booking.bride_name} i ${booking.groom_name}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    ${customImageHtml}
                    <h1>Cześć ${guest.name}!</h1>
                    ${customMessageHtml}
                    <p>Zapraszamy Cię serdecznie na nasz ślub. Prosimy o potwierdzenie przybycia, klikając w poniższy link:</p>
                    <a href="https://${req.headers.host}/rsvp/${guest.rsvp_token}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Potwierdź przybycie</a>
                    <p>Pozdrawiamy,<br>${booking.bride_name} i ${booking.groom_name}</p>
                </div>
            `,
            reply_to: booking.email,
        }));

        await resend.batch.send(emails);

        res.json({ message: `Pomyślnie wysłano zaproszenia do ${guests_to_invite.length} gości.` });
    } catch (error) {
        console.error("Error sending guest invites:", error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Wystąpił nieznany błąd podczas wysyłania zaproszeń.' });
    } finally {
        client.release();
    }
});

// Guest Groups for Clients
app.get('/api/my-booking/guest-groups', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        let groupsRes = await client.query('SELECT * FROM guest_groups WHERE booking_id = $1 ORDER BY name', [req.user.userId]);

        if (groupsRes.rowCount === 0) {
            const defaultGroups = ['Rodzice', 'Przyjaciele', 'Bliższa Rodzina', 'Dalsza Rodzina'];
            for (const groupName of defaultGroups) {
                await client.query('INSERT INTO guest_groups (booking_id, name) VALUES ($1, $2)', [req.user.userId, groupName]);
            }
            groupsRes = await client.query('SELECT * FROM guest_groups WHERE booking_id = $1 ORDER BY name', [req.user.userId]);
        }
        
        res.json(groupsRes.rows);
    } catch (error) {
        res.status(500).json({ message: 'Błąd pobierania grup gości.' });
    } finally {
        client.release();
    }
});

app.post('/api/my-booking/guest-groups', authenticateClient, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await getPool().query('INSERT INTO guest_groups (booking_id, name) VALUES ($1, $2) RETURNING *', [req.user.userId, name]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Błąd tworzenia grupy.' });
    }
});

app.delete('/api/my-booking/guest-groups/:id', authenticateClient, async (req, res) => {
    try {
        await getPool().query('DELETE FROM guest_groups WHERE id = $1 AND booking_id = $2', [req.params.id, req.user.userId]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania grupy.' });
    }
});

// Invite Settings
app.get('/api/my-booking/invite-settings', authenticateClient, async (req, res) => {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT invite_message, invite_image_url FROM bookings WHERE id = $1', [req.user.userId]);
        res.json(result.rows[0] || { invite_message: '', invite_image_url: '' });
    } catch (error) {
        console.error("Error getting invite settings:", error);
        res.status(500).json({ message: 'Błąd pobierania ustawień zaproszenia.' });
    } finally {
        client.release();
    }
});
app.patch('/api/my-booking/invite-settings', authenticateClient, async (req, res) => {
    const { invite_message, invite_image_url } = req.body;
    try {
        await getPool().query('UPDATE bookings SET invite_message = $1, invite_image_url = $2 WHERE id = $3', [invite_message, invite_image_url, req.user.userId]);
        res.json({ message: 'Ustawienia zapisane.' });
    } catch (error) {
        res.status(500).json({ message: 'Błąd zapisu ustawień.' });
    }
});

// Questionnaire
app.patch('/api/my-booking/questionnaire/answers', authenticateClient, async(req, res) => {
    const { response_id, answers } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (const question_id in answers) {
            const answer_text = answers[question_id];
            await client.query(`
                INSERT INTO answers (response_id, question_id, answer_text) VALUES ($1, $2, $3)
                ON CONFLICT (response_id, question_id) DO UPDATE SET answer_text = $3
            `, [response_id, question_id, answer_text]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Zapisano odpowiedzi.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving answers:', error);
        res.status(500).json({ message: 'Błąd zapisu odpowiedzi.' });
    } finally {
        client.release();
    }
});

app.post('/api/my-booking/questionnaire/submit', authenticateClient, async (req, res) => {
    const { response_id } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE questionnaire_responses SET status = $1 WHERE id = $2 AND booking_id = $3', ['submitted', response_id, req.user.userId]);

        const adminRes = await client.query('SELECT notification_email FROM admins LIMIT 1');
        const bookingRes = await client.query('SELECT bride_name, groom_name FROM bookings WHERE id = $1', [req.user.userId]);
        const notificationEmail = adminRes.rows[0]?.notification_email;
        const { bride_name, groom_name } = bookingRes.rows[0];

        if (notificationEmail) {
            const { senderName, fromEmail } = await getSenderDetails(client);
            await resend.emails.send({
                from: `${senderName} <${fromEmail}>`,
                to: notificationEmail,
                subject: `Para ${bride_name} i ${groom_name} wypełniła ankietę!`,
                html: `<h1>Ankieta została wypełniona</h1><p>Para ${bride_name} i ${groom_name} zatwierdziła swoje odpowiedzi w ankiecie. Możesz je teraz przejrzeć w panelu administratora.</p>`
            });
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Ankieta została pomyślnie wysłana.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error submitting questionnaire:', error);
        res.status(500).json({ message: 'Błąd wysyłania ankiety.' });
    } finally {
        client.release();
    }
});


// --- ADMIN-PROTECTED ROUTES ---
// Database Management
app.post('/api/admin/setup-database', authenticateAdmin, async (req, res) => {
    try {
        await initialize(false);
        res.json({ message: 'Baza danych została pomyślnie zainicjowana/zaktualizowana.' });
    } catch (error) {
        res.status(500).json({ message: 'Błąd inicjalizacji bazy danych.', error: error.message });
    }
});

app.post('/api/admin/reset-database', authenticateAdmin, async (req, res) => {
    try {
        await initialize(true);
        res.json({ message: 'Baza danych została pomyślnie zresetowana.' });
    } catch (error) {
        res.status(500).json({ message: 'Błąd resetowania bazy danych.', error: error.message });
    }
});

// -- Settings --
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const adminRes = await client.query('SELECT email, notification_email FROM admins WHERE id = $1', [req.admin.adminId]);
            const settingsRes = await client.query("SELECT key, value FROM app_settings WHERE key IN ('senderName', 'fromEmail')");
            
            if (adminRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono administratora.' });
            
            const senderName = settingsRes.rows.find(r => r.key === 'senderName')?.value;
            const fromEmail = settingsRes.rows.find(r => r.key === 'fromEmail')?.value;

            res.json({
                loginEmail: adminRes.rows[0].email,
                notificationEmail: adminRes.rows[0].notification_email,
                senderName: senderName || '',
                fromEmail: fromEmail || ''
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching admin settings:', error);
        res.status(500).json({ message: 'Błąd pobierania ustawień.' });
    }
});

app.patch('/api/admin/settings', authenticateAdmin, async (req, res) => {
    const { notificationEmail, senderName, fromEmail } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        if (notificationEmail !== undefined) {
            await client.query('UPDATE admins SET notification_email = $1 WHERE id = $2', [notificationEmail, req.admin.adminId]);
        }
        if (senderName !== undefined) {
             await client.query("INSERT INTO app_settings (key, value) VALUES ('senderName', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [senderName]);
        }
        if (fromEmail !== undefined) {
            await client.query("INSERT INTO app_settings (key, value) VALUES ('fromEmail', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [fromEmail]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Ustawienia zaktualizowane.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating admin settings:', error);
        res.status(500).json({ message: 'Błąd zapisu ustawień.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/contact-settings', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const details = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(details);
    } catch (error) {
        console.error('Error fetching admin contact settings:', error);
        res.status(500).json({ message: 'Błąd pobierania danych kontaktowych.' });
    }
});

app.patch('/api/admin/contact-settings', authenticateAdmin, async (req, res) => {
    const settings = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (const key in settings) {
            if (Object.prototype.hasOwnProperty.call(settings, key)) {
                await client.query(
                    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                    [key, settings[key]]
                );
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'Ustawienia zaktualizowane.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating contact settings:', error);
        res.status(500).json({ message: 'Błąd zapisu ustawień.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/credentials', authenticateAdmin, async (req, res) => {
    const { currentPassword, newEmail, newPassword } = req.body;
    const client = await getPool().connect();
    try {
        const adminRes = await client.query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.adminId]);
        if (adminRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono administratora.' });

        const { password_hash } = adminRes.rows[0];
        const isPasswordValid = await bcrypt.compare(currentPassword, password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: 'Nieprawidłowe bieżące hasło.' });
        
        await client.query('BEGIN');
        if (newEmail) {
            await client.query('UPDATE admins SET email = $1 WHERE id = $2', [newEmail, req.admin.adminId]);
        }
        if (newPassword) {
            const newPasswordHash = await bcrypt.hash(newPassword, 10);
            await client.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.admin.adminId]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Dane logowania zaktualizowane.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating credentials:', error);
        res.status(500).json({ message: 'Błąd zapisu danych logowania.' });
    } finally {
        client.release();
    }
});

// Admin Notifications
app.get('/api/admin/notifications', authenticateAdmin, async(req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const clientMessagesRes = await client.query(`
                SELECT
                    'client_message' as type,
                    m.booking_id,
                    b.bride_name || ' & ' || b.groom_name as sender_name,
                    COUNT(*) as unread_count,
                    (SELECT content FROM messages WHERE booking_id = m.booking_id AND is_read_by_admin = FALSE ORDER BY created_at DESC LIMIT 1) as preview
                FROM messages m
                JOIN bookings b ON m.booking_id = b.id
                WHERE m.is_read_by_admin = FALSE AND m.sender = 'client'
                GROUP BY m.booking_id, b.bride_name, b.groom_name
            `);

            const inboxMessagesRes = await client.query(`
                SELECT
                    'inbox_message' as type,
                    id as message_id,
                    first_name || ' ' || last_name as sender_name,
                    message as preview
                FROM contact_messages
                WHERE is_read = FALSE
                ORDER BY created_at DESC
            `);

            res.json([...clientMessagesRes.rows, ...inboxMessagesRes.rows]);

        } finally {
            client.release();
        }
    } catch(err) {
        res.status(500).json({ message: 'Błąd pobierania powiadomień.' });
    }
});

app.get('/api/admin/notifications/count', authenticateAdmin, async(req, res) => {
    try {
         const client = await getPool().connect();
        try {
            const [clientMessagesRes, inboxMessagesRes] = await Promise.all([
                 client.query("SELECT COUNT(*) FROM messages WHERE is_read_by_admin = FALSE AND sender = 'client'"),
                 client.query("SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE")
            ]);
            const total = parseInt(clientMessagesRes.rows[0].count, 10) + parseInt(inboxMessagesRes.rows[0].count, 10);
            res.json({ count: total });
        } finally {
            client.release();
        }
    } catch(err) {
        res.status(500).json({ message: 'Błąd pobierania licznika powiadomień.' });
    }
});

// Admin Inbox
app.get('/api/admin/inbox', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania wiadomości.' });
    }
});

app.patch('/api/admin/inbox/:id/read', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: 'Błąd oznaczania jako przeczytane.' });
    }
});

app.delete('/api/admin/inbox/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: 'Błąd usuwania wiadomości.' });
    }
});

// Admin Bookings
app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at FROM bookings ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania rezerwacji.' });
    }
});

app.get('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania szczegółów rezerwacji.' });
    }
});

app.delete('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM availability WHERE resource->>'bookingId' = $1`, [req.params.id]);
        await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd usuwania rezerwacji.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const { bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    try {
        const result = await getPool().query(
            `UPDATE bookings SET 
             bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5, bride_address = $6, groom_address = $7,
             church_location = $8, venue_location = $9, schedule = $10, additional_info = $11 
             WHERE id = $12 RETURNING *`,
            [bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.params.id]
        );
        res.json({ message: 'Zaktualizowano rezerwację.', booking: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: 'Błąd aktualizacji rezerwacji.' });
    }
});

app.patch('/api/admin/bookings/:id/payment', authenticateAdmin, async (req, res) => {
    const { payment_status, amount_paid } = req.body;
    try {
        await getPool().query('UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3', [payment_status, amount_paid, req.params.id]);
        res.json({ message: 'Płatność zaktualizowana.', payment_details: { payment_status, amount_paid } });
    } catch(err) {
        res.status(500).json({ message: 'Błąd zapisu płatności.' });
    }
});

app.post('/api/admin/bookings/:id/resend-credentials', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT client_id, email FROM bookings WHERE id = $1', [req.params.id]);
        if (bookingRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });

        const { client_id, email } = bookingRes.rows[0];
        const { senderName, fromEmail } = await getSenderDetails(client);

        await resend.emails.send({
            from: `${senderName} <${fromEmail}>`,
            to: email,
            subject: 'Twoje dane logowania - Dreamcatcher Film',
            html: `<p>Cześć,</p><p>poniżej przypominamy Twoje dane do logowania do panelu klienta:</p><p><strong>Numer klienta (login):</strong> ${client_id}</p><p><strong>Hasło:</strong> [ustawione podczas rezerwacji]</p><p>Jeśli nie pamiętasz hasła, skontaktuj się z nami.</p>`
        });
        
        res.json({ message: 'E-mail został wysłany.' });
    } catch (err) {
        res.status(500).json({ message: 'Błąd wysyłania e-maila.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:bookingId/contract', authenticateAdmin, async(req, res) => {
    const { contract_url } = req.body;
    try {
        await getPool().query('UPDATE bookings SET contract_url = $1 WHERE id = $2', [contract_url, req.params.bookingId]);
        res.json({ message: 'Umowa została zapisana.', contract_url });
    } catch (error) {
        console.error('Error saving contract URL:', error);
        res.status(500).json({ message: 'Błąd zapisu umowy.' });
    }
});

// Admin Guest Management
app.get('/api/admin/bookings/:bookingId/guests', authenticateAdmin, async (req, res) => {
    try {
        const guests = await getPool().query('SELECT g.*, gg.name as group_name FROM guests g LEFT JOIN guest_groups gg ON g.group_id = gg.id WHERE g.booking_id = $1 ORDER BY gg.name, g.name', [req.params.bookingId]);
        res.json(guests.rows);
    } catch (error) { res.status(500).json({ message: 'Błąd pobierania gości.' }); }
});
app.post('/api/admin/bookings/:bookingId/guests', authenticateAdmin, async (req, res) => {
    const { name, email, group_id, allowed_companions, companion_status } = req.body;
    try {
        const result = await getPool().query( 'INSERT INTO guests (booking_id, name, email, group_id, allowed_companions, companion_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.params.bookingId, name, email, group_id || null, allowed_companions || 0, JSON.stringify(companion_status)] );
        res.status(201).json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: 'Błąd dodawania gościa.' }); }
});
app.put('/api/admin/bookings/:bookingId/guests/:id', authenticateAdmin, async (req, res) => {
    const { name, email, group_id, allowed_companions, rsvp_status, companion_status } = req.body;
    try {
        const result = await getPool().query('UPDATE guests SET name = $1, email = $2, group_id = $3, allowed_companions = $4, rsvp_status = $5, companion_status = $6 WHERE id = $7 AND booking_id = $8 RETURNING *', [name, email, group_id || null, allowed_companions || 0, rsvp_status, JSON.stringify(companion_status), req.params.id, req.params.bookingId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono gościa.' });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: 'Błąd aktualizacji gościa.' }); }
});
app.delete('/api/admin/bookings/:bookingId/guests/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('DELETE FROM guests WHERE id = $1 AND booking_id = $2', [req.params.id, req.params.bookingId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono gościa.' });
        res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Błąd usuwania gościa.' }); }
});
app.get('/api/admin/bookings/:bookingId/guest-groups', authenticateAdmin, async (req, res) => {
    try {
        const groupsRes = await getPool().query('SELECT * FROM guest_groups WHERE booking_id = $1 ORDER BY name', [req.params.bookingId]);
        res.json(groupsRes.rows);
    } catch (error) { res.status(500).json({ message: 'Błąd pobierania grup gości.' }); }
});
app.post('/api/admin/bookings/:bookingId/guest-groups', authenticateAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await getPool().query('INSERT INTO guest_groups (booking_id, name) VALUES ($1, $2) RETURNING *', [req.params.bookingId, name]);
        res.status(201).json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: 'Błąd tworzenia grupy.' }); }
});
app.delete('/api/admin/bookings/:bookingId/guest-groups/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM guest_groups WHERE id = $1 AND booking_id = $2', [req.params.id, req.params.bookingId]);
        res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Błąd usuwania grupy.' }); }
});
app.post('/api/admin/bookings/:bookingId/guests/send-invites', authenticateAdmin, async (req, res) => {
    const { bookingId } = req.params;
    const client = await getPool().connect();
    try {
        const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingRes.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        const booking = bookingRes.rows[0];

        const guestsRes = await client.query("SELECT * FROM guests WHERE booking_id = $1 AND rsvp_status = 'pending' AND email IS NOT NULL AND email <> ''", [bookingId]);
        const guests_to_invite = guestsRes.rows;

        if (guests_to_invite.length === 0) return res.status(400).json({ message: 'Brak gości do zaproszenia (wszyscy już odpowiedzieli lub nie mają podanego adresu e-mail).' });

        const { senderName, fromEmail } = await getSenderDetails(client);
        
        const customImageHtml = booking.invite_image_url ? `<img src="${booking.invite_image_url}" alt="Zaproszenie" style="width:100%;max-width:600px;height:auto;margin-bottom:20px;">` : '';
        const customMessageHtml = booking.invite_message ? `<p>${booking.invite_message.replace(/\n/g, '<br>')}</p>` : '';

        const emails = guests_to_invite.map(guest => ({
            from: `${booking.bride_name} i ${booking.groom_name} <${fromEmail}>`,
            to: guest.email,
            subject: `Zaproszenie na ślub ${booking.bride_name} i ${booking.groom_name}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    ${customImageHtml}
                    <h1>Cześć ${guest.name}!</h1>
                    ${customMessageHtml}
                    <p>Zapraszamy Cię serdecznie na nasz ślub. Prosimy o potwierdzenie przybycia, klikając w poniższy link:</p>
                    <a href="https://${req.headers.host}/rsvp/${guest.rsvp_token}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Potwierdź przybycie</a>
                    <p>Pozdrawiamy,<br>${booking.bride_name} i ${booking.groom_name}</p>
                </div>
            `,
            reply_to: booking.email,
        }));

        await resend.batch.send(emails);

        res.json({ message: `Pomyślnie wysłano zaproszenia do ${guests_to_invite.length} gości.` });
    } catch (error) {
        console.error("Error sending guest invites by admin:", error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Wystąpił nieznany błąd podczas wysyłania zaproszeń.' });
    } finally {
        client.release();
    }
});


// Admin Access Keys
app.get('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania kluczy.' }) }
});

app.post('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
    const { client_name } = req.body;
    let newKey;
    let isUnique = false;
    const client = await getPool().connect();
    try {
        while(!isUnique) {
            newKey = Math.floor(1000 + Math.random() * 9000).toString();
            const result = await client.query('SELECT 1 FROM access_keys WHERE key = $1', [newKey]);
            if(result.rowCount === 0) isUnique = true;
        }
        const insertResult = await client.query('INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *', [newKey, client_name]);
        res.status(201).json(insertResult.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Błąd tworzenia klucza.' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/access-keys/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM access_keys WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch(err) {
        res.status(500).json({ message: 'Błąd usuwania klucza.' });
    }
});

// Admin Availability
app.get('/api/admin/availability', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM availability');
        res.json(result.rows.map(row => ({
            ...row,
            start: row.start_time,
            end: row.end_time,
            allDay: row.is_all_day
        })));
    } catch(err) {
        res.status(500).json({ message: 'Błąd pobierania kalendarza.' });
    }
});

app.post('/api/admin/availability', authenticateAdmin, async (req, res) => {
    const { title, description, start_time, end_time, is_all_day } = req.body;
    try {
        const result = await getPool().query('INSERT INTO availability (title, description, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [title, description, start_time, end_time, is_all_day, JSON.stringify({ type: 'event' })]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Błąd tworzenia wydarzenia.' });
    }
});

app.patch('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    const { title, description, start_time, end_time, is_all_day } = req.body;
    try {
        const result = await getPool().query('UPDATE availability SET title=$1, description=$2, start_time=$3, end_time=$4, is_all_day=$5 WHERE id=$6 RETURNING *', [title, description, start_time, end_time, is_all_day, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Błąd aktualizacji wydarzenia.' });
    }
});

app.delete('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM availability WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: 'Błąd usuwania wydarzenia.' });
    }
});

// Admin Gallery
app.get('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(err) { res.status(500).json({ message: 'Błąd pobierania galerii.' }) }
});

app.post('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    const { title, description, image_url } = req.body;
    try {
        const result = await getPool().query('INSERT INTO galleries (title, description, image_url) VALUES ($1, $2, $3) RETURNING *', [title, description, image_url]);
        res.status(201).json(result.rows[0]);
    } catch(err) { res.status(500).json({ message: 'Błąd dodawania do galerii.' }) }
});

app.delete('/api/admin/galleries/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const itemRes = await client.query('SELECT image_url FROM galleries WHERE id = $1', [req.params.id]);
        if (itemRes.rowCount > 0 && itemRes.rows[0].image_url) {
            await del(itemRes.rows[0].image_url);
        }
        await client.query('DELETE FROM galleries WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd usuwania z galerii.' });
    } finally {
        client.release();
    }
});

// Admin Films
app.get('/api/admin/films', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM films ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch(err) { res.status(500).json({ message: 'Błąd pobierania filmów.' }) }
});

app.post('/api/admin/films', authenticateAdmin, async (req, res) => {
    const { youtube_url, title, description } = req.body;
    const videoId = getYouTubeVideoId(youtube_url);
    if (!videoId) return res.status(400).json({ message: 'Nieprawidłowy link YouTube.' });
    const thumbnail_url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    try {
        const result = await getPool().query('INSERT INTO films (youtube_url, title, description, thumbnail_url) VALUES ($1, $2, $3, $4) RETURNING *', [youtube_url, title, description, thumbnail_url]);
        res.status(201).json(result.rows[0]);
    } catch(err) { res.status(500).json({ message: 'Błąd dodawania filmu.' }) }
});

app.patch('/api/admin/films/:id', authenticateAdmin, async (req, res) => {
    const { youtube_url, title, description } = req.body;
    const videoId = getYouTubeVideoId(youtube_url);
    if (!videoId) return res.status(400).json({ message: 'Nieprawidłowy link YouTube.' });
    const thumbnail_url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    try {
        const result = await getPool().query('UPDATE films SET youtube_url=$1, title=$2, description=$3, thumbnail_url=$4 WHERE id=$5 RETURNING *', [youtube_url, title, description, thumbnail_url, req.params.id]);
        res.json(result.rows[0]);
    } catch(err) { res.status(500).json({ message: 'Błąd aktualizacji filmu.' }) }
});

app.delete('/api/admin/films/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM films WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch(err) { res.status(500).json({ message: 'Błąd usuwania filmu.' }) }
});

app.post('/api/admin/films/order', authenticateAdmin, async (req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE films SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Kolejność zaktualizowana.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zmiany kolejności.' });
    } finally {
        client.release();
    }
});

// Admin Films Page Settings
app.get('/api/admin/films-settings', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'films_page_%'");
        const settings = result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania ustawień strony filmów.' });
    }
});

app.patch('/api/admin/films-settings', authenticateAdmin, async (req, res) => {
    const settings = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (const key in settings) {
            if (key.startsWith('films_page_')) {
                await client.query("INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, settings[key]]);
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'Ustawienia zaktualizowane.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zapisu ustawień strony filmów.' });
    } finally {
        client.release();
    }
});


// Admin Messages
app.get('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania wiadomości.' }); }
});

app.post('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    const { content, attachment_url, attachment_type } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('INSERT INTO messages (booking_id, sender, content, attachment_url, attachment_type, is_read_by_admin) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *', [req.params.bookingId, 'admin', content, attachment_url, attachment_type]);
        
        const bookingRes = await client.query('SELECT email, bride_name, groom_name FROM bookings WHERE id = $1', [req.params.bookingId]);
        if (bookingRes.rowCount > 0) {
            const { email, bride_name, groom_name } = bookingRes.rows[0];
            const { senderName, fromEmail } = await getSenderDetails(client);
            await resend.emails.send({
                from: `${senderName} <${fromEmail}>`,
                to: email,
                subject: `Nowa wiadomość od Dreamcatcher Film w sprawie Twojej rezerwacji`,
                html: `<p>Cześć ${bride_name} i ${groom_name},</p><p>Otrzymaliście nową wiadomość w panelu klienta. Możecie ją odczytać, logując się na naszej stronie.</p><a href="https://${req.headers.host}/logowanie">Przejdź do panelu klienta</a>`
            });
        }

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd wysyłania wiadomości.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/bookings/:bookingId/unread-count', authenticateAdmin, async (req, res) => {
     try {
        const result = await getPool().query("SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND is_read_by_admin = FALSE AND sender = 'client'", [req.params.bookingId]);
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (error) { res.status(500).json({ message: 'Błąd pobierania licznika.' }); }
});

app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('UPDATE messages SET is_read_by_admin = TRUE WHERE booking_id = $1', [req.params.bookingId]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd oznaczania wiadomości.' }); }
});

// Offer Management
app.get('/api/admin/offer-data', authenticateAdmin, async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const [packagesRes, addonsRes, categoriesRes, packageAddonsRes] = await Promise.all([
                client.query('SELECT p.*, c.name as category_name FROM packages p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.name'),
                client.query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id GROUP BY a.id ORDER BY a.name'),
                client.query('SELECT * FROM categories ORDER BY name'),
                client.query('SELECT * FROM package_addons'),
            ]);

            const packagesWithAddons = packagesRes.rows.map(pkg => ({
                ...pkg,
                addons: packageAddonsRes.rows.filter(pa => pa.package_id === pkg.id).map(pa => ({ id: pa.addon_id }))
            }));

            res.json({
                packages: packagesWithAddons,
                addons: addonsRes.rows.map(a => ({...a, category_ids: a.category_ids[0] === null ? [] : a.category_ids })),
                categories: categoriesRes.rows
            });
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych oferty.' });
    }
});

// Categories
app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    const { name, description, icon_name } = req.body;
    try {
        const result = await getPool().query('INSERT INTO categories (name, description, icon_name) VALUES ($1, $2, $3) RETURNING *', [name, description, icon_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd tworzenia kategorii.' }); }
});
app.patch('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    const { name, description, icon_name } = req.body;
    try {
        const result = await getPool().query('UPDATE categories SET name=$1, description=$2, icon_name=$3 WHERE id=$4 RETURNING *', [name, description, icon_name, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd aktualizacji kategorii.' }); }
});
app.delete('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM categories WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania kategorii.' }); }
});

// Addons
app.post('/api/admin/addons', authenticateAdmin, async (req, res) => {
    const { name, price, category_ids } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const addonRes = await client.query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING id', [name, price]);
        const addonId = addonRes.rows[0].id;
        if (category_ids && category_ids.length > 0) {
            for (const catId of category_ids) {
                await client.query('INSERT INTO addon_categories (addon_id, category_id) VALUES ($1, $2)', [addonId, catId]);
            }
        }
        await client.query('COMMIT');
        const newAddon = await client.query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id WHERE a.id = $1 GROUP BY a.id', [addonId]);
        res.status(201).json(newAddon.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd tworzenia dodatku.' });
    } finally {
        client.release();
    }
});
app.patch('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    const { name, price, category_ids } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE addons SET name=$1, price=$2 WHERE id=$3', [name, price, req.params.id]);
        await client.query('DELETE FROM addon_categories WHERE addon_id = $1', [req.params.id]);
        if (category_ids && category_ids.length > 0) {
            for (const catId of category_ids) {
                await client.query('INSERT INTO addon_categories (addon_id, category_id) VALUES ($1, $2)', [req.params.id, catId]);
            }
        }
        await client.query('COMMIT');
        const updatedAddon = await client.query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id WHERE a.id = $1 GROUP BY a.id', [req.params.id]);
        res.json(updatedAddon.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji dodatku.' });
    } finally {
        client.release();
    }
});
app.delete('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM addons WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania dodatku.' }); }
});

// Packages
app.post('/api/admin/packages', authenticateAdmin, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const pkgRes = await client.query('INSERT INTO packages (name, description, price, category_id, is_published, rich_description, rich_description_image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [name, description, price, category_id, is_published, rich_description, rich_description_image_url]);
        const packageId = pkgRes.rows[0].id;
        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)', [packageId, addon.id]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ id: packageId, ...req.body });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd tworzenia pakietu.' });
    } finally {
        client.release();
    }
});
app.patch('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE packages SET name=$1, description=$2, price=$3, category_id=$4, is_published=$5, rich_description=$6, rich_description_image_url=$7 WHERE id=$8', [name, description, price, category_id, is_published, rich_description, rich_description_image_url, req.params.id]);
        await client.query('DELETE FROM package_addons WHERE package_id=$1', [req.params.id]);
        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)', [req.params.id, addon.id]);
            }
        }
        await client.query('COMMIT');
        res.json({ id: req.params.id, ...req.body });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji pakietu.' });
    } finally {
        client.release();
    }
});
app.delete('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM packages WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania pakietu.' }); }
});


// Admin Discounts
app.get('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania kodów.' }); }
});
app.post('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    const { code, type, value, usage_limit, expires_at } = req.body;
    try {
        const result = await getPool().query(
            'INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code.toUpperCase(), type, value, usage_limit, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd tworzenia kodu.' }); }
});
app.delete('/api/admin/discounts/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania kodu.' }); }
});

// Admin Stages
app.get('/api/admin/stages', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM production_stages ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania etapów.' }); }
});
app.post('/api/admin/stages', authenticateAdmin, async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await getPool().query('INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *', [name, description]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd tworzenia etapu.' }); }
});
app.delete('/api/admin/stages/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania etapu.' }); }
});

// Admin Booking Stages
app.get('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query(
            'SELECT bs.id, ps.name, bs.status FROM booking_stages bs JOIN production_stages ps ON bs.stage_id = ps.id WHERE bs.booking_id = $1 ORDER BY ps.id ASC',
            [req.params.bookingId]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania etapów rezerwacji.' }); }
});
app.post('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    const { stage_id } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2)', [req.params.bookingId, stage_id]);

        const bookingRes = await client.query('SELECT email, bride_name, groom_name FROM bookings WHERE id = $1', [req.params.bookingId]);
        const stageRes = await client.query('SELECT name FROM production_stages WHERE id = $1', [stage_id]);

        if (bookingRes.rowCount > 0 && stageRes.rowCount > 0) {
            const { email, bride_name, groom_name } = bookingRes.rows[0];
            const { name: stage_name } = stageRes.rows[0];
            const { senderName, fromEmail } = await getSenderDetails(client);
            
            await resend.emails.send({
                from: `${senderName} <${fromEmail}>`,
                to: email,
                subject: `Aktualizacja Twojego projektu: Nowy etap`,
                html: `<p>Cześć ${bride_name} i ${groom_name},</p><p>W Waszym projekcie pojawił się nowy etap: <strong>${stage_name}</strong>. Zalogujcie się do panelu klienta, aby zobaczyć szczegóły.</p><a href="https://${req.headers.host}/logowanie">Przejdź do panelu klienta</a>`
            });
        }
        await client.query('COMMIT');
        res.status(201).send();
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error adding stage to booking:", err);
        res.status(500).json({ message: 'Błąd dodawania etapu.' });
    } finally {
        client.release();
    }
});
app.patch('/api/admin/booking-stages/:id', authenticateAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await getPool().query('UPDATE booking_stages SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd aktualizacji statusu.' }); }
});
app.delete('/api/admin/booking-stages/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM booking_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania etapu.' }); }
});

// Admin Homepage Management
app.get('/api/admin/homepage/slides', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_slides ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania slajdów.' }); }
});

app.post('/api/admin/homepage/slides', authenticateAdmin, async (req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    try {
        const result = await getPool().query('INSERT INTO homepage_slides (image_url, title, subtitle, button_text, button_link) VALUES ($1, $2, $3, $4, $5) RETURNING *', [image_url, title, subtitle, button_text, button_link]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd tworzenia slajdu.' }); }
});

app.patch('/api/admin/homepage/slides/:id', authenticateAdmin, async (req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    try {
        const result = await getPool().query('UPDATE homepage_slides SET image_url=$1, title=$2, subtitle=$3, button_text=$4, button_link=$5 WHERE id=$6 RETURNING *', [image_url, title, subtitle, button_text, button_link, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd aktualizacji slajdu.' }); }
});

app.delete('/api/admin/homepage/slides/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const itemRes = await client.query('SELECT image_url FROM homepage_slides WHERE id = $1', [req.params.id]);
        if (itemRes.rowCount > 0 && itemRes.rows[0].image_url) {
            try { await del(itemRes.rows[0].image_url); } catch (blobError) { console.warn(`Blob deletion failed for ${itemRes.rows[0].image_url}:`, blobError.message); }
        }
        await client.query('DELETE FROM homepage_slides WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd usuwania slajdu.' });
    } finally {
        client.release();
    }
});

app.post('/api/admin/homepage/slides/order', authenticateAdmin, async (req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_slides SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Kolejność zaktualizowana.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zmiany kolejności.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/homepage/about', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')");
        const aboutData = result.rows.reduce((acc, row) => {
            acc[row.key.replace('about_us_', '')] = row.value;
            return acc;
        }, {});
        res.json(aboutData);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania sekcji O nas.' }); }
});

app.patch('/api/admin/homepage/about', authenticateAdmin, async (req, res) => {
    const { title, text, image_url } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query("INSERT INTO app_settings (key, value) VALUES ('about_us_title', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [title]);
        await client.query("INSERT INTO app_settings (key, value) VALUES ('about_us_text', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [text]);
        await client.query("INSERT INTO app_settings (key, value) VALUES ('about_us_image_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [image_url]);
        await client.query('COMMIT');
        res.json({ message: 'Sekcja O nas zaktualizowana.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji sekcji O nas.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/homepage/testimonials', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_testimonials ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania opinii.' }); }
});

app.post('/api/admin/homepage/testimonials', authenticateAdmin, async (req, res) => {
    const { author, content } = req.body;
    try {
        const result = await getPool().query('INSERT INTO homepage_testimonials (author, content) VALUES ($1, $2) RETURNING *', [author, content]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd tworzenia opinii.' }); }
});

app.patch('/api/admin/homepage/testimonials/:id', authenticateAdmin, async (req, res) => {
    const { author, content } = req.body;
    try {
        const result = await getPool().query('UPDATE homepage_testimonials SET author=$1, content=$2 WHERE id=$3 RETURNING *', [author, content, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd aktualizacji opinii.' }); }
});

app.delete('/api/admin/homepage/testimonials/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM homepage_testimonials WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania opinii.' }); }
});

app.get('/api/admin/homepage/instagram', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM homepage_instagram ORDER BY sort_order ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania postów z Instagrama.' }); }
});

app.post('/api/admin/homepage/instagram', authenticateAdmin, async (req, res) => {
    const { post_url, image_url, caption } = req.body;
    try {
        const result = await getPool().query('INSERT INTO homepage_instagram (post_url, image_url, caption) VALUES ($1, $2, $3) RETURNING *', [post_url, image_url, caption]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ message: 'Błąd dodawania posta.' }); }
});

app.delete('/api/admin/homepage/instagram/:id', authenticateAdmin, async (req, res) => {
     const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const itemRes = await client.query('SELECT image_url FROM homepage_instagram WHERE id = $1', [req.params.id]);
        if (itemRes.rowCount > 0 && itemRes.rows[0].image_url) {
            try { await del(itemRes.rows[0].image_url); } catch (blobError) { console.warn(`Blob deletion failed for ${itemRes.rows[0].image_url}:`, blobError.message); }
        }
        await client.query('DELETE FROM homepage_instagram WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd usuwania posta.' });
    } finally {
        client.release();
    }
});

app.post('/api/admin/homepage/instagram/order', authenticateAdmin, async (req, res) => {
    const { orderedIds } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE homepage_instagram SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Kolejność zaktualizowana.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zmiany kolejności.' });
    } finally {
        client.release();
    }
});

// Admin Questionnaire Management
app.get('/api/admin/questionnaires', authenticateAdmin, async (req, res) => {
    try {
        const templates = await getPool().query('SELECT * FROM questionnaire_templates');
        const questions = await getPool().query('SELECT * FROM questions ORDER BY sort_order');
        const templatesWithQuestions = templates.rows.map(t => ({
            ...t,
            questions: questions.rows.filter(q => q.template_id === t.id)
        }));
        res.json(templatesWithQuestions);
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania ankiet.' }); }
});
app.post('/api/admin/questionnaires', authenticateAdmin, async (req, res) => {
    const { title, is_default } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        if (is_default) {
            await client.query('UPDATE questionnaire_templates SET is_default = FALSE');
        }
        const result = await client.query('INSERT INTO questionnaire_templates (title, is_default) VALUES ($1, $2) RETURNING *', [title, is_default]);
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd tworzenia ankiety.' });
    } finally {
        client.release();
    }
});
app.patch('/api/admin/questionnaires/:id', authenticateAdmin, async (req, res) => {
    const { title, is_default } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        if (is_default) {
            await client.query('UPDATE questionnaire_templates SET is_default = FALSE');
        }
        const result = await client.query('UPDATE questionnaire_templates SET title=$1, is_default=$2 WHERE id=$3 RETURNING *', [title, is_default, req.params.id]);
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji ankiety.' });
    } finally {
        client.release();
    }
});
app.delete('/api/admin/questionnaires/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM questionnaire_templates WHERE id=$1', [req.params.id]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania ankiety.' }); }
});
app.post('/api/admin/questionnaires/:id/questions', authenticateAdmin, async (req, res) => {
    const { text, type, sort_order } = req.body;
    try {
        const result = await getPool().query('INSERT INTO questions (template_id, text, type, sort_order) VALUES ($1, $2, $3, $4) RETURNING *', [req.params.id, text, type, sort_order]);
        res.status(201).json(result.rows[0]);
    } catch(err) { res.status(500).json({ message: 'Błąd dodawania pytania.' }); }
});
app.patch('/api/admin/questions/:questionId', authenticateAdmin, async (req, res) => {
    const { text, type, sort_order } = req.body;
    try {
        const result = await getPool().query('UPDATE questions SET text=$1, type=$2, sort_order=$3 WHERE id=$4 RETURNING *', [text, type, sort_order, req.params.questionId]);
        res.json(result.rows[0]);
    } catch(err) { res.status(500).json({ message: 'Błąd aktualizacji pytania.' }); }
});
app.delete('/api/admin/questions/:questionId', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM questions WHERE id=$1', [req.params.questionId]);
        res.status(204).send();
    } catch(err) { res.status(500).json({ message: 'Błąd usuwania pytania.' }); }
});
app.get('/api/admin/bookings/:bookingId/questionnaire', authenticateAdmin, async (req, res) => {
    try {
        const responseRes = await getPool().query('SELECT * FROM questionnaire_responses WHERE booking_id = $1', [req.params.bookingId]);
        if(responseRes.rowCount === 0) return res.status(404).json({ message: 'Brak ankiety dla tej rezerwacji.' });
        
        const response = responseRes.rows[0];
        const templateRes = await getPool().query('SELECT * FROM questionnaire_templates WHERE id = $1', [response.template_id]);
        const questionsRes = await getPool().query('SELECT * FROM questions WHERE template_id = $1 ORDER BY sort_order', [response.template_id]);
        const answersRes = await getPool().query('SELECT * FROM answers WHERE response_id = $1', [response.id]);

        const answersMap = answersRes.rows.reduce((acc, ans) => {
            acc[ans.question_id] = ans.answer_text;
            return acc;
        }, {});
        
        res.json({
            response,
            template: templateRes.rows[0],
            questions: questionsRes.rows,
            answers: answersMap,
        });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania odpowiedzi.' });
    }
});

app.post('/api/admin/bookings/:bookingId/questionnaire', authenticateAdmin, async (req, res) => {
    const { bookingId } = req.params;
    const { template_id } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        // Deleting will cascade and remove answers.
        await client.query('DELETE FROM questionnaire_responses WHERE booking_id = $1', [bookingId]);
        // Insert the new one
        await client.query('INSERT INTO questionnaire_responses (booking_id, template_id, status) VALUES ($1, $2, $3)', [bookingId, template_id, 'pending']);
        await client.query('COMMIT');
        res.status(201).json({ message: 'Ankieta została przypisana.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error assigning questionnaire:', err);
        res.status(500).json({ message: 'Błąd przypisywania ankiety.' });
    } finally {
        client.release();
    }
});


// Final catch-all and export
app.all('/api/*', (req, res) => {
    res.status(404).send({ message: `API endpoint not found: ${req.method} ${req.path}` });
});

export default app;
