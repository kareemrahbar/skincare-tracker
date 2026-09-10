# Mara Dermatology - Production Deployment Checklist

## Pre-Deployment Verification (48 hours before)

### Code & Database
- [ ] All code reviewed and tested
- [ ] Database schema created with all tables
- [ ] Foreign key constraints verified (ON DELETE CASCADE)
- [ ] Indexes created on user_id, patient_id, patient_number
- [ ] WAL mode enabled: `PRAGMA journal_mode = WAL;`

### Security Configuration
- [ ] JWT_SECRET changed from example value
- [ ] JWT_REFRESH_SECRET set and unique
- [ ] CSRF_SECRET configured
- [ ] Password reset token secret configured
- [ ] Session cookie set to httpOnly, Secure, SameSite=Strict
- [ ] HTTPS/TLS certificate installed (Let's Encrypt recommended)
- [ ] CSP headers reviewed and configured

### Environment Variables
- [ ] .env file configured for production (NODE_ENV=production)
- [ ] DATABASE_PATH points to correct location
- [ ] Email SMTP credentials configured and tested
- [ ] All secrets stored in environment, NOT in code

### Email Configuration
- [ ] SMTP connection tested successfully
- [ ] Test email sends without errors
- [ ] Email bounce handling configured

### API Testing
- [ ] POST /api/register works end-to-end
- [ ] POST /api/login returns JWT tokens
- [ ] POST /api/patients creates patient with auto-increment
- [ ] POST /api/questionnaire/submit stores assessment
- [ ] GET /api/algorithm-data returns full pathway definitions
- [ ] GET /api/all-patients returns assessments count
- [ ] GET /api/export-csv returns formatted CSV
- [ ] Rate limiting triggered at threshold
- [ ] CSRF validation blocks requests without token

### Frontend Testing (Chrome, Firefox, Safari, Mobile)
- [ ] Login/register forms submit correctly
- [ ] Patient intake form validates all fields
- [ ] Hormonal status cascades on sex selection
- [ ] Safety gates evaluate and show restrictions
- [ ] Questionnaire modal renders with proper scrolling on mobile
- [ ] Tier selection radio buttons work
- [ ] Optional modules checkboxes toggle correctly
- [ ] Submit button disables and shows loading state
- [ ] Success message displays post-submission
- [ ] Logout clears session and state
- [ ] Tab navigation (Patients/Analytics) switches sections
- [ ] Analytics table exports CSV with proper escaping
- [ ] Form validation displays errors for missing fields
- [ ] Modal keyboard trap works (Tab cycles through)
- [ ] Responsive layout verified on 320px, 768px, 1024px

### Security Vulnerability Scan
- [ ] npm audit passes (no critical vulnerabilities)
- [ ] SQL injection tests pass (parameterized queries)
- [ ] XSS tests pass (no unescaped user input in DOM)
- [ ] CSRF protection verified (token required on POST)
- [ ] Brute force rate limiting blocks after 5 failed logins
- [ ] Session timeout enforces after 30 minutes inactivity
- [ ] Password complexity enforced (12+ chars, uppercase, number, symbol)

---

## Deployment Day Execution

### 1 Hour Before Go-Live

**Server Preparation**
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install --production

# Run tests
npm test

# Verify server health
curl http://localhost:3000/api/health
# Expected: { "status": "ok", "database": "connected" }

# Start server
npm start
```

### Database Initialization (if first deployment)
```bash
# Tables auto-created on startup
# Verify tables created:
sqlite3 data.db ".tables"
# Should show: patients questionnaire_responses session_log sessions users ...

# Verify indexes:
sqlite3 data.db "SELECT * FROM sqlite_master WHERE type='index';"
```

### DNS/Load Balancer Cutover
- [ ] DNS TTL lowered to 5 minutes (48 hours before)
- [ ] Load balancer health check pointing to /api/health
- [ ] SSL certificate installed and verified
- [ ] HSTS header enabled (if HTTPS only)
- [ ] Redirect HTTP → HTTPS configured

### Post-Deployment Validation (30 minutes)

**Smoke Tests**
- [ ] Server responds to requests (HTTP 200)
- [ ] New user registration works
- [ ] Login with valid credentials succeeds
- [ ] Incorrect password rejected (HTTP 401)
- [ ] Patient creation auto-increments patient number
- [ ] Questionnaire submission stores in database
- [ ] CSV export downloads without corruption
- [ ] No errors in logs
- [ ] Database transactions not deadlocking

**Performance Baseline**
- [ ] Response times < 500ms p95
- [ ] CPU usage < 70%
- [ ] Memory usage < 1GB
- [ ] No query timeouts (all < 1 second)

**Security Verification**
- [ ] CSRF tokens required on POST requests
- [ ] Rate limiting active (test login 6 times rapidly)
- [ ] Session timeout enforced
- [ ] Audit log recording all actions
- [ ] Passwords bcrypt hashed, not plain text

---

## Post-Deployment (First Week)

### Daily Checklist
- [ ] Zero critical errors in logs
- [ ] All API endpoints responding
- [ ] No login failures due to token issues
- [ ] Response times consistent

### Weekly Checklist
- [ ] Database integrity check: `PRAGMA integrity_check;`
- [ ] Security scan updated (npm audit)
- [ ] Logs reviewed for anomalies
- [ ] User feedback monitored

### Rollback Procedure (If Critical Issue)
1. Revert DNS to previous server
2. Stop current deployment
3. Deploy previous stable version
4. Notify support team
5. Post-mortem analysis

---

## Sign-Off

- [ ] DevOps Lead: _______________ Date: _______
- [ ] Security Lead: _______________ Date: _______
- [ ] Product Lead: _______________ Date: _______
- [ ] On-Call Support: _______________ Date: _______
