# CIE Portal - Code Submission & Evaluation Platform

A web-based platform for students to submit code assignments and receive AI-powered feedback, with admin controls for managing courses and evaluations.

## 🎯 Features

### Student Features

- ✅ Firebase authentication (email/password, Google Sign-In)
- 💻 Submit Dart code for evaluation
- 📝 View assignments and specifications
- 📊 Track submission scores and feedback
- 🤖 AI-powered code feedback using Gemini
- 📱 Responsive design (desktop & mobile)
- 🔄 Offline support via Service Worker

### Admin Features

- 👥 Manage student accounts and courses
- 📤 Create and manage assignments
- ✅ Configure test cases for evaluation
- 🔍 Review and score submissions
- 📊 View analytics and progress
- 🗑️ Reset data and manage database

### Backend Services

- 🔧 Dart code compilation via Dart Services API
- 🤖 Code feedback generation with Google Gemini
- 🐝 Code analysis with Groq API
- 📡 Real-time Firestore sync
- 🔐 Role-based access control (RBAC)

## 🚀 Quick Start

### Local Development

1. **Clone & Install**

   ```bash
   git clone <your-repo>
   cd cies-portal
   npm install
   ```

2. **Setup Environment**

   ```bash
   cp .env.local.example .env.local
   # Add your Firebase credentials and API keys
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

### Electron Desktop App (Local Only)

```bash
# Development
npm run electron-dev

# Build installer
npm run electron-build
# Installer saved to: dist/CIE Secure Launcher Setup 0.1.0.exe
```

## 📦 Project Structure

```
cies-portal/
├── pages/                    # Next.js pages & API routes
│   ├── _app.js              # App wrapper & auth context
│   ├── index.js             # Login page
│   ├── download.js          # Download page
│   ├── admin/
│   │   └── dashboard.js     # Admin dashboard
│   ├── student/
│   │   ├── cie.js           # Code editor & submission
│   │   └── dashboard.js     # Student dashboard
│   └── api/                 # API routes (server-side)
│       ├── compile.js       # Dart compilation
│       ├── simulate.js      # Code execution
│       ├── admin/
│       │   ├── setup-students.js
│       │   └── wipe-data.js
│       └── submissions/
│           └── score.js     # Scoring API
├── lib/
│   ├── firebase.js          # Client-side Firebase config
│   ├── firebase-admin.js    # Server-side Firebase admin
│   ├── gemini.js            # Gemini AI integration
│   ├── groq.js              # Groq API integration
│   └── labs.js              # Lab utilities
├── public/                  # Static assets
│   ├── sw.js               # Service worker
│   ├── favicon.ico         # App icon
│   └── manifest.json       # PWA manifest
├── styles/
│   └── globals.css         # Global styles
├── firestore.rules         # Firestore security rules
└── vercel.json            # Vercel deployment config
```

## 🔧 Environment Variables

Required for development and production:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Service Account (for API routes)
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json

# AI Services
GEMINI_API_KEY=...

# Optional
GROQ_API_KEY=...
```

## 📚 API Endpoints

### Public

- `GET /api/hello` - Health check

### Authentication Required

- `POST /api/compile` - Compile Dart code
- `POST /api/simulate` - Execute code with test input
- `POST /api/submissions/score` - Score submission

### Admin Only

- `POST /api/admin/setup-students` - Import students
- `POST /api/admin/wipe-data` - Clear all data

## 🌐 Deployment

### Deploy to Vercel

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed instructions.

Quick steps:

1. Push to GitHub
2. Go to https://vercel.com/new
3. Import repository
4. Add environment variables
5. Click "Deploy"

### Deploy as Electron App

```bash
npm run electron-build
# Installer: dist/CIE Secure Launcher Setup 0.1.0.exe
```

## 🔐 Security

- Firebase Authentication for user management
- Firestore security rules enforce access control
- API routes use Firebase Admin SDK for verification
- Service account JSON never committed (in `.gitignore`)
- Environment variables encrypted in Vercel

### Update Firestore Rules

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /admin/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /submissions/{submission=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 📋 Technology Stack

- **Frontend**: React 19, Next.js 16
- **Backend**: Next.js API Routes, Node.js
- **Database**: Firestore (NoSQL)
- **Auth**: Firebase Authentication
- **AI/ML**: Google Gemini, Groq API
- **Hosting**: Vercel (Web), Electron (Desktop)
- **Styling**: CSS Modules
- **Storage**: Firebase Storage

## 🛠 Development

### Scripts

```bash
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server
npm run electron-dev    # Run Electron app (dev)
npm run electron-build  # Build Electron installer
```

### Testing

```bash
# Test locally
npm run build && npm run start

# Test with production env vars
NEXT_PUBLIC_FIREBASE_API_KEY=... npm run start
```

## 🐛 Troubleshooting

**Build fails with memory error**

- Fixed by reducing node_modules size in build config
- Exclude unnecessary files in `.vercelignore`

**Firebase auth not working**

- Verify CORS allowed in Firebase Console
- Check environment variables
- Ensure service account has correct permissions

**API calls timeout**

- Check Firestore query indexes
- Verify database connectivity
- Monitor Vercel function duration

**Dart compilation errors**

- Verify Dart Services API is accessible
- Check code syntax before submission
- Review error messages in dashboard

## 📞 Support

- Firebase Docs: https://firebase.google.com/docs
- Next.js Docs: https://nextjs.org/docs
- Vercel Docs: https://vercel.com/docs
- Dart Language: https://dart.dev/guides

## 📄 License

MIT License - See LICENSE file for details

---

**Ready to deploy?** Follow [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
