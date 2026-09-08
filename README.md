# Skincare Test Patient Tracker

A web application for collecting and tracking test patient data through the skincare regimen questionnaire. Designed for clinical trials and questionnaire validation.

## Features

✅ **User Authentication** - Secure password-protected registration and login  
✅ **Global Sequential Patient Numbering** - Patients numbered sequentially across all users  
✅ **Test Patient Creation** - Create and manage multiple test patients per user  
✅ **Interactive Questionnaire** - Safety gates, pathway selection, tier selection, regimen assignment  
✅ **Data Persistence** - SQLite database stores all patient data and session logs  
✅ **Analytics Dashboard** - View all patients across all users, completion rates, failures  
✅ **Data Export** - Download all patient data as CSV for analysis  
✅ **Session Tracking** - Every action logged with timestamps for failure analysis  

## Architecture

```
├── server.js          # Express backend with API endpoints
├── public/
│   ├── index.html     # Main frontend
│   ├── app.js         # Frontend logic
│   └── styles.css     # Styling
├── package.json       # Dependencies
├── Procfile          # For cloud deployment
└── data.db           # SQLite database (created on first run)
```

## Local Development

### Prerequisites
- Node.js 18+ and npm

### Setup

1. **Extract the files**
   ```bash
   unzip skincare-tracker.zip
   cd skincare-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Open browser to `http://localhost:3000`
   - Create a user account
   - Start creating test patients

## Cloud Deployment

### Option 1: Deploy to Render (Recommended)

1. **Create a Render account** at https://render.com

2. **Create a new Web Service**
   - Connect your GitHub repository or upload the code
   - Build command: `npm install`
   - Start command: `node server.js`
   - Set Node version to 18

3. **Set Environment Variables**
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (Render sets this automatically)

4. **Deploy**
   - Render will automatically deploy from your repository or uploaded files

### Option 2: Deploy to Heroku

1. **Create a Heroku account** at https://www.heroku.com

2. **Install Heroku CLI**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # Windows/Linux
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

3. **Deploy**
   ```bash
   heroku login
   heroku create your-app-name
   git push heroku main
   heroku open
   ```

### Option 3: Deploy to Railway

1. **Create a Railway account** at https://railway.app

2. **Connect your GitHub repository or upload files**

3. **Railway automatically detects Node.js and deploys**

## Usage

### Creating a User Account

1. Go to the application URL
2. Click "Register"
3. Enter a username and password (min 6 characters)
4. Click "Register"

### Creating Test Patients

1. Log in
2. Click "+ Create New Patient"
3. Fill in patient information:
   - Patient name (e.g., "Test Patient 1")
   - Age, sex, Fitzpatrick type, skin type
   - Primary concern, sun exposure, retinoid history
4. Click "Create Patient"

Each patient is assigned a global sequential ID that never changes, regardless of which user creates them.

### Running the Questionnaire

1. Click "Start Questionnaire" on a patient card
2. Complete the questionnaire:
   - **Step 1: Safety Gates** - Check any conditions that apply
   - **Step 2: Pathway Selection** - Choose primary pathway (Acne, Rosacea, Eczema, General)
   - **Step 3: Tier Selection** - Choose tier (1-3)
   - **Step 4: Review Regimen** - See recommended products
3. Click "Save & Complete"

### Viewing Analytics

1. Click the "Analytics" tab
2. View summary statistics:
   - Total patients across all users
   - Completion rate
   - Failed/incomplete patients
   - Active users
3. Browse all patients in sequential order
4. View questionnaire failures to see where users get stuck

### Exporting Data

1. Click the "Export Data" tab
2. Click "Download CSV"
3. CSV includes:
   - Global patient ID
   - Username who created patient
   - Patient demographics
   - Questionnaire status
   - Assigned pathway and tier
   - Creation date

## Database Schema

### users
- `id` (primary key)
- `username` (unique)
- `password` (hashed with bcryptjs)
- `created_at`

### patients
- `id` (primary key)
- `global_id` (unique, sequential across all users)
- `user_id` (foreign key to users)
- `patient_name`
- `age`, `sex`, `fitzpatrick`, `skin_type`
- `primary_concern`, `sun_exposure`, `retinoid_history`
- `questionnaire_status` (started, completed)
- `created_at`, `completed_at`

### safety_gates
- `id` (primary key)
- `patient_id` (foreign key)
- `pregnant_breastfeeding`, `autoimmune`, `cancer_history`, `scarring_tendency`
- `allergies` (text field)

### regimen_assignments
- `id` (primary key)
- `patient_id` (foreign key)
- `pathway` (acne, rosacea, eczema, general)
- `tier` (1, 2, or 3)
- `cleanser`, `am_antioxidant`, `moisturizer`, `sunscreen`, `pm_retinoid`
- `created_at`

### session_log
- `id` (primary key)
- `patient_id`, `user_id` (foreign keys)
- `event_type` (patient_created, safety_gates_completed, regimen_assigned)
- `event_detail` (description of event)
- `timestamp`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login user

### Patients
- `POST /api/patients` - Create patient
- `GET /api/patients/user/:user_id` - Get patients for user
- `GET /api/patients/:patient_id` - Get patient details

### Questionnaire
- `POST /api/patients/:patient_id/safety-gates` - Save safety gate responses
- `POST /api/patients/:patient_id/regimen` - Save regimen assignment

### Analytics
- `GET /api/analytics/all-patients` - All patients globally
- `GET /api/analytics/failures` - Incomplete questionnaires
- `GET /api/analytics/users` - User statistics

### Export
- `GET /api/export/csv` - Download CSV export

## Troubleshooting

### "Cannot find module 'better-sqlite3'"
- Run `npm install` to ensure all dependencies are installed
- On some systems, you may need build tools:
  - macOS: `xcode-select --install`
  - Windows: Install Visual Studio Build Tools
  - Linux: `sudo apt-get install build-essential python3`

### Database locked error
- SQLite uses file locking. If you get a "database is locked" error:
  - Restart the server
  - Ensure only one instance is running at a time
  - For production, consider migrating to PostgreSQL

### Port already in use
- By default runs on port 3000
- To use a different port:
  ```bash
  PORT=8000 npm start
  ```

## Performance Notes

- **SQLite is suitable for**: Development, testing, small to medium deployments (<1000 patients)
- **For larger scale**, consider migrating to PostgreSQL:
  - Update `server.js` to use `pg` or `sequelize`
  - Keep the same database schema
  - Update deploy instructions

## Security

- Passwords are hashed using bcryptjs (10 salt rounds)
- No sensitive data is logged in session logs
- For production deployment:
  - Use HTTPS (provided by Render, Heroku, Railway)
  - Set strong database password if using external DB
  - Consider adding rate limiting to auth endpoints
  - Add CORS restrictions as needed

## License

MIT

## Support

For issues or questions:
1. Check that all dependencies installed: `npm install`
2. Verify Node.js version: `node --version` (should be 18+)
3. Check database exists: `ls -la data.db`
4. Review server logs for error messages
5. Ensure database is not corrupted: `npm start` will auto-initialize if needed
