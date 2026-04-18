# Vercel Deployment Checklist

## Before Pushing to GitHub

- [ ] Firebase credentials in `.env.local` (NOT committed)
- [ ] Service account JSON in `cies-20152-firebase-adminsdk-fbsvc-c19596ff35.json` (in `.gitignore`)
- [ ] Run `npm run build` locally - no errors ✅
- [ ] Test locally with `npm run dev` ✅
- [ ] Verify all pages load correctly
- [ ] Test login functionality
- [ ] Clear `.next` folder before commit: `rm -r .next`

## Before Vercel Deployment

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push
   ```

2. **Create Vercel Project**
   - Go to https://vercel.com/new
   - Import GitHub repository
   - Select Next.js framework (auto-detected)
   - Click "Deploy"

3. **Add Environment Variables in Vercel Dashboard**

   **Under Project → Settings → Environment Variables**

   Add these (get values from Firebase Console):

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
   NEXT_PUBLIC_FIREBASE_PROJECT_ID
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   NEXT_PUBLIC_FIREBASE_APP_ID
   FIREBASE_SERVICE_ACCOUNT_PATH
   GEMINI_API_KEY
   ```

4. **Create Firebase Service Account** (if not done)
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Upload to Vercel (or encode as env var)

5. **Redeploy After Setting Env Vars**
   - Go to Deployments tab
   - Select latest deployment
   - Click ⋮ → Redeploy

6. **Test Deployment**
   - Visit your Vercel URL
   - Test login with Firebase credentials
   - Check admin dashboard
   - Test student features

## File Structure Ready for Vercel

```
✅ pages/              - Next.js pages & API routes
✅ lib/                - Shared utilities & Firebase config
✅ public/             - Static assets
✅ styles/             - CSS files
✅ next.config.mjs     - Next.js config
✅ vercel.json         - Vercel deployment config
✅ .vercelignore       - Excludes Electron files
✅ .env.local.example  - Template for secrets
✅ package.json        - Dependencies & scripts
❌ electron-main.js    - Not deployed (Electron only)
❌ dist/               - Not deployed (Electron build)
❌ cies-20152-firebase-adminsdk*.json - Not committed
```

## Quick Start Commands

```bash
# Local development
npm run dev

# Production build (test)
npm run build
npm run start

# Deploy to Vercel
vercel --prod

# View logs
vercel logs

# Check function execution
vercel logs --follow
```

## Important Notes

⚠️ **Security**

- Never commit `.env.local`
- Never commit Firebase service account JSON
- Use Vercel's encrypted environment variables
- Enable Vercel's CORS for Firebase

⚠️ **Firebase**

- Update Firestore security rules
- Enable Firestore locations matching your region
- Set up Firebase Authentication providers (Email/Google)

⚠️ **Pricing**

- Vercel: Free tier includes up to 12 serverless function invocations/month
- Firebase: Free tier should be sufficient for testing
- Consider upgrading if traffic is high

## Useful Links

- https://vercel.com/new
- https://firebase.google.com/console
- https://nextjs.org/docs/deployment/vercel
- https://github.com/settings/tokens (for GitHub integration)

## After Deployment

Monitor these:

- Vercel Analytics (Performance)
- Firebase Console (Usage & Errors)
- Application Logs (via `vercel logs`)
- Firestore Queries (Indexes & Performance)

## Questions?

Refer to `VERCEL_DEPLOYMENT.md` for detailed setup instructions.
