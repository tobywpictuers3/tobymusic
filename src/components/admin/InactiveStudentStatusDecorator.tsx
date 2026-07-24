import { useEffect } from "react";

type StudentStatusRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  leftDate?: string;
  leftReason?: string;
};

const STYLE_ID = "inactive-student-status-styles";
const DECORATED_ATTRIBUTE = "data-inactive-student-id";
const GENERATED_ATTRIBUTE = "data-inactive-status-generated";

const normalizeText = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const formatLeftDate = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL").format(date);
};

const getInactiveStudents = (): StudentStatusRecord[] => {
  const storage = (window as any).__musicSystemStorage;
  const students = storage?.students;

  if (!Array.isArray(students)) return [];

  return students.filter(
    (student: StudentStatusRecord) =>
      student &&
      typeof student.id === "string" &&
      student.isActive === false
  );
};

const createBadge = (): HTMLSpanElement => {
  const badge = document.createElement("span");
  badge.className = "inactive-student-badge";
  badge.setAttribute(GENERATED_ATTRIBUTE, "badge");
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-label", "תלמידה לא פעילה");
  badge.textContent = "⛔ לא פעילה";
  return badge;
};

const createInfo = (student: StudentStatusRecord): HTMLDivElement => {
  const info = document.createElement("div");
  info.className = "inactive-student-info";
  info.setAttribute(GENERATED_ATTRIBUTE, "info");

  const status = document.createElement("div");
  status.className = "inactive-student-info-title";
  status.textContent = "סטטוס: לא פעילה";
  info.appendChild(status);

  if (student.leftDate) {
    const date = document.createElement("div");
    date.textContent = `תאריך סיום: ${formatLeftDate(student.leftDate)}`;
    info.appendChild(date);
  }

  if (student.leftReason) {
    const reason = document.createElement("div");
    reason.textContent = `סיבה: ${student.leftReason}`;
    info.appendChild(reason);
  }

  return info;
};

const clearDecoration = (element: HTMLElement): void => {
  element.removeAttribute(DECORATED_ATTRIBUTE);
  element.classList.remove(
    "inactive-student-card",
    "inactive-student-row",
    "inactive-student-dialog"
  );
  element
    .querySelectorAll<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`)
    .forEach((generated) => generated.remove());
  element
    .querySelectorAll<HTMLElement>(".inactive-student-name")
    .forEach((name) => name.classList.remove("inactive-student-name"));
};

const decorateCard = (student: StudentStatusRecord): void => {
  const fullName = normalizeText(`${student.firstName || ""} ${student.lastName || ""}`);
  if (!fullName) return;

  document.querySelectorAll<HTMLHeadingElement>("h3").forEach((heading) => {
    if (normalizeText(heading.textContent) !== fullName) return;

    const card = heading.closest<HTMLElement>("div.rounded-lg.border");
    if (!card || !card.textContent?.includes("קוד:")) return;

    if (card.getAttribute(DECORATED_ATTRIBUTE) === student.id) return;

    card.setAttribute(DECORATED_ATTRIBUTE, student.id);
    card.classList.add("inactive-student-card");
    heading.classList.add("inactive-student-name");

    const headingRow = heading.parentElement;
    if (headingRow && !headingRow.querySelector(`[${GENERATED_ATTRIBUTE}="badge"]`)) {
      headingRow.appendChild(createBadge());
    }

    const content = headingRow?.parentElement;
    if (content && !content.querySelector(`[${GENERATED_ATTRIBUTE}="info"]`)) {
      headingRow.insertAdjacentElement("afterend", createInfo(student));
    }
  });
};

const decorateTableRow = (student: StudentStatusRecord): void => {
  const firstName = normalizeText(student.firstName);
  const lastName = normalizeText(student.lastName);
  if (!firstName && !lastName) return;

  document.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
    const cells = row.querySelectorAll<HTMLTableCellElement>("td");
    if (cells.length < 2) return;

    const displayedFirstName = normalizeText(cells[0].childNodes[0]?.textContent || cells[0].textContent);
    const displayedLastName = normalizeText(cells[1].textContent);
    if (displayedFirstName !== firstName || displayedLastName !== lastName) return;

    if (row.getAttribute(DECORATED_ATTRIBUTE) === student.id) return;

    row.setAttribute(DECORATED_ATTRIBUTE, student.id);
    row.classList.add("inactive-student-row");
    cells[0].classList.add("inactive-student-name");
    cells[1].classList.add("inactive-student-name");

    if (!cells[0].querySelector(`[${GENERATED_ATTRIBUTE}="badge"]`)) {
      cells[0].appendChild(createBadge());
    }
  });
};

const decorateDialog = (student: StudentStatusRecord): void => {
  document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach((dialog) => {
    const firstNameInput = dialog.querySelector<HTMLInputElement>("#firstName");
    const lastNameInput = dialog.querySelector<HTMLInputElement>("#lastName");
    if (!firstNameInput || !lastNameInput) return;

    if (
      normalizeText(firstNameInput.value) !== normalizeText(student.firstName) ||
      normalizeText(lastNameInput.value) !== normalizeText(student.lastName)
    ) {
      return;
    }

    if (dialog.getAttribute(DECORATED_ATTRIBUTE) === student.id) return;

    dialog.setAttribute(DECORATED_ATTRIBUTE, student.id);
    dialog.classList.add("inactive-student-dialog");

    const title = dialog.querySelector<HTMLElement>("h2");
    if (title && !title.querySelector(`[${GENERATED_ATTRIBUTE}="badge"]`)) {
      title.appendChild(createBadge());
    }
  });
};

const applyInactiveStudentDecorations = (): void => {
  const inactiveStudents = getInactiveStudents();
  const inactiveIds = new Set(inactiveStudents.map((student) => student.id));

  document
    .querySelectorAll<HTMLElement>(`[${DECORATED_ATTRIBUTE}]`)
    .forEach((element) => {
      const studentId = element.getAttribute(DECORATED_ATTRIBUTE);
      if (!studentId || !inactiveIds.has(studentId)) clearDecoration(element);
    });

  inactiveStudents.forEach((student) => {
    decorateCard(student);
    decorateTableRow(student);
    decorateDialog(student);
  });
};

const InactiveStudentStatusDecorator = () => {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .inactive-student-card {
          position: relative !important;
          overflow: hidden !important;
          border: 2px solid hsl(var(--destructive) / 0.58) !important;
          background: hsl(var(--destructive) / 0.07) !important;
          opacity: 0.94;
          box-shadow: 0 5px 18px hsl(var(--destructive) / 0.10) !important;
        }
        .inactive-student-card::before {
          content: "";
          position: absolute;
          inset-block: 0;
          inset-inline-start: 0;
          width: 6px;
          background: hsl(var(--destructive));
        }
        .inactive-student-row {
          background: hsl(var(--destructive) / 0.07) !important;
          box-shadow: inset -5px 0 0 hsl(var(--destructive));
          color: hsl(var(--muted-foreground));
        }
        .inactive-student-dialog {
          border: 2px solid hsl(var(--destructive) / 0.55) !important;
        }
        .inactive-student-name {
          color: hsl(var(--muted-foreground)) !important;
          text-decoration-line: line-through;
          text-decoration-color: hsl(var(--destructive) / 0.75);
          text-decoration-thickness: 2px;
        }
        .inactive-student-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin-inline-start: 8px;
          padding: 3px 9px;
          border-radius: 999px;
          background: hsl(var(--destructive));
          color: hsl(var(--destructive-foreground));
          font-size: 12px;
          line-height: 1.35;
          font-weight: 800;
          white-space: nowrap;
          text-decoration: none !important;
          vertical-align: middle;
        }
        .inactive-student-info {
          margin-top: 8px;
          padding: 8px 10px;
          border: 1px solid hsl(var(--destructive) / 0.32);
          border-radius: 8px;
          background: hsl(var(--background) / 0.72);
          color: hsl(var(--foreground));
          font-size: 12px;
          line-height: 1.6;
        }
        .inactive-student-info-title {
          font-weight: 800;
          color: hsl(var(--destructive));
        }
        @media (max-width: 640px) {
          .inactive-student-badge {
            font-size: 11px;
            padding: 3px 7px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let scheduled = false;
    const scheduleDecoration = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applyInactiveStudentDecorations();
      });
    };

    const observer = new MutationObserver(scheduleDecoration);
    observer.observe(document.body, { childList: true, subtree: true });

    const intervalId = window.setInterval(scheduleDecoration, 800);
    scheduleDecoration();

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
};

export default InactiveStudentStatusDecorator;
