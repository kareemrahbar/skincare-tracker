// Global State
let currentUser = null;
let currentPatients = [];
let allPatients = [];

// DOM Elements
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const logoutBtn = document.getElementById('logoutBtn');
const userDisplay = document.getElementById('userDisplay');
const questionnaireModal = document.getElementById('questionnaireModal');
const closeQuestionnaireBtn = document.getElementById('closeQuestionnaireBtn');
const modalBody = document.getElementById('modalBody');

// Auth form switching
const switchToRegister = document.getElementById('switchToRegister');
const switchToLogin = document.getElementById('switchToLogin');

if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    });
}

if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    });
}

// App section tabs
document.querySelectorAll('.app-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const sectionName = e.target.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.app-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(sectionName).classList.add('active');
        e.target.classList.add('active');

        // Load data when switching to analytics
        if (sectionName === 'analytics') {
            loadAnalytics();
        }
    });
});

// Auth Events
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error('Login failed');

        const user = await response.json();
        currentUser = user;
        showApp();
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error('Registration failed');

        const user = await response.json();
        currentUser = user;
        showApp();
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    currentPatients = [];
    loginForm.reset();
    registerForm.reset();
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
});

// Show App
function showApp() {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userDisplay.textContent = `Logged in as: ${currentUser.username}`;
    loadDashboard();
}

// Dashboard
async function loadDashboard() {
    try {
        // Load user's patients
        const patientsRes = await fetch(`/api/patients/${currentUser.id}`);
        currentPatients = await patientsRes.json();

        // Load all patients
        const allRes = await fetch('/api/all-patients');
        allPatients = await allRes.json();

        // Update stats
        document.getElementById('totalPatients').textContent = allPatients.length;
        document.getElementById('yourPatients').textContent = currentPatients.length;

        const completedCount = allPatients.filter(p => p.completed).length;
        document.getElementById('completedCount').textContent = completedCount;

        const completionRate = allPatients.length > 0
            ? Math.round((completedCount / allPatients.length) * 100)
            : 0;
        document.getElementById('completionRate').textContent = completionRate + '%';
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

// Patients Section
const createPatientForm = document.getElementById('createPatientForm');
let newPatientForQuestionnaire = null;

createPatientForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('patientName').value;
    const age = document.getElementById('patientAge').value;
    const gender = document.getElementById('patientGender').value;
    const skinType = document.getElementById('patientSkinType').value;

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                name,
                age: parseInt(age),
                gender,
                skinType
            })
        });

        if (!response.ok) throw new Error('Failed to create patient');

        const patient = await response.json();
        createPatientForm.reset();
        loadPatientsList();
        loadDashboard();

        // Store patient info and start questionnaire immediately
        newPatientForQuestionnaire = patient;
        startQuestionnaire(patient.id, patient.patient_number);
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

async function loadPatientsList() {
    try {
        const response = await fetch(`/api/patients/${currentUser.id}`);
        const patients = await response.json();
        currentPatients = patients;

        const patientsList = document.getElementById('patientsList');
        patientsList.innerHTML = '';

        patients.forEach(patient => {
            const card = document.createElement('div');
            card.className = 'patient-card';
            card.innerHTML = `
                <div class="patient-info">
                    <div class="patient-id">Patient #${patient.patient_number}</div>
                    <div class="patient-name">${patient.name}</div>
                    <div class="patient-details">
                        <div>Age: ${patient.age || 'N/A'}</div>
                        <div>Gender: ${patient.gender || 'N/A'}</div>
                        <div>Skin Type: ${patient.skin_type || 'N/A'}</div>
                    </div>
                    <div class="patient-status">${patient.completed ? '✓ Completed' : '○ Pending'}</div>
                </div>
                <div class="patient-actions">
                    <button onclick="startQuestionnaire(${patient.id}, ${patient.patient_number})">
                        ${patient.completed ? 'View' : 'Start'} Questionnaire
                    </button>
                </div>
            `;
            patientsList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

// Questionnaire
async function startQuestionnaire(patientId, patientNumber) {
    try {
        const response = await fetch('/api/start-questionnaire', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, userId: currentUser.id })
        });

        const data = await response.json();
        const pathways = data.pathways;

        let html = `
            <div style="padding: 20px;">
                <h3>Select Pathway for Patient #${patientNumber}</h3>
                <div style="margin: 20px 0;">
        `;

        Object.entries(pathways).forEach(([key, pathway]) => {
            html += `
                <button style="
                    display: block;
                    width: 100%;
                    padding: 15px;
                    margin: 10px 0;
                    text-align: left;
                    border: 1px solid #ddd;
                    background: #f5f5f5;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 500;
                " onclick="selectPathway(${patientId}, '${key}', '${pathway.name}')">
                    ${pathway.name}
                </button>
            `;
        });

        html += `
                </div>
            </div>
        `;

        modalBody.innerHTML = html;
        questionnaireModal.classList.remove('hidden');
    } catch (error) {
        alert('Error starting questionnaire: ' + error.message);
    }
}

function selectPathway(patientId, pathwayKey, pathwayName) {
    const tiers = {
        acne: {
            1: 'Cleanser, Exfoliant, Moisturizer, Sunscreen',
            2: 'Cleanser, Exfoliant, Toner, Moisturizer, Sunscreen, Acne Treatment',
            3: 'Cleanser, Exfoliant, Toner, Serum, Moisturizer, Sunscreen, Prescription Retinoid, Spot Treatment'
        },
        rosacea: {
            1: 'Gentle Cleanser, Moisturizer, Mineral Sunscreen',
            2: 'Gentle Cleanser, Toner, Moisturizer, Mineral Sunscreen, Calming Serum',
            3: 'Gentle Cleanser, Hydrating Toner, Calming Serum, Rich Moisturizer, Mineral Sunscreen, Niacinamide Treatment'
        },
        eczema: {
            1: 'Gentle Cleanser, Heavy Moisturizer, Fragrance-Free Products',
            2: 'Gentle Cleanser, Hydrating Toner, Heavy Moisturizer, Ceramide Treatment, Fragrance-Free',
            3: 'Gentle Cleanser, Hydrating Toner, Serum, Heavy Moisturizer, Ceramide Cream, Colloidal Oatmeal Treatment, Fragrance-Free Sunscreen'
        },
        general: {
            1: 'Cleanser, Moisturizer, Sunscreen',
            2: 'Cleanser, Toner, Moisturizer, Sunscreen, Serum',
            3: 'Cleanser, Toner, Exfoliant, Serum, Moisturizer, Sunscreen, Treatment Product'
        }
    };

    const tierOptions = tiers[pathwayKey];

    let html = `
        <div style="padding: 20px;">
            <h3>Select Tier - ${pathwayName}</h3>
            <div style="margin: 20px 0;">
    `;

    Object.entries(tierOptions).forEach(([tier, regimen]) => {
        html += `
            <button style="
                display: block;
                width: 100%;
                padding: 15px;
                margin: 10px 0;
                text-align: left;
                border: 1px solid #ddd;
                background: #f5f5f5;
                cursor: pointer;
                font-size: 14px;
            " onclick="submitQuestionnaire(${patientId}, '${pathwayKey}', ${tier}, '${regimen}')">
                <strong>Tier ${tier}:</strong> ${regimen}
            </button>
        `;
    });

    html += `
            </div>
        </div>
    `;

    modalBody.innerHTML = html;
}

async function submitQuestionnaire(patientId, pathway, tier, regimen) {
    try {
        const response = await fetch('/api/submit-questionnaire', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patientId,
                userId: currentUser.id,
                pathway,
                tier,
                regimen
            })
        });

        if (!response.ok) throw new Error('Failed to submit');

        questionnaireModal.classList.add('hidden');
        loadPatientsList();
        loadDashboard();

        // Show success message with patient number if this was a newly created patient
        if (newPatientForQuestionnaire) {
            alert(`Patient #${newPatientForQuestionnaire.patient_number} created and questionnaire completed successfully!`);
            newPatientForQuestionnaire = null;
        } else {
            alert('Questionnaire submitted successfully!');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

closeQuestionnaireBtn.addEventListener('click', () => {
    questionnaireModal.classList.add('hidden');
});

// Analytics
async function loadAnalytics() {
    try {
        const analyticsRes = await fetch('/api/analytics');
        const analytics = await analyticsRes.json();

        document.getElementById('analyticsTotalCount').textContent = analytics.totalPatients;
        document.getElementById('analyticsCompletionRate').textContent = analytics.completionRate + '%';
        document.getElementById('analyticsTopPathway').textContent = analytics.topPathway || 'N/A';

        // Load all patients table
        const allRes = await fetch('/api/all-patients');
        allPatients = await allRes.json();

        const tableBody = document.getElementById('analyticsTable');
        tableBody.innerHTML = '';

        allPatients.forEach(patient => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>#${patient.patient_number}</td>
                <td>${patient.name}</td>
                <td>${patient.username}</td>
                <td>${patient.pathway || '-'}</td>
                <td>${patient.tier || '-'}</td>
                <td>${patient.completed ? '✓ Completed' : '○ Pending'}</td>
                <td>
                    <button style="padding: 5px 10px; font-size: 12px;" onclick="startQuestionnaire(${patient.id}, ${patient.patient_number})">
                        ${patient.completed ? 'View' : 'Start'}
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// Export CSV
document.getElementById('exportBtn').addEventListener('click', async () => {
    try {
        window.location.href = '/api/export-csv';
    } catch (error) {
        alert('Error exporting data: ' + error.message);
    }
});

// Initial load
console.log('App loaded');
