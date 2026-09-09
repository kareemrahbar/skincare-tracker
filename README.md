# Mara Dermatology - Skincare Regimen Assessment Platform

A professional web application for collecting and analyzing test patient data through an interactive skincare regimen questionnaire.

## Features

- **Multi-User Accounts** - Each researcher has their own login
- **Global Patient Numbering** - Sequential patient IDs across all users
- **Interactive Questionnaire** - Guided assessment with safety gates, pathway selection, and tier recommendations
- **Analytics Dashboard** - View all patients, completion rates, and pathway distribution
- **Data Export** - Download all patient data as CSV
- **Professional Design** - Clean, medical-grade interface

## Quick Start

### Local Development
```bash
npm install
npm start
# Visit http://localhost:3000
```

### Deploy to Render
1. Push to GitHub
2. Go to render.com
3. Connect repository
4. Deploy

## Technology Stack

- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Frontend: HTML/CSS/JavaScript
- Authentication: bcryptjs
- Deployment: Render, Heroku, Railway, or Vercel

## API Endpoints

- `POST /api/register` - Create account
- `POST /api/login` - Sign in
- `POST /api/patients` - Create test patient
- `GET /api/patients/:userId` - Get user's patients
- `GET /api/all-patients` - Get all patients (global)
- `POST /api/submit-questionnaire` - Submit assessment
- `GET /api/analytics` - Get analytics data
- `GET /api/export-csv` - Download CSV export

## Database Schema

- **users** - User accounts with hashed passwords
- **patients** - Test patient records with demographics
- **regimen_assignments** - Questionnaire results and recommended regimens
- **session_log** - All user actions with timestamps

## License

ISC
