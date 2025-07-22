
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
             const tables = ['messages', 'booking_stages', 'bookings', 'homepage_instagram', 'homepage_testimonials', 'homepage_slides', 'package_addons', 'addon_categories', 'packages', 'categories', 'app_settings', 'contact_messages', 'production_stages', 'discount_codes', 'addons', 'galleries', 'availability', 'admins', 'access_keys'];
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
            CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, access_key VARCHAR(4) REFERENCES access_keys(key), client_id VARCHAR(4) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, package_name VARCHAR(255) NOT NULL, total_price NUMERIC(10, 2) NOT NULL, selected_items TEXT[], bride_name VARCHAR(255) NOT NULL, groom_name VARCHAR(255) NOT NULL, wedding_date DATE NOT NULL, bride_address TEXT, groom_address TEXT, church_location TEXT, venue_location TEXT, schedule TEXT, email VARCHAR(255) NOT NULL, phone_number VARCHAR(255), additional_info TEXT, discount_code VARCHAR(255), payment_status VARCHAR(50) DEFAULT 'pending', amount_paid NUMERIC(10, 2) DEFAULT 0.00, couple_photo_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS booking_stages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, stage_id INTEGER REFERENCES production_stages(id), status VARCHAR(50) DEFAULT 'pending', completed_at TIMESTAMP WITH TIME ZONE);
            CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, sender VARCHAR(50) NOT NULL, content TEXT, attachment_url TEXT, attachment_type VARCHAR(100), is_read_by_admin BOOLEAN DEFAULT FALSE, is_read_by_client BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
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
        console.error('Error validating access key:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/validate-discount', async (req, res) => {
    const { code } = req.body;
    try {
        const result = await getPool().query('SELECT * FROM discount_codes WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW()) AND (usage_limit IS NULL OR times_used < usage_limit)', [code]);
        if (result.rowCount > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Nieprawidłowy lub nieważny kod rabatowy.' });
        }
    } catch (error) {
        console.error('Error validating discount code:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

const generateUniqueFourDigitId = async (client) => {
    let id;
    let isUnique = false;
    while (!isUnique) {
        id = Math.floor(1000 + Math.random() * 9000).toString();
        const res = await client.query('SELECT 1 FROM bookings WHERE client_id = $1', [id]);
        if (res.rowCount === 0) {
            isUnique = true;
        }
    }
    return id;
};

app.post('/api/bookings', async (req, res) => {
    const { accessKey, password, ...bookingData } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
        const keyRes = await client.query('SELECT 1 FROM access_keys WHERE key = $1', [accessKey]);
        if (keyRes.rowCount === 0) {
            return res.status(403).json({ message: 'Nieprawidłowy klucz dostępu.' });
        }

        const clientId = await generateUniqueFourDigitId(client);
        const passwordHash = await bcrypt.hash(password, 10);
        
        if (bookingData.discountCode) {
            await client.query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [bookingData.discountCode]);
        }

        const bookingRes = await client.query(
            `INSERT INTO bookings (access_key, client_id, password_hash, package_name, total_price, selected_items, bride_name, groom_name, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, email, phone_number, additional_info, discount_code) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
            [accessKey, clientId, passwordHash, bookingData.packageName, bookingData.totalPrice, bookingData.selectedItems, bookingData.brideName, bookingData.groomName, bookingData.weddingDate, bookingData.brideAddress, bookingData.groomAddress, bookingData.churchLocation, bookingData.venueLocation, bookingData.schedule, bookingData.email, bookingData.phoneNumber, bookingData.additionalInfo, bookingData.discountCode]
        );

        const bookingId = bookingRes.rows[0].id;
        
        await client.query('DELETE FROM access_keys WHERE key = $1', [accessKey]);
        
        await client.query(
            'INSERT INTO availability (title, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5)',
            [`Rezerwacja: ${bookingData.brideName} & ${bookingData.groomName}`, bookingData.weddingDate, bookingData.weddingDate, true, { type: 'booking', bookingId }]
        );

        await client.query('COMMIT');
        res.status(201).json({ bookingId, clientId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Błąd tworzenia rezerwacji.' });
    } finally {
        client.release();
    }
});


app.post('/api/contact', async (req, res) => {
    const { firstName, lastName, email, phone, subject, message } = req.body;
    try {
        await getPool().query(
            'INSERT INTO contact_messages (first_name, last_name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5, $6)',
            [firstName, lastName, email, phone, subject, message]
        );

        const adminSettings = await getPool().query("SELECT value FROM app_settings WHERE key = 'notification_email'");
        const adminEmail = adminSettings.rows[0]?.value;

        if (adminEmail) {
            await resend.emails.send({
                from: 'Dreamcatcher App <no-reply@dreamcatcherfilm.com>',
                to: adminEmail,
                subject: `Nowe zapytanie: ${subject}`,
                html: `<p>Otrzymałeś nową wiadomość od <strong>${firstName} ${lastName}</strong> (${email}).</p><p><strong>Treść:</strong></p><p>${message}</p>`
            });
        }

        res.status(201).json({ message: 'Wiadomość wysłana pomyślnie.' });
    } catch (error) {
        console.error('Error saving contact message:', error);
        res.status(500).json({ message: 'Błąd wysyłania wiadomości.' });
    }
});


// --- AUTH ROUTES ---

app.post('/api/login', async (req, res) => {
    const { clientId, password } = req.body;
    try {
        const result = await getPool().query('SELECT id, password_hash FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rowCount === 0) {
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
        console.error('Client login error:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await getPool().query('SELECT id, password_hash FROM admins WHERE email = $1', [email]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        const admin = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło.' });
        }
        const token = jwt.sign({ adminId: admin.id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- CLIENT-AUTHENTICATED ROUTES ---

app.get('/api/my-booking', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.user.bookingId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching my-booking:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/my-booking', authenticateClient, async (req, res) => {
    const { bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
    try {
        await getPool().query(
            'UPDATE bookings SET bride_address = $1, groom_address = $2, church_location = $3, venue_location = $4, schedule = $5, additional_info = $6 WHERE id = $7',
            [bride_address, groom_address, church_location, venue_location, schedule, additional_info, req.user.bookingId]
        );
        res.json({ message: 'Dane zaktualizowane.' });
    } catch (error) {
        console.error('Error updating my-booking:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/my-booking/photo', authenticateClient, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || `photo-${req.user.bookingId}.jpg`;
    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ message: 'Brak pliku do wysłania.' });
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

app.get('/api/booking-stages', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query(`
            SELECT bs.id, ps.name, ps.description, bs.status, bs.completed_at 
            FROM booking_stages bs
            JOIN production_stages ps ON bs.stage_id = ps.id
            WHERE bs.booking_id = $1
            ORDER BY ps.id ASC
        `, [req.user.bookingId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching booking stages:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/booking-stages/:stageId/approve', authenticateClient, async (req, res) => {
    const { stageId } = req.params;
    try {
        await getPool().query("UPDATE booking_stages SET status = 'completed', completed_at = NOW() WHERE id = $1 AND booking_id = $2 AND status = 'awaiting_approval'", [stageId, req.user.bookingId]);
        res.json({ message: 'Etap zatwierdzony.' });
    } catch (error) {
        console.error('Error approving stage:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/messages', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.user.bookingId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.post('/api/messages', authenticateClient, async (req, res) => {
    const { content } = req.body;
    try {
        const result = await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, is_read_by_admin) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.bookingId, 'client', content, false]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/messages/unread-count', authenticateClient, async (req, res) => {
    try {
        const result = await getPool().query("SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = 'admin' AND is_read_by_client = FALSE", [req.user.bookingId]);
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.patch('/api/messages/mark-as-read', authenticateClient, async (req, res) => {
    try {
        await getPool().query("UPDATE messages SET is_read_by_client = TRUE WHERE booking_id = $1 AND sender = 'admin'", [req.user.bookingId]);
        res.status(204).send();
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- ADMIN-AUTHENTICATED ROUTES ---

app.get('/api/admin/notifications/count', authenticateAdmin, async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const clientMessages = await client.query("SELECT COUNT(DISTINCT booking_id) FROM messages WHERE sender = 'client' AND is_read_by_admin = FALSE");
            const inboxMessages = await client.query("SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE");
            const totalCount = parseInt(clientMessages.rows[0].count, 10) + parseInt(inboxMessages.rows[0].count, 10);
            res.json({ count: totalCount });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

app.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
     try {
        const client = await getPool().connect();
        try {
            const clientMessagesRes = await client.query(`
                SELECT DISTINCT ON (m.booking_id) m.booking_id, b.bride_name || ' & ' || b.groom_name AS sender_name, m.content AS preview, 
                (SELECT COUNT(*) FROM messages WHERE booking_id = m.booking_id AND sender = 'client' AND is_read_by_admin = FALSE) as unread_count
                FROM messages m
                JOIN bookings b ON m.booking_id = b.id
                WHERE m.sender = 'client' AND m.is_read_by_admin = FALSE
                ORDER BY m.booking_id, m.created_at DESC;
            `);
             const inboxMessagesRes = await client.query(`
                SELECT id as message_id, first_name || ' ' || last_name AS sender_name, message as preview
                FROM contact_messages
                WHERE is_read = FALSE
                ORDER BY created_at DESC;
            `);

            const notifications = [
                ...clientMessagesRes.rows.map(r => ({ ...r, type: 'client_message' })),
                ...inboxMessagesRes.rows.map(r => ({ ...r, type: 'inbox_message' }))
            ];
            res.json(notifications);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});


app.get('/api/admin/inbox', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching inbox messages.' });
    }
});

app.patch('/api/admin/inbox/:id/read', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error updating message status.' });
    }
});

app.delete('/api/admin/inbox/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting message.' });
    }
});

app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at FROM bookings ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching bookings.' });
    }
});

app.get('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Booking not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching booking details.' });
    }
});

app.patch('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
     try {
        const { id } = req.params;
        const { bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info } = req.body;
        const result = await getPool().query(
            `UPDATE bookings SET bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5, bride_address = $6, groom_address = $7, church_location = $8, venue_location = $9, schedule = $10, additional_info = $11 WHERE id = $12 RETURNING *`,
            [bride_name, groom_name, email, phone_number, wedding_date, bride_address, groom_address, church_location, venue_location, schedule, additional_info, id]
        );
        res.json({ message: 'Zaktualizowano pomyślnie.', booking: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Błąd aktualizacji rezerwacji.' });
    }
});

app.delete('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM availability WHERE resource->>\'type\' = \'booking\' AND (resource->>\'bookingId\')::int = $1', [req.params.id]);
        await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error deleting booking.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/bookings/:id/payment', authenticateAdmin, async (req, res) => {
    try {
        const { payment_status, amount_paid } = req.body;
        const result = await getPool().query('UPDATE bookings SET payment_status = $1, amount_paid = $2 WHERE id = $3 RETURNING payment_status, amount_paid', [payment_status, amount_paid, req.params.id]);
        res.json({ message: 'Płatność zaktualizowana.', payment_details: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Błąd aktualizacji płatności.' });
    }
});

app.post('/api/admin/bookings/:bookingId/resend-credentials', authenticateAdmin, async (req, res) => {
    const { bookingId } = req.params;
    try {
        const result = await getPool().query('SELECT email, client_id, bride_name, groom_name FROM bookings WHERE id = $1', [bookingId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });

        const { email, client_id, bride_name, groom_name } = result.rows[0];

        await resend.emails.send({
            from: 'Dreamcatcher Films <no-reply@dreamcatcherfilm.com>',
            to: email,
            subject: 'Twoje dane do Panelu Klienta Dreamcatcher Film',
            html: `
                <h1>Cześć ${bride_name} i ${groom_name}!</h1>
                <p>Oto Twoje dane do logowania do naszego Panelu Klienta:</p>
                <p><strong>Numer klienta:</strong> ${client_id}</p>
                <p><strong>Hasło:</strong> [ustawione podczas rezerwacji]</p>
                <p>Możesz zalogować się <a href="${req.protocol}://${req.get('host')}/logowanie">tutaj</a>.</p>
                <p>Pozdrawiamy,<br>Zespół Dreamcatcher Film</p>
            `
        });
        res.json({ message: 'E-mail z danymi został wysłany.' });
    } catch (error) {
        console.error('Error resending credentials:', error);
        res.status(500).json({ message: 'Błąd wysyłania e-maila.' });
    }
});


app.get('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching access keys.' });
    }
});

app.post('/api/admin/access-keys', authenticateAdmin, async (req, res) => {
     const { client_name } = req.body;
     const client = await getPool().connect();
    try {
        let key;
        let isUnique = false;
        while (!isUnique) {
            key = Math.floor(1000 + Math.random() * 9000).toString();
            const res = await client.query('SELECT 1 FROM access_keys WHERE key = $1', [key]);
            if (res.rowCount === 0) isUnique = true;
        }
        const result = await client.query('INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *', [key, client_name]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error creating access key.' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/access-keys/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM access_keys WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting access key.' });
    }
});

app.get('/api/admin/availability', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM availability');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching availability.' });
    }
});

app.post('/api/admin/availability', authenticateAdmin, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await getPool().query('INSERT INTO availability (title, description, start_time, end_time, is_all_day, resource) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [title, description, start_time, end_time, is_all_day, { type: 'event' }]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error creating event.' });
    }
});

app.patch('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    try {
        const { title, description, start_time, end_time, is_all_day } = req.body;
        const result = await getPool().query('UPDATE availability SET title = $1, description = $2, start_time = $3, end_time = $4, is_all_day = $5 WHERE id = $6 AND (resource->>\'type\') = \'event\' RETURNING *',
            [title, description, start_time, end_time, is_all_day, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error updating event.' });
    }
});

app.delete('/api/admin/availability/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM availability WHERE id = $1 AND (resource->>\'type\') = \'event\'', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting event.' });
    }
});

app.get('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching gallery items.' });
    }
});

app.post('/api/admin/galleries/upload', authenticateAdmin, rawBodyParser, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'gallery-image.jpg';
        const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: 'Error uploading gallery image.' });
    }
});

app.post('/api/admin/galleries', authenticateAdmin, async (req, res) => {
    try {
        const { title, description, image_url } = req.body;
        const result = await getPool().query('INSERT INTO galleries (title, description, image_url) VALUES ($1, $2, $3) RETURNING *', [title, description, image_url]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error creating gallery item.' });
    }
});

app.delete('/api/admin/galleries/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM galleries WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting gallery item.' });
    }
});

app.get('/api/admin/stages', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM production_stages ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stages.' });
    }
});

app.post('/api/admin/stages', authenticateAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await getPool().query('INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *', [name, description]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error creating stage.' });
    }
});

app.delete('/api/admin/stages/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM production_stages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting stage.' });
    }
});

app.post('/api/admin/setup-database', authenticateAdmin, async(req, res) => {
    try {
        await initialize(false); // run setup without dropping tables
        res.status(200).json({ message: "Schemat bazy danych został pomyślnie zainicjowany/zaktualizowany." });
    } catch (error) {
        console.error("Manual DB setup failed:", error);
        res.status(500).json({ message: "Wystąpił błąd podczas inicjalizacji bazy danych." });
    }
});

app.post('/api/admin/reset-database', authenticateAdmin, async(req, res) => {
    try {
        await initialize(true); // run setup WITH dropping tables
        res.status(200).json({ message: "Baza danych została pomyślnie zresetowana. Utworzono domyślnego administratora." });
    } catch (error) {
        console.error("Manual DB reset failed:", error);
        res.status(500).json({ message: "Wystąpił błąd podczas resetowania bazy danych." });
    }
});

app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const [adminRes, settingsRes] = await Promise.all([
             getPool().query('SELECT email FROM admins WHERE id = $1', [req.admin.adminId]),
             getPool().query("SELECT value FROM app_settings WHERE key = 'notification_email'")
        ]);
        res.json({
            loginEmail: adminRes.rows[0]?.email,
            notificationEmail: settingsRes.rows[0]?.value,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin settings.' });
    }
});

app.patch('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        await getPool().query("INSERT INTO app_settings (key, value) VALUES ('notification_email', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [email]);
        res.json({ message: 'Ustawienia zapisane.' });
    } catch (error) {
        res.status(500).json({ message: 'Error saving admin settings.' });
    }
});

app.get('/api/admin/contact-settings', authenticateAdmin, async(req, res) => {
    try {
        const result = await getPool().query("SELECT key, value FROM app_settings WHERE key LIKE 'contact_%' OR key = 'google_maps_api_key'");
        const settings = result.rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: "Błąd pobierania ustawień" });
    }
});

app.patch('/api/admin/contact-settings', authenticateAdmin, async(req, res) => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(req.body)) {
            await client.query("INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, value]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Ustawienia zapisane.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: "Błąd zapisu ustawień" });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/credentials', authenticateAdmin, async (req, res) => {
    const { currentPassword, newEmail, newPassword } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const adminRes = await client.query('SELECT * FROM admins WHERE id = $1', [req.admin.adminId]);
        if (adminRes.rowCount === 0) return res.status(404).json({ message: 'Admin not found.' });

        const admin = adminRes.rows[0];
        const isPasswordValid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isPasswordValid) return res.status(401).json({ message: 'Bieżące hasło jest nieprawidłowe.' });

        if (newEmail && newEmail !== admin.email) {
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
        res.status(500).json({ message: 'Błąd zapisu danych logowania.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Błąd pobierania kodów rabatowych.' });
    }
});

app.post('/api/admin/discounts', authenticateAdmin, async (req, res) => {
    try {
        const { code, type, value, usage_limit, expires_at } = req.body;
        const result = await getPool().query('INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code, type, value, usage_limit, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Kod o tej nazwie już istnieje.' });
        res.status(500).json({ message: 'Błąd tworzenia kodu rabatowego.' });
    }
});

app.delete('/api/admin/discounts/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania kodu rabatowego.' });
    }
});

// --- NEWLY ADDED ENDPOINTS ---

// Offer Data (Packages, Addons, Categories) for Admin
app.get('/api/admin/offer-data', authenticateAdmin, async (req, res) => {
    try {
        const client = await getPool().connect();
        try {
            const [packagesRes, addonsRes, categoriesRes, packageAddonsRes, addonCategoriesRes] = await Promise.all([
                client.query('SELECT p.*, c.name as category_name FROM packages p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.name ASC'),
                client.query('SELECT * FROM addons ORDER BY name ASC'),
                client.query('SELECT * FROM categories ORDER BY name ASC'),
                client.query('SELECT * FROM package_addons'),
                client.query('SELECT * FROM addon_categories')
            ]);

            const packages = packagesRes.rows.map(p => ({
                ...p,
                addons: packageAddonsRes.rows.filter(pa => pa.package_id === p.id).map(pa => ({ id: pa.addon_id }))
            }));
            const addons = addonsRes.rows.map(a => ({
                ...a,
                category_ids: addonCategoriesRes.rows.filter(ac => ac.addon_id === a.id).map(ac => ac.category_id)
            }));
            
            res.json({ packages, addons, categories: categoriesRes.rows });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching offer data for admin:', error);
        res.status(500).json({ message: 'Błąd pobierania danych oferty.' });
    }
});

// Categories CRUD
app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, icon_name } = req.body;
        const result = await getPool().query('INSERT INTO categories (name, description, icon_name) VALUES ($1, $2, $3) RETURNING *', [name, description, icon_name]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Błąd tworzenia kategorii.' });
    }
});
app.patch('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, icon_name } = req.body;
        const result = await getPool().query('UPDATE categories SET name = $1, description = $2, icon_name = $3 WHERE id = $4 RETURNING *', [name, description, icon_name, req.params.id]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Błąd aktualizacji kategorii.' });
    }
});
app.delete('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM categories WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania kategorii.' });
    }
});

// Addons CRUD
app.post('/api/admin/addons', authenticateAdmin, async (req, res) => {
    const { name, price, category_ids = [] } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const addonRes = await client.query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING id', [name, price]);
        const addonId = addonRes.rows[0].id;
        if (category_ids.length > 0) {
            for (const categoryId of category_ids) {
                await client.query('INSERT INTO addon_categories (addon_id, category_id) VALUES ($1, $2)', [addonId, categoryId]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ id: addonId, name, price, category_ids });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd tworzenia dodatku.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    const { name, price, category_ids = [] } = req.body;
    const addonId = req.params.id;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE addons SET name = $1, price = $2 WHERE id = $3', [name, price, addonId]);
        await client.query('DELETE FROM addon_categories WHERE addon_id = $1', [addonId]);
        if (category_ids.length > 0) {
            for (const categoryId of category_ids) {
                await client.query('INSERT INTO addon_categories (addon_id, category_id) VALUES ($1, $2)', [addonId, categoryId]);
            }
        }
        await client.query('COMMIT');
        res.json({ id: addonId, name, price, category_ids });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji dodatku.' });
    } finally {
        client.release();
    }
});
app.delete('/api/admin/addons/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM addons WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania dodatku.' });
    }
});

// Packages CRUD
app.post('/api/admin/packages/upload-image', authenticateAdmin, rawBodyParser, async (req, res) => {
    try {
        const filename = req.headers['x-vercel-filename'] || 'package-image.jpg';
        const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
        res.status(200).json(blob);
    } catch (error) {
        res.status(500).json({ message: 'Error uploading package image.' });
    }
});
app.post('/api/admin/packages', authenticateAdmin, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons = [] } = req.body;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const pkgRes = await client.query('INSERT INTO packages (name, description, price, category_id, is_published, rich_description, rich_description_image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [name, description, price, category_id, is_published, rich_description, rich_description_image_url]);
        const packageId = pkgRes.rows[0].id;
        for (const addon of addons) {
            await client.query('INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)', [packageId, addon.id]);
        }
        await client.query('COMMIT');
        res.status(201).json({ id: packageId, ...req.body });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd tworzenia pakietu.' });
    } finally {
        client.release();
    }
});
app.patch('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    const { name, description, price, category_id, is_published, rich_description, rich_description_image_url, addons = [] } = req.body;
    const packageId = req.params.id;
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE packages SET name=$1, description=$2, price=$3, category_id=$4, is_published=$5, rich_description=$6, rich_description_image_url=$7 WHERE id=$8', [name, description, price, category_id, is_published, rich_description, rich_description_image_url, packageId]);
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [packageId]);
        for (const addon of addons) {
            await client.query('INSERT INTO package_addons (package_id, addon_id) VALUES ($1, $2)', [packageId, addon.id]);
        }
        await client.query('COMMIT');
        res.json({ id: packageId, ...req.body });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd aktualizacji pakietu.' });
    } finally {
        client.release();
    }
});
app.delete('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    try {
        await getPool().query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Błąd usuwania pakietu.' });
    }
});


// Homepage Management
app.get('/api/admin/homepage/slides', authenticateAdmin, async (req, res) => {
    const result = await getPool().query('SELECT * FROM homepage_slides ORDER BY sort_order ASC');
    res.json(result.rows);
});
app.post('/api/admin/homepage/slides/upload', authenticateAdmin, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || 'slide.jpg';
    const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
    res.status(200).json(blob);
});
app.post('/api/admin/homepage/slides', authenticateAdmin, async (req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    const result = await getPool().query('INSERT INTO homepage_slides (image_url, title, subtitle, button_text, button_link) VALUES ($1, $2, $3, $4, $5) RETURNING *', [image_url, title, subtitle, button_text, button_link]);
    res.status(201).json(result.rows[0]);
});
app.patch('/api/admin/homepage/slides/:id', authenticateAdmin, async (req, res) => {
    const { image_url, title, subtitle, button_text, button_link } = req.body;
    const result = await getPool().query('UPDATE homepage_slides SET image_url=$1, title=$2, subtitle=$3, button_text=$4, button_link=$5 WHERE id=$6 RETURNING *', [image_url, title, subtitle, button_text, button_link, req.params.id]);
    res.json(result.rows[0]);
});
app.delete('/api/admin/homepage/slides/:id', authenticateAdmin, async (req, res) => {
    await getPool().query('DELETE FROM homepage_slides WHERE id = $1', [req.params.id]);
    res.status(204).send();
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
        res.status(200).json({ message: 'Kolejność zapisana.' });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zapisu kolejności.' });
    } finally {
        client.release();
    }
});


app.get('/api/admin/homepage/about', authenticateAdmin, async (req, res) => {
    const result = await getPool().query("SELECT value, key FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')");
    const about = result.rows.reduce((acc, row) => ({ ...acc, [row.key.replace('about_us_', '')]: row.value }), {});
    res.json(about);
});
app.post('/api/admin/homepage/about/upload', authenticateAdmin, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || 'about.jpg';
    const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
    res.status(200).json(blob);
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
        res.json({ message: 'Zapisano pomyślnie.' });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zapisu sekcji "O nas".' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/homepage/testimonials', authenticateAdmin, async (req, res) => {
    const result = await getPool().query('SELECT * FROM homepage_testimonials ORDER BY id ASC');
    res.json(result.rows);
});
app.post('/api/admin/homepage/testimonials', authenticateAdmin, async (req, res) => {
    const { author, content } = req.body;
    const result = await getPool().query('INSERT INTO homepage_testimonials (author, content) VALUES ($1, $2) RETURNING *', [author, content]);
    res.status(201).json(result.rows[0]);
});
app.patch('/api/admin/homepage/testimonials/:id', authenticateAdmin, async (req, res) => {
    const { author, content } = req.body;
    const result = await getPool().query('UPDATE homepage_testimonials SET author=$1, content=$2 WHERE id=$3 RETURNING *', [author, content, req.params.id]);
    res.json(result.rows[0]);
});
app.delete('/api/admin/homepage/testimonials/:id', authenticateAdmin, async (req, res) => {
    await getPool().query('DELETE FROM homepage_testimonials WHERE id = $1', [req.params.id]);
    res.status(204).send();
});

app.get('/api/admin/homepage/instagram', authenticateAdmin, async (req, res) => {
    const result = await getPool().query('SELECT * FROM homepage_instagram ORDER BY sort_order ASC');
    res.json(result.rows);
});
app.post('/api/admin/homepage/instagram/upload', authenticateAdmin, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || 'instagram.jpg';
    const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
    res.status(200).json(blob);
});
app.post('/api/admin/homepage/instagram', authenticateAdmin, async (req, res) => {
    const { post_url, image_url, caption } = req.body;
    const result = await getPool().query('INSERT INTO homepage_instagram (post_url, image_url, caption) VALUES ($1, $2, $3) RETURNING *', [post_url, image_url, caption]);
    res.status(201).json(result.rows[0]);
});
app.delete('/api/admin/homepage/instagram/:id', authenticateAdmin, async (req, res) => {
    await getPool().query('DELETE FROM homepage_instagram WHERE id = $1', [req.params.id]);
    res.status(204).send();
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
        res.status(200).json({ message: 'Kolejność zapisana.' });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Błąd zapisu kolejności.' });
    } finally {
        client.release();
    }
});


app.get('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    const result = await getPool().query('SELECT bs.id, ps.name, bs.status FROM booking_stages bs JOIN production_stages ps ON bs.stage_id = ps.id WHERE bs.booking_id = $1 ORDER BY ps.id', [req.params.bookingId]);
    res.json(result.rows);
});
app.post('/api/admin/booking-stages/:bookingId', authenticateAdmin, async (req, res) => {
    const { stage_id } = req.body;
    const result = await getPool().query('INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2) RETURNING *', [req.params.bookingId, stage_id]);
    res.status(201).json(result.rows[0]);
});
app.patch('/api/admin/booking-stages/:stageId', authenticateAdmin, async (req, res) => {
    const { status } = req.body;
    await getPool().query('UPDATE booking_stages SET status = $1 WHERE id = $2', [status, req.params.stageId]);
    res.status(200).json({ message: 'Status zaktualizowany.' });
});
app.delete('/api/admin/booking-stages/:stageId', authenticateAdmin, async (req, res) => {
    await getPool().query('DELETE FROM booking_stages WHERE id = $1', [req.params.stageId]);
    res.status(204).send();
});

app.get('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    const result = await getPool().query('SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at ASC', [req.params.bookingId]);
    res.json(result.rows);
});
app.post('/api/admin/messages/upload', authenticateAdmin, rawBodyParser, async (req, res) => {
    const filename = req.headers['x-vercel-filename'] || 'attachment';
    const blob = await put(filename, req.body, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN, contentType: req.headers['content-type'] });
    res.status(200).json(blob);
});
app.post('/api/admin/messages/:bookingId', authenticateAdmin, async (req, res) => {
    const { content, attachment_url, attachment_type } = req.body;
    const result = await getPool().query(
        'INSERT INTO messages (booking_id, sender, content, attachment_url, attachment_type, is_read_by_client) VALUES ($1, \'admin\', $2, $3, $4, FALSE) RETURNING *',
        [req.params.bookingId, content, attachment_url, attachment_type]
    );
    res.status(201).json(result.rows[0]);
});
app.get('/api/admin/bookings/:bookingId/unread-count', authenticateAdmin, async (req, res) => {
    const result = await getPool().query("SELECT COUNT(*) FROM messages WHERE booking_id = $1 AND sender = 'client' AND is_read_by_admin = FALSE", [req.params.bookingId]);
    res.json({ count: parseInt(result.rows[0].count, 10) });
});
app.patch('/api/admin/bookings/:bookingId/messages/mark-as-read', authenticateAdmin, async (req, res) => {
    await getPool().query("UPDATE messages SET is_read_by_admin = TRUE WHERE booking_id = $1 AND sender = 'client'", [req.params.bookingId]);
    res.status(204).send();
});

// --- CATCH-ALL ---
app.use((req, res) => {
    res.status(404).json({ message: `Cannot ${req.method} ${req.path}` });
});

export default app;
