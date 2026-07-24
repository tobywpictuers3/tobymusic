import { useEffect } from "react";
import { getStudents, updateStudent } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import type { Student } from "@/lib/types";

const STYLE_ID = "student-active-toggle-styles";
const TOGGLE_ATTRIBUTE = "data-student-active-toggle";

const normalize = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const findStudentForButton = (button: HTMLButtonElement): Student | undefined => {
  const assignedId = button.getAttribute(TOGGLE_ATTRIBUTE);
  if (assignedId) {
    const assigned = getStudents().find((student) => student.id === assignedId);
    if (assigned) return assigned;
  }

  const card = button.closest<HTMLElement>("div.rounded-lg.border");
  if (!card) return undefined;

  const name = normalize(card.querySelector("h3")?.textContent);
  const code = card.textContent?.match(/קוד:\s*(\d{4})/)?.[1];

  return getStudents().find((student) => {
    const fullName = normalize(`${student.firstName || ""} ${student.lastName || ""}`);
    return (code && String(student.personalCode) === code) || (name && fullName === name);
  });
};

const paintButton = (button: HTMLButtonElement, student: Student): void => {
  button.setAttribute(TOGGLE_ATTRIBUTE, student.id);

  if (student.isActive === false) {
    button.classList.add("student-left-toggle-inactive");
    button.title = "החזירי את התלמידה לפעילות";
    button.setAttribute("aria-label", "החזירי את התלמידה לפעילות");
  } else {
    button.classList.remove("student-left-toggle-inactive");
    button.title = "סמני את התלמידה כעזבה";
    button.setAttribute("aria-label", "סמני את התלמידה כעזבה");
  }
};

const decorateButtons = (): void => {
  document
    .querySelectorAll<HTMLButtonElement>(
      `button[title="סמן כ-עזבה (לא ימחק נתונים)"], button[${TOGGLE_ATTRIBUTE}]`
    )
    .forEach((button) => {
      const student = findStudentForButton(button);
      if (student) paintButton(button, student);
    });
};

const StudentActiveToggleDecorator = () => {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        button.student-left-toggle-inactive {
          border-color: #9ca3af !important;
          background: #e5e7eb !important;
          color: #6b7280 !important;
          box-shadow: none !important;
        }
        button.student-left-toggle-inactive:hover {
          background: #d1d5db !important;
          color: #4b5563 !important;
        }
        button.student-left-toggle-inactive svg {
          opacity: .62;
        }
        .dark button.student-left-toggle-inactive {
          border-color: #64748b !important;
          background: #475569 !important;
          color: #e2e8f0 !important;
        }
        .dark button.student-left-toggle-inactive:hover {
          background: #64748b !important;
        }
      `;
      document.head.appendChild(style);
    }

    const handleToggle = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>(`button[${TOGGLE_ATTRIBUTE}]`);
      if (!button) return;

      const student = findStudentForButton(button);
      if (!student) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (student.isActive === false) {
        const updated = updateStudent(student.id, {
          isActive: true,
          leftDate: undefined,
          leftReason: undefined,
        });
        if (updated) {
          paintButton(button, updated);
          toast({
            title: "התלמידה חזרה לפעילות",
            description: `${student.firstName} ${student.lastName} מסומנת שוב כתלמידה פעילה`,
          });
        }
        return;
      }

      const reason = window.prompt(
        `סיבת עזיבה של ${student.firstName} ${student.lastName} (אפשר לרשום: סיום שנה / עברה / הפסקה זמנית):`
      );
      if (reason === null) return;

      const updated = updateStudent(student.id, {
        isActive: false,
        leftDate: new Date().toISOString().split("T")[0],
        leftReason: reason.trim() || "לא צוין",
      });
      if (updated) {
        paintButton(button, updated);
        toast({
          title: "התלמידה סומנה כלא פעילה",
          description: "כפתור העזיבה הפך לאפור. לחיצה נוספת תחזיר אותה לפעילות.",
        });
      }
    };

    let scheduled = false;
    const scheduleDecoration = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        decorateButtons();
      });
    };

    document.addEventListener("click", handleToggle, true);
    const observer = new MutationObserver(scheduleDecoration);
    observer.observe(document.body, { childList: true, subtree: true });
    const intervalId = window.setInterval(scheduleDecoration, 700);
    scheduleDecoration();

    return () => {
      document.removeEventListener("click", handleToggle, true);
      observer.disconnect();
      window.clearInterval(intervalId);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
};

export default StudentActiveToggleDecorator;
