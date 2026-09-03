import fs from 'node:fs';

function replaceOrVerify(path, oldText, newText, verification) {
  let source = fs.readFileSync(path, 'utf8');
  if (source.includes(oldText)) {
    source = source.replaceAll(oldText, newText);
    fs.writeFileSync(path, source);
    return;
  }
  if (!source.includes(verification)) throw new Error(`patch marker not found in ${path}`);
}

const studentsPath = 'src/components/admin/StudentsManagement.tsx';
replaceOrVerify(
  studentsPath,
  'const formSchoolYear = getSchoolYearForDate(studentForm.startDate || new Date());',
  "const formSchoolYear = editingStudent ? getSchoolYearForDate() : getSchoolYearForDate(studentForm.startDate || new Date());",
  'const formSchoolYear = editingStudent ? getSchoolYearForDate()',
);
replaceOrVerify(
  studentsPath,
  'const schoolYear = getSchoolYearForDate(studentForm.startDate || new Date());',
  "const schoolYear = editingStudent ? getSchoolYearForDate() : getSchoolYearForDate(studentForm.startDate || new Date());",
  'const schoolYear = editingStudent ? getSchoolYearForDate()',
);
replaceOrVerify(
  studentsPath,
  '<Label htmlFor="startDate">תאריך התחלה</Label>',
  '<Label htmlFor="startDate">תאריך הצטרפות</Label>',
  '<Label htmlFor="startDate">תאריך הצטרפות</Label>',
);

const mailingPath = 'src/components/admin/StudentMailingTab.tsx';
const copyReplacements = [
  ['קוראת את התלמידות הפעילות מ-Airtable ומסנכרנת ל-Brevo 2…', 'קוראת את התלמידות הפעילות מ-DB הקנוני ומסנכרנת ל-Brevo 2…'],
  ['הפעולה נעצרה כדי שלא תישלח תפוצה לרשימה לא מעודכנת.', 'הפעולה נעצרה כדי שלא תישלח הודעת תלמידות לרשימה לא מעודכנת.'],
  ['מסנכרנת קודם את Airtable לרשימת התלמידות ב-Brevo 2…', 'מסנכרנת קודם את רשימת התלמידות הפעילות ל-Brevo 2…'],
  ['הרשימה תסונכרן שוב מ-Airtable לפני השליחה.', 'הרשימה תסונכרן שוב ממקור נתוני התלמידות לפני השליחה.'],
  ['מסנכרנת שוב את Airtable לפני השליחה הסופית…', 'מסנכרנת שוב את התלמידות הפעילות לפני השליחה הסופית…'],
  ['<span>שליחה לתפוצת תלמידות</span>', '<span>שליחה לתלמידות פעילות</span>'],
];
let mailing = fs.readFileSync(mailingPath, 'utf8');
for (const [oldText, newText] of copyReplacements) mailing = mailing.replaceAll(oldText, newText);
if (/Airtable/.test(mailing)) throw new Error('StudentMailingTab still presents Airtable as the student audience source');
fs.writeFileSync(mailingPath, mailing);

console.log('current-year billing and student-mailing UI guards ready');
