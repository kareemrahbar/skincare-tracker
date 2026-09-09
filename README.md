# Mara Dermatology - Skincare Regimen Assessment Platform

A professional web application for healthcare professionals to manage test patients and track skincare regimen questionnaire responses.

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Open http://localhost:3000 in your browser

## Tech Stack

- **Backend:** Node.js with Express.js
- **Database:** SQLite (better-sqlite3)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Security:** bcryptjs for password hashing, CORS enabled

## Features

- User authentication (register/login)
- Create and manage test patient profiles
- Multi-tier skincare regimen questionnaire
- Global patient tracking across all users
- Analytics dashboard with completion rates
- CSV data export
- Responsive design with dark mode support
- Professional Mara Dermatology branding

## API Endpoints

### Authentication
- `POST /api/register` - Create new user account
- `POST /api/login` - User login

### Patients
- `POST /api/patients` - Create new test patient
- `GET /api/patients/:userId` - Get user's patients
- `GET /api/all-patients` - Get all patients (global)

### Questionnaire
- `POST /api/start-questionnaire` - Start questionnaire flow
- `POST /api/submit-questionnaire` - Submit questionnaire results

### Analytics
- `GET /api/analytics` - Get platform analytics
- `GET /api/export-csv` - Export all patient data as CSV

## Database Schema

### users
- id (Primary Key)
- username (Unique)
- password (Hashed)
- created_at

### patients
- id (Primary Key)
- patient_number (Unique, Sequential)
- user_id (Foreign Key)
- name
- age
- gender
- skin_type
- created_at

### regimen_assignments
- id (Primary Key)
- patient_id (Foreign Key)
- pathway (Acne, Rosacea, Eczema, General)
- tier (1-3)
- regimen (Product recommendation)
- completed
- created_at

### session_log
- id (Primary Key)
- user_id (Foreign Key)
- action
- details
- timestamp

## Deployment on Render

1. Push code to GitHub repository
2. Connect GitHub to Render
3. Set environment: Node
4. Build command: `npm install`
5. Start command: `npm start`

The application will deploy automatically when you push to the main branch.

## Development Notes

- All patient numbers are globally sequential (never duplicate across users)
- Patient data persists across sessions in SQLite database
- Security headers configured for safe JavaScript execution
- Responsive design works on mobile, tablet, and desktop
