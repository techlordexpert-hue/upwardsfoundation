UPWARDS FOUNDATION PORTAL - 3 files, put them in the ROOT of your GitHub repo (replace the old ones):
  server.js  (the whole website + server in one file)
  vercel.json
  package.json
Old files (public/, api/, index.html, logo.png) can stay - they are ignored.
Then: Vercel -> Storage -> Create Upstash Redis -> connect to project -> Redeploy.
Check: open https://YOUR-SITE.vercel.app/api?a=health  (should show "ok":true,"db":true)
Optional env vars: BMS_API_KEY, BMS_API_URL, BMS_SENDER_ID.
Logins: lord@123 (admin) / frema@123 (treasurer). Change both after first login.
