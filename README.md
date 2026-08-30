# mv — Personal Film Ledger

A full-stack movie watchlist app. Search films from TMDB, track what you're
planning to watch, watching, or have finished, and rate and annotate your own
history.

<!-- Add a screenshot here — drop the image in docs/ and reference it:
     ![Watchlist](docs/watchlist.png) -->

---

## Stack

**Frontend** — React 19, Vite, React Router, Axios, CSS Modules
**Backend** — Node, Express 5, Drizzle ORM, PostgreSQL, Zod
**Auth** — JWT (httpOnly cookie + bearer token), bcrypt
**Data** — [TMDB](https://www.themoviedb.org) for film metadata

---

## Features

- Registration and login with hashed passwords and JWT sessions
- Protected client-side routes; unauthenticated users are redirected
- Film search against TMDB, proxied through the backend
- Watchlist items with status (`PLANNED` / `WATCHING` / `COMPLETED` / `DROPPED`),
  a 1–5 rating, and free-text notes
- Client-side search and status filtering over your own list
- Grid and list views with adjustable density
- Light and dark themes, persisted locally
- Toast notifications, including a dedicated message when rate limited

---

## Layout

This is a single repository holding both halves of the app, so changes that
span the API contract land in one commit.

```
mv/
├── mv-backend/          Express API
│   ├── drizzle/         Generated SQL migrations
│   └── src/
│       ├── config/      DB connection (driver-switching)
│       ├── controllers/ Route handlers
│       ├── db/          Drizzle schema
│       ├── middleware/  Auth, validation, rate limiting, error handling
│       ├── routes/      Route definitions
│       ├── services/    TMDB client
│       ├── utils/       Token generation
│       └── validators/  Zod schemas
└── mv-frontend/         React SPA
    └── src/
        ├── components/  Layout, UI, and watchlist components
        ├── context/     Auth context
        ├── hooks/       useAuth, useToast
        ├── pages/       Landing, auth, watchlist
        └── services/    Axios instance and API calls
```

---

## Running locally

**Requires** Node 18+ and a PostgreSQL database — either a free
[Neon](https://neon.tech) instance or a local Postgres.

### 1. Backend

```bash
cd mv-backend
npm install
cp .env.example .env      # then fill in the values below
npx drizzle-kit push      # creates the tables
npm run dev               # http://localhost:5001
```

### 2. Frontend

```bash
cd mv-frontend
npm install
npm run dev               # http://localhost:5173
```

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon or local Postgres connection string |
| `DB_DRIVER` | no | `neon` or `pg`. Inferred from the URL if unset |
| `JWT_SECRET` | yes | Any long random string |
| `JWT_EXPIRES_IN` | no | Defaults to `1d`. Also sets the cookie lifetime |
| `TMDB_ACCESS_TOKEN` | yes | TMDB **v4** API Read Access Token |
| `PORT` | no | Defaults to `5001` |
| `NODE_ENV` | no | `development` adds stack traces to error responses |
| `RATE_LIMIT_WINDOW_MINUTES` | no | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | no | Requests allowed per window |

A TMDB token is free — sign up, then Settings → API → Developer plan. Use the
long v4 Read Access Token, not the short v3 key.

---

## Design notes

A few decisions worth calling out:

**TMDB is proxied, never called from the browser.** Vite inlines `VITE_*`
variables into the client bundle, so an API token used from React would be
readable in devtools. All TMDB traffic goes through `/movies`, which also means
the existing rate limiter protects the upstream quota.

**Users can't reach each other's data.** Every watchlist handler derives
`userId` from the verified JWT rather than the request body, and updates and
deletes carry an ownership predicate in the `WHERE` clause. A valid token for
one account cannot mutate another's rows even with a guessed item id.

**Films are a shared catalogue, not per-user rows.** `movie.tmdb_id` is unique,
so two users adding the same film resolve to one row — which is what makes the
`unique(user_id, movie_id)` constraint on watchlist items meaningful. Imports
use `ON CONFLICT DO UPDATE` so concurrent adds don't race into a unique
violation.

**TMDB metadata is cached, not owned.** Their API terms forbid retaining
content beyond six months, so every descriptive column is refreshable and
stamped with `refreshed_at`; only `tmdb_id` is durable. User data — statuses,
ratings, notes — is ours and never expires.

**One database object, two drivers.** Neon's serverless driver speaks HTTP and
can't reach a local Postgres over TCP, so `config/db.js` selects between it and
node-postgres based on the connection string. The same code runs against either
with no changes.

---

## Roadmap

- [ ] Automated tests — there are none yet
- [ ] Move the frontend API base URL to an env variable (currently hardcoded to
      `localhost:5001`)
- [ ] Deploy
- [ ] Recommendations from watch history

---

## Attribution

<img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" height="16">

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or
otherwise approved by TMDB.
