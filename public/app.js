// Global state
let currentUser = null;
let currentPatient = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showDashboard();
  } else {
    showAuthScreen();
  }

  // Auth form handlers
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('create-patient-form').addEventListener('submit', handleCreatePatient);
});

// Auth Handlers
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  if (tab === 'login') {
    document.getElementById('login-form').classList.add('active');
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
  } else {
    document.getElementById('register-form').classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (response.ok) {
      currentUser = { id: data.user_id, username: data.username };
      localStorage.setItem('user', JSON.stringify(currentUser));
      showDashboard();
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Connection error: ' + err.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const errorDiv = document.getElementById('register-error');

  if (password.length < 6) {
    errorDiv.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (response.ok) {
      currentUser = { id: data.user_id, username: data.username };
      localStorage.setItem('user', JSON.stringify(currentUser));
      showDashboard();
    } else {
      errorDiv.textContent = data.error || 'Registration failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Connection error: ' + err.message;
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('user');
  location.reload();
}

// Screen Management
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('dashboard-screen').style.display = 'none';
}

function showDashboard() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'block';
  document.getElementById('current-username').textContent = currentUser.username;
  loadPatients();
}

// Dashboard Navigation
function switchDashboardTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

  document.getElementById(tab + '-tab').classList.add('active');
  event.target.classList.add('active');

  if (tab === 'analytics') {
    loadAnalytics();
  }
}

// Patient Management
async function loadPatients() {
  try {
    const response = await fetch(`/api/patients/user/${currentUser.id}`);
    const data = await response.json();

    const list = document.getElementById('patients-list');
    if (data.patients.length === 0) {
      list.innerHTML = '<p class="empty-state">No test patients yet. Create one to get started.</p>';
      return;
    }

    list.innerHTML = data.patients.map(p => `
      <div class="patient-card" onclick="viewPatient(${p.id})">
        <div class="patient-id">Patient #${p.global_id}</div>
        <div class="patient-name">${p.patient_name}</div>
        <div class="patient-info">
          <span>${p.age ? p.age + ' years' : 'Age: —'}</span>
          <span>${p.sex || '—'}</span>
        </div>
        <div class="patient-info">
          Fitzpatrick: ${p.fitzpatrick || '—'} | Skin: ${p.skin_type || '—'}
        </div>
        <div class="patient-info">
          Concern: ${p.primary_concern || '—'}
        </div>
        <span class="patient-status status-${p.questionnaire_status.replace('/', '-')}">${p.questionnaire_status}</span>
        <div class="patient-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); startQuestionnaire(${p.id})">Start Questionnaire</button>
          <button class="btn btn-secondary" onclick="event.stopPropagation(); viewPatient(${p.id})">Details</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading patients:', err);
  }
}

function openCreatePatientModal() {
  document.getElementById('create-patient-modal').classList.add('active');
}

function closeCreatePatientModal() {
  document.getElementById('create-patient-modal').classList.remove('active');
  document.getElementById('create-patient-form').reset();
}

async function handleCreatePatient(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('create-error');

  const patientData = {
    user_id: currentUser.id,
    patient_name: document.getElementById('patient-name').value,
    age: document.getElementById('patient-age').value || null,
    sex: document.getElementById('patient-sex').value,
    fitzpatrick: document.getElementById('patient-fitzpatrick').value,
    skin_type: document.getElementById('patient-skin-type').value,
    primary_concern: document.getElementById('patient-concern').value,
    sun_exposure: document.getElementById('patient-sun').value,
    retinoid_history: document.getElementById('patient-retinoid').value
  };

  try {
    const response = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    });

    const data = await response.json();
    if (response.ok) {
      closeCreatePatientModal();
      loadPatients();
    } else {
      errorDiv.textContent = data.error || 'Failed to create patient';
    }
  } catch (err) {
    errorDiv.textContent = 'Connection error: ' + err.message;
  }
}

async function viewPatient(patientId) {
  try {
    const response = await fetch(`/api/patients/${patientId}`);
    const data = response.json();

    document.getElementById('patient-detail-title').textContent = `Patient #${(await data).patient.global_id} - ${(await data).patient.patient_name}`;
    document.getElementById('patient-detail-content').innerHTML = `
      <div style="padding: 20px;">
        <h3>Patient Information</h3>
        <p><strong>Name:</strong> ${(await data).patient.patient_name}</p>
        <p><strong>Age:</strong> ${(await data).patient.age || '—'}</p>
        <p><strong>Sex:</strong> ${(await data).patient.sex || '—'}</p>
        <p><strong>Fitzpatrick Type:</strong> ${(await data).patient.fitzpatrick || '—'}</p>
        <p><strong>Skin Type:</strong> ${(await data).patient.skin_type || '—'}</p>
        <p><strong>Primary Concern:</strong> ${(await data).patient.primary_concern || '—'}</p>
        <p><strong>Sun Exposure:</strong> ${(await data).patient.sun_exposure || '—'}</p>
        <p><strong>Retinoid History:</strong> ${(await data).patient.retinoid_history || '—'}</p>
        <p><strong>Status:</strong> ${(await data).patient.questionnaire_status}</p>

        <h3 style="margin-top: 24px;">Session Activity</h3>
        ${((await data).session_log && (await data).session_log.length > 0 ?
          `<ul style="margin: 12px 0 0 20px;">
            ${(await data).session_log.map(log => `<li>${log.event_type}: ${log.event_detail} (${new Date(log.timestamp).toLocaleString()})</li>`).join('')}
          </ul>`
          : '<p>No activity yet</p>'
        )}
      </div>
    `;
    document.getElementById('patient-detail-modal').classList.add('active');
  } catch (err) {
    console.error('Error loading patient details:', err);
  }
}

function closePatientDetailModal() {
  document.getElementById('patient-detail-modal').classList.remove('active');
}

// Questionnaire
async function startQuestionnaire(patientId) {
  currentPatient = patientId;
  const modal = document.getElementById('questionnaire-modal');
  const content = document.getElementById('questionnaire-content');

  content.innerHTML = `
    <div style="padding: 24px;">
      <div class="questionnaire-section">
        <div class="questionnaire-title">Step 1: Safety Gates</div>
        <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 13px;">
          Check any that apply to this patient. Safety gates override all other logic.
        </p>
        <div class="checkbox-group">
          <label>
            <input type="checkbox" id="gate-pregnant"> Pregnant or breastfeeding
          </label>
          <label>
            <input type="checkbox" id="gate-autoimmune"> Active autoimmune disease or immunosuppressant therapy
          </label>
          <label>
            <input type="checkbox" id="gate-cancer"> Personal skin cancer history or lesion of concern
          </label>
          <label>
            <input type="checkbox" id="gate-scarring"> Keloid or hypertrophic scarring tendency
          </label>
          <label style="margin-top: 12px;">
            <input type="text" id="gate-allergies" placeholder="Known allergies (optional)" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </label>
        </div>
      </div>

      <div class="questionnaire-section">
        <div class="questionnaire-title">Step 2: Select Primary Pathway</div>
        <div id="pathway-options"></div>
      </div>

      <div class="questionnaire-section" id="tier-section" style="display: none;">
        <div class="questionnaire-title">Step 3: Select Tier</div>
        <div class="tier-selector" id="tier-options"></div>
      </div>

      <div class="questionnaire-section" id="regimen-section" style="display: none;">
        <div class="questionnaire-title">Step 4: Recommended Regimen</div>
        <div id="regimen-display"></div>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button class="btn btn-primary" onclick="submitQuestionnaire()">Save & Complete</button>
        <button class="btn btn-secondary" onclick="closeQuestionnaireModal()">Cancel</button>
      </div>
    </div>
  `;

  // Pathway options
  const pathways = [
    { id: 'acne', name: 'ACNE', desc: 'Comedonal or inflammatory acne' },
    { id: 'rosacea', name: 'ROSACEA', desc: 'Papulopustules, flushing, redness' },
    { id: 'eczema', name: 'ECZEMA', desc: 'Barrier compromise, atopic dermatitis' },
    { id: 'general', name: 'GENERAL', desc: 'Photoaging, maintenance, pigmentation' }
  ];

  document.getElementById('pathway-options').innerHTML = pathways.map(p => `
    <div class="pathway-card" onclick="selectPathway('${p.id}')" id="pathway-${p.id}">
      <div class="pathway-name">${p.name}</div>
      <div class="pathway-description">${p.desc}</div>
    </div>
  `).join('');

  modal.classList.add('active');
}

let selectedPathway = null;
let selectedTier = null;

function selectPathway(pathway) {
  selectedPathway = pathway;
  document.querySelectorAll('.pathway-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('pathway-' + pathway).classList.add('selected');
  showTierOptions();
}

function showTierOptions() {
  const tierSection = document.getElementById('tier-section');
  tierSection.style.display = 'block';

  const options = `
    <button class="tier-btn" onclick="selectTier(1)">Tier 1<br><span style="font-size: 11px; font-weight: normal;">Mild/Entry</span></button>
    <button class="tier-btn" onclick="selectTier(2)">Tier 2<br><span style="font-size: 11px; font-weight: normal;">Moderate</span></button>
    <button class="tier-btn" onclick="selectTier(3)">Tier 3<br><span style="font-size: 11px; font-weight: normal;">Strong/Rx</span></button>
  `;
  document.getElementById('tier-options').innerHTML = options;
}

function selectTier(tier) {
  selectedTier = tier;
  document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('selected'));
  event.target.closest('.tier-btn').classList.add('selected');
  showRegimen();
}

function showRegimen() {
  const regimens = {
    acne: {
      1: {
        cleanser: 'Salicylic acid 0.5–1% foaming/gel',
        am_antioxidant: 'Niacinamide 4%',
        moisturizer: 'Oil-free gel with hyaluronic acid',
        sunscreen: 'SPF 30, matte, non-comedogenic',
        pm_retinoid: 'OTC encapsulated retinol, 2–3x/week'
      },
      2: {
        cleanser: 'Salicylic acid 2% or Benzoyl peroxide 2.5%',
        am_antioxidant: 'Compounded vitamin C + niacinamide',
        moisturizer: 'Oil-free gel-cream + niacinamide',
        sunscreen: 'SPF 50, tinted, matte',
        pm_retinoid: 'Tretinoin 0.025% nightly'
      },
      3: {
        cleanser: 'Benzoyl peroxide 5%',
        am_antioxidant: 'GHK-Cu cream',
        moisturizer: 'Barrier-repair gel-cream',
        sunscreen: 'SPF 50, tinted, matte',
        pm_retinoid: 'Compounded tretinoin 0.05–0.1%'
      }
    },
    rosacea: {
      1: {
        cleanser: 'Non-foaming ceramide syndet, fragrance-free',
        am_antioxidant: 'Niacinamide 4%',
        moisturizer: 'Fragrance-free ceramide barrier cream',
        sunscreen: 'SPF 30, fragrance-free, untinted',
        pm_retinoid: 'Azelaic acid 10%'
      },
      2: {
        cleanser: 'Non-foaming ceramide syndet + soothing agents',
        am_antioxidant: 'Niacinamide 5%',
        moisturizer: 'Ceramide barrier cream + niacinamide',
        sunscreen: 'SPF 50, fragrance-free, tinted',
        pm_retinoid: 'Azelaic acid 15–20%'
      },
      3: {
        cleanser: 'Minimal-ingredient compounded wash',
        am_antioxidant: 'Niacinamide 5% + azelaic acid',
        moisturizer: 'Prescription barrier repair',
        sunscreen: 'SPF 50, fragrance-free, tinted',
        pm_retinoid: 'Azelaic acid + low-dose retinol'
      }
    },
    eczema: {
      1: {
        cleanser: 'Cream cleanser, sulfate-free',
        am_antioxidant: 'None (wait for barrier stability)',
        moisturizer: 'Ceramide cream',
        sunscreen: 'SPF 30, fragrance-free, minimal',
        pm_retinoid: 'Bakuchiol 0.5%, 2x/week'
      },
      2: {
        cleanser: 'Cream cleanser + colloidal oatmeal',
        am_antioxidant: 'Compounded melatonin + ceramide serum',
        moisturizer: 'Ceramide cream + petrolatum + pumpkin seed oil',
        sunscreen: 'SPF 30, fragrance-free, minimal',
        pm_retinoid: 'Encapsulated retinol 0.1–0.3%, 2–3x/week'
      },
      3: {
        cleanser: 'Prescriber-directed medicated wash',
        am_antioxidant: 'Compounded melatonin ± green tea',
        moisturizer: 'Prescription barrier repair ± steroid',
        sunscreen: 'SPF 30, fragrance-free, minimal',
        pm_retinoid: 'Low-dose prescription retinoid'
      }
    },
    general: {
      1: {
        cleanser: 'Gentle low-foaming gel, fragrance-free',
        am_antioxidant: 'Niacinamide or green tea serum',
        moisturizer: 'Standard ceramide moisturizer',
        sunscreen: 'SPF 30–50, per preference',
        pm_retinoid: 'OTC retinol, 2–3x/week'
      },
      2: {
        cleanser: 'Cream cleanser (if dry) or gel (if oily)',
        am_antioxidant: 'Vitamin C + ferulic acid + vitamin E',
        moisturizer: 'Richer ceramide cream ± peptides',
        sunscreen: 'SPF 50, tinted with iron oxides',
        pm_retinoid: 'Tretinoin 0.025–0.05%'
      },
      3: {
        cleanser: 'Active-ingredient cleanser (if secondary acne)',
        am_antioxidant: 'Compounded vitamin C or GHK-Cu',
        moisturizer: 'Ceramide + peptide complex',
        sunscreen: 'SPF 50, reapplication-friendly',
        pm_retinoid: 'Compounded tretinoin ± GHK-Cu'
      }
    }
  };

  const regimen = regimens[selectedPathway][selectedTier];
  const regimeSection = document.getElementById('regimen-section');
  regimeSection.style.display = 'block';

  document.getElementById('regimen-display').innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 8px; font-weight: 600;">Cleanser</td>
        <td style="padding: 8px;">${regimen.cleanser}</td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 8px; font-weight: 600;">AM Antioxidant</td>
        <td style="padding: 8px;">${regimen.am_antioxidant}</td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 8px; font-weight: 600;">Moisturizer</td>
        <td style="padding: 8px;">${regimen.moisturizer}</td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 8px; font-weight: 600;">Mineral Sunscreen</td>
        <td style="padding: 8px;">${regimen.sunscreen}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: 600;">PM Retinoid</td>
        <td style="padding: 8px;">${regimen.pm_retinoid}</td>
      </tr>
    </table>
  `;
}

async function submitQuestionnaire() {
  if (!selectedPathway || !selectedTier) {
    alert('Please select a pathway and tier');
    return;
  }

  const safetyData = {
    user_id: currentUser.id,
    pregnant_breastfeeding: document.getElementById('gate-pregnant').checked ? 1 : 0,
    autoimmune: document.getElementById('gate-autoimmune').checked ? 1 : 0,
    cancer_history: document.getElementById('gate-cancer').checked ? 1 : 0,
    scarring_tendency: document.getElementById('gate-scarring').checked ? 1 : 0,
    allergies: document.getElementById('gate-allergies').value
  };

  const regimens = {
    acne: {
      1: { cleanser: 'Salicylic acid 0.5–1%', am_antioxidant: 'Niacinamide 4%', moisturizer: 'Oil-free gel', sunscreen: 'SPF 30', pm_retinoid: 'OTC retinol' },
      2: { cleanser: 'Salicylic acid 2%', am_antioxidant: 'Compounded vitamin C', moisturizer: 'Oil-free gel-cream', sunscreen: 'SPF 50', pm_retinoid: 'Tretinoin 0.025%' },
      3: { cleanser: 'Benzoyl peroxide 5%', am_antioxidant: 'GHK-Cu', moisturizer: 'Barrier-repair', sunscreen: 'SPF 50', pm_retinoid: 'Tretinoin 0.05–0.1%' }
    },
    rosacea: {
      1: { cleanser: 'Ceramide syndet', am_antioxidant: 'Niacinamide 4%', moisturizer: 'Ceramide cream', sunscreen: 'SPF 30', pm_retinoid: 'Azelaic acid 10%' },
      2: { cleanser: 'Ceramide + soothing', am_antioxidant: 'Niacinamide 5%', moisturizer: 'Ceramide + niacinamide', sunscreen: 'SPF 50', pm_retinoid: 'Azelaic acid 15–20%' },
      3: { cleanser: 'Compounded minimal', am_antioxidant: 'Niacinamide 5% + AA', moisturizer: 'Barrier repair', sunscreen: 'SPF 50', pm_retinoid: 'AA + retinol' }
    },
    eczema: {
      1: { cleanser: 'Cream cleanser', am_antioxidant: 'None', moisturizer: 'Ceramide', sunscreen: 'SPF 30', pm_retinoid: 'Bakuchiol 0.5%' },
      2: { cleanser: 'Cream + oatmeal', am_antioxidant: 'Melatonin + ceramide', moisturizer: 'Ceramide + oil', sunscreen: 'SPF 30', pm_retinoid: 'Retinol 0.1–0.3%' },
      3: { cleanser: 'Medicated wash', am_antioxidant: 'Melatonin ± green tea', moisturizer: 'Barrier repair', sunscreen: 'SPF 30', pm_retinoid: 'Low-dose Rx' }
    },
    general: {
      1: { cleanser: 'Gentle gel', am_antioxidant: 'Niacinamide', moisturizer: 'Ceramide', sunscreen: 'SPF 30–50', pm_retinoid: 'OTC retinol' },
      2: { cleanser: 'Cream gel', am_antioxidant: 'Vitamin C+E', moisturizer: 'Rich ceramide', sunscreen: 'SPF 50', pm_retinoid: 'Tretinoin 0.025–0.05%' },
      3: { cleanser: 'Active cleanser', am_antioxidant: 'Compounded vitamin C', moisturizer: 'Ceramide + peptides', sunscreen: 'SPF 50', pm_retinoid: 'Compounded tretinoin' }
    }
  };

  try {
    await fetch(`/api/patients/${currentPatient}/safety-gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safetyData)
    });

    const regimen = regimens[selectedPathway][selectedTier];
    await fetch(`/api/patients/${currentPatient}/regimen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        pathway: selectedPathway,
        tier: selectedTier,
        ...regimen
      })
    });

    closeQuestionnaireModal();
    loadPatients();
  } catch (err) {
    alert('Error submitting questionnaire: ' + err.message);
  }
}

function closeQuestionnaireModal() {
  document.getElementById('questionnaire-modal').classList.remove('active');
  selectedPathway = null;
  selectedTier = null;
}

// Analytics
async function loadAnalytics() {
  try {
    const [allRes, failRes, usersRes] = await Promise.all([
      fetch('/api/analytics/all-patients'),
      fetch('/api/analytics/failures'),
      fetch('/api/analytics/users')
    ]);

    const allData = await allRes.json();
    const failData = await failRes.json();
    const usersData = await usersRes.json();

    const completed = allData.patients.filter(p => p.questionnaire_status === 'completed').length;

    document.getElementById('total-patients').innerHTML = `
      <div class="stat-value">${allData.total}</div>
      <div class="stat-label">Total Patients</div>
    `;
    document.getElementById('completed-patients').innerHTML = `
      <div class="stat-value">${completed}</div>
      <div class="stat-label">Completed</div>
    `;
    document.getElementById('failed-patients').innerHTML = `
      <div class="stat-value">${failData.total}</div>
      <div class="stat-label">Failed/Incomplete</div>
    `;
    document.getElementById('total-users').innerHTML = `
      <div class="stat-value">${usersData.users.length}</div>
      <div class="stat-label">Active Users</div>
    `;

    document.getElementById('all-patients-body').innerHTML = allData.patients.map(p => `
      <tr onclick="viewPatient(${p.id})">
        <td>#${p.global_id}</td>
        <td>${p.username}</td>
        <td>${p.patient_name}</td>
        <td><span class="status-badge ${p.questionnaire_status.replace('/', '-')}">${p.questionnaire_status}</span></td>
        <td>${p.pathway || '—'}</td>
        <td>${p.tier || '—'}</td>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-secondary" style="width: auto; padding: 6px 12px; font-size: 12px;">View</button></td>
      </tr>
    `).join('');

    document.getElementById('failures-body').innerHTML = failData.failures.map(f => `
      <tr onclick="viewPatient(${f.id})">
        <td>#${f.global_id}</td>
        <td>${f.username}</td>
        <td>${f.patient_name}</td>
        <td><span class="status-badge ${f.questionnaire_status.replace('/', '-')}">${f.questionnaire_status}</span></td>
        <td>${f.events || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

// Export
async function downloadCSV() {
  try {
    const response = await fetch('/api/export/csv');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patient_data.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    alert('Error downloading CSV: ' + err.message);
  }
}
