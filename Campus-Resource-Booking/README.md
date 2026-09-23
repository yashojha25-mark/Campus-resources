# Campus Resource Booking System

A full-stack web app for reserving campus spaces — classrooms, computer labs, halls,
sports areas and study rooms. Students browse resources, check a slot is free, and book
it. Administrators manage resources and every booking.

- **Backend:** Node.js, Express 5, MongoDB (Mongoose), JWT auth, bcrypt password hashing
- **Frontend:** plain HTML, CSS and vanilla JavaScript — no framework, no build step
- **Auth:** JWT bearer tokens; role-based access (`student` / `admin`)

---

## Table of contents

- [Features](#features)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Creating an admin account](#creating-an-admin-account)
- [Running the app](#running-the-app)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Booking rules](#booking-rules)
- [Testing](#testing)
- [Security notes](#security-notes)

---

## Features

**Students**
- Register and log in (JWT session, persisted in `localStorage`)
- Browse the resource catalogue
- Search and filter by category, location, minimum capacity, and availability
- View a resource's full details
- Pick a date and time, check availability, then book the slot
- View upcoming, active and past bookings on a dashboard
- Cancel a booking
- Log out

**Administrators**
- Dashboard with resource and booking statistics
- Add, edit, and delete resources
- Toggle a resource's availability
- View every booking with student details
- Change a booking's status (pending / confirmed / cancelled / completed)
- See the students derived from the booking history
- Log out

**Behaviour worth knowing**
- Overlapping bookings on the same resource are rejected — the availability check and
  the actual booking run the *same* overlap query, so they cannot disagree.
- Cancelling a booking frees the slot up again.
- Deleting a resource keeps its bookings; they display as "Resource no longer available".
- A student can only ever see and modify **their own** bookings.

---

## Project structure

```
Campus-Resource-Booking/
├── backend/
│   ├── config/
│   │   ├── assertSecureConfig.js   # refuses to boot with an unsafe JWT secret
│   │   └── db.js                   # MongoDB connection
│   ├── controllers/                # auth, resource, booking logic
│   ├── middleware/
│   │   ├── authMiddleware.js       # verifies the JWT -> req.user
│   │   └── adminMiddleware.js      # 403 unless req.user.role === 'admin'
│   ├── models/                     # Mongoose schemas (User, Resource, Booking)
│   ├── routes/                     # /api/auth, /api/resources, /api/bookings
│   ├── utils/errorResponse.js      # consistent 500 handling
│   ├── app.js                      # Express app, CORS, JSON, error handler
│   ├── server.js                   # entry point
│   ├── .env.example                # copy to .env and fill in
│   └── package.json
├── frontend/
│   ├── css/                        # style, navbar, hero, cards, filters, dashboard, admin, booking-modal
│   ├── js/
│   │   ├── api.js                  # low-level fetch wrapper + all endpoints
│   │   ├── ui.js                   # shared DOM helpers, escaping, loading/empty states
│   │   ├── auth.js                 # login / register / session bootstrap
│   │   ├── resources.js            # resource list + details page
│   │   ├── bookings.js             # booking modal + my-bookings page
│   │   ├── dashboard.js            # student dashboard
│   │   ├── admin.js                # admin dashboard
│   │   └── main.js                 # navbar toggle, hero slideshow, logout
│   ├── index.html                  # home
│   ├── resources.html              # catalogue + filters
│   ├── resource-details.html       # details + booking modal
│   ├── dashboard.html              # student dashboard
│   ├── my-bookings.html            # all of a student's bookings
│   ├── admin.html                  # admin dashboard
│   ├── login.html / register.html  # auth pages
│   └── images/
└── TEST-CHECKLIST.md               # end-to-end PASS/FAIL test checklist
```

---

## Prerequisites

- **Node.js** 18 or newer
- **MongoDB** running locally, or a MongoDB Atlas connection string
- Any static file server for the frontend (Python's `http.server` is enough)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/yashojha25-mark/Campus-resources.git
cd Campus-resources
```

### 2. Install backend dependencies

```bash
cd Campus-Resource-Booking/backend
npm install
```

### 3. Create your `.env`

```bash
cp .env.example .env
```

Then edit `.env` and set at least a real `JWT_SECRET`. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> The server **refuses to start** if `JWT_SECRET` is missing, shorter than 32 characters,
> or still looks like a placeholder (e.g. `replace_with_a_long_random_secret`).
> This is deliberate — a guessable secret lets anyone forge an admin token.

`.env` is git-ignored. Never commit it.

---

## Creating an admin account

Public registration **always** creates a `student`. The `role` field in the request body
is deliberately ignored, so nobody can make themselves an admin by asking.

To create an admin:

1. Register a normal account through the app (or `POST /api/auth/register`).
2. Promote it directly in MongoDB:

```bash
mongosh
```

```javascript
use campus_resource_booking
db.users.updateOne(
  { email: "admin@campus.test" },
  { $set: { role: "admin" } }
)
```

3. Log in again — the navbar now shows the **Admin** link.

---

## Running the app

**Terminal 1 — backend (port 5000):**

```bash
cd Campus-Resource-Booking/backend
npm start        # or: npm run dev   (nodemon, auto-restart)
```

You should see:

```
MongoDB Connected: <host>
Server is running on port 5000
```

**Terminal 2 — frontend (any port; 5599 used in the docs):**

```bash
cd Campus-Resource-Booking/frontend
python3 -m http.server 5599
```

Open <http://localhost:5599/index.html>.

> Keep the trailing slash off paths consistently and always open the app through the
> server (not `file://`) — the frontend loads sibling CSS/JS files by relative path.

### Pointing the frontend at a different API

`frontend/js/api.js` defaults to `http://localhost:5000/api`. To override it without
editing the file, define `window.CAMPUS_API_BASE_URL` before `api.js` loads:

```html
<script>window.CAMPUS_API_BASE_URL = 'https://my-api.example.com/api';</script>
```

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `5000` | Port the API listens on |
| `MONGO_URI` | **yes** | — | MongoDB connection string |
| `JWT_SECRET` | **yes** | — | Signing key for JWTs. ≥ 32 chars, not a placeholder |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime, e.g. `15m`, `2h`, `7d` |
| `CORS_ORIGINS` | no | *(empty)* | Comma-separated allowed browser origins. Empty = same-origin only in production, but localhost is allowed in development |
| `NODE_ENV` | no | — | Set to `production` to tighten CORS and hide validation details from 500s |

---

## API reference

Base URL: `http://localhost:5000/api`
Authenticated requests need `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Auth | Success | Notes |
|---|---|---|---|---|
| `POST` | `/auth/register` | none | `201` | Body: `name`, `email`, `password`. Always creates a `student`. |
| `POST` | `/auth/login` | none | `200` | Returns `{ token, user }` |
| `GET` | `/auth/me` | token | `200` | Returns the current user |

### Resources

| Method | Endpoint | Auth | Success | Notes |
|---|---|---|---|---|
| `GET` | `/resources/public` | none | `200` | Up to 6 available resources (for the home page) |
| `GET` | `/resources` | token | `200` | Optional filters: `search`, `category`, `location`, `minCapacity`, `maxCapacity`, `available`. Also returns `filterOptions` for the dropdowns |
| `GET` | `/resources/:id` | token | `200` | Single resource |
| `GET` | `/resources/:id/availability` | token | `200` | Query: `date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm`. Returns `{ available, reason }` |
| `POST` | `/resources` | admin | `201` | Body: `name`, `location`, `capacity`, `category`, `description?`, `image?`, `available?` |
| `PUT` | `/resources/:id` | admin | `200` | Requires the **full** resource (partial bodies are rejected) |
| `DELETE` | `/resources/:id` | admin | `200` | Bookings referencing it are kept |

### Bookings

| Method | Endpoint | Auth | Success | Notes |
|---|---|---|---|---|
| `POST` | `/bookings` | student | `201` | Body: `resourceId`, `date`, `startTime`, `endTime` |
| `GET` | `/bookings` | token | `200` | Student: own bookings. Admin: all bookings |
| `GET` | `/bookings/:id` | token | `200` | Own booking, or any if admin |
| `PUT` | `/bookings/:id` | token | `200` | Student: cancel via `{ "status": "cancelled" }`. Admin: any status change |
| `DELETE` | `/bookings/:id` | token | `200` | Own booking, or any if admin |

### Common error responses

| Status | Meaning |
|---|---|
| `400` | Validation failed (missing/invalid fields, bad time order, unavailable resource) |
| `401` | Missing, malformed, expired or invalid token |
| `403` | Authenticated but not allowed (e.g. a student writing to an admin route) |
| `404` | Not found — or, for bookings, **not yours** (ownership is enforced in the query) |
| `409` | Booking conflicts with an existing booking for that resource and slot |
| `413` | Request body over 100 kb |
| `500` | Server error (internals logged server-side, not returned) |

---

## Booking rules

- `startTime` and `endTime` must both be strict 24-hour `HH:mm` (e.g. `09:00`, not `9:00`).
- `startTime` must be **strictly before** `endTime`.
- A booking must not overlap an existing booking on the same resource and date.
  Adjacent slots (`09:00–10:00` then `10:00–11:00`) are allowed.
- Cancelled bookings are ignored by the overlap check, so cancelling frees the slot.
- Only `student` accounts can create bookings; only an admin can change a booking's status.
- The pre-flight availability endpoint and the create endpoint share the same overlap
  query, so an "available" answer means the booking will succeed (barring a race with
  another student, which still returns `409` — the UI handles it).

---

## Testing

`TEST-CHECKLIST.md` in this repo is a complete manual end-to-end checklist — mark each
row PASS/FAIL. It covers:

- the full student journey (register → login → browse → search → filter → book → cancel → logout)
- the full admin journey (login → dashboard → add/edit/delete resource → manage bookings → logout)
- 50+ failure cases (wrong password, duplicate email, missing fields, invalid/backwards
  times, overlapping bookings, unavailable resources, expired JWT, unauthorized requests,
  a student reaching admin routes, a student touching another student's booking,
  nonexistent resources, malformed JSON, oversized bodies)
- a responsive smoke check at 375 / 390 / 768 / 1024 / 1440 px

There is no automated test runner configured yet (`npm test` is a placeholder).

---

## Security notes

- Passwords are hashed with **bcrypt** (12 rounds); hashes are never returned by the API
  (`studentId` is populated with `-password`).
- Login returns the **same** message for a wrong password and an unknown email, so the
  endpoint cannot be used to discover which emails have accounts.
- `role` is never read from the registration body — public signup cannot create admins.
- The server validates `JWT_SECRET` at boot and exits if it is weak or a placeholder.
- Resource create/update/delete require `adminOnly` on the server. Hiding admin buttons in
  the UI is cosmetic; the API is the real boundary.
- Booking reads and writes are scoped by `studentId` for students, so one student cannot
  view or modify another's booking.
- The JSON body limit is 100 kb, and unknown `/api` routes return JSON rather than an
  HTML error page.
- CORS is an allow-list. Requests with no `Origin` (curl, server-to-server) are permitted,
  since CORS only protects browsers.

---

## License

ISC
