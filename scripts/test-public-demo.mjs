import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/demo/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'Demo must be standalone and have exactly one inline script.');
const script = scripts[0][1];
assert.doesNotThrow(() => new vm.Script(script), 'Demo JavaScript syntax');
assert.match(html, /connect-src 'none'/, 'Browser Content Security Policy prevents API calls.');
assert.doesNotMatch(script.replace(/^\s*\/\/.*$/gm, ''), /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|workerApi|hybridSync|Dropbox|Gmail/);
assert.match(html, /נתוני הדגמה|נתוני דמה/);
assert.match(html, /id="resetDemo"/);
assert.equal((script.match(/\['[\u0590-\u05FF]+','[\u0590-\u05FF]+'\]/g) || []).length, 10, 'Exactly ten fictional students');

const elements = new Map();
const docHandlers = {};
const el = id => {
  if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', addEventListener(name, fn) { this[name] = fn; } });
  return elements.get(id);
};
const document = {
  addEventListener(name, fn) { docHandlers[name] = fn; },
  getElementById: el,
};
vm.runInNewContext(script, { document, Date, Intl }, { timeout: 3000 });
assert.match(el('demoContent').innerHTML, /תלמידות רשומות/);
assert.match(el('demoContent').innerHTML, />10</);
assert.match(el('demoNav').innerHTML, /ניהול|תלמידות/);
const click = (action, id) => docHandlers.click({target:{closest:()=>({getAttribute: name => name === 'data-action' ? action : id})}});
click('tab', 'students');
assert.match(el('demoContent').innerHTML, /שרה כהן/);
click('selectStudent', 'demo-student-04');
assert.match(el('demoContent').innerHTML, /אסתר פרידמן/);
click('tab', 'lessons');
click('cycleLesson', 'upcoming-0');
assert.match(el('demoContent').innerHTML, /סטטוס השיעור עודכן/);
click('tab', 'payments');
assert.match(el('demoContent').innerHTML, /תשלומים ממתינים/);
click('togglePayment', 'payment-0-2');
assert.match(el('demoContent').innerHTML, /מצב התשלום עודכן/);
click('tab', 'personal');
click('addPractice', 'demo-student-01');
assert.match(el('demoContent').innerHTML, /נרשמו 15 דקות אימון/);
el('resetDemo').click();
assert.match(el('demoContent').innerHTML, /אופסה בהצלחה/);
assert.match(el('demoContent').innerHTML, />10</);
console.log('Verified public demo: 10 fictional records, CSP/no APIs, navigation, student selection, lessons, payments, practice, reset.');
