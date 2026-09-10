let algorithmData = null;
let currentUser = null;
let currentPatientForQuestionnaire = {};
let safetyGates = [];
let currentPathwayKey = null;
let modalOpen = false;

// Fetch algorithm data on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadAlgorithmData();
        setupAuthHandlers();
        setupAppHandlers();
        checkAuthStatus();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

async function loadAlgorithmData() {
    try {
        const response = await fetch('/api/algorithm-data');
        algorithmData = await response.json();
    } catch (error) {
        console.error('Failed to load algorithm data:', error);
    }
}

function checkAuthStatus() {
    const user = localStorage.getItem('currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        showAppSection();
        document.getElementById('userDisplay').textContent = `Logged in as: ${currentUser.username}`;
        loadPatients();
    }
}

function setupAuthHandlers() {
    document.getElementById('switchToRegister').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').classList.remove('active');
        document.getElementById('registerForm').classList.add('active');
    });

    document.getElementById('switchToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').classList.remove('active');
        document.getElementById('loginForm').classList.add('active');
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                currentUser = { id: data.userId, username: data.username };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                showAppSection();
                document.getElementById('userDisplay').textContent = `Logged in as: ${currentUser.username}`;
                loadPatients();
                document.getElementById('loginForm').reset();
            } else {
                alert('Login failed. Please check your credentials.');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login error. Please try again.');
        }
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                alert('Account created successfully! Please log in.');
                document.getElementById('registerForm').classList.remove('active');
                document.getElementById('loginForm').classList.add('active');
                document.getElementById('registerForm').reset();
            } else {
                const error = await response.json();
                alert(`Registration failed: ${error.error}`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration error. Please try again.');
        }
    });
}

function setupAppHandlers() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        fetch('/api/logout', { method: 'POST' }).then(() => {
            localStorage.removeItem('currentUser');
            currentUser = null;
            location.reload();
        });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionId = e.target.dataset.section;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(sectionId).classList.add('active');

            if (sectionId === 'analytics') {
                loadAnalytics();
            }
        });
    });

    document.getElementById('createPatientForm').addEventListener('submit', handlePatientCreation);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    document.getElementById('closeQuestionnaireBtn').addEventListener('click', closeQuestionnaireModal);
}

async function handlePatientCreation(e) {
    e.preventDefault();

    const csrfToken = await getCSRFToken();

    const patientData = {
        name: document.getElementById('patientName').value,
        date_of_birth: document.getElementById('patientDOB').value,
        sex: document.getElementById('patientSex').value,
        hormonal_status: document.getElementById('patientHormonalStatus').value,
        fitzpatrick_type: document.getElementById('patientFitzpatrick').value,
        skin_type: document.getElementById('patientSkinType').value,
        diagnosed_condition: document.getElementById('patientCondition').value,
        primary_concern: document.getElementById('patientConcern').value,
        sun_exposure: document.getElementById('patientSunExposure').value,
        retinoid_history: document.getElementById('patientRetinoidHistory').value,
        autoimmune_flag: document.getElementById('autoimmuneFlag').checked,
        skin_cancer_flag: document.getElementById('skinCancerFlag').checked,
        scarring_flag: document.getElementById('scarringFlag').checked,
        allergies: document.getElementById('patientAllergies').value
    };

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(patientData)
        });

        if (response.ok) {
            const result = await response.json();
            currentPatientForQuestionnaire = result;
            openQuestionnaireModal(result);
            document.getElementById('createPatientForm').reset();
            loadPatients();
        } else {
            const error = await response.json();
            alert(`Error creating patient: ${error.error}`);
        }
    } catch (error) {
        console.error('Patient creation error:', error);
    }
}

async function getCSRFToken() {
    try {
        const response = await fetch('/api/csrf-token');
        const data = await response.json();
        return data.csrfToken;
    } catch (error) {
        console.error('CSRF token error:', error);
        return '';
    }
}

function openQuestionnaireModal(patient) {
    if (modalOpen) return;
    modalOpen = true;

    const modalBody = document.getElementById('modalBody');
    let html = `<div class="questionnaire-form">`;

    // Safety gates
    html += `<div class="safety-gates-section">`;
    html += `<h3>Safety Gate Evaluation</h3>`;

    safetyGates = evaluateSafetyGates(patient);

    if (safetyGates.length > 0) {
        html += `<div class="safety-gates-list">`;
        safetyGates.forEach(gate => {
            html += `<div class="safety-gate-warning">⚠️ ${gate.question}<br><strong>${gate.restrictions}</strong></div>`;
        });
        html += `</div>`;
    } else {
        html += `<p style="color: green;">✓ No contraindications detected</p>`;
    }

    html += `</div>`;

    // Pathway selection
    html += `<div class="pathway-selection">`;
    html += `<h3>Select Treatment Pathway</h3>`;
    html += `<div class="pathway-options">`;

    Object.keys(algorithmData.pathways).forEach(key => {
        const pathway = algorithmData.pathways[key];
        html += `<button type="button" class="pathway-btn" data-pathway="${key}">${pathway.name}</button>`;
    });

    html += `</div></div>`;
    html += `<div id="tierSelection" style="display: none; margin-top: 20px;"></div>`;
    html += `<div id="optionalModules" style="display: none; margin-top: 20px;"></div>`;
    html += `</div>`;

    modalBody.innerHTML = html;

    // Pathway button handlers
    document.querySelectorAll('.pathway-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPathwayKey = btn.dataset.pathway;
            selectPathway(currentPathwayKey);
        });
    });

    document.getElementById('questionnaireModal').classList.remove('hidden');
}

function evaluateSafetyGates(patient) {
    const gates = [];

    if (patient.autoimmune_flag) {
        gates.push(algorithmData.safetyGates.autoimmune);
    }
    if (patient.skin_cancer_flag) {
        gates.push(algorithmData.safetyGates.skin_cancer);
    }
    if (patient.scarring_flag) {
        gates.push(algorithmData.safetyGates.scarring);
    }
    if (patient.allergies) {
        gates.push({
            question: `Known allergies: ${patient.allergies}`,
            restrictions: algorithmData.safetyGates.allergies.restrictions
        });
    }

    return gates;
}

function selectPathway(pathwayKey) {
    const pathway = algorithmData.pathways[pathwayKey];
    const tierSelection = document.getElementById('tierSelection');

    let html = `<div class="tier-selection">`;
    html += `<h3>${pathway.name} - Select Intensity Tier</h3>`;
    html += `<fieldset><legend>Tier Selection</legend>`;

    Object.keys(pathway.tiers).forEach(tierNum => {
        const tier = pathway.tiers[tierNum];
        html += `<label class="radio-label">`;
        html += `<input type="radio" name="tier" value="${tierNum}" data-tier-obj='${JSON.stringify(tier)}' required>`;
        html += `<strong>Tier ${tierNum}</strong> - `;
        if (tierNum === '1') html += `Gentle introduction`;
        if (tierNum === '2') html += `Moderate intensity`;
        if (tierNum === '3') html += `Advanced/Prescription`;
        html += `</label>`;
    });

    html += `</fieldset></div>`;

    // Optional modules
    html += `<div class="optional-modules">`;
    html += `<h3>Optional Add-On Modules</h3>`;

    if (pathwayKey !== 'rosacea') {
        html += `<label class="checkbox-label">`;
        html += `<input type="checkbox" id="hyperpigmentationModule" data-module="hyperpigmentation">`;
        html += `Hyperpigmentation/Melasma Module`;
        html += `</label>`;
    }

    html += `<label class="checkbox-label">`;
    html += `<input type="checkbox" id="compoundedActives" data-module="compounded">`;
    html += `Compounded Actives Available`;
    html += `</label>`;

    html += `<label>Botanical Adjuncts (optional)`;
    html += `<input type="text" id="botanicalAdjuncts" placeholder="e.g., centella, green tea, melatonin" maxlength="200">`;
    html += `</label>`;

    html += `</div>`;

    html += `<div class="regimen-display" id="regimenDisplay"></div>`;

    html += `<button type="button" id="submitAssessmentBtn" class="btn-primary" style="margin-top: 20px;">Submit Assessment</button>`;

    tierSelection.innerHTML = html;
    tierSelection.style.display = 'block';

    // Tier radio handlers
    document.querySelectorAll('input[name="tier"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const tier = JSON.parse(e.target.dataset.tierObj);
            displayRegimen(tier, pathwayKey);
        });
    });

    document.getElementById('submitAssessmentBtn').addEventListener('click', submitAssessment);
}

function displayRegimen(tier, pathwayKey) {
    const display = document.getElementById('regimenDisplay');
    let html = `<div class="regimen-card">`;
    html += `<h4>Recommended Regimen</h4>`;
    html += `<p><strong>Cleanser:</strong> ${tier.cleanser}</p>`;
    html += `<p><strong>AM Antioxidant:</strong> ${tier.am_antioxidant}</p>`;
    html += `<p><strong>Moisturizer:</strong> ${tier.moisturizer}</p>`;
    html += `<p><strong>Sunscreen:</strong> ${tier.sunscreen}</p>`;
    html += `<p><strong>PM Retinoid:</strong> ${tier.pm_retinoid}</p>`;
    html += `</div>`;
    display.innerHTML = html;
}

async function submitAssessment() {
    const selectedTier = document.querySelector('input[name="tier"]:checked');
    if (!selectedTier) {
        alert('Please select a tier');
        return;
    }

    const csrfToken = await getCSRFToken();
    const tierObj = JSON.parse(selectedTier.dataset.tierObj);

    const assessmentData = {
        patientId: currentPatientForQuestionnaire.id,
        sex: currentPatientForQuestionnaire.sex,
        hormonal_status: currentPatientForQuestionnaire.hormonal_status,
        fitzpatrick_type: currentPatientForQuestionnaire.fitzpatrick_type,
        skin_type: currentPatientForQuestionnaire.skin_type,
        diagnosed_condition: currentPatientForQuestionnaire.diagnosed_condition,
        primary_concern: currentPatientForQuestionnaire.primary_concern,
        sun_exposure: currentPatientForQuestionnaire.sun_exposure,
        retinoid_history: currentPatientForQuestionnaire.retinoid_history,
        autoimmune_flag: currentPatientForQuestionnaire.autoimmune_flag,
        skin_cancer_flag: currentPatientForQuestionnaire.skin_cancer_flag,
        scarring_flag: currentPatientForQuestionnaire.scarring_flag,
        allergies: currentPatientForQuestionnaire.allergies,
        pathway: currentPathwayKey,
        safetyGates: safetyGates.map(g => g.question),
        tiers: {
            cleanser: parseInt(selectedTier.value),
            am_antioxidant: parseInt(selectedTier.value),
            moisturizer: parseInt(selectedTier.value),
            sunscreen: parseInt(selectedTier.value),
            pm_retinoid: parseInt(selectedTier.value)
        },
        hyperpigmentation: document.getElementById('hyperpigmentationModule')?.checked || false,
        compounded: document.getElementById('compoundedActives')?.checked || false,
        botanical: document.getElementById('botanicalAdjuncts')?.value || null
    };

    try {
        const response = await fetch('/api/questionnaire/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(assessmentData)
        });

        if (response.ok) {
            alert('✓ Assessment submitted successfully!');
            closeQuestionnaireModal();
            loadPatients();
        } else {
            const error = await response.json();
            alert(`Submission error: ${error.error}`);
        }
    } catch (error) {
        console.error('Submission error:', error);
    }
}

function closeQuestionnaireModal() {
    document.getElementById('questionnaireModal').classList.add('hidden');
    modalOpen = false;
    currentPatientForQuestionnaire = {};
    safetyGates = [];
    currentPathwayKey = null;
}

async function loadPatients() {
    try {
        const response = await fetch(`/api/patients/${currentUser.id}`);
        const patients = await response.json();

        const patientsList = document.getElementById('patientsList');
        patientsList.innerHTML = '';

        patients.forEach(patient => {
            const card = document.createElement('div');
            card.className = 'patient-card';
            card.innerHTML = `
                <h4>Patient #${patient.patient_number}: ${patient.name}</h4>
                <p>DOB: ${patient.date_of_birth}</p>
                <p>Pathway: ${patient.pathway}</p>
                <p>Assessments: ${patient.questionnaires_completed}</p>
            `;
            patientsList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function loadAnalytics() {
    try {
        const response = await fetch('/api/all-patients');
        const patients = await response.json();

        const analyticsTable = document.getElementById('analyticsTable');
        analyticsTable.innerHTML = '';

        let totalCount = 0;
        let completedCount = 0;

        patients.forEach(patient => {
            totalCount++;
            if (patient.pathway !== 'Pending') completedCount++;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${patient.patient_number}</td>
                <td>${patient.name}</td>
                <td>${patient.pathway}</td>
                <td>${patient.questionnaires_completed}</td>
                <td>${patient.username}</td>
                <td>${patient.date_of_birth}</td>
            `;
            analyticsTable.appendChild(row);
        });

        document.getElementById('analyticsTotalCount').textContent = totalCount;
        document.getElementById('analyticsCompleted').textContent = completedCount;

        const pathwayCounts = {};
        patients.forEach(p => {
            if (p.pathway !== 'Pending') {
                pathwayCounts[p.pathway] = (pathwayCounts[p.pathway] || 0) + 1;
            }
        });

        const topPathway = Object.entries(pathwayCounts).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('analyticsTopPathway').textContent = topPathway ? topPathway[0] : '-';
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

async function exportCSV() {
    try {
        window.location.href = '/api/export-csv';
    } catch (error) {
        console.error('Export error:', error);
    }
}

function showAppSection() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
}

function updateHormonalStatus() {
    const sex = document.getElementById('patientSex').value;
    const statusSelect = document.getElementById('patientHormonalStatus');
    statusSelect.innerHTML = '<option value="">Select status</option>';

    if (sex === 'Male') {
        statusSelect.innerHTML += '<option value="N/A">N/A</option>';
    } else if (sex === 'Female') {
        statusSelect.innerHTML += `
            <option value="Premenopausal">Premenopausal</option>
            <option value="Perimenopausal">Perimenopausal</option>
            <option value="Postmenopausal">Postmenopausal</option>
            <option value="Pregnant-Breastfeeding">Pregnant/Breastfeeding</option>
        `;
    }
}
