import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const student=read("src/components/student/StudentFiles.tsx");
const editor=read("src/components/student/DocumentEditor.tsx");
const pdf=read("src/components/student/PdfAnnotationEditor.tsx");
const library=read("src/components/admin/TeacherFileLibrary.tsx");
const types=read("src/lib/types.ts");
const lock=JSON.parse(read("package-lock.json"));

test("files default to date descending with name, topic and type sorting",()=>{
 assert.match(student,/useState<FileSort>\("date"\)/);
 for(const sort of ['date','name','topic','type'])assert.ok(student.includes('value="'+sort+'"'));
 assert.match(student,/localeCompare\(a\.uploadDate/);
 assert.match(student,/חיפוש לפי שם/);
});

test("open action offers editor, device and actual Blob download",()=>{
 for(const label of ["פתיחה בעורך לעריכה","פתיחה במכשיר","הורדה"])assert.ok(student.includes(label));
 assert.match(student,/createObjectURL\(blob\)/);
 assert.match(student,/!kind \|\|/); // Unsupported audio/links never create an empty editor.
});

test("editor exports a single A4 PDF and accepts white ink",()=>{
 assert.match(editor,/595\.28/);
 assert.match(editor,/841\.89/);
 assert.match(editor,/canvasToPdfBlob/);
 assert.ok(!student.includes("upPng"));
 assert.match(student,/const pdfFile = new File/);
 assert.match(editor,/setInkColor\("#ffffff"\)/);
 assert.match(pdf,/setColor\("#ffffff"\)/);
});

test("multi-page PDF import is local, retains all source pages and flattens annotated copy",()=>{
 assert.match(pdf,/pdfjs-dist/);
 assert.match(pdf,/pdf\.worker\.min\.mjs\?url/);
 assert.match(pdf,/isEvalSupported:false/);
 assert.match(pdf,/new Uint8Array\(await props\.blob\.arrayBuffer\(\)\)/);
 assert.match(pdf,/n<=document\.numPages/);
 assert.match(pdf,/output\.addPage\("a4"/);
 assert.match(pdf,/ctx\.drawImage\(overlay,0,0\)/);
 assert.match(pdf,/output\.output\("blob"\)/);
 assert.ok(lock.packages["node_modules/pdfjs-dist"]);
});

test("branded A4 templates include ordinary and piano staves",()=>{
 assert.match(editor,/template==="piano"/);
 assert.match(editor,/template==="staff"/);
 assert.match(editor,/#C9A961/);
 assert.match(editor,/#6B1F2A/);
 assert.match(student,/תווים לפסנתר/);
 assert.match(student,/תווים רגיל/);
});

test("teacher files share one attachment and verify new assignment",()=>{
 assert.match(library,/getTeacherFileMasters\(\)/);
 assert.match(library,/sourceFileId/);
 assert.match(library,/downloadCanonicalDropboxLatest/);
 assert.match(library,/makeSightReadingPdf/);
 assert.match(types,/parentFileId\?: string/);
 assert.match(types,/tags\?: string\[\]/);
 assert.ok(!student.includes("workerApi.deleteAttachment("));
 const storage=read("src/lib/storage.ts");
 assert.match(storage,/export const getTeacherFileMasters/);
 assert.match(storage,/trackTeacherFileMaster\(existingFile\)/);
});

test("audio can be recorded or uploaded and linked to a file",()=>{
 assert.match(student,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(student,/new MediaRecorder/);
 assert.match(student,/parentFileId:associated/);
 assert.match(student,/attachAudioFromDevice/);
});


test("student identity never uses the teacher manager credential to write Dropbox",()=>{
 const text=read("src/components/student/StudentFiles.tsx");
 assert.match(text,/cloudWriteAuthorized = isTeacher && Boolean\(getManagerCode\(\)\)/);
 assert.match(text,/if \(!cloudWriteAuthorized\)/);
 assert.match(text,/downloadLocal\(pdfFile, pdfFile.name\)/);
 assert.match(text,/downloadLocal\(file, file.name\)/);
 assert.match(text,/שמירת קבצים בענן לתלמידות אינה זמינה עדיין/);
 assert.match(text,/הסרת שיוך בענן אינה זמינה ללא הרשאה מאובטחת/);
});


test("student personal files only expose download; teacher receives the editor",()=>{
  const dashboard=read("src/pages/StudentDashboard.tsx");
  const downloads=read("src/components/student/StudentFileDownloads.tsx");
  const teacher=read("src/components/admin/TeacherFileLibrary.tsx");
  assert.match(dashboard,/import StudentFileDownloads/);
  assert.match(dashboard,/<StudentFileDownloads studentId=\{student\.id\}/);
  assert.doesNotMatch(dashboard,/<StudentFiles studentId=/);
  assert.match(downloads,/getCurrentUser\(\)/);
  assert.match(downloads,/currentUser\.studentId === studentId/);
  assert.match(downloads,/file\.studentId === studentId/);
  assert.match(downloads,/downloadFile\(file\)/);
  assert.doesNotMatch(downloads,/from [\"']\.\/DocumentEditor/);
  assert.doesNotMatch(downloads,/workerApi/);
  assert.doesNotMatch(downloads,/\baddFile\s*\(/);
  assert.doesNotMatch(downloads,/\bdeleteFile\s*\(/);
  assert.doesNotMatch(downloads,/MediaRecorder|<DocumentEditor|<PdfAnnotationEditor/);
  assert.match(teacher,/import StudentFiles from/);
  assert.match(teacher,/<StudentFiles key=\{editingStudentId\} studentId=\{editingStudentId\}/);
  assert.match(teacher,/בחרי תלמידה לניהול קבצים/);
});

test("teacher has independent full-library metadata search and student workspace",()=>{
  const teacher=read("src/components/admin/TeacherFileLibrary.tsx");
  for(const field of ["filterStudentId","filterType","filterTag","dateFrom","dateTo","row.file.subject","row.file.tags","row.file.uploadDate"])
    assert.ok(teacher.includes(field), "Missing teacher metadata filter: "+field);
  assert.match(teacher,/getTeacherFileMasters\(\)/);
  assert.match(teacher,/setEditingStudentId\(file.studentId\)/);
  assert.match(read("src/components/student/StudentFiles.tsx"),/if \(!isTeacher\) \{/);
});
