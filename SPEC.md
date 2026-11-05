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

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- AC-9 passed: registration creates a salted bcrypt hash, issues a session, and the UI replaces the sign-in form with the seeded availability list.
- AC-10 passed: valid credentials issue a session, expose the availability list, and allow the signed-in student to open the bookings page. The API returns 401 without a session.
- AC-11 passed: an incorrect password returns the sign-in error, leaves the UI on the sign-in form, and creates no session.
- Check adjustment: “lands on” sounded like a page navigation, but the implementation changes views in place on `/`; AC-9 and AC-10 now describe the observed behavior precisely.
- The bookings page is an authenticated empty state in this slice. Booking, cancellation, Google sign-in, and manager slot creation are not implemented yet.
