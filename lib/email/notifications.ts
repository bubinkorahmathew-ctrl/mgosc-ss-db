import "server-only";
/**
 * Notification emails, one function per event. They never throw: a failed or unconfigured
 * email is logged and the action that triggered it has already succeeded. Call them through
 * next/server after(), so they run once the response is sent and never slow the page down.
 *
 * To add an event: a template in templates.ts, a recipients lookup in lib/repo/notify.ts if
 * needed, and a function here following the same pattern.
 */
import { formatDate } from "@/lib/dates";
import { adminRecipients, classTeacherRecipients, prayerUnitName, studentForNotice, type Recipient } from "@/lib/repo/notify";
import { appUrl, sendEmail } from "./send";
import { newRegistrationEmail, newStudentInClassEmail, type Rendered } from "./templates";

/** One email per recipient (no shared To list: addresses stay private). Logs, never throws. */
async function deliver(event: string, recipients: Recipient[], mail: Rendered, replyTo?: string | null) {
  for (const r of recipients) {
    try {
      await sendEmail({ to: r.email, ...mail, ...(replyTo ? { replyTo } : {}) });
    } catch (e) {
      console.error(`[email] ${event}: could not send one notification:`, e instanceof Error ? e.message : e);
    }
  }
}

async function safely(event: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (e) {
    console.error(`[email] ${event} failed:`, e instanceof Error ? e.message : e);
  }
}

/** A child was registered on the public form: tell the admins, who review registrations. */
export function notifyAdminsOfRegistration(reg: {
  id: string | null; full_name: string; dob: string; school_class: string; father_name: string; father_phone: string;
  email: string | null; prayer_unit_id: string;
}) {
  return safely("new registration", async () => {
    const recipients = await adminRecipients();
    if (!recipients.length) return;
    const link = `${appUrl()}/admin/registrations${reg.id ? `/${reg.id}` : ""}`;
    const mail = newRegistrationEmail({
      childName: reg.full_name, dob: formatDate(reg.dob), schoolClass: reg.school_class, fatherName: reg.father_name,
      phone: reg.father_phone, email: reg.email, prayerUnit: await prayerUnitName(reg.prayer_unit_id),
    }, link);
    await deliver("new registration", recipients, mail, reg.email);
  });
}

/** A student joined a class (registration approved, or added by an admin): tell that class's teachers. */
export function notifyTeachersOfNewStudent(studentId: string, actorId?: string) {
  return safely("new student", async () => {
    const s = await studentForNotice(studentId);
    if (!s?.classId) return;
    const recipients = await classTeacherRecipients(s.classId, actorId);
    if (!recipients.length) return;
    const className = s.section ? `${s.className} - ${s.section}` : s.className ?? "your class";
    const mail = newStudentInClassEmail({ name: s.name, admissionNo: s.admissionNo, className },
      `${appUrl()}/teacher/students/${studentId}`);
    await deliver("new student", recipients, mail);
  });
}
