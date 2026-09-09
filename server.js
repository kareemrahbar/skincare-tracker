const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_PATH || './data.db';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Security headers - Fix CSP and allow app to work
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
    next();
});

// Serve static files
app.use(express.static('public'));

// Initialize Database
let db;
try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Create tables if they don't exist
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
            age INTEGER,
            gender TEXT,
            skin_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS safety_gates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            gate_passed BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );

        CREATE TABLE IF NOT EXISTS regimen_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            pathway TEXT NOT NULL,
            tier INTEGER NOT NULL,
            regimen TEXT NOT NULL,
            completed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );

        CREATE TABLE IF NOT EXISTS session_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);

    console.log('Database initialized successfully');
} catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
}

// Helper: Get next patient number
function getNextPatientNumber() {
    const result = db.prepare('SELECT MAX(patient_number) as max_num FROM patients').get();
    return (result?.max_num || 0) + 1;
}

// Helper: Log action
function logAction(userId, action, details = '') {
    db.prepare('INSERT INTO session_log (user_id, action, details) VALUES (?, ?, ?)')
        .run(userId, action, details);
}

// Routes

// Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
            .run(username, hashedPassword);

        res.json({ id: result.lastInsertRowid, username });
    } catch (error) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    logAction(user.id, 'login');
    res.json({ id: user.id, username: user.username });
});

// Create Patient
app.post('/api/patients', (req, res) => {
    const { userId, name, age, gender, skinType } = req.body;

    if (!userId || !name) {
        return res.status(400).json({ error: 'User ID and patient name required' });
    }

    const patientNumber = getNextPatientNumber();
    const result = db.prepare(
        'INSERT INTO patients (patient_number, user_id, name, age, gender, skin_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(patientNumber, userId, name, age, gender, skinType);

    logAction(userId, 'create_patient', `Patient #${patientNumber}: ${name}`);

    res.json({ id: result.lastInsertRowid, patient_number: patientNumber, name });
});

// Get User's Patients
app.get('/api/patients/:userId', (req, res) => {
    const { userId } = req.params;
    const patients = db.prepare(`
        SELECT p.*,
               COALESCE(r.pathway, 'Pending') as pathway,
               COALESCE(r.completed, 0) as completed
        FROM patients p
        LEFT JOIN regimen_assignments r ON p.id = r.patient_id
        WHERE p.user_id = ?
        ORDER BY p.patient_number DESC
    `).all(userId);

    res.json(patients);
});

// Get All Patients (Global)
app.get('/api/all-patients', (req, res) => {
    const patients = db.prepare(`
        SELECT p.*, u.username,
               COALESCE(r.pathway, 'Pending') as pathway,
               COALESCE(r.tier, 0) as tier,
               COALESCE(r.completed, 0) as completed
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN regimen_assignments r ON p.id = r.patient_id
        ORDER BY p.patient_number ASC
    `).all();

    res.json(patients);
});

// Start Questionnaire
app.post('/api/start-questionnaire', (req, res) => {
    const { patientId, userId } = req.body;

    if (!patientId || !userId) {
        return res.status(400).json({ error: 'Patient ID and User ID required' });
    }

    logAction(userId, 'start_questionnaire', `Patient ID: ${patientId}`);

    // Questionnaire pathways
    const pathways = {
        acne: {
            name: 'Acne-Prone Skin',
            tiers: {
                1: 'Cleanser, Exfoliant, Moisturizer, Sunscreen',
                2: 'Cleanser, Exfoliant, Toner, Moisturizer, Sunscreen, Acne Treatment',
                3: 'Cleanser, Exfoliant, Toner, Serum, Moisturizer, Sunscreen, Prescription Retinoid, Spot Treatment'
            }
        },
        rosacea: {
            name: 'Rosacea-Sensitive Skin',
            tiers: {
                1: 'Gentle Cleanser, Moisturizer, Mineral Sunscreen',
                2: 'Gentle Cleanser, Toner, Moisturizer, Mineral Sunscreen, Calming Serum',
                3: 'Gentle Cleanser, Hydrating Toner, Calming Serum, Rich Moisturizer, Mineral Sunscreen, Niacinamide Treatment'
            }
        },
        eczema: {
            name: 'Eczema-Prone Skin',
            tiers: {
                1: 'Gentle Cleanser, Heavy Moisturizer, Fragrance-Free Products',
                2: 'Gentle Cleanser, Hydrating Toner, Heavy Moisturizer, Ceramide Treatment, Fragrance-Free',
                3: 'Gentle Cleanser, Hydrating Toner, Serum, Heavy Moisturizer, Ceramide Cream, Colloidal Oatmeal Treatment, Fragrance-Free Sunscreen'
            }
        },
        general: {
            name: 'General/Combination Skin',
            tiers: {
                1: 'Cleanser, Moisturizer, Sunscreen',
                2: 'Cleanser, Toner, Moisturizer, Sunscreen, Serum',
                3: 'Cleanser, Toner, Exfoliant, Serum, Moisturizer, Sunscreen, Treatment Product'
            }
        }
    };

    res.json({ pathways });
});

// Submit Questionnaire
app.post('/api/submit-questionnaire', (req, res) => {
    const { patientId, userId, pathway, tier, regimen } = req.body;

    if (!patientId || !pathway || !tier) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = db.prepare(`
            INSERT INTO regimen_assignments (patient_id, pathway, tier, regimen, completed)
            VALUES (?, ?, ?, ?, 1)
        `).run(patientId, pathway, tier, regimen || '');

        logAction(userId, 'complete_questionnaire', `Patient ${patientId}: ${pathway} Tier ${tier}`);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get Analytics
app.get('/api/analytics', (req, res) => {
    const totalPatients = db.prepare('SELECT COUNT(*) as count FROM patients').get();
    const completedQuestionnaires = db.prepare(
        'SELECT COUNT(*) as count FROM regimen_assignments WHERE completed = 1'
    ).get();

    const pathwayCounts = db.prepare(`
        SELECT pathway, COUNT(*) as count
        FROM regimen_assignments
        WHERE completed = 1
        GROUP BY pathway
        ORDER BY count DESC
    `).all();

    const completionRate = totalPatients.count > 0
        ? Math.round((completedQuestionnaires.count / totalPatients.count) * 100)
        : 0;

    res.json({
        totalPatients: totalPatients.count,
        completedQuestionnaires: completedQuestionnaires.count,
        completionRate,
        topPathway: pathwayCounts[0]?.pathway || 'None',
        pathwayBreakdown: pathwayCounts
    });
});

// Export CSV
app.get('/api/export-csv', (req, res) => {
    const patients = db.prepare(`
        SELECT
            p.patient_number as 'Patient #',
            p.name as 'Name',
            p.age as 'Age',
            p.gender as 'Gender',
            p.skin_type as 'Skin Type',
            u.username as 'Created By',
            COALESCE(r.pathway, 'No Data') as 'Pathway',
            COALESCE(r.tier, '') as 'Tier',
            COALESCE(r.regimen, '') as 'Recommended Regimen',
            CASE WHEN r.completed = 1 THEN 'Completed' ELSE 'Pending' END as 'Status'
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN regimen_assignments r ON p.id = r.patient_id
        ORDER BY p.patient_number ASC
    `).all();

    let csv = Object.keys(patients[0] || {}).join(',') + '\n';
    patients.forEach(row => {
        csv += Object.values(row).map(v => `"${v}"`).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=patients.csv');
    res.send(csv);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
