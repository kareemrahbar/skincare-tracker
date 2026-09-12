const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_PATH || './data.db';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());
app.use(compression());

// Security headers
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
});

// Serve static files
app.use(express.static('public'));

// Initialize Database
let db;
try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_number INTEGER UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            date_of_birth TEXT,
            sex TEXT,
            hormonal_status TEXT,
            fitzpatrick_type TEXT,
            skin_type TEXT,
            diagnosed_condition TEXT,
            primary_concern TEXT,
            sun_exposure TEXT,
            retinoid_history TEXT,
            autoimmune_flag BOOLEAN DEFAULT 0,
            skin_cancer_flag BOOLEAN DEFAULT 0,
            scarring_flag BOOLEAN DEFAULT 0,
            allergies TEXT,
            status TEXT DEFAULT 'active',
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, patient_number),
            UNIQUE(user_id, name, date_of_birth)
        );

        CREATE TABLE IF NOT EXISTS questionnaire_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            date_of_service DATETIME DEFAULT CURRENT_TIMESTAMP,
            pathway TEXT,
            safety_gates_fired TEXT,
            cleanser_tier INTEGER,
            am_antioxidant_tier INTEGER,
            moisturizer_tier INTEGER,
            sunscreen_tier INTEGER,
            pm_retinoid_tier INTEGER,
            hyperpigmentation_module BOOLEAN DEFAULT 0,
            compounded_actives BOOLEAN DEFAULT 0,
            botanical_adjuncts TEXT,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS session_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            expires_at DATETIME NOT NULL,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS revoked_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT UNIQUE NOT NULL,
            revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS patient_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS drug_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_name TEXT NOT NULL,
            active_ingredient TEXT,
            conflicting_actives TEXT,
            severity TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS allergy_cross_reactivity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_1 TEXT,
            ingredient_2 TEXT,
            same_class BOOLEAN,
            severity TEXT
        );

        CREATE TABLE IF NOT EXISTS ingredient_tolerances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            ingredient TEXT,
            status TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS assessment_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            questionnaire_id INTEGER NOT NULL,
            reminder_day INTEGER,
            reminder_sent BOOLEAN DEFAULT 0,
            scheduled_for DATETIME,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_responses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS compliance_checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            questionnaire_id INTEGER NOT NULL,
            adherence_percentage INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_responses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
        CREATE INDEX IF NOT EXISTS idx_questionnaire_patient_id ON questionnaire_responses(patient_id);
        CREATE INDEX IF NOT EXISTS idx_questionnaire_user_id ON questionnaire_responses(user_id);
        CREATE INDEX IF NOT EXISTS idx_session_log_user_id ON session_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_patient_history_patient_id ON patient_history(patient_id);
    `);

    console.log('Database initialized successfully');
} catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
}

// Rate Limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.body.username || req.ip,
    message: { error: 'Too many login attempts, please try again later' }
});

const patientCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    keyGenerator: (req) => req.userId || req.ip,
    message: { error: 'Patient creation limit exceeded' }
});

const questionnaireLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.userId || req.ip,
    message: { error: 'Questionnaire submission limit exceeded' }
});

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    keyGenerator: (req) => req.ip,
    message: { error: 'Rate limit exceeded' }
});

app.use(globalLimiter);

// Helper: Get next patient number
function getNextPatientNumber() {
    const result = db.prepare('SELECT MAX(patient_number) as max_num FROM patients').get();
    return (result?.max_num || 0) + 1;
}

// Helper: Log action
function logAction(userId, action, details = '', ipAddress = '') {
    db.prepare('INSERT INTO session_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
        .run(userId, action, details, ipAddress);
}

// Helper: Generate CSRF token
function generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper: Hash token for storage
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper: Validate password complexity
function validatePasswordComplexity(password) {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{12,}$/;
    return regex.test(password);
}

// Helper: Escape CSV values
function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.match(/[,"\n]/)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    if (str.match(/^[=+@-]/)) {
        return `'${str}`;
    }
    return str;
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.accessToken;

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const tokenHash = hashToken(token);

        const isRevoked = db.prepare('SELECT * FROM revoked_tokens WHERE token_hash = ?').get(tokenHash);
        if (isRevoked) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        db.prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);

        req.userId = decoded.userId;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// CSRF middleware
function verifyCRSFToken(req, res, next) {
    const token = req.get('X-CSRF-Token');
    const cookieToken = req.cookies.csrfToken;

    if (!token || token !== cookieToken) {
        return res.status(403).json({ error: 'CSRF validation failed' });
    }

    next();
}

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
    const token = generateCSRFToken();
    res.cookie('csrfToken', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ csrfToken: token });
});

// Health check
app.get('/api/health', (req, res) => {
    try {
        const result = db.prepare('SELECT 1').get();
        res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// REGISTER
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (!validatePasswordComplexity(password)) {
        return res.status(400).json({
            error: 'Password must be at least 12 characters with uppercase letter, number, and symbol'
        });
    }

    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
            .run(username, hashedPassword);

        logAction(result.lastInsertRowid, 'register', username);
        res.status(201).json({ success: true, id: result.lastInsertRowid, username });
    } catch (error) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

// LOGIN
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const ipAddress = req.ip;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
        logAction(null, 'login_failed', username, ipAddress);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '1h' }
    );

    const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret',
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
    );

    const tokenHash = hashToken(accessToken);
    const expiresAt = new Date(Date.now() + 3600000);

    db.prepare(`
        INSERT INTO sessions (user_id, token_hash, ip_address, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(user.id, tokenHash, ipAddress, expiresAt.toISOString());

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logAction(user.id, 'login', username, ipAddress);
    res.json({ success: true, userId: user.id, username: user.username });
});

// REFRESH TOKEN
app.post('/api/refresh-token', (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret');

        const newAccessToken = jwt.sign(
            { userId: decoded.userId },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '1h' }
        );

        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000
        });

        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// LOGOUT
app.post('/api/logout', authenticateToken, verifyCRSFToken, (req, res) => {
    const tokenHash = hashToken(req.token);

    db.prepare('INSERT INTO revoked_tokens (token_hash) VALUES (?)').run(tokenHash);
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);

    logAction(req.userId, 'logout');

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ success: true });
});

// CREATE PATIENT
app.post('/api/patients', authenticateToken, verifyCRSFToken, patientCreationLimiter, (req, res) => {
    const {
        name, date_of_birth, sex, hormonal_status, fitzpatrick_type, skin_type,
        diagnosed_condition, primary_concern, sun_exposure, retinoid_history,
        autoimmune_flag, skin_cancer_flag, scarring_flag, allergies
    } = req.body;

    if (!name || !date_of_birth) {
        return res.status(400).json({ error: 'Name and date of birth required' });
    }

    const patientNumber = getNextPatientNumber();

    try {
        db.prepare('BEGIN IMMEDIATE').run();

        const result = db.prepare(`
            INSERT INTO patients (
                patient_number, user_id, name, date_of_birth, sex, hormonal_status,
                fitzpatrick_type, skin_type, diagnosed_condition, primary_concern,
                sun_exposure, retinoid_history, autoimmune_flag, skin_cancer_flag,
                scarring_flag, allergies
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            patientNumber, req.userId, name, date_of_birth, sex, hormonal_status,
            fitzpatrick_type, skin_type, diagnosed_condition, primary_concern,
            sun_exposure, retinoid_history, autoimmune_flag ? 1 : 0, skin_cancer_flag ? 1 : 0,
            scarring_flag ? 1 : 0, allergies || null
        );

        db.prepare('COMMIT').run();
        logAction(req.userId, 'create_patient', `Patient #${patientNumber}: ${name}`);

        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            patient_number: patientNumber,
            name
        });
    } catch (error) {
        db.prepare('ROLLBACK').run();
        res.status(400).json({ error: error.message });
    }
});

// GET USER'S PATIENTS
app.get('/api/patients/:userId', authenticateToken, (req, res) => {
    const userId = parseInt(req.params.userId);

    if (userId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const patients = db.prepare(`
        SELECT p.*,
               COALESCE(q.pathway, 'Pending') as pathway,
               COUNT(q.id) as questionnaires_completed
        FROM patients p
        LEFT JOIN questionnaire_responses q ON p.id = q.patient_id
        WHERE p.user_id = ? AND p.status = 'active'
        GROUP BY p.id
        ORDER BY p.patient_number DESC
    `).all(userId);

    res.json(patients);
});

// GET ALL PATIENTS (ANALYTICS)
app.get('/api/all-patients', authenticateToken, (req, res) => {
    const patients = db.prepare(`
        SELECT p.*, u.username,
               COALESCE(q.pathway, 'Pending') as pathway,
               COUNT(q.id) as questionnaires_completed
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN questionnaire_responses q ON p.id = q.patient_id
        WHERE p.status = 'active'
        GROUP BY p.id
        ORDER BY p.patient_number ASC
    `).all();

    res.json(patients);
});

// SUBMIT QUESTIONNAIRE
app.post('/api/questionnaire/submit', authenticateToken, verifyCRSFToken, questionnaireLimiter, (req, res) => {
    const {
        patientId, sex, hormonal_status, fitzpatrick_type, skin_type,
        diagnosed_condition, primary_concern, sun_exposure, retinoid_history,
        autoimmune_flag, skin_cancer_flag, scarring_flag, allergies,
        pathway, safetyGates, tiers, hyperpigmentation, compounded, botanical
    } = req.body;

    const VALID_TIERS = [1, 2, 3];
    const VALID_PATHWAYS = ['acne', 'rosacea', 'eczema', 'general'];

    if (!VALID_TIERS.includes(tiers?.cleanser)) {
        return res.status(400).json({ error: 'Invalid tier value' });
    }
    if (!VALID_PATHWAYS.includes(pathway)) {
        return res.status(400).json({ error: 'Invalid pathway' });
    }

    try {
        db.prepare('BEGIN IMMEDIATE').run();

        db.prepare(`
            UPDATE patients SET
            sex = ?, hormonal_status = ?, fitzpatrick_type = ?, skin_type = ?,
            diagnosed_condition = ?, primary_concern = ?, sun_exposure = ?,
            retinoid_history = ?, autoimmune_flag = ?, skin_cancer_flag = ?,
            scarring_flag = ?, allergies = ?, version = version + 1
            WHERE id = ? AND user_id = ?
        `).run(
            sex, hormonal_status, fitzpatrick_type, skin_type,
            diagnosed_condition, primary_concern, sun_exposure,
            retinoid_history, autoimmune_flag ? 1 : 0, skin_cancer_flag ? 1 : 0,
            scarring_flag ? 1 : 0, allergies || null, patientId, req.userId
        );

        const result = db.prepare(`
            INSERT INTO questionnaire_responses
            (patient_id, user_id, pathway, safety_gates_fired, cleanser_tier, am_antioxidant_tier,
             moisturizer_tier, sunscreen_tier, pm_retinoid_tier, hyperpigmentation_module,
             compounded_actives, botanical_adjuncts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            patientId, req.userId, pathway,
            safetyGates?.length > 0 ? safetyGates.join(',') : null,
            tiers.cleanser, tiers.am_antioxidant, tiers.moisturizer,
            tiers.sunscreen, tiers.pm_retinoid,
            hyperpigmentation ? 1 : 0,
            compounded ? 1 : 0,
            botanical || null
        );

        [7, 30, 90].forEach(day => {
            const reminderDate = new Date();
            reminderDate.setDate(reminderDate.getDate() + day);

            db.prepare(`
                INSERT INTO assessment_reminders (patient_id, questionnaire_id, reminder_day, scheduled_for)
                VALUES (?, ?, ?, ?)
            `).run(patientId, result.lastInsertRowid, day, reminderDate.toISOString());
        });

        db.prepare('COMMIT').run();
        logAction(req.userId, 'complete_questionnaire', `Patient ${patientId}: ${pathway}`);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        db.prepare('ROLLBACK').run();
        res.status(400).json({ error: error.message });
    }
});

// GET ALGORITHM DATA
app.get('/api/algorithm-data', (req, res) => {
    const algorithmData = {
        pathways: {
            acne: {
                name: 'Acne',
                tiers: {
                    1: {
                        cleanser: 'Salicylic acid 0.5–1% foaming/gel',
                        am_antioxidant: 'Niacinamide 4% or Compounded vitamin C cream',
                        moisturizer: 'Oil-free gel with hyaluronic acid',
                        sunscreen: 'SPF 30, matte, non-comedogenic',
                        pm_retinoid: 'OTC encapsulated retinol, 2–3x/week'
                    },
                    2: {
                        cleanser: 'Salicylic acid 2% or benzoyl peroxide 2.5%',
                        am_antioxidant: 'Compounded vitamin C or GHK-Cu cream + niacinamide',
                        moisturizer: 'Oil-free gel-cream + niacinamide',
                        sunscreen: 'SPF 50, tinted, matte',
                        pm_retinoid: 'Tretinoin 0.025% nightly'
                    },
                    3: {
                        cleanser: 'Benzoyl peroxide 5% or prescription combination wash',
                        am_antioxidant: 'Compounded tretinoin 0.05–0.1% ± GHK-Cu',
                        moisturizer: 'Barrier-repair gel-cream',
                        sunscreen: 'SPF 50, same as Tier 2, reformulated if needed',
                        pm_retinoid: 'Compounded tretinoin 0.05–0.1% ± GHK-Cu'
                    }
                }
            },
            rosacea: {
                name: 'Rosacea',
                tiers: {
                    1: {
                        cleanser: 'Non-foaming ceramide syndet, fragrance-free',
                        am_antioxidant: 'Niacinamide 4%',
                        moisturizer: 'Fragrance-free ceramide barrier cream',
                        sunscreen: 'Fragrance-free, untinted',
                        pm_retinoid: 'Azelaic acid 10%'
                    },
                    2: {
                        cleanser: 'Same + soothing agents (centella, oat)',
                        am_antioxidant: 'Niacinamide 5%',
                        moisturizer: 'Same + niacinamide',
                        sunscreen: 'Fragrance-free, tinted with iron oxides',
                        pm_retinoid: 'Azelaic acid 15–20%'
                    },
                    3: {
                        cleanser: 'Minimal-ingredient, compounded/prescriber-directed',
                        am_antioxidant: 'Niacinamide 5% + azelaic acid',
                        moisturizer: 'Prescription barrier repair ± anti-inflammatory',
                        sunscreen: 'Same as Tier 2, minimal-ingredient',
                        pm_retinoid: 'Azelaic acid + low-dose retinol or ivermectin/metronidazole'
                    }
                }
            },
            eczema: {
                name: 'Eczema/Atopic Dermatitis',
                tiers: {
                    1: {
                        cleanser: 'Cream cleanser, sulfate-free',
                        am_antioxidant: 'None until barrier stable',
                        moisturizer: 'Ceramide cream',
                        sunscreen: 'Fragrance-free, minimal-ingredient',
                        pm_retinoid: 'Bakuchiol 0.5%, 2x/week'
                    },
                    2: {
                        cleanser: 'Same + colloidal oatmeal',
                        am_antioxidant: 'Compounded melatonin + ceramide serum or green tea polyphenol serum',
                        moisturizer: 'Ceramide cream + occlusive ± pumpkin seed oil',
                        sunscreen: 'Same as Tier 1',
                        pm_retinoid: 'Encapsulated retinol 0.1–0.3%, 2–3x/week (once flare-free ≥4 weeks)'
                    },
                    3: {
                        cleanser: 'Prescriber-directed medicated wash',
                        am_antioxidant: 'Compounded melatonin ± green tea polyphenol blend with barrier repair',
                        moisturizer: 'Prescription barrier repair ± topical corticosteroid',
                        sunscreen: 'Same as Tier 1',
                        pm_retinoid: 'Low-dose prescription retinoid (dermatology co-management)'
                    }
                }
            },
            general: {
                name: 'General (Photoaging/Pigmentation/Maintenance)',
                tiers: {
                    1: {
                        cleanser: 'Gentle low-foaming gel or milk, fragrance-free',
                        am_antioxidant: 'Niacinamide or green tea polyphenol serum',
                        moisturizer: 'Standard ceramide-containing moisturizer',
                        sunscreen: 'SPF 30–50, format per preference',
                        pm_retinoid: 'OTC retinol (encapsulated/low %), 2–3x/week if naive'
                    },
                    2: {
                        cleanser: 'Cream cleanser if dry/age ≥55, or gel if oily',
                        am_antioxidant: 'Vitamin C + ferulic acid + vitamin E, or green tea polyphenol serum',
                        moisturizer: 'Richer ceramide cream ± peptides if dry/postmenopausal',
                        sunscreen: 'SPF 50, tinted if Fitzpatrick V–VI',
                        pm_retinoid: 'Tretinoin 0.025–0.05%'
                    },
                    3: {
                        cleanser: 'Active-ingredient cleanser only if secondary acne-prone tendency',
                        am_antioxidant: 'Compounded vitamin C cream or GHK-Cu cream',
                        moisturizer: 'Ceramide + peptide complex',
                        sunscreen: 'SPF 50, reapplication-friendly',
                        pm_retinoid: 'Compounded tretinoin ± GHK-Cu or estriol'
                    }
                }
            }
        },
        safetyGates: {
            pregnant_breastfeeding: {
                question: 'Pregnant or breastfeeding?',
                restrictions: 'NO retinoids and NO hydroquinone. Use azelaic acid or bakuchiol for PM; stabilized vitamin C/niacinamide/green tea for AM; mineral sunscreen only.'
            },
            autoimmune: {
                question: 'Active autoimmune disease or on immunosuppressants/biologics?',
                restrictions: 'Start Tier 1 all steps. Extend titration. One new active at a time.'
            },
            skin_cancer: {
                question: 'Skin cancer history, family melanoma history, or current lesion without dermatology clearance?',
                restrictions: 'Hold all regimen changes and hyperpigmentation module pending dermatology clearance.'
            },
            scarring: {
                question: 'History of keloid or hypertrophic scarring?',
                restrictions: 'Avoid aggressive peels/ablative procedures. Introduce actives one at a time with patch testing.'
            },
            allergies: {
                question: 'Known allergy to specific ingredient class?',
                restrictions: 'Exclude that class from all tiers; substitute with alternative at same tier level.'
            }
        },
        hyperpigmentation_module: {
            name: 'Hyperpigmentation/Melasma Add-On Module',
            tier1: 'Niacinamide 5%, kojic acid 1–2%, topical tranexamic acid 2–5%, azelaic acid 10–15%, melatonin, green tea polyphenol + daily mineral sunscreen with iron oxides',
            tier2: 'Add hydroquinone 2–4% (cycled 8–12 weeks on/4 off) + tranexamic acid 5% and/or kojic acid + mineral sunscreen',
            tier3: 'Compounded quad: hydroquinone 4% + tretinoin 0.025–0.05% + mild corticosteroid + tranexamic acid + mineral sunscreen'
        }
    };

    res.json(algorithmData);
});

// EXPORT CSV
app.get('/api/export-csv', authenticateToken, (req, res) => {
    const patients = db.prepare(`
        SELECT
            p.patient_number,
            p.name,
            p.date_of_birth,
            p.sex,
            p.fitzpatrick_type,
            p.skin_type,
            u.username,
            COALESCE(q.pathway, 'Pending') as pathway,
            COUNT(q.id) as assessments_completed
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN questionnaire_responses q ON p.id = q.patient_id
        WHERE p.status = 'active'
        GROUP BY p.id
        ORDER BY p.patient_number ASC
    `).all();

    let csv = 'Patient #,Name,DOB,Sex,Fitzpatrick,Skin Type,Created By,Pathway,Assessments\n';
    patients.forEach(row => {
        csv += `${escapeCSV(row.patient_number)},${escapeCSV(row.name)},${escapeCSV(row.date_of_birth)},${escapeCSV(row.sex)},${escapeCSV(row.fitzpatrick_type)},${escapeCSV(row.skin_type)},${escapeCSV(row.username)},${escapeCSV(row.pathway)},${escapeCSV(row.assessments_completed)}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=patients.csv');
    res.send(csv);
});

// ANALYTICS
app.get('/api/analytics', authenticateToken, (req, res) => {
    try {
        const totalPatients = db.prepare('SELECT COUNT(*) as count FROM patients WHERE status = "active"').get();
        const completedQuestionn = db.prepare(
            'SELECT COUNT(*) as count FROM questionnaire_responses'
        ).get();

        const pathwayCounts = db.prepare(`
            SELECT pathway, COUNT(*) as count
            FROM questionnaire_responses
            GROUP BY pathway
            ORDER BY count DESC
        `).all();

        res.json({
            totalPatients: totalPatients.count,
            completedAssessments: completedQuestionn.count,
            topPathway: pathwayCounts[0]?.pathway || 'None',
            pathwayBreakdown: pathwayCounts
        });
    } catch (error) {
        res.status(500).json({ error: 'Analytics error' });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing database...');
    db.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing database...');
    db.close();
    process.exit(0);
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Mara Dermatology API running on port ${PORT}`);
});

module.exports = app;
