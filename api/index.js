import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';

const { Pool } = pg;
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-for-dev';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'your-default-super-secret-admin-key-for-dev';

if (!process.env.DATABASE_URL) {
  throw new Error('FATAL ERROR: DATABASE_URL environment variable is not set.');
}

// --- Database Pool Configuration ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// --- Helper Functions ---
const generateUniqueClientId = async (client) => {
    let isUnique = false;
    let clientId;
    while (!isUnique) {
        clientId = Math.floor(1000 + Math.random() * 9000).toString();
        const res = await client.query('SELECT id FROM bookings WHERE client_id = $1', [clientId]);
        if (res.rowCount === 0) {
            isUnique = true;
        }
    }
    return clientId;
};

// --- Database Initialization ---
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Connected to the database. Initializing schema...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS access_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        client_name VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          client_id VARCHAR(4) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          access_key VARCHAR(255) NOT NULL,
          package_name VARCHAR(255),
          total_price NUMERIC(10, 2),
          selected_items JSONB,
          bride_name VARCHAR(255),
          groom_name VARCHAR(255),
          wedding_date DATE,
          bride_address TEXT,
          groom_address TEXT,
          locations TEXT,
          schedule TEXT,
          email VARCHAR(255) NOT NULL,
          phone_number VARCHAR(255) NOT NULL,
          additional_info TEXT,
          discount_code VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
     await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
        CREATE TABLE IF NOT EXISTS availability (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            start_time TIMESTAMP WITH TIME ZONE NOT NULL,
            end_time TIMESTAMP WITH TIME ZONE NOT NULL,
            is_all_day BOOLEAN DEFAULT FALSE,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS galleries (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // --- New Tables for Offer Management ---
    await client.query(`
        CREATE TABLE IF NOT EXISTS packages (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price NUMERIC(10, 2) NOT NULL
        );
    `);
     await client.query(`
        CREATE TABLE IF NOT EXISTS addons (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            price NUMERIC(10, 2) NOT NULL
        );
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS package_addons (
            package_id INT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
            addon_id INT NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
            is_locked BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (package_id, addon_id)
        );
    `);

    // Add a sample key if it doesn't exist for testing
    const resKeys = await client.query("SELECT * FROM access_keys WHERE key = '1234'");
    if (resKeys.rowCount === 0) {
      await client.query("INSERT INTO access_keys (key, client_name) VALUES ('1234', 'Test Client')");
    }
    
    // Create default admin user if none exists
    const resAdmins = await client.query("SELECT * FROM admins");
    if (resAdmins.rowCount === 0) {
        const adminEmail = 'admin@dreamcatcher.com';
        const adminPassword = 'admin' + Math.floor(1000 + Math.random() * 9000); // Generate a random password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(adminPassword, salt);
        await client.query("INSERT INTO admins (email, password_hash) VALUES ($1, $2)", [adminEmail, passwordHash]);
        console.log('============================================');
        console.log('CREATED DEFAULT ADMIN USER:');
        console.log(`Email: ${adminEmail}`);
        console.log(`Password: ${adminPassword}`);
        console.log('============================================');
    }

    // --- Migrate hardcoded offer to database ---
    const packagesCount = await client.query('SELECT COUNT(*) FROM packages');
    if (parseInt(packagesCount.rows[0].count, 10) === 0) {
        console.log('Migrating hardcoded offer to database...');
        const hardcodedAddons = [
            { id: 'pre_wedding', name: 'Sesja narzeczeńska', price: 600 },
            { id: 'drone', name: 'Ujęcia z drona', price: 400 },
            { id: 'social', name: 'Teledysk dla social media', price: 350 },
            { id: 'guest_interviews', name: 'Wywiady z gośćmi', price: 300 },
            { id: 'smoke_candles', name: 'Świece dymne', price: 150 },
            { id: 'film', name: 'Film kinowy', price: 0 }, // internal
            { id: 'photos', name: 'Reportaż zdjęciowy (cały dzień)', price: 0 }, // internal
        ];
        
        const addonMap = new Map();
        for (const addon of hardcodedAddons) {
            const res = await client.query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING id', [addon.name, addon.price]);
            addonMap.set(addon.id, res.rows[0].id);
        }
        
        const hardcodedPackages = [
            {
                id: 'gold', name: 'Pakiet Złoty', price: 4500, description: 'Najbardziej kompletny pakiet, aby stworzyć niezapomnianą pamiątkę.',
                included: [ { id: 'film', locked: true }, { id: 'photos', locked: true } ]
            },
            {
                id: 'silver', name: 'Pakiet Srebrny', price: 4500, description: 'Najpopularniejszy wybór zapewniający kompleksową relację.',
                included: [ { id: 'film', locked: true }, { id: 'photos', locked: true }, { id: 'drone', locked: false } ]
            },
             {
                id: 'bronze', name: 'Pakiet Brązowy', price: 3200, description: 'Piękny film kinowy, który uchwyci magię Waszego dnia.',
                included: [ { id: 'film', locked: true } ]
            },
        ];

        for (const pkg of hardcodedPackages) {
            const res = await client.query('INSERT INTO packages (name, description, price) VALUES ($1, $2, $3) RETURNING id', [pkg.name, pkg.description, pkg.price]);
            const packageId = res.rows[0].id;
            for (const item of pkg.included) {
                const addonId = addonMap.get(item.id);
                if (addonId) {
                    await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [packageId, addonId, item.locked]);
                }
            }
        }
        console.log('Offer migration complete.');
    }


    // Add a sample booking for testing if it doesn't exist
    const testClientId = '9999';
    const resTestBooking = await client.query("SELECT * FROM bookings WHERE client_id = $1", [testClientId]);
    if (resTestBooking.rowCount === 0) {
        const testPassword = 'password123';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(testPassword, salt);
        
        const query = `
            INSERT INTO bookings (
                client_id, password_hash, access_key, package_name, total_price, selected_items,
                bride_name, groom_name, wedding_date, bride_address, groom_address, locations, schedule, 
                email, phone_number, additional_info, discount_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `;
        const values = [
            testClientId, passwordHash, '1234', 'Pakiet Złoty', 5500.00, 
            JSON.stringify(["film", "photos", "drone", "pre_wedding"]),
            'Janina Testowa', 'Krzysztof Przykładowy', '2025-07-26', 
            'ul. Testowa 1, 00-001 Warszawa', 'ul. Przykładowa 2, 00-002 Kraków',
            'Kościół: Katedra Polowa WP, Sala: Zamek Ujazdowski', 
            '14:00 - Ceremonia\n16:00 - Wesele', 
            'test@example.com', '555-444-333',
            'Prosimy o ujęcia detali i dużo spontanicznych kadrów.', null
        ];

        await client.query(query, values);
        console.log('============================================');
        console.log('CREATED A TEST BOOKING:');
        console.log(`Client ID: ${testClientId}`);
        console.log(`Password: ${testPassword}`);
        console.log('============================================');
    }
    
  } catch (err) {
    console.error('Database initialization error!', err.stack);
  } finally {
    client.release();
  }
};

initializeDatabase().catch(console.error);


// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' })); 

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authenticateAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, ADMIN_JWT_SECRET, (err, admin) => {
        if (err) return res.sendStatus(403);
        req.admin = admin;
        next();
    });
};


// --- API Endpoints ---

// --- DIAGNOSTIC Endpoint ---
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      res.status(200).json({ status: 'ok', message: 'Database connection successful.' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({ status: 'error', message: 'Database connection failed.', error: err.message });
  }
});

// --- PUBLIC Endpoints ---
app.get('/api/packages', async (req, res) => {
    try {
        const packagesRes = await pool.query('SELECT * FROM packages ORDER BY price DESC');
        const addonsRes = await pool.query('SELECT * FROM addons');
        const relationsRes = await pool.query('SELECT * FROM package_addons');
        
        const addonsMap = new Map(addonsRes.rows.map(a => [a.id, a]));
        
        const packages = packagesRes.rows.map(pkg => {
            const included = relationsRes.rows
                .filter(r => r.package_id === pkg.id)
                .map(r => {
                    const addon = addonsMap.get(r.addon_id);
                    if (!addon) return null;
                    return {
                        id: addon.id,
                        name: addon.name,
                        price: Number(addon.price),
                        locked: r.is_locked,
                    };
                }).filter(Boolean);
            
            return {
                ...pkg,
                price: Number(pkg.price),
                included
            };
        });
        
        const allAddons = addonsRes.rows.map(a => ({ ...a, price: Number(a.price) }));
        res.json({ packages, allAddons });
    } catch (err) {
        console.error('Error fetching packages and addons:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania oferty.' });
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching public gallery:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania galerii.' });
    }
});

// --- CLIENT Endpoints ---
app.post('/api/validate-key', async (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ message: 'Access key is required.' });
  }
  try {
    const result = await pool.query('SELECT * FROM access_keys WHERE key = $1', [key]);
    if (result.rowCount > 0) {
      res.status(200).json({ valid: true, message: 'Key is valid.' });
    } else {
      res.status(404).json({ valid: false, message: 'Nieprawidłowy klucz dostępu.' });
    }
  } catch (err) {
    console.error('Error validating key:', err);
    res.status(500).json({ message: 'Server error during key validation.' });
  }
});

app.post('/api/bookings', async (req, res) => {
    const {
        accessKey, password, packageName, totalPrice, selectedItems,
        brideName, groomName, weddingDate, brideAddress, groomAddress,
        locations, schedule, email, phoneNumber, additionalInfo, discountCode
    } = req.body;
    if (!accessKey || !password || !packageName || !totalPrice || !email || !phoneNumber) {
        return res.status(400).json({ message: 'Missing required booking information.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const clientId = await generateUniqueClientId(client);
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const query = `
            INSERT INTO bookings (
                client_id, password_hash, access_key, package_name, total_price, selected_items,
                bride_name, groom_name, wedding_date, bride_address, groom_address, locations, schedule, 
                email, phone_number, additional_info, discount_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id, client_id;
        `;
        const values = [
            clientId, passwordHash, accessKey, packageName, totalPrice, JSON.stringify(selectedItems),
            brideName, groomName, weddingDate || null, brideAddress || null, groomAddress || null,
            locations || null, schedule || null, email, phoneNumber, additionalInfo || null, discountCode || null
        ];
        const result = await client.query(query, values);
        await client.query('COMMIT');
        res.status(201).json({ 
            message: 'Booking created successfully.', 
            bookingId: result.rows[0].id,
            clientId: result.rows[0].client_id 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating booking:', err);
        res.status(500).json({ message: 'Server error while creating booking.' });
    } finally {
        client.release();
    }
});

app.post('/api/login', async (req, res) => {
    const { clientId, password } = req.body;
    if (!clientId || !password) {
        return res.status(400).json({ message: 'Numer klienta i hasło są wymagane.' });
    }
    try {
        const result = await pool.query('SELECT * FROM bookings WHERE client_id = $1', [clientId.trim()]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }
        const booking = result.rows[0];
        const isMatch = await bcrypt.compare(password, booking.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy numer klienta lub hasło.' });
        }
        const payload = { user: { clientId: booking.client_id } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Błąd serwera podczas logowania.' });
    }
});

app.get('/api/my-booking', authenticateToken, async (req, res) => {
    try {
        const { clientId } = req.user.user;
        const result = await pool.query('SELECT * FROM bookings WHERE client_id = $1', [clientId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        const { password_hash, ...bookingData } = result.rows[0];
        res.json(bookingData);
    } catch (err) {
        console.error('Error fetching booking data:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania danych.' });
    }
});

app.patch('/api/my-booking', authenticateToken, async (req, res) => {
    try {
        const { clientId } = req.user.user;
        const { bride_address, groom_address, locations, schedule, additional_info } = req.body;
        const result = await pool.query(
            `UPDATE bookings 
             SET bride_address = $1, groom_address = $2, locations = $3, schedule = $4, additional_info = $5
             WHERE client_id = $6
             RETURNING *`,
            [bride_address, groom_address, locations, schedule, additional_info, clientId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji do zaktualizowania.' });
        }
        const { password_hash, ...updatedBooking } = result.rows[0];
        res.json({ message: 'Dane zostały pomyślnie zaktualizowane.', booking: updatedBooking });
    } catch (err) {
        console.error('Error updating booking data:', err);
        res.status(500).json({ message: 'Błąd serwera podczas aktualizacji danych.' });
    }
});

// --- ADMIN Endpoints ---
app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email i hasło są wymagane.' });
    }
    try {
        const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        const payload = { admin: { id: admin.id, email: admin.email } };
        const token = jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch(err) {
        console.error('Admin login error:', err);
        res.status(500).json({ message: 'Błąd serwera podczas logowania administratora.' });
    }
});

app.get('/api/admin/bookings', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, client_id, bride_name, groom_name, wedding_date, total_price, created_at 
             FROM bookings 
             ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch(err) {
        console.error('Error fetching bookings for admin:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania rezerwacji.' });
    }
});

app.get('/api/admin/bookings/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        const { password_hash, ...bookingData } = result.rows[0];
        res.json(bookingData);
    } catch (err) {
        console.error(`Error fetching booking details for admin (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania szczegółów rezerwacji.' });
    }
});

app.patch('/api/admin/bookings/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const {
        bride_name, groom_name, email, phone_number, wedding_date,
        bride_address, groom_address, locations, schedule, additional_info
    } = req.body;
    if (!bride_name || !groom_name || !email || !phone_number || !wedding_date) {
        return res.status(400).json({ message: 'Brak wymaganych pól do aktualizacji.' });
    }
    try {
        const result = await pool.query(
            `UPDATE bookings
             SET bride_name = $1, groom_name = $2, email = $3, phone_number = $4, wedding_date = $5,
                 bride_address = $6, groom_address = $7, locations = $8, schedule = $9, additional_info = $10
             WHERE id = $11
             RETURNING *`,
            [
                bride_name, groom_name, email, phone_number, wedding_date,
                bride_address, groom_address, locations, schedule, additional_info,
                id
            ]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji do zaktualizowania.' });
        }
        const { password_hash, ...updatedBooking } = result.rows[0];
        res.json({ message: 'Rezerwacja została pomyślnie zaktualizowana.', booking: updatedBooking });
    } catch (err) {
        console.error(`Błąd podczas aktualizacji rezerwacji (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas aktualizacji rezerwacji.' });
    }
});

app.get('/api/admin/access-keys', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching access keys for admin:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania kluczy dostępu.' });
    }
});

app.post('/api/admin/access-keys', authenticateAdminToken, async (req, res) => {
    const { client_name } = req.body;
    if (!client_name) {
        return res.status(400).json({ message: 'Nazwa klienta jest wymagana.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let newKey;
        let isUnique = false;
        while (!isUnique) {
            newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            const res = await client.query('SELECT id FROM access_keys WHERE key = $1', [newKey]);
            if (res.rowCount === 0) {
                isUnique = true;
            }
        }
        const result = await client.query(
            'INSERT INTO access_keys (key, client_name) VALUES ($1, $2) RETURNING *',
            [newKey, client_name]
        );
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating access key:', err);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia klucza dostępu.' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/access-keys/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM access_keys WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono klucza do usunięcia.' });
        }
        res.status(200).json({ message: 'Klucz dostępu został pomyślnie usunięty.' });
    } catch (err) {
        console.error(`Error deleting access key (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania klucza dostępu.' });
    }
});

// --- ADMIN AVAILABILITY ENDPOINTS ---
app.get('/api/admin/availability', authenticateAdminToken, async (req, res) => {
    try {
        const availabilityRes = await pool.query('SELECT * FROM availability');
        const bookingsRes = await pool.query('SELECT id, bride_name, groom_name, wedding_date FROM bookings WHERE wedding_date IS NOT NULL');
        const customEvents = availabilityRes.rows.map(e => ({
            id: e.id,
            title: e.title,
            start: new Date(e.start_time),
            end: new Date(e.end_time),
            allDay: e.is_all_day,
            description: e.description,
            resource: { type: 'event' }
        }));
        const bookingEvents = bookingsRes.rows.map(b => ({
            id: `booking-${b.id}`,
            title: `Ślub: ${b.bride_name} i ${b.groom_name}`,
            start: b.wedding_date,
            end: b.wedding_date,
            allDay: true,
            resource: { type: 'booking', bookingId: b.id }
        }));
        res.json([...customEvents, ...bookingEvents]);
    } catch (err) {
        console.error('Error fetching availability:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania dostępności.' });
    }
});

app.post('/api/admin/availability', authenticateAdminToken, async (req, res) => {
    const { title, start_time, end_time, is_all_day, description } = req.body;
    if (!title || !start_time || !end_time) {
        return res.status(400).json({ message: 'Tytuł, początek i koniec wydarzenia są wymagane.' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO availability (title, start_time, end_time, is_all_day, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [title, start_time, end_time, !!is_all_day, description || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating availability event:', err);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia wydarzenia.' });
    }
});

app.patch('/api/admin/availability/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const { title, start_time, end_time, is_all_day, description } = req.body;
    if (!title || !start_time || !end_time) {
        return res.status(400).json({ message: 'Tytuł, początek i koniec wydarzenia są wymagane.' });
    }
    try {
        const result = await pool.query(
            'UPDATE availability SET title = $1, start_time = $2, end_time = $3, is_all_day = $4, description = $5 WHERE id = $6 RETURNING *',
            [title, start_time, end_time, !!is_all_day, description || null, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono wydarzenia do zaktualizowania.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating availability event (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas aktualizacji wydarzenia.' });
    }
});

app.delete('/api/admin/availability/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM availability WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono wydarzenia do usunięcia.' });
        }
        res.status(200).json({ message: 'Wydarzenie zostało pomyślnie usunięte.' });
    } catch (err) {
        console.error(`Error deleting availability event (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania wydarzenia.' });
    }
});

// --- ADMIN GALLERY ENDPOINTS ---
app.post('/api/admin/galleries/upload', authenticateAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) {
        return res.status(400).json({ message: 'Filename is required in x-vercel-filename header.' });
    }
    try {
        const blob = await put(filename, req, {
          access: 'public',
          addRandomSuffix: false
        });
        res.status(200).json(blob);
    } catch(err) {
        console.error('Error uploading file to blob:', err);
        res.status(500).json({ message: `Error uploading file: ${err.message}` });
    }
});

app.get('/api/admin/galleries', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching admin gallery:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania galerii.' });
    }
});

app.post('/api/admin/galleries', authenticateAdminToken, async (req, res) => {
    const { title, description, image_url } = req.body;
    if (!title || !image_url) {
        return res.status(400).json({ message: 'Title and image URL are required.' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO galleries (title, description, image_url) VALUES ($1, $2, $3) RETURNING *',
            [title, description || null, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch(err) {
        console.error('Error saving gallery item:', err);
        res.status(500).json({ message: 'Błąd serwera podczas zapisu do galerii.' });
    }
});

app.delete('/api/admin/galleries/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const galleryItemRes = await client.query('SELECT image_url FROM galleries WHERE id = $1', [id]);
        if (galleryItemRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Nie znaleziono elementu galerii.' });
        }
        const imageUrl = galleryItemRes.rows[0].image_url;
        await del(imageUrl);
        await client.query('DELETE FROM galleries WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'Element galerii został usunięty.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting gallery item (id: ${id}):`, err);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania elementu galerii.' });
    } finally {
        client.release();
    }
});

// --- ADMIN PACKAGES & ADDONS ENDPOINTS ---
app.get('/api/admin/packages', authenticateAdminToken, async (req, res) => {
  try {
    const packagesRes = await pool.query(`
      SELECT p.*, COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name, 'price', a.price, 'is_locked', pa.is_locked)) FILTER (WHERE a.id IS NOT NULL), '[]') as addons
      FROM packages p
      LEFT JOIN package_addons pa ON p.id = pa.package_id
      LEFT JOIN addons a ON pa.addon_id = a.id
      GROUP BY p.id
      ORDER BY p.price DESC
    `);
    res.json(packagesRes.rows);
  } catch (err) {
    console.error('Error fetching packages for admin:', err);
    res.status(500).json({ message: 'Błąd serwera podczas pobierania pakietów.' });
  }
});

app.get('/api/admin/addons', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM addons ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching addons for admin:', err);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania dodatków.' });
    }
});

app.post('/api/admin/addons', authenticateAdminToken, async (req, res) => {
    const { name, price } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ message: 'Nazwa i cena są wymagane.' });
    }
    try {
        const result = await pool.query('INSERT INTO addons (name, price) VALUES ($1, $2) RETURNING *', [name, price]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating addon:', err);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia dodatku.' });
    }
});

app.patch('/api/admin/addons/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const { name, price } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ message: 'Nazwa i cena są wymagane.' });
    }
    try {
        const result = await pool.query('UPDATE addons SET name = $1, price = $2 WHERE id = $3 RETURNING *', [name, price, id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Dodatek nie znaleziony.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating addon:', err);
        res.status(500).json({ message: 'Błąd serwera podczas aktualizacji dodatku.' });
    }
});

app.delete('/api/admin/addons/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM addons WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting addon:', err);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania dodatku.' });
    }
});

app.post('/api/admin/packages', authenticateAdminToken, async (req, res) => {
    const { name, description, price, addons } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ message: 'Nazwa i cena pakietu są wymagane.' });
    }
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
        res.status(201).json({ id: packageId, name, description, price, addons });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating package:', err);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia pakietu.' });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/packages/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, price, addons } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ message: 'Nazwa i cena pakietu są wymagane.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE packages SET name = $1, description = $2, price = $3 WHERE id = $4', [name, description, price, id]);
        await client.query('DELETE FROM package_addons WHERE package_id = $1', [id]);
        if (addons && addons.length > 0) {
            for (const addon of addons) {
                await client.query('INSERT INTO package_addons (package_id, addon_id, is_locked) VALUES ($1, $2, $3)', [id, addon.id, addon.is_locked]);
            }
        }
        await client.query('COMMIT');
        res.json({ id, name, description, price, addons });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating package:', err);
        res.status(500).json({ message: 'Błąd serwera podczas aktualizacji pakietu.' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/packages/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM packages WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting package:', err);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania pakietu.' });
    }
});

export default app;--- START OF FILE src/App.tsx ---

import React, { useState, useCallback, ReactNode } from 'react';
import HomePage from './pages/HomePage.tsx';
import CalculatorPage from './pages/CalculatorPage.tsx';
import Header from './components/Header.tsx';
import SideMenu from './components/SideMenu.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ClientPanelPage from './pages/ClientPanelPage.tsx';
import AdminLoginPage from './pages/AdminLoginPage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';
import AdminBookingDetailsPage from './pages/AdminBookingDetailsPage.tsx';
import GalleryPage from './pages/GalleryPage.tsx';

export type Page = 
  | 'home' 
  | 'calculator' 
  | 'gallery' 
  | 'login' 
  | 'clientPanel' 
  | 'adminLogin' 
  | 'adminDashboard' 
  | 'adminBookingDetails';
  
export type AdminSubPage = 'bookings' | 'accessKeys' | 'availability' | 'gallery' | 'packages';

const App = () => {
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [currentAdminPage, setCurrentAdminPage] = useState<AdminSubPage>('bookings');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);

    const navigateTo = useCallback((page: Page, adminPage?: AdminSubPage) => {
        setCurrentPage(page);
        if (adminPage) {
            setCurrentAdminPage(adminPage);
        }
        setIsMenuOpen(false);
        if (page !== 'adminBookingDetails') {
            setViewingBookingId(null);
        }
    }, []);

    const handleViewBookingDetails = useCallback((bookingId: number) => {
        setViewingBookingId(bookingId);
        navigateTo('adminBookingDetails');
    }, [navigateTo]);

    const renderCurrentPage = () => {
        switch (currentPage) {
            case 'home':
                return <HomePage onNavigateToCalculator={() => navigateTo('calculator')} />;
            case 'calculator':
                return <CalculatorPage navigateTo={navigateTo} />;
            case 'gallery':
                return <GalleryPage />;
            case 'login':
                return <LoginPage navigateTo={navigateTo} />;
            case 'clientPanel':
                return <ClientPanelPage navigateTo={navigateTo} />;
            case 'adminLogin':
                return <AdminLoginPage navigateTo={navigateTo} />;
            case 'adminDashboard':
                return <AdminDashboardPage 
                            navigateTo={navigateTo} 
                            onViewDetails={handleViewBookingDetails} 
                            activeTab={currentAdminPage}
                            setActiveTab={(tab) => setCurrentAdminPage(tab)}
                       />;
            case 'adminBookingDetails':
                return viewingBookingId 
                    ? <AdminBookingDetailsPage 
                        navigateTo={(page) => navigateTo(page, 'bookings')} 
                        bookingId={viewingBookingId} /> 
                    : <AdminDashboardPage 
                        navigateTo={navigateTo} 
                        onViewDetails={handleViewBookingDetails} 
                        activeTab="bookings"
                        setActiveTab={(tab) => setCurrentAdminPage(tab)}
                      />;
            default:
                return <HomePage onNavigateToCalculator={() => navigateTo('calculator')} />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            <Header onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />
            <SideMenu isOpen={isMenuOpen} onNavigate={navigateTo} onClose={() => setIsMenuOpen(false)} />
            <main className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    {renderCurrentPage()}
                </div>
            </main>
        </div>
    );
};

export default App;--- START OF FILE src/pages/AdminDashboardPage.tsx ---

import React, { useEffect, FC, ReactNode } from 'react';
import { Page, AdminSubPage } from '../App.tsx';
import AdminBookingsPage from './AdminBookingsPage.tsx';
import AdminAccessKeysPage from './AdminAccessKeysPage.tsx';
import AdminAvailabilityPage from './AdminAvailabilityPage.tsx';
import AdminGalleryPage from './AdminGalleryPage.tsx';
import AdminPackagesPage from './AdminPackagesPage.tsx';
import { InboxStackIcon, KeyIcon, CalendarIcon, PhotoIcon, TagIcon } from '../components/Icons.tsx';

interface AdminDashboardPageProps {
    navigateTo: (page: Page, adminPage?: AdminSubPage) => void;
    onViewDetails: (bookingId: number) => void;
    activeTab: AdminSubPage;
    setActiveTab: (tab: AdminSubPage) => void;
}

const TabButton: FC<{ isActive: boolean; onClick: () => void; children: ReactNode }> = ({ isActive, onClick, children }) => (
    <button onClick={onClick} className={`flex items-center gap-2 ${isActive ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-3 border-b-2 font-medium text-sm transition-colors focus:outline-none`}>
        {children}
    </button>
);

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo, onViewDetails, activeTab, setActiveTab }) => {
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigateTo('adminLogin');
            return;
        }
    }, [navigateTo]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigateTo('home');
    };
    
    const renderActiveTab = () => {
        switch(activeTab) {
            case 'bookings':
                return <AdminBookingsPage onViewDetails={onViewDetails} />;
            case 'accessKeys':
                return <AdminAccessKeysPage />;
            case 'availability':
                 return <AdminAvailabilityPage onViewBookingDetails={onViewDetails} />;
            case 'gallery':
                return <AdminGalleryPage />;
            case 'packages':
                return <AdminPackagesPage />;
            default:
                return <AdminBookingsPage onViewDetails={onViewDetails} />;
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-6">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            <div className="border-b border-slate-200 mb-8">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    <TabButton isActive={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')}>
                        <InboxStackIcon className="w-5 h-5" /> Rezerwacje
                    </TabButton>
                    <TabButton isActive={activeTab === 'accessKeys'} onClick={() => setActiveTab('accessKeys')}>
                        <KeyIcon className="w-5 h-5" /> Klucze Dostępu
                    </TabButton>
                    <TabButton isActive={activeTab === 'availability'} onClick={() => setActiveTab('availability')}>
                        <CalendarIcon className="w-5 h-5" /> Dostępność
                    </TabButton>
                    <TabButton isActive={activeTab === 'gallery'} onClick={() => setActiveTab('gallery')}>
                        <PhotoIcon className="w-5 h-5" /> Galeria
                    </TabButton>
                    <TabButton isActive={activeTab === 'packages'} onClick={() => setActiveTab('packages')}>
                        <TagIcon className="w-5 h-5" /> Oferta
                    </TabButton>
                </nav>
            </div>

            <div>
                {renderActiveTab()}
            </div>
        </div>
    );
};

export default AdminDashboardPage;--- START OF FILE src/pages/AdminBookingsPage.tsx ---

import React, { useEffect, useState, FC } from 'react';
import { formatCurrency } from '../utils.ts';
import { LoadingSpinner, InboxStackIcon } from '../components/Icons.tsx';

interface AdminBookingsPageProps {
    onViewDetails: (bookingId: number) => void;
}

interface BookingSummary {
    id: number;
    client_id: string;
    bride_name: string;
    groom_name: string;
    wedding_date: string;
    total_price: string;
    created_at: string;
}

const StatCard: FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white rounded-2xl shadow p-6 flex items-center">
        <div className="bg-indigo-100 text-indigo-600 rounded-full p-3 mr-4">
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);

const AdminBookingsPage: FC<AdminBookingsPageProps> = ({ onViewDetails }) => {
    const [bookings, setBookings] = useState<BookingSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

     useEffect(() => {
        const fetchBookings = async () => {
            const token = localStorage.getItem('adminAuthToken');
            try {
                const response = await fetch('/api/admin/bookings', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać rezerwacji.');
                }
                setBookings(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchBookings();
    }, []);

    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 text-center py-20">{error}</p>;

    return (
        <>
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Wszystkie rezerwacje" value={bookings.length} icon={<InboxStackIcon className="w-6 h-6"/>} />
            </section>
            
            <section>
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Ostatnie rezerwacje</h2>
                 <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">ID Rezerwacji</th>
                                    <th scope="col" className="px-6 py-3">Klient</th>
                                    <th scope="col" className="px-6 py-3">Data ślubu</th>
                                    <th scope="col" className="px-6 py-3">Cena</th>
                                    <th scope="col" className="px-6 py-3">Data rezerwacji</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <tr key={booking.id} className="bg-white border-b hover:bg-slate-50">
                                        <th scope="row" className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">#{booking.id}</th>
                                        <td className="px-6 py-4"><div>{booking.bride_name}</div><div className="text-xs text-slate-400">{booking.groom_name}</div></td>
                                        <td className="px-6 py-4">{booking.wedding_date ? formatDate(booking.wedding_date) : '-'}</td>
                                        <td className="px-6 py-4 font-semibold">{formatCurrency(Number(booking.total_price))}</td>
                                        <td className="px-6 py-4">{formatDate(booking.created_at)}</td>
                                        <td className="px-6 py-4 text-right"><button onClick={() => onViewDetails(booking.id)} className="font-medium text-indigo-600 hover:underline">Szczegóły</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {bookings.length === 0 && <p className="text-center p-8 text-slate-500">Nie znaleziono żadnych rezerwacji.</p>}
                 </div>
            </section>
        </>
    );
};
--- START OF FILE src/pages/AdminAccessKeysPage.tsx ---

import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, KeyIcon } from '../components/Icons.tsx';

const AdminAccessKeysPage: FC = () => {
    const [keys, setKeys] = useState<AccessKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newClientName, setNewClientName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle'|'success'>('idle');

    interface AccessKey {
        id: number;
        key: string;
        client_name: string;
        created_at: string;
    }

    const fetchKeys = async () => {
        setIsLoading(true);
        const token = localStorage.getItem('adminAuthToken');
        try {
            const response = await fetch('/api/admin/access-keys', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Błąd pobierania kluczy.');
            setKeys(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);
    
    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName) return;
        setIsSubmitting(true);
        setError('');
        const token = localStorage.getItem('adminAuthToken');

        try {
            const response = await fetch('/api/admin/access-keys', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: newClientName }),
            });
            const newKey = await response.json();
            if (!response.ok) throw new Error(newKey.message || 'Błąd tworzenia klucza.');
            setKeys(prev => [newKey, ...prev]);
            setNewClientName('');
            setSubmitStatus('success');
            setTimeout(() => setSubmitStatus('idle'), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteKey = async (keyId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten klucz? Tej operacji nie można cofnąć.')) return;
        
        setError('');
        const token = localStorage.getItem('adminAuthToken');
        
        try {
            const response = await fetch(`/api/admin/access-keys/${keyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Błąd usuwania klucza.');
            setKeys(prev => prev.filter(key => key.id !== keyId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pl-PL');

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Aktywne Klucze Dostępu</h2>
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500">
                             <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Klucz</th>
                                    <th scope="col" className="px-6 py-3">Przypisany do Klienta</th>
                                    <th scope="col" className="px-6 py-3">Data Utworzenia</th>
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                             <tbody>
                                {keys.map(key => (
                                    <tr key={key.id} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-6 py-4 font-mono text-indigo-600 font-bold">{key.key}</td>
                                        <td className="px-6 py-4 text-slate-800 font-medium">{key.client_name}</td>
                                        <td className="px-6 py-4">{formatDate(key.created_at)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDeleteKey(key.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" aria-label="Usuń klucz">
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                     {keys.length === 0 && <p className="text-center p-8 text-slate-500">Brak aktywnych kluczy dostępu.</p>}
                </div>
            </div>
            <div className="lg:col-span-1">
                 <h2 className="text-2xl font-bold text-slate-800 mb-4">Wygeneruj Nowy Klucz</h2>
                 <form onSubmit={handleAddKey} className="bg-white rounded-2xl shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="clientName" className="block text-sm font-medium text-slate-700">Nazwa klienta</label>
                        <input
                            type="text"
                            id="clientName"
                            value={newClientName}
                            onChange={e => setNewClientName(e.target.value)}
                            placeholder="np. Anna i Piotr"
                            required
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <button type="submit" disabled={isSubmitting || !newClientName} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5" /> : <KeyIcon className="w-5 h-5" />}
                        <span>Wygeneruj</span>
                    </button>
                    {submitStatus === 'success' && <p className="flex items-center gap-2 text-sm text-green-600"><CheckCircleIcon className="w-5 h-5"/> Klucz został pomyślnie utworzony!</p>}
                 </form>
            </div>
        </div>
    );
};

export default AdminAccessKeysPage;
