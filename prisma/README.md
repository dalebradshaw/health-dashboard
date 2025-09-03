Prisma schema for Health Dashboard

Models:
- User: identity holder (Sign in with Apple later)
- Device: registered device with secret hash
- Sample: time-series health samples (unique by uuid+type)
- DailySummary: rollups by day/type

Setup:
1) Set DATABASE_URL in .env
2) npm i -D prisma @prisma/client
3) npx prisma migrate dev -n init
4) npm run prisma:generate

