import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { getDevStore, getStudents, isDevMode } from '@/lib/storage';
import { hybridSync } from '@/lib/hybridSync';
import { getSchoolYearBounds, getSchoolYearForDate } from '@/lib/schoolYear';
import type { Payment, Student } from '@/lib/types';

type PaymentMethod = Payment['paymentMethod'];
type StudentWithPaymentMethod = Student & { paymentMethod?: PaymentMethod };

const GENERATED_ATTRIBUTE = 'data-payment-method-generated';
const STUDENT_ATTRIBUTE = 'data-payment-method-student';
const STYLE_ID = 'student-payment-method-styles';

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'inactive', label: 'לא הוגדר' },
  { value: 'bank', label: 'העברה בנקאית' },
  { value: 'check', label: 'צ׳ק' },
  { value: 'cash', label: 'מזומן' },
];

const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const normalizePhone = (value: string | null | undefined) => (value || '').replace(/\D/g, '');

const getMutableStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();
  return (window as any).__musicSystemStorage || {};
};

const currentStudents = (): StudentWithPaymentMethod[] => {
  const store = getMutableStore();
  return Array.isArray(store.students) ? store.students : getStudents();
};

const paymentMonthKeysForSchoolYear = (schoolYear: number): string[] => {
  const { start } = getSchoolYearBounds(schoolYear);
  const baseYear = Number(start.slice(0, 4));
  return [
    `${baseYear}-09`, `${baseYear}-10`, `${baseYear}-11`, `${baseYear}-12`,
    `${baseYear + 1}-01`, `${baseYear + 1}-02`, `${baseYear + 1}-03`, `${baseYear + 1}-04`,
    `${baseYear + 1}-05`, `${baseYear + 1}-06`, `${baseYear + 1}-07`, `${baseYear + 1}-08`,
  ];
};

const getStudentMethod = (student: StudentWithPaymentMethod): PaymentMethod => {
  if (student.paymentMethod) return student.paymentMethod;
  const store = getMutableStore();
  const payments: Payment[] = Array.isArray(store.payments) ? store.payments : [];
  const currentYear = getSchoolYearForDate();
  const { start, end } = getSchoolYearBounds(currentYear);
  const startMonth = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  return payments.find(payment =>
    payment.studentId === student.id && payment.month >= startMonth && payment.month <= endMonth,
  )?.paymentMethod || 'inactive';
};

const savePaymentMethod = async (studentId: string, method: PaymentMethod): Promise<void> => {
  const store = getMutableStore();
  const students: StudentWithPaymentMethod[] = Array.isArray(store.students) ? [...store.students] : [];
  const studentIndex = students.findIndex(student => student.id === studentId);
  if (studentIndex < 0) return;

  const now = new Date().toISOString();
  const student = students[studentIndex];
  students[studentIndex] = { ...student, paymentMethod: method, lastModified: now };
  store.students = students;

  // Per-lesson payments have their own ledger. The profile preference is still
  // saved, but we do not create annual monthly rows for that payment track.
  if (!student.paymentType || student.paymentType === 'annual') {
    const payments: Payment[] = Array.isArray(store.payments) ? [...store.payments] : [];
    paymentMonthKeysForSchoolYear(getSchoolYearForDate()).forEach(monthKey => {
      const index = payments.findIndex(payment => payment.studentId === studentId && payment.month === monthKey);
      if (index >= 0) {
        // Preserve real financial history/status/amount. Only the method changes.
        payments[index] = { ...payments[index], paymentMethod: method, lastModified: now };
      } else {
        payments.push({
          id: `${studentId}-${monthKey}`,
          studentId,
          month: monthKey,
          amount: 0,
          status: 'not_paid',
          paymentMethod: method,
          lastModified: now,
        });
      }
    });
    store.payments = payments;
  }

  const result = await hybridSync.onDataChange();
  window.dispatchEvent(new CustomEvent('student-payment-method-changed', { detail: { studentId } }));

  if (isDevMode()) {
    toast({ description: '🧪 אמצעי התשלום נשמר במצב הבדיקה בלבד' });
  } else if (result.success) {
    toast({ description: method === 'inactive' ? 'אמצעי התשלום הוסר' : '✅ אמצעי התשלום נשמר' });
  } else {
    toast({
      title: 'שמירת אמצעי התשלום לא הושלמה',
      description: result.message || 'השינוי נשמר מקומית אך נדרש אימות סנכרון.',
      variant: 'destructive',
    });
  }
};

const createControl = (student: StudentWithPaymentMethod): HTMLDivElement => {
  const wrapper = document.createElement('div');
  wrapper.setAttribute(GENERATED_ATTRIBUTE, 'true');
  wrapper.setAttribute(STUDENT_ATTRIBUTE, student.id);
  wrapper.className = 'student-payment-method-control';

  const label = document.createElement('label');
  label.textContent = '💳 אמצעי תשלום';
  label.className = 'student-payment-method-label';

  const select = document.createElement('select');
  select.className = 'student-payment-method-select';
  select.setAttribute('aria-label', `אמצעי תשלום עבור ${student.firstName} ${student.lastName}`);
  METHODS.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  select.value = getStudentMethod(student);
  select.addEventListener('click', event => event.stopPropagation());
  select.addEventListener('change', event => {
    event.stopPropagation();
    const method = (event.currentTarget as HTMLSelectElement).value as PaymentMethod;
    void savePaymentMethod(student.id, method);
  });

  wrapper.append(label, select);
  return wrapper;
};

const findStudentForCard = (card: HTMLElement): StudentWithPaymentMethod | undefined => {
  const code = card.textContent?.match(/קוד:\s*(\d{4})/)?.[1];
  const heading = normalize(card.querySelector('h3')?.textContent);
  return currentStudents().find(student => {
    const fullName = normalize(`${student.firstName} ${student.lastName}`);
    return Boolean((code && student.personalCode === code) || (heading && fullName === heading));
  });
};

const decorateCards = () => {
  document.querySelectorAll<HTMLHeadingElement>('h3').forEach(heading => {
    const card = heading.closest<HTMLElement>('div.rounded-lg.border');
    if (!card || !card.textContent?.includes('קוד:')) return;
    const student = findStudentForCard(card);
    if (!student) return;

    const existing = card.querySelector<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`);
    if (existing) {
      const select = existing.querySelector<HTMLSelectElement>('select');
      if (select) select.value = getStudentMethod(student);
      return;
    }

    const details = Array.from(card.querySelectorAll<HTMLElement>('div')).find(element =>
      element.textContent?.includes('קוד:') && element.textContent?.includes(student.phone),
    );
    if (details) details.insertAdjacentElement('afterend', createControl(student));
  });
};

const findStudentForRow = (row: HTMLTableRowElement): StudentWithPaymentMethod | undefined => {
  const cells = row.querySelectorAll<HTMLTableCellElement>('td');
  if (cells.length < 3) return undefined;
  const firstName = normalize(cells[0]?.textContent);
  const lastName = normalize(cells[1]?.textContent);
  const phoneText = normalizePhone(cells[2]?.textContent);
  return currentStudents().find(student => {
    const sameName = normalize(student.firstName) === firstName && normalize(student.lastName) === lastName;
    const phone = normalizePhone(student.phone);
    return sameName && (!phone || phoneText.includes(phone));
  });
};

const decorateRows = () => {
  document.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
    const student = findStudentForRow(row);
    if (!student) return;
    const cells = row.querySelectorAll<HTMLTableCellElement>('td');
    const contactCell = cells[2];
    if (!contactCell) return;

    const existing = contactCell.querySelector<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`);
    if (existing) {
      const select = existing.querySelector<HTMLSelectElement>('select');
      if (select) select.value = getStudentMethod(student);
      return;
    }
    contactCell.appendChild(createControl(student));
  });
};

const StudentPaymentMethodDecorator = () => {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .student-payment-method-control {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 8px;
          padding: 8px 10px;
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          background: hsl(var(--background) / .72);
          direction: rtl;
        }
        .student-payment-method-label {
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          color: hsl(var(--foreground));
        }
        .student-payment-method-select {
          min-width: 128px;
          max-width: 180px;
          border: 1px solid hsl(var(--border));
          border-radius: 6px;
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          padding: 5px 7px;
          font-size: 12px;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);
    }

    let scheduled = false;
    const decorate = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        decorateCards();
        decorateRows();
      });
    };

    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('student-payment-method-changed', decorate);
    window.addEventListener('student-active-status-changed', decorate);
    window.addEventListener('toby:storage-imported', decorate);
    decorate();

    return () => {
      observer.disconnect();
      window.removeEventListener('student-payment-method-changed', decorate);
      window.removeEventListener('student-active-status-changed', decorate);
      window.removeEventListener('toby:storage-imported', decorate);
      document.querySelectorAll(`[${GENERATED_ATTRIBUTE}]`).forEach(element => element.remove());
    };
  }, []);

  return null;
};

export default StudentPaymentMethodDecorator;
