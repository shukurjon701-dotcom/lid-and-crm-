# Render deployment

## 1. Push to GitHub

Create a GitHub repository and upload this project.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-url>
git push -u origin main
```

## 2. Create database in Render

In Render dashboard:

- New -> PostgreSQL
- Choose Free plan
- Copy the internal connection string

## 3. Create Web Service

- New -> Web Service
- Connect GitHub repo: <repo-name>
- Build command:

```bash
npm install && npm run build
```

- Start command:

```bash
npm run start -- --hostname 0.0.0.0 --port $PORT
```

- Add environment variables:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...render...?
AUTH_SECRET=generate-a-long-random-value
NEXT_PUBLIC_CURRENCY=UZS
NEXT_PUBLIC_LOCALE=ru-RU
```

## 4. Initialize database

Render runs `prisma db push` automatically only if you use render.yaml.

If you deploy manually, run one-time database setup in Render shell:

```bash
npx prisma db push
npm run db:seed
```

## 5. Open the service URL

After deployment you will get a Render URL like:

```text
https://lid-crm.onrender.com
```

## Login

Default admin users:

- admin1 / admin1-2026
- admin2 / admin2-2026
- admin3 / admin3-2026
