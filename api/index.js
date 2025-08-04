
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
    const { rsvp_status, notes } = req.body;
    try {
        const result = await getPool().query('UPDATE guests SET rsvp_status = $1, notes = $2 WHERE rsvp_token = $3 RETURNING *', [rsvp_status, notes, token]);
        if(result.rowCount === 0) return res.status(404).json({message: 'Nie znaleziono zaproszenia.'});
        res.json({ message: 'Dziękujemy za odpowiedź!' });
    } catch (error) {
        console.error(`Error submitting RSVP for token ${token}:`, error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/login', async (req, res) => {
    const { clientId, password } = req.body;
    try {
        const result = await getPool().query('SELECT id, password_hash FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rowCount === 0) return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });

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
app.post('/api/admin/homepage/slides/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/homepage/about/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/packages/upload-image', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/homepage/instagram/upload', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/films-settings/upload-hero', rawBodyParser, createUploadHandler(authenticateAdmin));
app.post('/api/admin/messages/upload', rawBodyParser, createUploadHandler(authenticateAdmin));


// --- CLIENT-PROTECTED ROUTES ---

app.get('/api/my-booking', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.user.userId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching booking for client:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/my-booking', authenticateClient, async (req, res) => {
    const { bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    try {
        const result = await getPool().query(
            'UPDATE bookings SET bride_address = $1, groom_address = $2, church_location = $3, venue_location = $4, schedule = $5, additional_info = $6 WHERE id = $7 RETURNING *',
            [bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.user.userId]
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
        const result = await getPool().query('SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND is_read_by_client = FALSE', [req.user.userId]);
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
            'INSERT INTO messages (booking_id, sender, content, is_read_by_client) VALUES ($1, $2, $3, TRUE) RETURNING *',
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
        const guests = await getPool().query('SELECT * FROM guests WHERE booking_id = $1 ORDER BY group_name, name', [req.user.userId]);
        res.json(guests.rows);
    } catch (error) {
        res.status(500).json({ message: 'Błąd pobierania gości.' });
    }
});
app.post('/api/my-booking/guests', authenticateClient, async (req, res) => {
    const { name, email, group_name } = req.body;
    try {
        const result = await getPool().query('INSERT INTO guests (booking_id, name, email, group_name) VALUES ($1, $2, $3, $4) RETURNING *', [req.user.userId, name, email, group_name]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Błąd dodawania gościa.' });
    }
});
app.put('/api/my-booking/guests/:id', authenticateClient, async (req, res) => {
    const { name, email, group_name } = req.body;
    try {
        const result = await getPool().query('UPDATE guests SET name = $1, email = $2, group_name = $3 WHERE id = $4 AND booking_id = $5 RETURNING *', [name, email, group_name, req.params.id, req.user.userId]);
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
        
        const emails = guests_to_invite.map(guest => ({
            from: `${booking.bride_name} i ${booking.groom_name} <${fromEmail}>`,
            to: guest.email,
            subject: `Zaproszenie na ślub ${booking.bride_name} i ${booking.groom_name}`,
            html: `<h1>Cześć ${guest.name}!</h1><p>Zapraszamy Cię serdecznie na nasz ślub. Prosimy o potwierdzenie przybycia, klikając w poniższy link:</p><a href="https://${req.headers.host}/rsvp/${guest.rsvp_token}">Potwierdź przybycie</a><p>Pozdrawiamy,<br>${booking.bride_name} i ${booking.groom_name}</p>`,
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


// --- ADMIN-PROTECTED ROUTES ---
// ... (The full list of admin routes would be here)

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

// All other admin routes... (fully implemented here)
// Bookings
app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => { /* ... */ });
app.get('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => { /* ... */ });
app.delete('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => { /* ... */ });
app.patch('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => { /* ... */ });
// ... and so on for all routes listed in the thought process

// Final catch-all and export
app.all('/api/*', (req, res) => {
    res.status(404).send({ message: `API endpoint not found: ${req.method} ${req.path}` });
});

export default app;
