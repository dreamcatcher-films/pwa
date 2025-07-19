import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { put, del } from '@vercel/blob';

const { Pool, Client } = pg;
const app = express();

// --- Database Pool Configuration ---
let pool;
if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: true // Use `ssl: true` for Supabase
    });

    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  } catch (err) {
      console.error('Failed to create database pool:', err);
  }
} else {
    console.error('FATAL ERROR: DATABASE_URL environment variable is not set.');
}


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
  if (!pool) {
      console.error("Database pool not available. Skipping initialization.");
      return;
  }
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

    // Smartly alter table to add columns if they don't exist, preventing errors on redeploy.
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0.00;`);
    
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
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'percentage' or 'fixed'
        value NUMERIC(10, 2) NOT NULL,
        usage_limit INT,
        times_used INT DEFAULT 0,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_stages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INT DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_stages (
        id SERIAL PRIMARY KEY,
        booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, awaiting_approval, completed
        notes TEXT,
        completed_at TIMESTAMP WITH TIME ZONE,
        sort_order INT DEFAULT 0,
        UNIQUE(booking_id, stage_id)
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

initializeDatabase().catch(err => {
    console.error("Failed to initialize database on startup:", err);
});


// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use((req, res, next) => {
    if (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET) {
        const errorMessage = 'FATAL ERROR: JWT secrets are not configured in environment variables.';
        console.error(errorMessage);
        return res.status(500).send(errorMessage);
    }
    if (!pool) {
        const errorMessage = 'A server error occurred: Database connection is not configured.';
        console.error(errorMessage);
        return res.status(500).send(errorMessage);
    }
    next();
});


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authenticateAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.ADMIN_JWT_SECRET, (err, admin) => {
        if (err) return res.sendStatus(403);
        req.admin = admin;
        next();
    });
};


// --- API Endpoints ---

// --- DIAGNOSTIC Endpoints ---
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
    console.error('Health check failed:', err.stack);
    res.status(500).send(`A server error occurred during health check: ${err.message}`);
  }
});

app.get('/api/test-db', async (req, res) => {
    if (!process.env.DATABASE_URL) {
        return res.status(500).json({
            success: false,
            message: 'Database connection failed.',
            error: { message: 'DATABASE_URL environment variable is not set.' }
        });
    }
    
    const testClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: true // Use `ssl: true` for Supabase
    });

    try {
        await testClient.connect();
        const result = await testClient.query('SELECT NOW()');
        res.status(200).json({
            success: true,
            message: 'Database connection successful!',
            db_time: result.rows[0].now,
        });
    } catch (err) {
        console.error('[/api/test-db] Database connection test failed:', err.stack);
        res.status(500).json({
            success: false,
            message: 'Database connection failed.',
            error: {
                message: err.message,
                code: err.code,
                stack: err.stack,
            }
        });
    } finally {
        await testClient.end();
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
        console.error('Error fetching packages and addons:', err.stack);
        res.status(500).send('A server error occurred while fetching the offer.');
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching public gallery:', err.stack);
        res.status(500).send('A server error occurred while fetching the gallery.');
    }
});

app.post('/api/validate-discount', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Kod jest wymagany.' });

    try {
        const result = await pool.query('SELECT * FROM discount_codes WHERE code = $1', [code.toUpperCase()]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono takiego kodu.' });
        }
        const discount = result.rows[0];
        if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
            return res.status(410).json({ message: 'Ten kod wygasł.' });
        }
        if (discount.usage_limit && discount.times_used >= discount.usage_limit) {
            return res.status(410).json({ message: 'Limit użyć tego kodu został wyczerpany.' });
        }
        res.json({
            code: discount.code,
            type: discount.type,
            value: Number(discount.value)
        });
    } catch (err) {
        console.error('Error validating discount code:', err.stack);
        res.status(500).send('A server error occurred during discount validation.');
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
    console.error('Error validating key:', err.stack);
    res.status(500).send('A server error occurred during key validation.');
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
        
        // If a discount code was used, increment its usage count
        if (discountCode) {
            await client.query('UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1', [discountCode]);
        }
        
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
        console.error('Error creating booking:', err.stack);
        res.status(500).send('A server error occurred while creating booking.');
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
        const payload = { user: { clientId: booking.client_id, bookingId: booking.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch (err) {
        console.error('Login error:', err.stack);
        res.status(500).send('A server error occurred during login.');
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
        console.error('Error fetching booking data:', err.stack);
        res.status(500).send('A server error occurred while fetching booking data.');
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
        console.error('Error updating booking data:', err.stack);
        res.status(500).send('A server error occurred while updating data.');
    }
});

app.get('/api/booking-stages', authenticateToken, async (req, res) => {
    try {
        const { bookingId } = req.user.user;
        const result = await pool.query(`
            SELECT bs.id, bs.status, bs.completed_at, ps.name, ps.description
            FROM booking_stages bs
            JOIN production_stages ps ON bs.stage_id = ps.id
            WHERE bs.booking_id = $1
            ORDER BY bs.sort_order ASC, ps.sort_order ASC
        `, [bookingId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching booking stages:', err.stack);
        res.status(500).send('A server error occurred while fetching stages.');
    }
});

app.patch('/api/booking-stages/:id/approve', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { bookingId } = req.user.user;
    try {
        const result = await pool.query(
            `UPDATE booking_stages 
             SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
             WHERE id = $1 AND booking_id = $2 AND status = 'awaiting_approval'
             RETURNING *`,
            [id, bookingId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono etapu do zatwierdzenia lub nie wymaga on akcji.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error approving stage (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while approving stage.');
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
        const token = jwt.sign(payload, process.env.ADMIN_JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch(err) {
        console.error('Admin login error:', err.stack);
        res.status(500).send('A server error occurred during admin login.');
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
        console.error('Error fetching bookings for admin:', err.stack);
        res.status(500).send('A server error occurred while fetching bookings.');
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
        console.error(`Error fetching booking details for admin (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while fetching booking details.');
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
        console.error(`Błąd podczas aktualizacji rezerwacji (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while updating booking.');
    }
});

app.patch('/api/admin/bookings/:id/payment', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const { payment_status, amount_paid } = req.body;

    try {
        const result = await pool.query(
            `UPDATE bookings
             SET payment_status = $1, amount_paid = $2
             WHERE id = $3
             RETURNING id, payment_status, amount_paid`,
            [payment_status, amount_paid, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji do zaktualizowania.' });
        }
        res.json({ message: 'Status płatności został zaktualizowany.', payment_details: result.rows[0] });
    } catch (err) {
        console.error(`Błąd podczas aktualizacji płatności (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while updating payment.');
    }
});

app.get('/api/admin/access-keys', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM access_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching access keys for admin:', err.stack);
        res.status(500).send('A server error occurred while fetching access keys.');
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
        console.error('Error creating access key:', err.stack);
        res.status(500).send('A server error occurred while creating access key.');
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
        console.error(`Error deleting access key (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while deleting access key.');
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
        console.error('Error fetching availability:', err.stack);
        res.status(500).send('A server error occurred while fetching availability.');
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
        console.error('Error creating availability event:', err.stack);
        res.status(500).send('A server error occurred while creating event.');
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
        console.error(`Error updating availability event (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while updating event.');
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
        console.error(`Error deleting availability event (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while deleting event.');
    }
});

// --- ADMIN GALLERY ENDPOINTS ---
app.post('/api/admin/galleries/upload', authenticateAdminToken, async (req, res) => {
    const filename = req.headers['x-vercel-filename'];
    if (!filename) {
        return res.status(400).json({ message: 'Filename is required in x-vercel-filename header.' });
    }
    try {
        const blob = await put(filename, req, { access: 'public', addRandomSuffix: true });
        res.status(200).json(blob);
    } catch(err) {
        console.error('Error uploading file to blob:', err.stack);
        res.status(500).send(`A server error occurred during file upload: ${err.message}`);
    }
});

app.get('/api/admin/galleries', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM galleries ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching admin gallery:', err.stack);
        res.status(500).send('A server error occurred while fetching the admin gallery.');
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
        console.error('Error saving gallery item:', err.stack);
        res.status(500).send('A server error occurred while saving gallery item.');
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
        console.error(`Error deleting gallery item (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while deleting gallery item.');
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
    console.error('Error fetching packages for admin:', err.stack);
    res.status(500).send('A server error occurred while fetching packages.');
  }
});

app.get('/api/admin/addons', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM addons ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching addons for admin:', err.stack);
        res.status(500).send('A server error occurred while fetching addons.');
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
        console.error('Error creating addon:', err.stack);
        res.status(500).send('A server error occurred while creating addon.');
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
        console.error('Error updating addon:', err.stack);
        res.status(500).send('A server error occurred while updating addon.');
    }
});

app.delete('/api/admin/addons/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM addons WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting addon:', err.stack);
        res.status(500).send('A server error occurred while deleting addon.');
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
        console.error('Error creating package:', err.stack);
        res.status(500).send('A server error occurred while creating package.');
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
        console.error('Error updating package:', err.stack);
        res.status(500).send('A server error occurred while updating package.');
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
        console.error('Error deleting package:', err.stack);
        res.status(500).send('A server error occurred while deleting package.');
    }
});

// --- ADMIN DISCOUNT CODES ENDPOINTS ---
app.get('/api/admin/discounts', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM discount_codes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching discount codes:', err.stack);
        res.status(500).send('A server error occurred while fetching codes.');
    }
});

app.post('/api/admin/discounts', authenticateAdminToken, async (req, res) => {
    const { code, type, value, usage_limit, expires_at } = req.body;
    if (!code || !type || value === undefined) {
        return res.status(400).json({ message: 'Kod, typ i wartość są wymagane.' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO discount_codes (code, type, value, usage_limit, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [code.toUpperCase(), type, value, usage_limit || null, expires_at || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating discount code:', err.stack);
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Ten kod już istnieje.' });
        }
        res.status(500).send('A server error occurred while creating code.');
    }
});

app.delete('/api/admin/discounts/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM discount_codes WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono kodu do usunięcia.' });
        }
        res.status(200).json({ message: 'Kod rabatowy został pomyślnie usunięty.' });
    } catch (err) {
        console.error(`Error deleting discount code (id: ${id}):`, err.stack);
        res.status(500).send('A server error occurred while deleting code.');
    }
});

// --- ADMIN PRODUCTION STAGES ENDPOINTS ---
app.get('/api/admin/stages', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM production_stages ORDER BY sort_order ASC, name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching stages:', err.stack);
        res.status(500).send('A server error occurred while fetching stages.');
    }
});

app.post('/api/admin/stages', authenticateAdminToken, async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Nazwa etapu jest wymagana.' });
    try {
        const result = await pool.query('INSERT INTO production_stages (name, description) VALUES ($1, $2) RETURNING *', [name, description]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating stage:', err.stack);
        res.status(500).send('A server error occurred while creating stage.');
    }
});

app.delete('/api/admin/stages/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM production_stages WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting stage:', err.stack);
        res.status(500).send('A server error occurred while deleting stage.');
    }
});

app.get('/api/admin/booking-stages/:bookingId', authenticateAdminToken, async (req, res) => {
    const { bookingId } = req.params;
    try {
        const result = await pool.query(`
            SELECT bs.id, bs.status, ps.name, ps.description
            FROM booking_stages bs
            JOIN production_stages ps ON bs.stage_id = ps.id
            WHERE bs.booking_id = $1
            ORDER BY bs.sort_order ASC, ps.sort_order ASC
        `, [bookingId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching booking stages for admin:', err.stack);
        res.status(500).send('A server error occurred while fetching stages.');
    }
});

app.post('/api/admin/booking-stages/:bookingId', authenticateAdminToken, async (req, res) => {
    const { bookingId } = req.params;
    const { stage_id } = req.body;
    try {
        const result = await pool.query('INSERT INTO booking_stages (booking_id, stage_id) VALUES ($1, $2) RETURNING *', [bookingId, stage_id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding stage to booking:', err.stack);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Ten etap jest już dodany do projektu.' });
        }
        res.status(500).send('A server error occurred while adding stage.');
    }
});

app.patch('/api/admin/booking-stages/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query('UPDATE booking_stages SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating booking stage status:', err.stack);
        res.status(500).send('A server error occurred while updating stage status.');
    }
});

app.delete('/api/admin/booking-stages/:id', authenticateAdminToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM booking_stages WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error('Error removing stage from booking:', err.stack);
        res.status(500).send('A server error occurred while removing stage.');
    }
});

// Fallback error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});


export default app;--- START OF FILE public/favicon.svg ---
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>
--- START OF FILE public/apple-touch-icon.svg ---
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>
--- START OF FILE public/icon-192.svg ---
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>
--- START OF FILE public/icon-512.svg ---
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>
