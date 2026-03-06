# adibudget

`adibudget` keeps the custom dashboard UI and now treats Firefly III as the finance backend and source of truth. The Node/Express server acts as a BFF/adapter so the frontend stays branded, uses relative API calls, and never sees Firefly tokens.

## Architecture

### Frontend
- `index.html` bootstraps the app shell, navigation, and shared modal.
- `pages/` contains hash-routed page fragments for dashboard, transactions, accounts, budgets, categories, tags, recurring, and settings.
- `js/app.js` loads data from the Express API, renders page-level widgets, and manages CRUD modals.
- `js/router.js` swaps page fragments and triggers the right data loaders.
- `js/ui.js` wires modal interactions, filters, and action buttons.

### Backend
- `server.js` starts Express, serves the frontend, and mounts the API routes.
- `src/config/env.js` loads `.env` values without extra dependencies.
- `src/lib/fireflyClient.js` wraps authenticated Firefly III API requests.
- `src/services/fireflyAdapters.js` converts Firefly III payloads into frontend-friendly account, transaction, budget, category, tag, recurrence, and health objects.
- `src/services/fireflyFinanceService.js` handles CRUD operations and Firefly request shaping.
- `src/routes/financeRoutes.js` exposes the app routes.

### API surface kept for the UI
- `GET /accounts`
- `POST /accounts`
- `PUT /accounts/:id`
- `POST /accounts/:id/archive`
- `GET /transactions`
- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`
- `GET /budgets`
- `POST /budgets`
- `PUT /budgets/:id`
- `DELETE /budgets/:id`
- `GET /categories`
- `POST /categories`
- `PUT /categories/:id`
- `DELETE /categories/:id`
- `GET /tags`
- `POST /tags`
- `PUT /tags/:id`
- `DELETE /tags/:id`
- `GET /recurring`
- `POST /recurring`
- `PUT /recurring/:id`
- `DELETE /recurring/:id`
- `GET /api/health`
- `POST /api/transactions/quick`
- `GET /api/suggestions`
- `GET /api/search`
- `GET /api/review/monthly`
- `GET /api/budgets/projection`

## Current UI Features

- Dashboard with net worth, month-to-date totals, recent transactions, budget snapshot, account overview, and connection status
- Transactions page with add/edit/delete flows, date/type/category/account/budget filters, transfer support, and split transaction support
- Quick Add modal for one-line fast entry with deterministic parsing
- Global search entry point with `/` to focus search and `q` to open quick add
- Search page for merchant/account/category/tag/month queries
- Monthly review page for totals, category breakdowns, merchants, and unusual transactions
- Budget projections with projected month-end spend and safe daily pace
- Accounts page with grouped balances plus create/edit/archive actions
- Budgets, categories, and tags pages with list/create/edit/delete flows
- Recurring page with list/create/edit/delete for a practical supported subset of Firefly recurrence fields
- Settings page with connection health, Firefly runtime/version information, and safe backend config visibility

## Product Roadmap Status

### V1

Mostly implemented:
- dashboard, transactions, accounts, budgets, categories, tags, recurring, and settings pages exist
- day-to-day CRUD now lives in AdiBudget instead of Firefly for normal flows
- Firefly remains hidden behind the Express adapter layer

Still worth refining inside V1:
- more live smoke coverage for create/update/delete flows against a real Firefly dataset
- more keyboard-friendly quick entry polish inside the existing transaction modal

### V2

Implemented in this repo:
- quick add transaction flow
- deterministic one-line parser
- search page and backend search adapter
- monthly review page
- budget projection widgets

Still worth refining:
- richer merchant/account/category memory and explicit favorite toggles
- more parser heuristics for transfer and edge-case input
- more nuanced unusual-transaction detection

### V3

Not implemented yet:
- rule builder and rule suggestions
- insight engine and unusual-activity guidance
- AdiBudget-specific preference layer

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

Important variables:
- `FIREFLY_BASE_URL`: Base URL of your Firefly III instance, for example `http://localhost:8080`
- `FIREFLY_ACCESS_TOKEN`: Personal access token generated in Firefly III
- `PORT`: Port for this app, default `3000`

The same repo also includes Docker files for running Firefly III locally. Extra Firefly container settings in `.env.example` are there for that stack and are ignored by the adibudget backend.

AdiBudget V2 also creates a small local JSON file at `data/ux-preferences.json` for UI-only memory such as recent searches and quick-entry defaults. Core financial records remain in Firefly III.

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

1. Start Firefly III:

```bash
docker compose up -d
```

2. Generate a personal access token in Firefly III:

- Open [http://localhost:8080](http://localhost:8080)
- Log in
- Go to `Options → Profile → OAuth → Personal Access Tokens`
- Create a token and paste it into `.env` as `FIREFLY_ACCESS_TOKEN`

3. Install dependencies:

```bash
npm install
```

4. Run adibudget:

```bash
npm run dev
```

5. Open:

- adibudget: [http://localhost:3000](http://localhost:3000)
- Firefly III: [http://localhost:8080](http://localhost:8080)

### V2 shortcuts

- `q`: open Quick Add
- `/`: focus the global search box

## Firefly Mapping Notes

- Asset accounts are normalized into `bank`, `cash`, and `savings`.
- Debt-like accounts are normalized into `credit` or `liability`.
- Firefly `deposit` journals are exposed as frontend `income`.
- Firefly `withdrawal` journals are exposed as frontend `expense`.
- Firefly `transfer` journals are exposed as frontend `transfer`.
- Firefly split journal groups are exposed as one UI transaction with a `splits` array.
- The backend owns this mapping so the UI does not need to understand Firefly III's raw response shapes.

## Error Handling

The backend returns normalized JSON errors for:
- invalid or unauthorized Firefly tokens
- Firefly III being unavailable or timing out
- malformed or unexpected Firefly API responses
- invalid transaction requests from the frontend
- malformed recurring/account/budget/category/tag requests from the frontend

## Notes

- The old `database.db` file is no longer used by the active application flow.
- If you want to extend the UI further, keep new Firefly-specific mapping in `src/services/fireflyAdapters.js` instead of pushing Firefly response details into the frontend.
- The recurring UI currently focuses on a practical subset of Firefly recurrence fields: one transaction template plus daily/weekly/monthly/yearly repetition settings.

## Local Firefly III Stack

This repo also includes a minimal local Docker Compose stack for Firefly III with MariaDB and a cron container.

### Files

- `docker-compose.yml`
- `.env`
- `.db.env`

### Start the stack

```bash
docker compose up -d
```

### Restart the stack

```bash
docker compose restart
```

### Stop the stack

```bash
docker compose down
```

### View logs

```bash
docker compose logs -f firefly-app
docker compose logs -f firefly-db
docker compose logs -f firefly-cron
```

### Generate a personal access token

1. Open [http://localhost:8080](http://localhost:8080)
2. Create your Firefly III account or sign in
3. Click `Options`
4. Open `Profile`
5. Open the `OAuth` tab
6. Go to `Personal Access Tokens`
7. Create the token and copy it immediately

### Common troubleshooting

- If Firefly does not open, make sure Docker Desktop is running and then check `docker compose logs -f firefly-app`.
- If the app keeps restarting, verify `APP_KEY` exists in `.env` and `APP_URL` is exactly `http://localhost:8080`.
- If login or token creation fails, inspect `docker compose logs -f firefly-app` and confirm Firefly is using standard local login, not remote user auth.
- If `/register` says registration is unavailable, that usually means a user already exists in the database. Use `/login` instead, or reset the stack data if you want a brand-new first-run flow.
- If OAuth-related features break after a restart, keep the `firefly-storage` volume intact because Firefly stores important app material under `storage`.
- If database startup is slow, wait for the MariaDB healthcheck to pass before testing the web UI.
- If adibudget shows Firefly connection errors, confirm `FIREFLY_BASE_URL=http://localhost:8080` and that `FIREFLY_ACCESS_TOKEN` is set in `.env`, then restart `npm run dev`.
