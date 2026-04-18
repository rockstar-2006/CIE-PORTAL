# Vercel Deployment Guide

## Project Structure

```
cies-portal/
├── pages/                          # Next.js pages & API routes
│   ├── _app.js                    # App wrapper
│   ├── _document.js               # Document wrapper
│   ├── index.js                   # Login page
│   ├── download.js                # Download page
│   ├── admin/                     # Admin pages
│   │   └── dashboard.js
│   ├── student/                   # Student pages
│   │   ├── cie.js
│   │   └── dashboard.js
│   └── api/                       # API routes (server-side)
│       ├── compile.js             # Dart compilation API
│       ├── simulate.js            # Simulation API
│       ├── hello.js               # Test API
│       ├── admin/
│       │   ├── setup-students.js  # Admin: Setup students
│       │   └── wipe-data.js       # Admin: Clear data
│       └── submissions/
│           └── score.js           # Submission scoring
├── lib/
│   ├── firebase.js                # Firebase client config
│   ├── firebase-admin.js          # Firebase admin SDK (for API routes)
│   ├── gemini.js                  # Google Gemini AI
│   ├── groq.js                    # Groq API
│   └── labs.js                    # Lab utilities
├── public/
│   ├── favicon.ico                # App icon
│   ├── manifest.json              # PWA manifest
│   └── sw.js                      # Service worker (offline support)
├── styles/
│   └── globals.css                # Global styles
├── firestore.rules                # Firestore security rules
├── .env.local                     # Environment variables (LOCAL ONLY)
├── .env.local.example             # Template for env vars
├── next.config.mjs                # Next.js configuration
├── vercel.json                    # Vercel deployment config
├── .vercelignore                  # Files to ignore in Vercel
├── jsconfig.json                  # JavaScript config
├── package.json                   # Dependencies & scripts
└── README.md                      # Documentation
```

## Setup Instructions

### Step 1: Prepare Local Environment

```bash
# Copy environment template
cp .env.local.example .env.local

# Add your Firebase credentials to .env.local
```

### Step 2: Create Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Settings → Service Accounts → Generate New Private Key
4. Save the JSON file as `cies-20152-firebase-adminsdk-fbsvc-c19596ff35.json` in project root
5. **DO NOT commit this file** (already in `.gitignore`)

### Step 3: Configure Firestore Rules

Update your Firestore security rules in Firebase Console:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Allow authenticated users to read/write their own data
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    // Allow admin operations
    match /admin/{document=**} {
      allow read, write: if request.auth != null;
    }

    // Student submissions
    match /submissions/{submission=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 4: Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Select project root as framework preset → **Next.js** (auto-detected)
5. Under "Environment Variables", add:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_SERVICE_ACCOUNT_PATH` (path to service account)
   - `GEMINI_API_KEY`

6. Click "Deploy"

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# For production deployment
vercel --prod
```

### Step 5: Configure Environment Variables in Vercel

1. Go to your Vercel project → Settings → Environment Variables
2. Add all variables from `.env.local.example`
3. For `FIREBASE_SERVICE_ACCOUNT_PATH`:
   - Option 1: Upload JSON to Vercel Storage
   - Option 2: Base64 encode JSON and decode at runtime in `lib/firebase-admin.js`

**For Option 2 (recommended for Firebase):**

```bash
# Base64 encode your service account JSON
certutil -encode "cies-20152-firebase-adminsdk-fbsvc-c19596ff35.json" "encoded.txt"
# Copy content and add as FIREBASE_SERVICE_ACCOUNT (base64 encoded)
```

Then update `lib/firebase-admin.js` to decode it:

```javascript
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const decodedJson = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT,
    "base64",
  ).toString("utf-8");
  const serviceAccount = JSON.parse(decodedJson);
  // Use serviceAccount for initialization
}
```

### Step 6: Setup Domain (Optional)

1. In Vercel Dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

## Key Features

### For Students

- 🔐 Firebase authentication (email/password, Google)
- 💻 Code submission in Dart
- 📝 View assignments and submissions
- 📊 Track scores and feedback

### For Admins

- 👥 Manage student accounts
- 📤 Setup test cases
- ✅ Score submissions (automated or manual)
- 🗑️ Clear/reset data

### Backend Services

- 🔧 Dart code compilation (via dart-services)
- 🤖 AI feedback (Gemini API)
- 📡 Real-time Firestore sync
- 🔄 Offline support (Service Worker)

## Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Service account JSON downloaded
- [ ] `.env.local` file populated with credentials
- [ ] GitHub repository pushed with all code
- [ ] Vercel project created
- [ ] Environment variables added to Vercel
- [ ] Firestore security rules updated
- [ ] Build succeeds: `npm run build` ✓
- [ ] Login works with test account
- [ ] Admin dashboard functions
- [ ] Student submission works
- [ ] Domain configured (optional)

## Troubleshooting

### Error: "Cannot find module '@/lib/firebase-admin'"

- This is normal for front-end pages. Only API routes use firebase-admin.
- Ensure pages don't import this directly.

### Error: "Firebase app not initialized"

- Check environment variables in Vercel Dashboard
- Redeploy after adding env vars

### Build fails with "Cannot allocate memory"

- This was fixed by excluding unnecessary node_modules
- Uses optimized Turbopack configuration

### Function timeout on scoring

- Increase Vercel function timeout in `vercel.json`
- Current max (on Pro): 60 seconds
- Consider moving heavy computation to background jobs

## Monitoring

### Vercel Analytics

- Dashboard → Analytics tab
- Monitor:
  - Page load times
  - Function execution time
  - Error rates
  - Bandwidth usage

### Firebase Console

- Firestore usage and limits
- Authentication logs
- Security rule errors

## Performance Tips

1. **Images**: Use `next/image` component (auto-optimized)
2. **Code Splitting**: Next.js handles automatically
3. **API Caching**: Set appropriate Cache-Control headers
4. **Database**: Use Firestore indexes for common queries
5. **CSS**: Global styles in `styles/globals.css`

## Rollback

If something breaks:

```bash
# Vercel Dashboard → Deployments → select previous version → Rollback
```

Or via CLI:

```bash
vercel rollback
```

## Support

- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs
- Firebase Docs: https://firebase.google.com/docs
- GitHub Issues: [Your repo issues]
