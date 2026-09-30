# DECISIONS

> English copy of `DECISIONS.md`, for easier reading. The Hebrew file is the one to submit.

## 1. Architecture

- The controller only maps HTTP. Leave rules (quota, status, day count) live in `LeaveRequestService`. Database access stays in the repositories. The service throws `LeaveRequestException` with a business code (`NOT_FOUND` / `CONFLICT` / `BAD_REQUEST`), and the controller maps that to 404 / 409 / 400. Status codes do not leak into the business logic. There is no response-DTO layer and no separate exception class per case.
- `GET /api/employees` still calls the repository directly. There is no business rule there, and an empty service would have been just another file.
- The Angular form validates before submit, without an extra validation layer: leave type and employee are required, the start date is not after the end date and is not in the past, and the number of working days is not negative. A working day is Sunday through Thursday; Friday and Saturday are not counted. The same calculation runs in `LeaveRequestService`. Days are not sent from the form. The message appears next to the field after blur or a submit attempt. Requests already stored keep the day count that was saved on them.
- Approving a request updates only that row from the `POST .../approve` response. While the call is in flight, that row's button shows "Approving…". On success the status becomes Approved and the row shows "Request approved." An error (for example 409 because the request was already decided) stays on that row. The list is not reloaded.
- On the Angular side, `LeaveApiService` owns the HTTP calls. The component owns only screen state (form, loading, messages). `LeaveType` and `LeaveStatus` are numeric enums matching the API, with no `any`. Every subscription stops with `takeUntilDestroyed`. Reloading the list goes through `switchMap`, so an older response cannot overwrite a newer one.

## 2. The vacation-balance bug

- What it was, where, and the fix: when creating a request, already approved days (`used`) were calculated and then not used in the condition. The check compared only the new request's days to the full quota, so an employee with 18 of 20 days could still submit a 3-day vacation. The fix, now in `LeaveRequestService.create`, rejects a `VACATION` when `used + days` is greater than `annualQuota` and returns 400.
- The test that proves it: `LeaveRequestsTests.create_ExceedingRemainingBalance_IsRejected`.

## 3. Approve and concurrency

- Invalid cases: `POST /api/leave-requests/{id}/approve`. A missing request returns 404. A status other than `PENDING` (already approved or rejected) returns 409 and the status does not change. Approving a vacation that, together with days already approved, exceeds the quota returns 400 and the request stays `PENDING`.
- Two approvals at the same time: two `PENDING` requests can each fit the quota alone and exceed it together. Without a lock, both approvals read the same `used` before either commits, and both succeed. `LeaveRequestService.approve` runs in one transaction and locks the request row first (`SELECT … FOR UPDATE`), then the employee row. The second approval waits for the commit, then sees the days already approved. The same lock order avoids deadlock and also catches a double approve of the same request. `PENDING` days are not counted when creating a request; the quota is enforced on approve, which is where the lock is actually required.

## 4. What I left out for time

- There is no authentication and no roles. Anyone who opens the screen can submit and approve for any employee. In this kind of system an employee submits only for themselves, and a manager or HR approves and declines. A history of who decided, and when, is also missing.
- The screen does not show how many vacation days remain before submit. The balance is enforced on the server only after the POST.
- `DECLINE`: rejecting a `PENDING` request to `REJECTED`, with the same 404 / 409 behavior as approve. A decline does not return days to the quota, because days are counted only after approval.
- Editing a request only while it is `PENDING`, and only by an authorized user (the submitter or a manager). A request that is already approved does not open for edit, so the quota lock cannot be bypassed.
- Selecting several requests and deleting them. Delete only `PENDING` rows. Deleting an approved request would change the balance without a decision screen.
- The frontend is not in `docker compose`. `docker compose up` currently starts only Postgres and the API. With more time I would add an Angular service so the whole system comes up with one command.
- With another day: authentication and roles, the remaining balance on the screen, and a `DECLINE` button first. Then edit for an authorized user, bulk delete of `PENDING` requests, and adding the frontend to compose.

## 5. Use of AI

I used Cursor. I gave it the context, the files, and the boundary of the change, then checked the diff and the tests before keeping the result.

### Where AI helped (including prompts)

**1. Vacation balance**

```text
In LeaveRequestService.create, approved VACATION days are computed and then ignored.
An employee with 18 approved days out of annualQuota 20 can still submit a 3-day vacation.
Reject when used + requestedDays exceeds the quota, return 400, and do not persist the row.
Apply this only to VACATION.
Add a Testcontainers test in LeaveRequestsTests that proves the request is rejected
and the row count does not change.
```

Kept the fix in `create`. Test: `create_ExceedingRemainingBalance_IsRejected`.

**2. Approve**

```text
Add POST /api/leave-requests/{id}/approve.
Missing request: 404.
Status other than PENDING: 409, and do not change the row.
A vacation that would exceed the quota together with already approved days: 400, and stay PENDING.
Two pending requests for the same employee can both pass a quota check if they run concurrently.
Handle that in one transaction: lock the request row with SELECT ... FOR UPDATE,
then the employee row, always in that order.
Do not use synchronized or a table lock.
Add a test where two approvals run together and only one succeeds.
```

That is the `approve` implementation, including the lock order and the concurrent test.

**3. Frontend component**

```text
LeaveRequestsComponent calls HttpClient directly, keeps screen state by hand, and types the list as any.
Move HTTP to LeaveApiService: list, employees, create, approve.
Replace any with LeaveRequest, Employee, and numeric LeaveType / LeaveStatus enums that match the API.
Stop every subscription with takeUntilDestroyed.
Reload the list through switchMap so an older response cannot overwrite a newer one.
Do not add NgRx or another store.
Form state, loading, and row messages stay in the component.
```

That is the structure that stayed on the frontend. HTTP lives in `LeaveApiService`. Screen state stays in the component.

### Where I rejected or corrected an AI suggestion

- After the logic moved out of the controller, Cursor suggested splitting it into an `EmployeeService`, three exception classes, a `@ControllerAdvice`, and a separate DTO for every response. That is empty here: `GET /api/employees` is a `findAll` with no rule, and the status is already decided in one place. I told it to keep one service, `LeaveRequestException` with a code (`NOT_FOUND` / `CONFLICT` / `BAD_REQUEST`), and to let the controller only map that code to 404 / 409 / 400. `GET /api/employees` stays on the repository.

### Security

- `GET /api/leave-requests/search` built SQL by concatenating `name` (`LIKE '%" + name + "%'`). Input such as `' OR 1=1 --` could have read or changed data. Search is now JPQL with a `:name` parameter in `LeaveRequestRepository.findByEmployeeNameContaining` (line 21). The parameter value is not inserted into the query text.

## 6. How to run

- Run instructions in the original README were not changed.
