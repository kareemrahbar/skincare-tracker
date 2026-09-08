import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database initialization
const db = new Database('data.db');
db.pragma('journal_mode = WAL');

// Create tables
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      global_id INTEGER UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      patient_name TEXT NOT NULL,
      age INTEGER,
      sex TEXT,
      fitzpatrick TEXT,
      skin_type TEXT,
      primary_concern TEXT,
      sun_exposure TEXT,
      retinoid_history TEXT,
      questionnaire_status TEXT DEFAULT 'started',
      status_detail TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS safety_gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      pregnant_breastfeeding INTEGER DEFAULT 0,
      autoimmune INTEGER DEFAULT 0,
      cancer_history INTEGER DEFAULT 0,
      scarring_tendency INTEGER DEFAULT 0,
      allergies TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS regimen_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      pathway TEXT,
      tier INTEGER,
      cleanser TEXT,
      am_antioxidant TEXT,
      moisturizer TEXT,
      sunscreen TEXT,
      pm_retinoid TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS session_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      event_type TEXT,
      event_detail TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Get next global patient ID
function getNextGlobalPatientId() {
  const result = db.prepare('SELECT MAX(global_id) as max_id FROM patients').get();
  return (result?.max_id || 0) + 1;
}

// Authentication endpoints
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const result = stmt.run(username, hashedPassword);

    res.json({
      success: true,
      user_id: result.lastInsertRowid,
      username: username
    });
  } catch (error) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user_id: user.id,
      username: user.username
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Patient management endpoints
app.post('/api/patients', (req, res) => {
  const { user_id, patient_name, age, sex, fitzpatrick, skin_type, primary_concern, sun_exposure, retinoid_history } = req.body;

  if (!user_id || !patient_name) {
    return res.status(400).json({ error: 'User ID and patient name required' });
  }

  try {
    const global_id = getNextGlobalPatientId();
    const stmt = db.prepare(`
      INSERT INTO patients (
        global_id, user_id, patient_name, age, sex, fitzpatrick, skin_type,
        primary_concern, sun_exposure, retinoid_history, questionnaire_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started')
    `);

    const result = stmt.run(
      global_id, user_id, patient_name, age, sex, fitzpatrick, skin_type,
      primary_concern, sun_exposure, retinoid_history
    );

    // Log session event
    db.prepare(`
      INSERT INTO session_log (patient_id, user_id, event_type, event_detail)
      VALUES (?, ?, 'patient_created', ?)
    `).run(result.lastInsertRowid, user_id, `Patient created: ${patient_name}`);

    res.json({
      success: true,
      patient_id: result.lastInsertRowid,
      global_id: global_id,
      patient_name: patient_name
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create patient', detail: error.message });
  }
});

app.get('/api/patients/user/:user_id', (req, res) => {
  const { user_id } = req.params;

  try {
    const patients = db.prepare(`
      SELECT id, global_id, patient_name, age, sex, fitzpatrick, skin_type,
             primary_concern, questionnaire_status, created_at
      FROM patients
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(user_id);

    res.json({ patients });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

app.get('/api/patients/:patient_id', (req, res) => {
  const { patient_id } = req.params;

  try {
    const patient = db.prepare(`
      SELECT p.*, u.username
      FROM patients p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(patient_id);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const safetyGates = db.prepare('SELECT * FROM safety_gates WHERE patient_id = ?').get(patient_id);
    const regimen = db.prepare('SELECT * FROM regimen_assignments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1').get(patient_id);
    const sessionLog = db.prepare(`
      SELECT event_type, event_detail, timestamp
      FROM session_log
      WHERE patient_id = ?
      ORDER BY timestamp DESC
    `).all(patient_id);

    res.json({
      patient,
      safety_gates: safetyGates,
      regimen,
      session_log: sessionLog
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patient details' });
  }
});

app.post('/api/patients/:patient_id/safety-gates', (req, res) => {
  const { patient_id } = req.params;
  const { pregnant_breastfeeding, autoimmune, cancer_history, scarring_tendency, allergies, user_id } = req.body;

  try {
    const existing = db.prepare('SELECT id FROM safety_gates WHERE patient_id = ?').get(patient_id);

    if (existing) {
      db.prepare(`
        UPDATE safety_gates
        SET pregnant_breastfeeding = ?, autoimmune = ?, cancer_history = ?, scarring_tendency = ?, allergies = ?
        WHERE patient_id = ?
      `).run(pregnant_breastfeeding, autoimmune, cancer_history, scarring_tendency, allergies, patient_id);
    } else {
      db.prepare(`
        INSERT INTO safety_gates (patient_id, pregnant_breastfeeding, autoimmune, cancer_history, scarring_tendency, allergies)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(patient_id, pregnant_breastfeeding, autoimmune, cancer_history, scarring_tendency, allergies);
    }

    // Log event
    const gatesFired = [];
    if (pregnant_breastfeeding) gatesFired.push('Pregnancy/Breastfeeding');
    if (autoimmune) gatesFired.push('Autoimmune');
    if (cancer_history) gatesFired.push('Cancer History');
    if (scarring_tendency) gatesFired.push('Scarring Tendency');

    db.prepare(`
      INSERT INTO session_log (patient_id, user_id, event_type, event_detail)
      VALUES (?, ?, 'safety_gates_completed', ?)
    `).run(patient_id, user_id, gatesFired.length > 0 ? `Gates fired: ${gatesFired.join(', ')}` : 'No gates fired');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save safety gates' });
  }
});

app.post('/api/patients/:patient_id/regimen', (req, res) => {
  const { patient_id } = req.params;
  const { pathway, tier, cleanser, am_antioxidant, moisturizer, sunscreen, pm_retinoid, user_id } = req.body;

  try {
    db.prepare(`
      INSERT INTO regimen_assignments (patient_id, pathway, tier, cleanser, am_antioxidant, moisturizer, sunscreen, pm_retinoid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(patient_id, pathway, tier, cleanser, am_antioxidant, moisturizer, sunscreen, pm_retinoid);

    db.prepare(`
      UPDATE patients
      SET questionnaire_status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(patient_id);

    db.prepare(`
      INSERT INTO session_log (patient_id, user_id, event_type, event_detail)
      VALUES (?, ?, 'regimen_assigned', ?)
    `).run(patient_id, user_id, `${pathway} pathway - Tier ${tier}`);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save regimen' });
  }
});

// Data analytics endpoints
app.get('/api/analytics/all-patients', (req, res) => {
  try {
    const patients = db.prepare(`
      SELECT p.id, p.global_id, p.patient_name, u.username, p.questionnaire_status,
             p.created_at, r.pathway, r.tier
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN regimen_assignments r ON p.id = r.patient_id
      ORDER BY p.global_id ASC
    `).all();

    res.json({ patients, total: patients.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

app.get('/api/analytics/failures', (req, res) => {
  try {
    const failures = db.prepare(`
      SELECT p.id, p.global_id, p.patient_name, u.username, p.questionnaire_status,
             p.status_detail, GROUP_CONCAT(sl.event_detail) as events
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN session_log sl ON p.id = sl.patient_id
      WHERE p.questionnaire_status != 'completed'
      GROUP BY p.id
      ORDER BY p.global_id ASC
    `).all();

    res.json({ failures, total: failures.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch failures' });
  }
});

app.get('/api/analytics/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, COUNT(p.id) as patient_count,
             SUM(CASE WHEN p.questionnaire_status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM users u
      LEFT JOIN patients p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
});

// Data export endpoint
app.get('/api/export/csv', (req, res) => {
  try {
    const patients = db.prepare(`
      SELECT p.global_id, u.username, p.patient_name, p.age, p.sex, p.fitzpatrick,
             p.skin_type, p.primary_concern, p.questionnaire_status, p.created_at,
             r.pathway, r.tier
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN regimen_assignments r ON p.id = r.patient_id
      ORDER BY p.global_id ASC
    `).all();

    let csv = 'Global ID,Username,Patient Name,Age,Sex,Fitzpatrick,Skin Type,Primary Concern,Status,Created At,Pathway,Tier\n';
    patients.forEach(p => {
      csv += `${p.global_id},"${p.username}","${p.patient_name}",${p.age},"${p.sex}","${p.fitzpatrick}","${p.skin_type}","${p.primary_concern}","${p.questionnaire_status}","${p.created_at}","${p.pathway || ''}","${p.tier || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="patient_data.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start
initializeDatabase();

app.listen(PORT, () => {
  console.log(`Skincare Test Patient Tracker running on http://localhost:${PORT}`);
  console.log('Database: data.db');
});
