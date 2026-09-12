# Mara Dermatology Clinical Algorithm Platform

## Overview

Mara Dermatology is a HIPAA-compliant clinical skincare regimen algorithm platform designed for licensed prescribers and qualified aesthetic clinicians. The platform provides evidence-based skincare pathway recommendations across four clinical profiles with tiered intensity levels and safety gate evaluations.

## Clinical Features

### Four Treatment Pathways
- **Acne**: Salicylic acid → Benzoyl peroxide → Prescription tretinoin
- **Rosacea**: Azelaic acid → Niacinamide → Ivermectin/Metronidazole
- **Eczema/Atopic Dermatitis**: Bakuchiol → Encapsulated retinol → Low-dose prescription
- **General (Photoaging/Pigmentation/Maintenance)**: Retinol → Tretinoin → Compounded options

### 5 Safety Gates (Clinical Contraindications)
1. **Pregnancy/Breastfeeding** → NO retinoids, use bakuchiol/azelaic acid
2. **Autoimmune Disease** → Start Tier 1, extend titration, one active at a time
3. **Skin Cancer History** → Hold pending dermatology clearance
4. **Scarring History** → Patch test, introduce slowly
5. **Known Allergies** → Exclude class, substitute alternative

### Optional Modules
- Hyperpigmentation/Melasma add-on (hydroquinone + tranexamic acid)
- Compounded actives (GHK-Cu, estriol)
- Botanical adjuncts (centella, green tea, melatonin)

## Installation & Setup

### Prerequisites
- Node.js 16+
- npm or yarn
- SQLite3 (included with better-sqlite3)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Step 3: Start Server
```bash
npm start
```

Server runs on `http://localhost:3000`

### Step 4: Access Application
- Open browser to `http://localhost:3000`
- Register clinician account
- Begin entering patients

## System Architecture

### Backend (Node.js/Express)
- RESTful API endpoints for patient management
- SQLite database with WAL mode for consistency
- JWT token-based authentication
- Session management (30-minute timeout)
- Rate limiting (login, patient creation, submissions)
- CSRF protection
- Comprehensive audit logging

### Frontend (Vanilla JavaScript)
- HTML5 responsive form
- Dynamic questionnaire modal
- Real-time field validation
- Patient history and analytics
- CSV export functionality
- Mobile-optimized UI (44px touch targets)

### Database (SQLite)
- `users`: Authentication with bcrypt hashing
- `patients`: Demograph ics, intake flags, history
- `questionnaire_responses`: Assessments and regimen assignments
- `session_log`: Audit trail of all actions
- `sessions`: Active session tracking

## API Endpoints

### Authentication
- `POST /api/register` - Create account
- `POST /api/login` - Authenticate
- `POST /api/refresh-token` - Refresh JWT
- `POST /api/logout` - Logout

### Patients
- `POST /api/patients` - Create patient
- `GET /api/patients/:userId` - Get clinician's patients
- `GET /api/all-patients` - Get all patients (analytics)

### Questionnaire
- `POST /api/questionnaire/submit` - Submit assessment
- `GET /api/algorithm-data` - Get algorithm definitions

### Analytics
- `GET /api/analytics` - Clinical dashboard
- `GET /api/export-csv` - Export patient data

## Security Features

- **Password Security**: 12+ chars with uppercase, number, symbol
- **CSRF Protection**: Token validation on state-changing requests
- **Rate Limiting**:
  - Login: 5 attempts per 15 minutes
  - Patient creation: 100 per hour
  - Global: 1000 requests per minute
- **Sessions**: 30-minute inactivity timeout, IP tracking
- **Database**: Transactions, optimistic locking, foreign key cascades
- **Audit Logging**: Complete trail of all user actions

## Deployment

See `DEPLOYMENT_CHECKLIST.md` for production deployment steps.

## Testing

```bash
npm test                    # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
```

## Troubleshooting

### Database Lock
If "database is locked" error appears:
1. Verify no other processes accessing database
2. Check WAL mode enabled: `PRAGMA journal_mode;`
3. Delete `.db-wal` and `.db-shm` files if persists

### Email Not Sending
1. Verify SMTP credentials in .env
2. Check Gmail: use app password, not account password
3. Review logs in `logs/` directory

### Login Issues
1. Clear browser cookies
2. Re-login to obtain new tokens
3. Check JWT_SECRET hasn't changed

## Support

For technical support, contact: support@maraderm.com
