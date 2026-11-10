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
 assert.match(library,/getFiles\(\)/);
 assert.match(library,/sourceFileId/);
 assert.match(library,/downloadCanonicalDropboxLatest/);
 assert.match(library,/makeSightReadingPdf/);
 assert.match(types,/parentFileId\?: string/);
 assert.match(types,/tags\?: string\[\]/);
 assert.ok(!student.includes("workerApi.deleteAttachment("));
});

test("audio can be recorded or uploaded and linked to a file",()=>{
 assert.match(student,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(student,/new MediaRecorder/);
 assert.match(student,/parentFileId:associated/);
 assert.match(student,/attachAudioFromDevice/);
});
