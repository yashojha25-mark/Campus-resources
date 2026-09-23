# Campus Resource Booking — End-to-End Test Checklist

Mark each row **PASS** / **FAIL**. When a row fails, record the actual result in **Notes**
(status code, message shown, screenshot). Anything marked FAIL must be linked to a bug.

- **Build under test:** `__________________` (git commit / date)
- **Tester:** `__________________`
- **Environment:** backend `http://localhost:5000`, frontend static server `http://localhost:5599`
- **Browser + version:** `__________________`
- **Result summary:** PASS `___` / FAIL `___` / BLOCKED `___`

---

## 0. Pre-requisites & test data

| # | Setup step | Expected | Result | Notes |
|---|---|---|---|---|
| 0.1 | `backend/.env` has `MONGO_URI`, `PORT=5000`, and a real `JWT_SECRET` (≥32 chars, not a placeholder) | Server boots; no `[FATAL] Insecure configuration` | ☐ PASS ☐ FAIL | |
| 0.2 | Start MongoDB, then `npm start` in `backend/` | Console: `Server is running on port 5000` | ☐ PASS ☐ FAIL | |
| 0.3 | `curl http://localhost:5000/api/test` | `200` `{"message":"Campus Resource Booking API is running"}` | ☐ PASS ☐ FAIL | |
| 0.4 | Serve `frontend/` (e.g. `python3 -m http.server 5599`) and open `index.html` | Home page loads, featured section shows data or an empty/error state | ☐ PASS ☐ FAIL | |
| 0.5 | **Provision an admin.** Public registration always creates a `student` (role is ignored from the body). Promote a user in MongoDB:<br>`db.users.updateOne({email:"admin@campus.test"},{$set:{role:"admin"}})` | User document has `"role": "admin"` | ☐ PASS ☐ FAIL | |
| 0.6 | Have **two** distinct student accounts available (Student A, Student B) | Both can log in | ☐ PASS ☐ FAIL | |
| 0.7 | Have at least **one available** resource (e.g. "Computer Lab A") and know its `_id` | Visible on the resources page | ☐ PASS ☐ FAIL | |
| 0.8 | Have at least **one unavailable** resource (availability toggled off) | Shows "Unavailable" on its card | ☐ PASS ☐ FAIL | |

---

## 1. Student happy path

### 1.1 Register

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| S-1 | Go to `register.html`, fill Name / Email / Password, submit | Success message: "User registered successfully…", then redirect to `login.html` after ~1.2 s; form is reset | ☐ PASS ☐ FAIL | |
| S-2 | Confirm the account in MongoDB | New user has `role: "student"` and a **bcrypt-hashed** password (not plain text) | ☐ PASS ☐ FAIL | |
| S-3 | Open DevTools → Application → localStorage during the flow | **No** `campusToken` is stored by registration (register does not log you in) | ☐ PASS ☐ FAIL | |

### 1.2 Login

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| S-4 | On `login.html`, enter the new credentials, submit | "Login successful. Redirecting…", then lands on `resources.html` | ☐ PASS ☐ FAIL | |
| S-5 | Inspect localStorage | `campusToken` (JWT) and `campusUser` (id/name/email/role) are stored | ☐ PASS ☐ FAIL | |
| S-6 | Inspect the navbar | Guest links (Login/Register) hidden; Dashboard / Resources / All Bookings / user name / Logout shown; **Admin** link hidden for a student | ☐ PASS ☐ FAIL | |

### 1.3 View resources + search + filter

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| S-7 | Open `resources.html` | Loading state → resource cards render ("N resources found") | ☐ PASS ☐ FAIL | |
| S-8 | Type part of a resource name in **Search** | After ~180 ms debounce, the list narrows to matches; status line reads "Showing X of N resources."; a removable chip appears | ☐ PASS ☐ FAIL | |
| S-9 | Search matches on location/category too (e.g. type a location) | Relevant cards still returned (search covers name + location + category) | ☐ PASS ☐ FAIL | |
| S-10 | Type a nonsense term (e.g. `zzzz`) | "No matching resources" empty state **plus** a "Clear all filters" button | ☐ PASS ☐ FAIL | |
| S-11 | Use **Category** dropdown | Dropdown options are the real distinct categories from the API; list filters to that category | ☐ PASS ☐ FAIL | |
| S-12 | Use **Location** dropdown | Filtered to that location | ☐ PASS ☐ FAIL | |
| S-13 | Use **Min. capacity** (e.g. 20) | Only resources with capacity ≥ 20 remain | ☐ PASS ☐ FAIL | |
| S-14 | Use **Availability = Available / Unavailable** | List shows only the matching availability | ☐ PASS ☐ FAIL | |
| S-15 | Combine two or more filters | All filters apply together (AND), count updates | ☐ PASS ☐ FAIL | |
| S-16 | Click a chip's ✕, then "Clear filters" | Individual chip clears that one filter; "Clear filters" resets all controls and restores the full list | ☐ PASS ☐ FAIL | |
| S-17 | Press Enter in the search box | Page does **not** reload; list just re-filters | ☐ PASS ☐ FAIL | |

### 1.4 View resource → select date/time → check availability → book

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| S-18 | Click **View Details** on an available resource | `resource-details.html?id=<id>` loads; title, location, image, category, capacity, availability and description are populated | ☐ PASS ☐ FAIL | |
| S-19 | Click **Book Resource** | Booking modal (native `<dialog>`) opens; shows the resource summary; **Date** input is focused and its `min` = today | ☐ PASS ☐ FAIL | |
| S-20 | Pick a **future date**, a **start time**, and a **later end time**; click **Check Availability** on a free slot | Availability panel turns green with ✓ "Resource is available"; **step 2 (Confirm)** appears with a summary line ("<Resource> · <date> · HH:mm – HH:mm") | ☐ PASS ☐ FAIL | |
| S-21 | Change any date/time field after checking | The confirm step and availability panel hide (the old check is invalidated) | ☐ PASS ☐ FAIL | |
| S-22 | Click **Confirm Booking** | Step 3 receipt appears: Booking ID, Resource, Date, Time, Status (`confirmed`); a success message is shown on the page behind the dialog | ☐ PASS ☐ FAIL | |
| S-23 | Confirm in MongoDB | New booking document: `studentId` = your user, `resourceId` = the resource, `status: "confirmed"` | ☐ PASS ☐ FAIL | |
| S-24 | Press **Esc** (or click the backdrop) on the open modal | Dialog closes; body scroll is unlocked; focus returns to the "Book Resource" button | ☐ PASS ☐ FAIL | |

### 1.5 View booking → cancel booking → logout

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| S-25 | Open `my-bookings.html` | Your booking is listed (status badge + Date/Start/End/Status), newest first | ☐ PASS ☐ FAIL | |
| S-26 | Check `dashboard.html` | The booking appears in the correct group (Upcoming / Active / History) and the counters update | ☐ PASS ☐ FAIL | |
| S-27 | On `my-bookings.html`, click **Cancel booking** | Button shows "Cancelling…"; on success the badge flips to `cancelled` and the action is replaced by "This booking is cancelled." | ☐ PASS ☐ FAIL | |
| S-28 | Confirm in MongoDB | Booking `status` is now `"cancelled"` (document is kept, not deleted) | ☐ PASS ☐ FAIL | |
| S-29 | Re-check the dashboard | The cancelled booking moved to **History** (never Upcoming/Active) | ☐ PASS ☐ FAIL | |
| S-30 | Click **Logout** | Session cleared; redirected to `index.html`; navbar shows guest links again | ☐ PASS ☐ FAIL | |
| S-31 | Press browser Back after logout, then open `resources.html` | `campusToken` is gone → bounced to `login.html?next=resources.html` | ☐ PASS ☐ FAIL | |

---

## 2. Admin happy path

> Sign in as the promoted admin (0.5). This is a separate browser session/profile from the student run.

| # | Step | Expected result | Result | Notes |
|---|---|---|---|---|
| A-1 | Log in as admin on `login.html` | Navbar now shows an **Admin** link (student-only links still present) | ☐ PASS ☐ FAIL | |
| A-2 | Open `admin.html` | Admin shell renders (no "Administrator access required" card); topbar shows "Signed in as <admin>"; sidebar Dashboard/Resources/Bookings/Students/Settings badges fill from the API | ☐ PASS ☐ FAIL | |
| A-3 | **Dashboard** view | 4 stat cards populated (Total/Available Resources, Total/Active Bookings); "Recent Bookings" table + "Resource Availability" list render; no `—` placeholders left | ☐ PASS ☐ FAIL | |
| A-4 | **Add resource:** Resources view → fill Name/Location/Capacity/Category (+ optional Image URL/Description) → **Add Resource** | Success message; form resets to "Add Resource"; the new row appears in the table, in the availability list, and the stat counts increase | ☐ PASS ☐ FAIL | |
| A-5 | Confirm in MongoDB | New resource document created with an `available` boolean | ☐ PASS ☐ FAIL | |
| A-6 | **Edit resource:** click **Edit** on a row | Form fills with that resource, title becomes "Edit Resource: <name>", submit becomes "Save Changes", a "Cancel edit" button appears | ☐ PASS ☐ FAIL | |
| A-7 | Change a field (e.g. Capacity) → **Save Changes** | Success message; table/list reflect the new value | ☐ PASS ☐ FAIL | |
| A-8 | **Toggle availability** (switch in the row, or in the Dashboard availability list) | Switch flips; success message "<name> is now available/unavailable"; status pill and Available count update | ☐ PASS ☐ FAIL | |
| A-9 | **Delete resource:** click **Delete** → confirm the browser dialog | Success message; row disappears; counts update. (Bookings for it are kept and later display "Resource no longer available") | ☐ PASS ☐ FAIL | |
| A-10 | **View bookings:** Bookings view | Table lists every student's booking with student + email, resource + location, date, time, status pill, and a status `<select>` | ☐ PASS ☐ FAIL | |
| A-11 | Use the Bookings **search** (student/resource) and **Status** filter | The table narrows correctly; "No matching bookings" when nothing matches | ☐ PASS ☐ FAIL | |
| A-12 | **Manage booking:** change a booking's status via the dropdown (e.g. → `completed`) | Success message; pill + counters update; **Students** view counts update too | ☐ PASS ☐ FAIL | |
| A-13 | **Students** view | Only students who have booked appear, with Total / Active / Cancelled counts matching the bookings table | ☐ PASS ☐ FAIL | |
| A-14 | **Settings** view → **Reload all data** | Resources + bookings refetch; stats/tables refresh | ☐ PASS ☐ FAIL | |
| A-15 | Click sidebar **Logout** | Session cleared; redirected to `login.html` | ☐ PASS ☐ FAIL | |

---

## 3. Failure & edge cases

Record the **actual** status code and message for every row — they are the point of these tests.

### 3.1 Auth failures

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-1 | **Wrong password** | Login with a valid email + wrong password | `401`, message **"Invalid email or password"**; stays on login page; no token stored | ☐ PASS ☐ FAIL | |
| F-2 | **Unknown email** | Login with an unregistered email | `401`, **identical** message/shape to F-1 (no account enumeration) | ☐ PASS ☐ FAIL | |
| F-3 | **Duplicate email** | Register with an email that already exists | `400`, message **"User already exists"**; no second user created; no redirect | ☐ PASS ☐ FAIL | |
| F-4 | **Duplicate email, different case** | Register `USER@x.com` when `user@x.com` exists | `400` "User already exists" (emails normalise to lower-case) | ☐ PASS ☐ FAIL | |

### 3.2 Missing / invalid fields

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-5 | **Login, missing fields** | Submit login with email or password empty | Client blocks with "Please enter both email and password."; API itself returns `400` "Email and password are required" if called directly | ☐ PASS ☐ FAIL | |
| F-6 | **Register, missing fields** | Submit with any of Name/Email/Password empty | Client: "Name, email, and password are all required."; API: `400` "Name, email, and password are required" | ☐ PASS ☐ FAIL | |
| F-7 | **Register, short password** | 7-character password | Client: "Please use a password of at least 8 characters."; API: `400` "Password must be at least 8 characters" | ☐ PASS ☐ FAIL | |
| F-8 | **Register, invalid email** | e.g. `not-an-email` | `400` "A valid email address is required" | ☐ PASS ☐ FAIL | |
| F-9 | **Register, 1-char name** | Name = `A` | `400` "Name must be at least 2 characters" | ☐ PASS ☐ FAIL | |
| F-10 | **Add resource, missing fields** | Submit the admin resource form with a blank Name/Location/Category or empty Capacity | Client shows e.g. "Name is required." / "Capacity must be a positive number."; API returns `400` with the matching message | ☐ PASS ☐ FAIL | |
| F-11 | **Add resource, capacity ≤ 0** | Capacity = `0` or `-5` | `400` "Capacity must be a positive number"; nothing created | ☐ PASS ☐ FAIL | |
| F-12 | **Booking, missing slot fields** | Open the modal, leave Date/Time blank, click **Check Availability** | In-modal error panel: "Please select a booking date." / "Please select both start time and end time."; no request sent | ☐ PASS ☐ FAIL | |

### 3.3 Time & availability

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-13 | **Invalid time format** | `POST /api/bookings` with `startTime: "9am"` or `"25:00"` (curl/Postman) | `400` "startTime must be before endTime in HH:mm format" (strict `HH:mm`, 24-hour) | ☐ PASS ☐ FAIL | |
| F-14 | **End time before start time** | Modal: start `14:00`, end `13:00`, Check Availability | In-modal error "Start time must be before end time."; API `400` with the same meaning | ☐ PASS ☐ FAIL | |
| F-15 | **End time equal to start time** | start `10:00`, end `10:00` | Rejected (start must be strictly before end) | ☐ PASS ☐ FAIL | |
| F-16 | **Past date** | Modal: choose yesterday | Client blocks with "Please select today or a future date." (the date input's `min` also discourages it) | ☐ PASS ☐ FAIL | |
| F-17 | **Overlapping booking (pre-flight)** | Student B checks a slot that Student A already holds on the same resource/date | Availability returns **`200` with `available:false`**, reason `conflict`, message "Another booking already exists during this time." (plus the conflicting `HH:mm – HH:mm` in the UI) | ☐ PASS ☐ FAIL | |
| F-18 | **Overlapping booking (create)** | Force the create on the clashing slot (`POST /api/bookings`) | **`409`** "Resource is already booked for this time slot"; no second booking created | ☐ PASS ☐ FAIL | |
| F-19 | **Adjacent slot is allowed** | Book `09:00–10:00`, then book `10:00–11:00` | Succeeds (touching edges do not overlap) | ☐ PASS ☐ FAIL | |
| F-20 | **Cancelled slot frees up** | Cancel the `09:00–10:00` booking, then rebook that slot | Succeeds (cancelled bookings are excluded from the overlap check) | ☐ PASS ☐ FAIL | |
| F-21 | **Unavailable resource (availability check)** | Check a slot on a resource whose availability is off | `200` `available:false`, reason `unavailable`, message "This resource is not available for booking right now." | ☐ PASS ☐ FAIL | |
| F-22 | **Unavailable resource (create)** | `POST /api/bookings` for that resource | `400` "Resource is not available" | ☐ PASS ☐ FAIL | |
| F-23 | **Unavailable resource (UI)** | Open details of an unavailable resource | "Book Resource" button is **disabled** with the message "This resource is not available for booking right now." | ☐ PASS ☐ FAIL | |

### 3.4 Token / authorization failures

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-24 | **Expired JWT** | In DevTools, replace `campusToken` with a **valid-format but expired** token, then load `resources.html` | API `401`; app keeps **no** session, clears storage, and redirects to `login.html?next=…`; login page shows "Your session expired. Please log in again." | ☐ PASS ☐ FAIL | |
| F-25 | **Tampered JWT** | Corrupt one character of the stored token, reload a protected page | `401` → same expired-session redirect as F-24 (signature check fails) | ☐ PASS ☐ FAIL | |
| F-26 | **No token at all** | `curl http://localhost:5000/api/resources` with no `Authorization` header | `401` "Not authorized, no token provided" | ☐ PASS ☐ FAIL | |
| F-27 | **Malformed Authorization header** | `curl -H "Authorization: Token abc" …` (no `Bearer `) | `401` "Not authorized, no token provided" | ☐ PASS ☐ FAIL | |
| F-28 | **Unauthorized API request — read** | `curl http://localhost:5000/api/bookings` with no token | `401` "Not authorized, no token provided" | ☐ PASS ☐ FAIL | |
| F-29 | **Unauthorized API request — write** | Student token → `curl -X POST .../api/resources` (create) | **`403`** "Admin access required" | ☐ PASS ☐ FAIL | |
| F-30 | **Unauthorized API request — update/delete** | Student token → `PUT` and `DELETE` on `/api/resources/:id` | `403` "Admin access required" for both | ☐ PASS ☐ FAIL | |
| F-31 | **Student accesses admin page (UI)** | Log in as student A, manually open `admin.html` | Redirected to `login.html` (requireAuth `adminOnly`); the admin shell is never usable | ☐ PASS ☐ FAIL | |
| F-32 | **Student fakes the cached role** | As a student, edit `campusUser` in localStorage to `"role":"admin"`, then open `admin.html` | Page may render cosmetically, but every request `403`s / `GET /api/auth/me` shows the true role and the "does not have administrator privileges" denied card appears — **no admin action succeeds** | ☐ PASS ☐ FAIL | |
| F-33 | **Student token on an admin write (defence in depth)** | Even if the UI is faked, replay the create/update/delete with the student's token | `403` — the backend, not the UI, is the boundary | ☐ PASS ☐ FAIL | |

### 3.5 Ownership failures

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-34 | **Student cancels another student's booking** | As Student B, `PUT /api/bookings/<A's id>` `{"status":"cancelled"}` | **`404`** "Booking not found" (the query is scoped to `studentId = B`, so A's booking is invisible) — and A's booking is **unchanged** in the DB | ☐ PASS ☐ FAIL | |
| F-35 | **Student reads another student's booking** | As Student B, `GET /api/bookings/<A's id>` | `404` "Booking not found" | ☐ PASS ☐ FAIL | |
| F-36 | **Student deletes another student's booking** | As Student B, `DELETE /api/bookings/<A's id>` | `404` "Booking not found"; A's booking still exists | ☐ PASS ☐ FAIL | |
| F-37 | **Student's `my-bookings` list is scoped** | Compare the list for A vs B | Each student sees **only their own** bookings (admin sees all) | ☐ PASS ☐ FAIL | |
| F-38 | **Student tries to set another student's status** | As Student B, `PUT /api/bookings/<A's id>` with `{"status":"confirmed"}` on A's booking | `404` (not theirs) — students cannot re-confirm or promote someone else's booking | ☐ PASS ☐ FAIL | |
| F-39 | **Admin can manage any booking** | As admin, change Student A's booking status | Succeeds (`200`) — ownership scoping does not apply to admins | ☐ PASS ☐ FAIL | |

### 3.6 Nonexistent / bad identifiers

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-40 | **Nonexistent resource (details page)** | Open `resource-details.html?id=<valid-but-unknown ObjectId>` | `404` "Resource not found"; page shows "Resource Not Found" and disables the Book button | ☐ PASS ☐ FAIL | |
| F-41 | **Nonexistent resource (booking)** | `POST /api/bookings` with a valid-but-unknown `resourceId` | `404` "Resource not found" | ☐ PASS ☐ FAIL | |
| F-42 | **Nonexistent resource (availability)** | `GET /api/resources/<unknown>/availability?…` | `404` "Resource not found" | ☐ PASS ☐ FAIL | |
| F-43 | **Malformed resource id** | `GET /api/resources/123` | `400` "Invalid resource id" | ☐ PASS ☐ FAIL | |
| F-44 | **Malformed booking id** | `GET /api/bookings/123` | `400` "Invalid booking id" | ☐ PASS ☐ FAIL | |
| F-45 | **Nonexistent booking** | `GET /api/bookings/<valid-but-unknown ObjectId>` | `404` "Booking not found" | ☐ PASS ☐ FAIL | |
| F-46 | **Details page with no `?id=`** | Open `resource-details.html` bare | "No resource was selected. Open a resource from the resources page."; Book button disabled | ☐ PASS ☐ FAIL | |
| F-47 | **Unknown API endpoint** | `curl http://localhost:5000/api/nope` | `404` **JSON** `{"message":"Endpoint not found"}` (not an HTML error page) | ☐ PASS ☐ FAIL | |
| F-48 | **Deleted resource still referenced** | Delete a resource that has bookings, then view those bookings | Bookings remain and display "Resource no longer available" (no crash) | ☐ PASS ☐ FAIL | |

### 3.7 Request-shape failures

| # | Test | How to trigger | Expected result | Result | Notes |
|---|---|---|---|---|---|
| F-49 | **Malformed JSON body** | `curl -X POST .../api/auth/login -H 'Content-Type: application/json' -d '{bad'` | `400` "Malformed JSON in request body" | ☐ PASS ☐ FAIL | |
| F-50 | **Oversized body** | POST a JSON body > 100 kb | `413` "Request body is too large" | ☐ PASS ☐ FAIL | |
| F-51 | **Partial resource update** | `PUT /api/resources/:id` with only `{"available": false}` (admin) | `400` — the controller re-validates and requires the full resource (use the availability toggle, which sends the whole object) | ☐ PASS ☐ FAIL | |
| F-52 | **Admin creates a booking** | As admin, `POST /api/bookings` | `403` "Only students can create bookings" | ☐ PASS ☐ FAIL | |
| F-53 | **Guest opens a protected page directly** | Logged out, open `my-bookings.html` / `dashboard.html` | Redirected to `login.html?next=<page>`; the page content is never fetched | ☐ PASS ☐ FAIL | |

---

## 4. Responsive smoke check (carry-over from the CSS pass)

Quick re-check that the flows above are usable at the required widths. Use DevTools device toolbar.

| # | Width | Check | Expected | Result |
|---|---|---|---|---|
| R-1 | 375 / 390 | Navbar | Hamburger menu; links in a drawer; no horizontal scroll | ☐ PASS ☐ FAIL |
| R-2 | 375 / 390 | Resource cards | Single column | ☐ PASS ☐ FAIL |
| R-3 | 375 / 390 | Booking modal | Fits width; slot fields stack; receipt rows stack | ☐ PASS ☐ FAIL |
| R-4 | 375 / 390 | Admin tables | Scroll horizontally inside the panel; first column stays pinned; page does not overflow | ☐ PASS ☐ FAIL |
| R-5 | 768 | Layouts | Tablet grid (cards 2-up, dashboard/admin single column, stats 2-up) | ☐ PASS ☐ FAIL |
| R-6 | 1024 / 1440 | Layouts | Desktop grid (3-up cards, admin sidebar + content, dashboard 2-column) | ☐ PASS ☐ FAIL |
| R-7 | All | Buttons/links on mobile | Tap targets ≥ 40px tall | ☐ PASS ☐ FAIL |

---

## 5. Sign-off

| Item | Result |
|---|---|
| All Student happy-path rows PASS (S-1 … S-31) | ☐ |
| All Admin happy-path rows PASS (A-1 … A-15) | ☐ |
| All failure rows PASS (F-1 … F-53) | ☐ |
| No row left BLOCKED without a reason | ☐ |
| Every FAIL has a linked bug with steps + screenshot | ☐ |

**Blocking bugs found**

| Bug ID | Checklist row | Summary | Severity | Status |
|---|---|---|---|---|
| | | | | |
| | | | | |

**Tester signature / date:** `__________________`

---

### Appendix — API contract cheatsheet (the expected values above come from these)

| Endpoint | Auth | Success | Key failures |
|---|---|---|---|
| `POST /api/auth/register` | none | `201` | `400` missing fields / short password / invalid email / **duplicate email** ("User already exists") |
| `POST /api/auth/login` | none | `200` + `{token,user}` | `400` missing fields; `401` "Invalid email or password" (wrong password **and** unknown email) |
| `GET /api/auth/me` | `protect` | `200` `{user}` | `401` no/failed/expired token |
| `GET /api/resources/public` | none | `200` (≤6 available) | — |
| `GET /api/resources` | `protect` | `200` + `filterOptions` | `401` |
| `GET /api/resources/:id` | `protect` | `200` | `400` invalid id; `404` not found |
| `GET /api/resources/:id/availability` | `protect` | **`200`** `{available:boolean,reason}` | `400` bad date/time; `404` resource |
| `POST /api/resources` | `protect`+`adminOnly` | `201` | `400` validation; `403` not admin |
| `PUT /api/resources/:id` | `protect`+`adminOnly` | `200` | `400` validation; `403`; `404` |
| `DELETE /api/resources/:id` | `protect`+`adminOnly` | `200` | `400` invalid id; `403`; `404` |
| `POST /api/bookings` | `protect` | `201` | `400` bad time/date/unavailable; `403` non-student; `404` resource; **`409` overlap** |
| `GET /api/bookings` | `protect` | `200` (student = own; admin = all) | `401` |
| `GET /api/bookings/:id` | `protect` | `200` | `400` invalid id; `404` not found/not yours |
| `PUT /api/bookings/:id` | `protect` | `200` | `400`; `404` not found/not yours; `409` overlap |
| `DELETE /api/bookings/:id` | `protect` | `200` | `400`; `404` not found/not yours |

**Cancel shortcut:** a student cancels with `PUT /api/bookings/:id` body `{"status":"cancelled"}` — it bypasses the re-validation/overlap branch and only touches their own booking.
