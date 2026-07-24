import { useEffect } from "react";
import { getStudents } from "@/lib/storage";
import { hybridSync } from "@/lib/hybridSync";
import { toast } from "@/hooks/use-toast";
import type { Student } from "@/lib/types";

const STYLE_ID = "student-active-overview-styles";
const STUDENT_ATTRIBUTE = "data-student-active-toggle";
const GENERATED_ATTRIBUTE = "data-inactive-overview-generated";

const normalize = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizePhone = (value: string | null | undefined): string =>
  (value || "").replace(/\D/g, "");

const currentStudents = (): Student[] => {
  const storage = (window as any).__musicSystemStorage;
  return Array.isArray(storage?.students) ? storage.students : getStudents();
};

const saveStudentState = (
  studentId: string,
  fields: Partial<Student>
): Student | undefined => {
  const storage = (window as any).__musicSystemStorage;
  const students = currentStudents();
  const current = students.find((student) => student.id === studentId);
  if (!current || !storage) return undefined;

  const updated: Student = {
    ...current,
    ...fields,
    lastModified: new Date().toISOString(),
  };

  // A new array reference is essential: it prevents the state from disappearing
  // when another card/view is opened and makes the change persist through sync.
  storage.students = students.map((student) =>
    student.id === studentId ? updated : student
  );
  hybridSync.onDataChange();
  window.dispatchEvent(new CustomEvent("student-active-status-changed"));
  return updated;
};

const createBadge = (): HTMLSpanElement => {
  const badge = document.createElement("span");
  badge.className = "inactive-overview-badge";
  badge.setAttribute(GENERATED_ATTRIBUTE, "badge");
  badge.setAttribute("role", "status");
  badge.textContent = "לא פעילה";
  return badge;
};

const createInfo = (student: Student): HTMLDivElement => {
  const info = document.createElement("div");
  info.className = "inactive-overview-info";
  info.setAttribute(GENERATED_ATTRIBUTE, "info");

  const title = document.createElement("strong");
  title.textContent = "תלמידה לא פעילה";
  info.appendChild(title);

  if (student.leftDate) {
    const date = document.createElement("span");
    date.textContent = ` · מתאריך ${new Intl.DateTimeFormat("he-IL").format(new Date(student.leftDate))}`;
    info.appendChild(date);
  }

  if (student.leftReason) {
    const reason = document.createElement("div");
    reason.textContent = `סיבה: ${student.leftReason}`;
    info.appendChild(reason);
  }

  return info;
};

const clearElement = (element: HTMLElement): void => {
  element.classList.remove(
    "inactive-overview-card",
    "inactive-overview-row",
    "inactive-overview-name"
  );
  element.removeAttribute(STUDENT_ATTRIBUTE);
  element
    .querySelectorAll<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`)
    .forEach((generated) => generated.remove());
};

const findStudentForCard = (card: HTMLElement): Student | undefined => {
  const assignedId = card.getAttribute(STUDENT_ATTRIBUTE);
  if (assignedId) {
    const assigned = currentStudents().find((student) => student.id === assignedId);
    if (assigned) return assigned;
  }

  const code = card.textContent?.match(/קוד:\s*(\d{4})/)?.[1];
  const heading = normalize(card.querySelector("h3")?.textContent);

  return currentStudents().find((student) => {
    const fullName = normalize(`${student.firstName || ""} ${student.lastName || ""}`);
    return Boolean(
      (code && String(student.personalCode) === code) ||
      (heading && fullName === heading)
    );
  });
};

const findDepartureButton = (container: HTMLElement): HTMLButtonElement | null => {
  const byAttribute = container.querySelector<HTMLButtonElement>(
    `button[${STUDENT_ATTRIBUTE}]`
  );
  if (byAttribute) return byAttribute;

  const icon = container.querySelector<SVGElement>("svg.lucide-door-open");
  return icon?.closest<HTMLButtonElement>("button") || null;
};

const paintButton = (button: HTMLButtonElement | null, student: Student): void => {
  if (!button) return;
  button.setAttribute(STUDENT_ATTRIBUTE, student.id);

  if (student.isActive === false) {
    button.classList.add("inactive-overview-toggle");
    button.title = "החזירי את התלמידה לפעילות";
    button.setAttribute("aria-label", "החזירי את התלמידה לפעילות");
  } else {
    button.classList.remove("inactive-overview-toggle");
    button.title = "סמני את התלמידה כעזבה";
    button.setAttribute("aria-label", "סמני את התלמידה כעזבה");
  }
};

const decorateCards = (): void => {
  document.querySelectorAll<HTMLHeadingElement>("h3").forEach((heading) => {
    const card = heading.closest<HTMLElement>("div.rounded-lg.border");
    if (!card || !card.textContent?.includes("קוד:")) return;

    const student = findStudentForCard(card);
    if (!student) return;

    card.setAttribute(STUDENT_ATTRIBUTE, student.id);
    const button = findDepartureButton(card);
    paintButton(button, student);

    if (student.isActive === false) {
      card.classList.add("inactive-overview-card");
      heading.classList.add("inactive-overview-name");

      const headingRow = heading.parentElement;
      if (headingRow && !headingRow.querySelector(`[${GENERATED_ATTRIBUTE}="badge"]`)) {
        headingRow.appendChild(createBadge());
      }
      const body = headingRow?.parentElement;
      if (body && !body.querySelector(`[${GENERATED_ATTRIBUTE}="info"]`)) {
        headingRow.insertAdjacentElement("afterend", createInfo(student));
      }
    } else {
      card.classList.remove("inactive-overview-card");
      heading.classList.remove("inactive-overview-name");
      card
        .querySelectorAll<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`)
        .forEach((generated) => generated.remove());
    }
  });
};

const findStudentForRow = (row: HTMLTableRowElement): Student | undefined => {
  const assignedId = row.getAttribute(STUDENT_ATTRIBUTE);
  if (assignedId) {
    const assigned = currentStudents().find((student) => student.id === assignedId);
    if (assigned) return assigned;
  }

  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  if (cells.length < 3) return undefined;
  const firstName = normalize(cells[0].textContent?.replace("לא פעילה", ""));
  const lastName = normalize(cells[1].textContent);
  const phoneText = normalizePhone(cells[2].textContent);

  return currentStudents().find((student) => {
    const nameMatches =
      normalize(student.firstName) === firstName &&
      normalize(student.lastName) === lastName;
    const phone = normalizePhone(student.phone);
    return nameMatches && (!phone || phoneText.includes(phone));
  });
};

const decorateRows = (): void => {
  document.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
    const student = findStudentForRow(row);
    if (!student) return;

    row.setAttribute(STUDENT_ATTRIBUTE, student.id);
    paintButton(findDepartureButton(row), student);

    const cells = row.querySelectorAll<HTMLTableCellElement>("td");
    if (student.isActive === false) {
      row.classList.add("inactive-overview-row");
      cells[0]?.classList.add("inactive-overview-name");
      cells[1]?.classList.add("inactive-overview-name");
      if (cells[0] && !cells[0].querySelector(`[${GENERATED_ATTRIBUTE}="badge"]`)) {
        cells[0].appendChild(createBadge());
      }
    } else {
      row.classList.remove("inactive-overview-row");
      cells[0]?.classList.remove("inactive-overview-name");
      cells[1]?.classList.remove("inactive-overview-name");
      row
        .querySelectorAll<HTMLElement>(`[${GENERATED_ATTRIBUTE}]`)
        .forEach((generated) => generated.remove());
    }
  });
};

const decorateOverview = (): void => {
  decorateCards();
  decorateRows();

  // Remove stale decorations from cards/rows whose student became active.
  const ids = new Map(currentStudents().map((student) => [student.id, student]));
  document
    .querySelectorAll<HTMLElement>(`[${STUDENT_ATTRIBUTE}]`)
    .forEach((element) => {
      const student = ids.get(element.getAttribute(STUDENT_ATTRIBUTE) || "");
      if (!student) clearElement(element);
    });
};

const StudentActiveToggleDecorator = () => {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .inactive-overview-card {
          border: 2px solid #94a3b8 !important;
          background: #f1f5f9 !important;
          opacity: .72 !important;
          filter: grayscale(.3);
          box-shadow: none !important;
        }
        .dark .inactive-overview-card {
          border-color: #64748b !important;
          background: #1e293b !important;
        }
        .inactive-overview-row {
          background: #e2e8f0 !important;
          color: #64748b !important;
          opacity: .78;
        }
        .dark .inactive-overview-row {
          background: #1e293b !important;
          color: #cbd5e1 !important;
        }
        .inactive-overview-name {
          color: #64748b !important;
          text-decoration: line-through 2px #64748b !important;
        }
        .inactive-overview-badge {
          display: inline-flex;
          align-items: center;
          margin-inline-start: 8px;
          padding: 3px 9px;
          border-radius: 999px;
          background: #64748b;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.4;
          white-space: nowrap;
          text-decoration: none !important;
        }
        .inactive-overview-info {
          margin-top: 7px;
          padding: 7px 9px;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          background: rgba(226,232,240,.72);
          color: #475569;
          font-size: 11px;
          line-height: 1.55;
        }
        .dark .inactive-overview-info {
          border-color: #475569;
          background: rgba(51,65,85,.75);
          color: #e2e8f0;
        }
        button.inactive-overview-toggle {
          border-color: #94a3b8 !important;
          background: #cbd5e1 !important;
          color: #475569 !important;
          box-shadow: none !important;
        }
        button.inactive-overview-toggle:hover {
          background: #94a3b8 !important;
          color: #334155 !important;
        }
        .dark button.inactive-overview-toggle {
          border-color: #64748b !important;
          background: #475569 !important;
          color: #f1f5f9 !important;
        }
      `;
      document.head.appendChild(style);
    }

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        decorateOverview();
      });
    };

    const handleToggle = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        `button[${STUDENT_ATTRIBUTE}]`
      );
      if (!button) return;

      const studentId = button.getAttribute(STUDENT_ATTRIBUTE);
      const student = currentStudents().find((item) => item.id === studentId);
      if (!student) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (student.isActive === false) {
        saveStudentState(student.id, {
          isActive: true,
          leftDate: undefined,
          leftReason: undefined,
        });
        toast({
          title: "התלמידה חזרה לפעילות",
          description: `${student.firstName} ${student.lastName} מסומנת שוב כתלמידה פעילה`,
        });
      } else {
        const reason = window.prompt(
          `סיבת עזיבה של ${student.firstName} ${student.lastName} (אפשר לרשום: סיום שנה / עברה / הפסקה זמנית):`
        );
        if (reason === null) return;
        saveStudentState(student.id, {
          isActive: false,
          leftDate: new Date().toISOString().split("T")[0],
          leftReason: reason.trim() || "לא צוין",
        });
        toast({
          title: "התלמידה סומנה כלא פעילה",
          description: "הכרטיס שלה נשאר אפור וברור בסקירת התלמידות",
        });
      }
      schedule();
    };

    document.addEventListener("click", handleToggle, true);
    window.addEventListener("student-active-status-changed", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const intervalId = window.setInterval(schedule, 450);
    schedule();

    return () => {
      document.removeEventListener("click", handleToggle, true);
      window.removeEventListener("student-active-status-changed", schedule);
      observer.disconnect();
      window.clearInterval(intervalId);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
};

export default StudentActiveToggleDecorator;
