# nm

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Lab booking.

## Goals
- Students can browse lab availability and book one seat for a specific date and time.
- Students can see their upcoming bookings and cancel a booking they no longer need.

## Non-goals
- No recurring reservations: each booking is for one specific date and time.
- No group reservations: each booking is made by one student for one seat.
- No attendance tracking or no-show penalties after a booking is made.

## Constraints
- The application uses Node.js 22, Express, SQLite, and a plain HTML, CSS, and JavaScript web UI.
- Passwords are stored only as salted hashes, never as readable text.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: Gemini 2.5 Flash, called by a server-side model service.
- Input: Lab names and non-personal details of upcoming slots; account and booking-owner data are never sent.
- Output: A short availability summary with slot IDs, shown only when every ID still matches a bookable slot in the database.
- When it fails: If the key is missing, the call times out or is rate-limited, or the output is invalid or stale, omit the summary and show the regular database-backed slot list.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: Students register and sign in with email and password; passwords are stored as bcrypt hashes.
- Provider: Google sign-in uses the server-side OAuth authorization-code flow.
- Linking: A signed-in student may link Google only after authenticating both accounts and confirming the same verified email; never merge accounts based only on an unverified email.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `list_lab_slots` | Lists upcoming slots with live remaining seats, optionally filtered by lab and date. | Anyone; returns public slot details only. |
| `book_lab_slot` | Reserves one seat for the signed-in student, refusing full slots and duplicate active bookings. | Signed-in student. |
| `list_my_bookings` | Shows the caller's own bookings with lab, date, time, and booking status. | Signed-in student; only their own bookings. |
| `cancel_my_booking` | Cancels the caller's future booking and releases its seat without affecting another student's booking. | Signed-in student; only their own booking. |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Responsive HTML, CSS, and vanilla JavaScript served by Express. Screens: sign-in/register, lab availability and filters, my bookings with cancellation, and manager slot creation.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->
When a student reserves a seat, the Reserve button and request handling in `public/app.js` send `POST /api/bookings` with the slot ID. `src/routes/labs.js` authenticates the request, validates the ID, calls `labService.bookSlot`, and maps the service result to an HTTP status and JSON response. The booking rule and seat-count update run transactionally in `src/services/labs.js`; it uses `src/data/lab-slots.js` to read/update slot capacity and `src/data/bookings.js` to create the booking. Those repositories execute the SQL against SQLite. The successful response contains the lab name and start time; `public/app.js` shows the confirmation and reloads availability into the slot list in the page.

On `/my-bookings`, `public/my-bookings.js` owns the rendered booking list and loading, empty, and error messages. It fetches `/api/my-bookings`; `src/routes/labs.js` passes the authenticated user ID to `labService.listMyBookings`, which reads through `src/data/bookings.js`. Its cancel button posts to `/api/bookings/:id/cancel`; the route calls `labService.cancelBooking`, which checks ownership and start time before the repositories update the booking and seat count. The browser reloads its list after success. The MCP entry point in `mcp-server/server.js` exposes the same behavior through `mcp-server/lab-booking-tools.js`; those tools resolve the caller's session and call `src/services/labs.js`, not SQL directly.

For managers, `src/app.js` checks the authenticated email against `LAB_MANAGER_EMAILS` before `POST /api/lab-slots` reaches `labService.createSlot`; capacity and future-time validation stay in `src/services/labs.js`, while `src/data/lab-slots.js` writes the row. Google sign-in and linking enter through the routes in `src/routes/auth.js`, use the state and account-linking rules in `src/services/google-auth.js`, and persist OAuth state and the Google subject through `src/data/oauth-states.js` and `src/data/users.js`. The availability summary button in `public/app.js` calls `/api/lab-slots/summary`; `src/services/availability-summary.js` passes only public slot data to `src/services/gemini-client.js` and validates returned IDs against current bookable slots before returning a summary.

One layering mismatch remains: `src/data/database.js` still creates the original users, sessions, labs, and lab-slot tables inline, while `migrations/001_bookings.sql` and `migrations/002_google_auth.sql` create booking and Google OAuth structures. I left the pre-existing schema in place to keep this slice focused on the new data-model changes rather than introduce migrations for unrelated existing tables.

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A student filters the availability list to a chosen date and lab, sees only matching slots, and each row shows its start time and free-seat count.
- [AC-2] A student reserves a free seat, sees the lab and time in their booking confirmation, and the slot's reserved-seat count increases by one in the database.
- [AC-3] Two students try to reserve the final seat; only one sees a confirmation, the other sees that no seats remain, and the slot's reserved-seat count does not exceed its capacity.
- [AC-4] A student tries to reserve the same slot twice, sees that they already have a booking, and only one active booking for that student and slot exists in `bookings`.
- [AC-5] A student cancels one of their future reservations, sees it disappear from upcoming bookings, and the slot has one more free seat.
- [AC-6] A lab manager submits a slot with capacity zero, sees a validation message, and no slot is added to `lab_slots`.
- [AC-7] A student opens their bookings page and sees only their own reservations; bookings belonging to other students are not returned.
- [AC-8] A student links Google sign-in to an existing account after verifying the same email, can then sign in either way, and still has one account record.

### Slice 1: sign-in and the lab availability list
- [AC-9] A visitor registers with an unused email and valid password; the sign-in form is replaced by the lab availability list on the same page, and the database stores a salted password hash instead of the password.
- [AC-10] A registered student signs in with their correct credentials; the sign-in form is replaced by the lab availability list on the same page, and they can open their own bookings page.
- [AC-11] A registered student enters a wrong password, sees a sign-in error, and remains unauthenticated on the sign-in page.

### Slice 2: reserve and cancel a lab slot
- [AC-12] A signed-in student reserves a future lab slot with an available seat, sees a confirmation naming the lab and start time, and the database records one active booking and increments the slot's reserved-seat count by one.
- [AC-13] A student trying to reserve a full slot is refused with 409; no booking is added and the reserved-seat count does not exceed capacity.
- [AC-14] A student trying to reserve the same slot twice is refused with 409; only one active booking for that student and slot remains in `bookings`.
- [AC-15] A student trying to reserve a slot that does not exist is refused with 404; no booking is added and no seat count changes.
- [AC-16] A student trying to reserve a slot that has already started is refused with 422; no booking is added and no seat count changes.
- [AC-17] A signed-in student trying to cancel another student's booking is refused with 403, and a signed-out request is refused with 401; the booking remains active and the reserved-seat count is unchanged.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `test/slice-2.test.js`: AC-1 a student filters availability by lab and date |
| AC-2 | `test/slice-2.test.js`: AC-2 and AC-12 a student books a free seat and sees the lab and start time |
| AC-3 | `test/slice-2.test.js`: AC-3 and AC-13 two students try to reserve the final seat |
| AC-4 | `test/slice-2.test.js`: AC-4 and AC-14 a student tries to reserve the same slot twice |
| AC-5 | `test/slice-2.test.js`: AC-5 a student cancels one of their future reservations |
| AC-6 | `test/manager-slots.test.js`: AC-6 a manager submitting zero capacity receives validation and creates no slot; a student cannot create a manager lab slot |
| AC-7 | `test/slice-2.test.js`: AC-7 a student sees only their own reservations |
| AC-8 | `test/google-auth.test.js`: AC-8 a student links verified Google sign-in and can sign in either way with one account; Google HTTP link callback and sign-in reuse the existing account |
| AC-9 | `test/slice-1.test.js`: AC-9 registration stores a salted password hash and opens availability |
| AC-10 | `test/slice-1.test.js`: AC-10 a registered student signs in and can open their bookings page |
| AC-11 | `test/slice-1.test.js`: AC-11 a wrong password does not create an authenticated session |
| AC-12 | `test/slice-2.test.js`: AC-2 and AC-12 a student books a free seat and sees the lab and start time |
| AC-13 | `test/slice-2.test.js`: AC-3 and AC-13 two students try to reserve the final seat; `test/lab-service.test.js`: AC-13 service refuses a full slot without writing another booking |
| AC-14 | `test/slice-2.test.js`: AC-4 and AC-14 a student tries to reserve the same slot twice |
| AC-15 | `test/slice-2.test.js`: AC-15 booking a slot that does not exist leaves the database unchanged |
| AC-16 | `test/slice-2.test.js`: AC-16 booking a slot that has already started leaves the database unchanged |
| AC-17 | `test/slice-2.test.js`: AC-17 another student receives 403 and a signed-out request receives 401 without changing the booking; `test/lab-service.test.js`: AC-17 service refuses to cancel another student booking without changing either record |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- AC-9 passed: registration creates a salted bcrypt hash, issues a session, and the UI replaces the sign-in form with the seeded availability list.
- AC-10 passed: valid credentials issue a session, expose the availability list, and allow the signed-in student to open the bookings page. The API returns 401 without a session.
- AC-11 passed: an incorrect password returns the sign-in error, leaves the UI on the sign-in form, and creates no session.
- Check adjustment: “lands on” sounded like a page navigation, but the implementation changes views in place on `/`; AC-9 and AC-10 now describe the observed behavior precisely.
- AC-12 through AC-17 are implemented with a numbered bookings migration, transactional service rules, authenticated HTTP routes, and reservation/cancellation controls in the browser.
- Booking refusals preserve the database state: full and duplicate reservations return 409, missing slots return 404, started slots return 422, and unauthorized cancellation returns 403 (401 when signed out).
- The bookings screen now loads the student's upcoming active reservations, provides an empty state and readable request errors, and removes a cancelled reservation from the upcoming list.
- The four listed booking MCP tools are implemented through the shared lab service; authenticated tools use the `MCP_TOKEN` session identity and enforce the HTTP ownership rules.
- AC-6 passed: only allowlisted manager emails can create lab slots; capacity zero returns a validation error and inserts no slot.
- AC-8 passed with a fake Google client: an existing student can link a verified matching Google account, then authenticate with either credential while retaining one database user. Unverified or mismatched email is refused; automatic account merging is not allowed.
- The availability summary is called from a server-side Gemini client with a timeout. It sends only lab/slot availability fields, validates returned IDs against current bookable slots, and falls back to the regular database-backed list when unavailable or invalid. Tests use a fake model client.
- Google OAuth requires configured client credentials and an authorized redirect URI. Live provider sign-in and Gemini calls were not exercised in tests.
