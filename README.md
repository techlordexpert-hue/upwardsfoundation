# Upwards Foundation Portal
Files must sit at the REPOSITORY ROOT: api/, public/, package.json, vercel.json (not inside another folder).
vercel.json is intentionally `{}` - it replaces the old broken one that caused the "unmatched function pattern" error.
1. Import the repo in Vercel (Framework: Other; leave Build/Output blank).
2. Storage -> add Upstash Redis (required, otherwise nothing is saved).
3. Settings -> Environment Variables: see .env.example. Redeploy.
First logins: lord@123 (admin) and frema@123 (treasurer). Change both in Admin -> Settings & Security.
