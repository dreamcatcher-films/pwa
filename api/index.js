
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

const runDbSetup = async () => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
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
        
        await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS couple_photo_url TEXT;');
        
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
                client.query("SELECT value FROM app_settings WHERE key IN ('about_us_title', 'about_us_text', 'about_us_image_url')"),
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
                    about_us_title: aboutSection.about_us_title,
                    about_us_text: aboutSection.about_us_text,
                    about_us_image_url: aboutSection.about_us_image_url
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
                client.query('SELECT a.*, array_agg(ac.category_id) as category_ids FROM addons a LEFT JOIN addon_categories ac ON a.id = ac.addon_id GROUP BY a.id ORDER BY a.name ASC'),
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

        // Send email notification to admin
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
        await getPool().query(
            'INSERT INTO messages (booking_id, sender, content, is_read_by_admin) VALUES ($1, $2, $3, $4)',
            [req.user.bookingId, 'client', content, false]
        );
        res.status(201).json({ message: 'Wiadomość wysłana.' });
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

// --- ADMIN-AUTHENTICATED ROUTES (add more here) ---

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

// Add other admin routes here...

// --- CATCH-ALL ---
app.use((req, res) => {
    res.status(404).json({ message: `Cannot ${req.method} ${req.path}` });
});

export default app;
