<div dir="rtl">

# DECISIONS

> מלאו את הקובץ הזה. הוא חלק מההערכה — קצר וברור עדיף על ארוך.

## 1. החלטות ארכיטקטוניות
- ה-Controller ממפה HTTP בלבד. כללי החופשה (מכסה, סטטוס, חישוב ימים) יושבים ב-`LeaveRequestService`, והגישה ל-DB ב-repositories. השירות זורק `LeaveRequestException` עם קוד עסקי (`NOT_FOUND` / `CONFLICT` / `BAD_REQUEST`), וה-Controller מתרגם אותו ל-404 / 409 / 400. כך הסטטוסים לא דולפים ללוגיקה, בלי שכבת DTO או מחלקות חריגה נפרדות לכל מקרה.
- `GET /api/employees` נשאר קריאה ישירה ל-repository. אין שם כלל עסקי, ו-service ריק היה רק עוד קובץ.
- טופס הבקשה ב-Angular בודק לפני שליחה, בלי שכבת ולידציה נוספת: סוג חופשה ועובד חובה, תאריך התחלה לא אחרי תאריך סיום, לא בעבר, ומספר ימי העבודה אינו שלילי. יום עבודה הוא ראשון עד חמישי; שישי ושבת לא נספרים. אותו חישוב ב-`LeaveRequestService`, והימים לא נשלחים מהטופס. ההודעה מופיעה ליד השדה אחרי נגיעה או ניסיון שליחה. בקשות שכבר נשמרו שומרות את מספר הימים שנשמר בהן.
- אישור בקשה מעדכן רק את השורה מהתשובה של `POST .../approve`. בזמן הקריאה הכפתור של אותה שורה מראה "Approving…". הצלחה משנה את הסטטוס ל-Approved וכותבת "Request approved." ליד השורה. שגיאה (למשל 409 כי הבקשה כבר הוכרעה) נשארת ליד השורה, והרשימה לא נטענת מחדש.
- ב-Angular, `LeaveApiService` מחזיק את קריאות ה-HTTP. הקומפוננטה מחזיקה רק את מצב המסך (טופס, טעינה, הודעות). `LeaveType` ו-`LeaveStatus` הם enums מספריים כמו ב-API, בלי `any`. כל ה-subscriptions נעצרים ב-`takeUntilDestroyed`, ורענון הרשימה עובר ב-`switchMap` כדי שתשובה ישנה לא תדרוס תשובה חדשה.

## 2. הבאג ביתרת החופשה
- מה היה הבאג, איפה, ואיך תיקנתי: ביצירת בקשה הימים שכבר אושרו (`used`) חושבו ולא שימשו בתנאי. הבדיקה השוותה רק את ימי הבקשה החדשה למכסה המלאה, כך שעובד עם 18 מתוך 20 ימים עדיין יכול להגיש בקשת חופשה של 3 ימים. התיקון, עכשיו ב-`LeaveRequestService.create`, דוחה בקשת `VACATION` כאשר `used + days` גדול מ-`annualQuota` ומחזיר 400.
- הטסט שמוכיח את התיקון: `LeaveRequestsTests.create_ExceedingRemainingBalance_IsRejected`.

## 3. אישור בקשה (approve) ו‑concurrency
- איך טיפלתי במצבים לא חוקיים (כבר אושר / לא קיים): `POST /api/leave-requests/{id}/approve`. בקשה שלא קיימת מחזירה 404. בקשה שסטטוס שלה אינו `PENDING` (כבר אושרה או נדחתה) מחזירה 409 והסטטוס לא משתנה. אישור חופשה שביחד עם הימים שכבר אושרו חורג מהמכסה מחזיר 400 והבקשה נשארת `PENDING`.
- מה לגבי אישור של שתי בקשות במקביל: שתי בקשות `PENDING` יכולות כל אחת בנפרד להיכנס למכסה, ויחד לחרוג ממנה. בלי נעילה שני האישורים קוראים את אותו `used` לפני שמישהו עושה commit, ושניהם עוברים. `LeaveRequestService.approve` רץ בטרנזקציה אחת ונועל קודם את שורת הבקשה (`SELECT … FOR UPDATE`) ואחר כך את שורת העובד. האישור השני מחכה ל-commit, ואז רואה את הימים שכבר אושרו. אותו סדר נעילות מונע deadlock, ותופס גם אישור כפול של אותה בקשה. ימי `PENDING` לא נספרים ביצירת בקשה; המכסה נאכפת באישור, ושם הנעילה באמת נדרשת.

## 4. על מה ויתרתי בגלל הזמן
- אין הזדהות ואין תפקידים. כל מי שמגיע למסך יכול להגיש ולאשר עבור כל עובד. במערכת כזו עובד מגיש רק עבור עצמו, ומנהל או HR מאשר ודוחה. חסרה גם היסטוריה: מי החליט ומתי.
- המסך לא מראה כמה ימי חופשה נשארו לפני השליחה. היתרה נאכפת בשרת רק אחרי POST.
- `DECLINE`: דחיית בקשה `PENDING` ל-`REJECTED`, עם אותם 404 / 409 כמו באישור. דחייה לא מחזירה ימים למכסה כי ימים נספרים רק אחרי אישור.
- עריכת בקשה רק כל עוד היא `PENDING`, ורק למשתמש מורשה (המגיש או מנהל). בקשה שכבר אושרה לא נפתחת לעריכה, כדי לא לעקוף את נעילת המכסה.
- סימון כמה בקשות ומחיקה. מוחקים רק `PENDING`. מחיקת בקשה מאושרת הייתה משנה את היתרה בלי מסך החלטה.
- ה-frontend לא ב-`docker compose`. `docker compose up` מרים היום רק Postgres וה-API. עם עוד זמן הייתי מוסיף שירות ל-Angular, כדי שכל המערכת תעלה בפקודה אחת.
- עם עוד יום: קודם הזדהות ותפקידים, יתרה במסך, וכפתור `DECLINE`. אחר כך עריכה למשתמש מורשה, מחיקה מרובה של `PENDING`, והוספת ה-frontend ל-compose.

## 5. שימוש ב‑AI
השתמשתי ב-Cursor. נתתי לו את ההקשר, את הקבצים, ואת גבול השינוי — ואז בדקתי את הדיף ואת הטסטים לפני שנשאר בקוד.

### איפה AI עזר (כולל prompts)
1. prompt: "In `LeaveRequestService.create`, approved `VACATION` days are computed and then ignored. An employee with 18 approved days out of `annualQuota` 20 can still submit a 3-day vacation. Reject when `used + requestedDays` exceeds the quota, return 400, and do not persist the row. Apply this only to `VACATION`. Add a Testcontainers test in `LeaveRequestsTests` that proves the request is rejected and the row count does not change." → התיקון נשאר ב-`create`, והטסט הוא `create_ExceedingRemainingBalance_IsRejected`.
2. prompt: "Add `POST /api/leave-requests/{id}/approve`. Missing request → 404. Status other than `PENDING` → 409 and do not change the row. A vacation that would exceed the quota together with already approved days → 400 and stay `PENDING`. Two pending requests for the same employee can both pass a quota check if they run concurrently. Handle that in one transaction: lock the request row with `SELECT … FOR UPDATE`, then the employee row, always in that order. Do not use `synchronized` or a table lock. Add a test where two approvals run together and only one succeeds." → זה המימוש ב-`approve`, כולל סדר הנעילות והטסט המקבילי.
3. prompt: "`LeaveRequestsComponent` calls `HttpClient` directly, keeps screen state by hand, and types the list as `any`. Move HTTP to `LeaveApiService` (`list`, `employees`, `create`, `approve`). Replace `any` with `LeaveRequest`, `Employee`, and numeric `LeaveType` / `LeaveStatus` enums that match the API. Stop every subscription with `takeUntilDestroyed`. Reload the list through `switchMap` so an older response cannot overwrite a newer one. Do not add NgRx or another store. Form state, loading, and row messages stay in the component." → זה המבנה שנשאר בפרונט.

### איפה דחיתי/תיקנתי הצעה של AI
- Cursor הציע, אחרי העברת הלוגיקה מה-Controller, לפצל את זה ל-`EmployeeService`, שלוש מחלקות חריגה, `@ControllerAdvice`, ו-DTO נפרד לכל תשובה. זה ריק כאן: `GET /api/employees` הוא `findAll` בלי כלל, והסטטוס כבר נקבע במקום אחד. הוריתי לו להשאיר שירות אחד, `LeaveRequestException` עם קוד (`NOT_FOUND` / `CONFLICT` / `BAD_REQUEST`), וה-Controller רק מתרגם את הקוד ל-404 / 409 / 400. `GET /api/employees` נשאר על ה-repository.

### אבטחה
- `GET /api/leave-requests/search` בנה SQL על ידי שרשור `name` (`LIKE '%" + name + "%'`). קלט כמו `' OR 1=1 --` יכול היה לקרוא או לשנות נתונים. החיפוש עכשיו JPQL עם פרמטר `:name` ב-`LeaveRequestRepository.findByEmployeeNameContaining` (שורה 21). ערך הפרמטר לא נכנס לטקסט השאילתה.

## 6. הוראות הרצה
- (אם שיניתם משהו מהוראות ה‑README המקורי)

</div>
