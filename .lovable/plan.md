## למה השמירה כל כך איטית היום

מעקב הקוד ב-`src/lib/hybridSync.ts` ו-`src/components/ui/save-button.tsx` מראה שכל לחיצה על "שמור שינויים" (וגם כל `onDataChange` אוטומטי) עוברת רצף כבד מאוד:

1. `SaveButton.handleSave` קורא ל-`clearClientCaches()` **לפני** השמירה — מנקה caches גם כשלא צריך.
2. `onDataChange` שומר local + עושה `persistLocalSnapshot` (JSON.stringify של כל ה-DB ל-localStorage).
3. Debounce של 500ms.
4. `syncToWorker` עושה **download_latest מלא מדרופבוקס** (round-trip של כל ה-DB) → merge כבד (`mergeDataWithConflictResolution` עובר על כל המפתחות, מפענח JSON, ממזג רשומה-רשומה לפי id) → `JSON.stringify` נוסף רק כדי למדוד גודל → upload מלא.
5. אחרי ההעלאה: `updateInMemoryStorage(mergedData)` (re-init של כל ה-storage) → `persistLocalSnapshot` שוב → `recalculateAllMonthlyAchievements()` סינכרוני שעובר על כל התלמידות וכל הסשנים.
6. אם משתמש שמר עוד פעם תוך כדי — `pendingResync` מריץ **את כל הרצף הזה שוב מההתחלה** (download+merge+upload+recalc).

כלומר כל שמירה = download מלא + merge מלא + upload מלא + recalc מלא, וכל לחיצה נוספת מכפילה את זה. זה גם הסיבה שלפעמים נראה שהשמירה "תקועה".

## עקרון התיקון

לשמור על אותה אמינות סנכרון לדרופבוקס (שום שינוי באמינות, שום ויתור על merge נגד התנגשויות), אבל להוציא את העבודה הכבדה מהמסלול הקריטי. ה-merge מול הענן הכרחי רק כשבאמת הייתה כתיבה מקבילה ממכשיר אחר — לא בכל לחיצה.

## שינויים

### 1. `src/components/ui/save-button.tsx`
- להסיר את `await clearClientCaches()` מלפני `hybridSync.onDataChange()`. אין סיבה לנקות caches לפני שמירה; אם בכלל צריך — אפשר להשאיר את הקריאה אחרי הצלחה, או להסיר לגמרי (cache נקי קורה בלוגין/לוגאוט).

### 2. `src/lib/hybridSync.ts` — מסלול שמירה רגיל (`onDataChange` → `syncToWorker`)
- **להשמיט את `downloadLatest` בכל שמירה.** במקום זאת:
  - לבצע `directUpload` (upload בלבד) כברירת מחדל.
  - להריץ download+merge רק במצבים שבהם יש סיכוי ממשי להתנגשות: על init (כבר קורה ב-`loadDataOnInit`), ובאינטרוול רקע נמוך-תדירות (למשל כל 2–5 דקות, או כשחזרנו online אחרי ניתוק). ה-`mergeRecords` הקיים נשאר ללא שינוי כך שכשבאמת רצים merge — ההגנה על הודעות/סשנים נשמרת.
- **`persistLocalSnapshot` פעם אחת בלבד** לכל שמירה (כרגע נקרא גם ב-`onDataChange` וגם ב-`syncToWorker`/`directUpload`).
- **למחוק את ה-`JSON.stringify(mergedData).length` "למדידה"** — לבצע את בדיקת ה-"data too small" על מבנה (קיום מפתחות `musicSystem_*`) במקום stringify של כל ה-DB פעם נוספת.
- **`recalculateAllMonthlyAchievements` יוצא מהמסלול הקריטי**: לקרוא לו ב-`queueMicrotask` / `setTimeout(..., 0)` אחרי שהצלחנו, ולעטוף ב-debounce פנימי (פעם אחת לכל "שקט" של כמה שניות) כדי שלא ירוץ שוב ושוב בלחיצות רצופות.
- **`pendingResync` יהפוך ל-`directUpload` בלבד** במקום `syncToWorker` מלא — אם המשתמש לחץ שמור שוב בזמן שמירה קודמת, די להעלות שוב את הסטייט הנוכחי, בלי עוד download+merge.
- אחרי `directUpload` מוצלח: לא צריך `updateInMemoryStorage` (הסטייט בזיכרון כבר נכון, רק הענן עודכן).

### 3. סנכרון רקע חדש (קל)
- להוסיף `setInterval` שקט של ~3 דקות שמריץ `syncToWorker` המלא (download+merge+upload) **רק אם** יש סימן שיכול להיות שינוי מרוחק (למשל מאז ה-cloud sync האחרון עברה מספיק זמן ויש משתמשים מקבילים). זה משאיר את ההגנה מפני התנגשויות במקומה, בלי לשלם עליה בכל לחיצה.
- בנוסף, להריץ `syncToWorker` המלא ברגע שחוזרים online (כבר יש hook `online` — להחליף את הקריאה הנוכחית להריץ merge פעם אחת).

### 4. ללא שינוי (חשוב לציין)
- `mergeDataWithConflictResolution` ו-`mergeRecords` — נשארים בדיוק כמו שהם, כולל מפתחות ה-conflict על הודעות, סשנים, תשלומים וכו'. ההגנה מהבאג הקודם של הודעות שנעלמות נשמרת לחלוטין.
- `beforeunload` עם `sendBeacon` — נשאר.
- `loadDataOnInit` — נשאר, כולל ה-local snapshot fallback.
- `workerApi.ts` — לא נוגעים.
- `restoreData` / שיחזור גיבוי — לא נוגעים.

## תוצאה צפויה
- שמירה רגילה: HTTP אחד בלבד (upload), בלי download, בלי merge, בלי recalc סינכרוני. אמורה להרגיש מיידית (מאות מילישניות במקום שניות).
- אמינות מול דרופבוקס: זהה — כי merge ממשיך לרוץ ב-init, ב-online, ובאינטרוול רקע.
- שום שינוי ב-UI/UX, רק מהירות.
