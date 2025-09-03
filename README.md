This is a Next.js health dashboard with a companion React Native iOS app and Prisma/Postgres backend.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses next/font to automatically optimize and load Inter, a custom Google Font.

## Mobile (React Native iOS)

- App lives in `mobile/` (TypeScript, RN 0.73.x)
- HealthKit entitlement and usage strings are configured
- Install pods: `cd mobile/ios && pod install` (use Homebrew Ruby if system Ruby crashes)
- Run via Xcode (open `mobile/ios/mobile.xcodeproj`) or `npm run ios`

- Background observers: app initializes react-native-health observers (HeartRate, StepCount, HeartRateVariabilitySDNN, ActiveEnergyBurned). On updates it fetches recent samples and uploads them.

## Database (Prisma + Postgres)

1) Create a Postgres DB (Vercel Postgres or Supabase)
2) Copy `.env.example` to `.env` and set `DATABASE_URL`
3) Install and migrate:

```
npm i -D prisma @prisma/client
npm run prisma:generate
npx prisma migrate dev -n init
```

Local Postgres with Docker:
- `npm run db` (alias of `npm run db:up`) to start Postgres (listens on 5432)
- Ensure `.env` has `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/health?schema=public`
- After migrations, optional seed via API: `curl -X POST http://localhost:3000/api/dev/seed` or Prisma seed: `npm run prisma:seed`

## Cron (optional)

- Configure Vercel Cron to POST to `/api/cron/rollup` daily (for example 02:00 UTC) to persist daily summaries.

## API Endpoints

- POST `/api/devices/register` → `{ userId }` returns `{ deviceId, token }`
- POST `/api/health/ingest` → `{ userId, deviceId, samples }` with `Authorization: Bearer <token>`
- GET `/api/health/query?type=...&from=...&to=...`

- GET `/api/health/summary?type=steps&days=7&agg=sum|avg` (agg optional; avg used for heartRate)
- POST `/api/cron/rollup` with optional `{ date: 'YYYY-MM-DD' }` to compute daily summaries (use with Vercel Cron)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out the Next.js GitHub repository - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
