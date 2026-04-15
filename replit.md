# Göçmen Perde - Replit Setup

## Project Overview
A Turkish e-commerce storefront for curtain products. Built with static HTML pages and a Node.js/Express API backend connected to a PostgreSQL database.

## Architecture
- **Frontend**: Static HTML files served from the root directory
- **Backend**: Express.js server (`server.js`) serving static files and API routes
- **Database**: PostgreSQL via `pg` package (connection via `DATABASE_URL` secret)
- **Payments**: PayTR payment gateway integration

## Running the App
The app runs via the "Start application" workflow using `npm run dev`, which starts `server.js` on port 5000.

## API Structure
- All API calls go through `/api/<route>` paths
- Routes are defined in `api/router.js` and dispatched to handlers in `server/handlers/`
- Database utilities in `server/lib/_db.js`
- Auth utilities in `server/lib/_auth-utils.js`

## Environment Variables / Secrets Required
- `DATABASE_URL` — PostgreSQL connection string (already set)
- `AUTH_TOKEN_SECRET` — Secret key for JWT-style auth tokens
- `PAYTR_MERCHANT_ID` — PayTR merchant credentials
- `RESEND_API_KEY` — For transactional emails
- `RESEND_FROM_EMAIL` — Sender email for orders
- `ADMIN_ORDER_EMAIL` — Admin notification email
- `SITE_URL` — Public URL of the site

## Migration Notes
- Migrated from Vercel (serverless functions) to Replit (Express server)
- `vercel.json` rewrites replaced by Express router middleware in `server.js`
- `dotenv` removed from `api/router.js` — Replit injects env vars natively
