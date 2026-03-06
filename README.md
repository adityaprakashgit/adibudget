# adibudget

`adibudget` now keeps the existing custom dashboard UI, but uses Firefly III as the finance backend and source of truth. The Node/Express server is a thin adapter layer that normalizes Firefly III accounts, transactions, and budgets into the simpler shapes the frontend already expects.

## Architecture

### Frontend
- `index.html` bootstraps the app shell and modal.
- `pages/` contains hash-routed page fragments for dashboard, transactions, accounts, and budgets.
- `js/app.js` loads data from the Express API and renders page-level widgets.
- `js/router.js` swaps page fragments and triggers the right data loaders.
- `js/ui.js` owns modal open/save behavior.

### Backend
- `server.js` starts Express, serves the frontend, and mounts the API routes.
- `src/config/env.js` loads `.env` values without extra dependencies.
- `src/lib/fireflyClient.js` wraps authenticated Firefly III API requests.
- `src/services/fireflyAdapters.js` converts Firefly III payloads into frontend-friendly account, transaction, and budget objects.
- `src/services/fireflyFinanceService.js` handles list/create/delete operations against Firefly III.
- `src/routes/financeRoutes.js` exposes the app routes.

### API surface kept for the UI
- `GET /accounts`
- `GET /transactions`
- `POST /transactions`
- `DELETE /transactions/:id`
- `GET /budgets`
- `GET /api/health`

## What Changed

### Previous data flow
- The original app stored `accounts` and `transactions` in `database.db` through inline SQLite calls in `server.js`.
- All reads and writes were handled by two local routes: `/accounts` and `/transactions`.
- Account balances were mutated locally after every transaction insert/delete.
- The frontend was tightly coupled to those local routes through hardcoded fetch calls.

### New data flow
- SQLite has been removed from the active data layer.
- Firefly III is now the source of truth for accounts, transactions, and budgets.
- The Express backend translates between your frontend contract and Firefly III's API model.
- Frontend API calls are now relative, so the app can be served directly from the same Node process.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Variables:
- `FIREFLY_BASE_URL`: Base URL of your Firefly III instance, for example `http://localhost:8080`
- `FIREFLY_ACCESS_TOKEN`: Personal access token generated in Firefly III
- `PORT`: Port for this app, default `3000`

## Running Firefly III With Docker

The official Firefly III docs describe Docker Compose as the easiest install path and note that Firefly III becomes available at `http://localhost` unless you change the published port. Source: [Using Docker](https://docs.firefly-iii.org/how-to/firefly-iii/installation/docker/).

Example local `docker-compose.yml` for Firefly III with Postgres:

```yaml
services:
  firefly-db:
    image: postgres:16
    container_name: firefly-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: firefly
      POSTGRES_USER: firefly
      POSTGRES_PASSWORD: firefly
    volumes:
      - firefly-db:/var/lib/postgresql/data

  firefly-app:
    image: fireflyiii/core:latest
    container_name: firefly-app
    restart: unless-stopped
    depends_on:
      - firefly-db
    ports:
      - "8080:8080"
    environment:
      APP_KEY: change-this-to-a-random-32-character-string
      APP_URL: http://localhost:8080
      TZ: Asia/Kolkata
      DB_CONNECTION: pgsql
      DB_HOST: firefly-db
      DB_PORT: 5432
      DB_DATABASE: firefly
      DB_USERNAME: firefly
      DB_PASSWORD: firefly
    volumes:
      - firefly-upload:/var/www/html/storage/upload

volumes:
  firefly-db:
  firefly-upload:
```

Start Firefly III:

```bash
docker compose up -d
docker compose logs -f firefly-app
```

When the app finishes booting, open [http://localhost:8080](http://localhost:8080).

## Generate a Firefly Personal Access Token

According to the official API docs, personal access tokens are created from `Options > Profile > OAuth > Personal Access Tokens`, and API requests must send `Authorization: Bearer <token>`. Source: [How to use the API](https://docs.firefly-iii.org/how-to/firefly-iii/features/api/).

Steps:
1. Log in to Firefly III.
2. Open `Options`.
3. Go to `Profile`.
4. Open the `OAuth` section.
5. Create a new personal access token.
6. Copy the full token into `FIREFLY_ACCESS_TOKEN` in your `.env`.

## Run This Project Locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Firefly Mapping Notes

- Asset accounts are normalized to frontend account type `bank`.
- Liability and credit-style accounts are normalized to frontend account type `credit`.
- Firefly `deposit` journals are exposed as frontend `income`.
- Firefly `withdrawal` journals are exposed as frontend `expense`.
- Firefly `transfer` journals are exposed as frontend `transfer`.
- The backend owns this mapping so the UI does not need to understand Firefly III's raw response shapes.

## Error Handling

The backend returns normalized JSON errors for:
- invalid or unauthorized Firefly tokens
- Firefly III being unavailable or timing out
- malformed or unexpected Firefly API responses
- invalid transaction requests from the frontend

## Notes

- The old `database.db` file is no longer used by the active application flow.
- If you want to extend the UI further, keep new Firefly-specific mapping in `src/services/fireflyAdapters.js` instead of pushing Firefly response details into the frontend.
