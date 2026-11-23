import { todayISO } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ReportTabs } from "@/components/reports/reports";
import { BulkUpload, type UploadKind } from "./bulk-upload";

type Option = { id: string; label: string };

const TABS: { id: UploadKind; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "marks", label: "Marks" },
  { id: "attendance", label: "Attendance" },
];

export function parseUploadTab(value: string | string[] | undefined): UploadKind {
  return TABS.find((t) => t.id === value)?.id ?? "students";
}

/** The bulk upload page; the caller passes only what this user may use. */
export function ImportScreen({ base, tab, studentClasses, classes, exams, allowNoClass }: {
  base: string; tab: UploadKind;
  /** classes students may be added to */
  studentClasses: Option[];
  /** classes for attendance */
  classes: Option[];
  exams: Option[];
  allowNoClass?: boolean;
}) {
  let body: React.ReactNode;
  if (tab === "students") {
    body = !studentClasses.length && !allowNoClass
      ? <EmptyState title="You have no class in the current year to add students to." />
      : <BulkUpload key="students" kind="students" options={studentClasses} today={todayISO()}
        noClassLabel={allowNoClass ? "No class yet" : undefined} />;
  } else if (tab === "marks") {
    body = !exams.length
      ? <EmptyState title="There are no exams yet.">Exams are created under Subjects &amp; Exams.</EmptyState>
      : <BulkUpload key="marks" kind="marks" options={exams} today={todayISO()} />;
  } else {
    body = !classes.length
      ? <EmptyState title="There are no classes yet." />
      : <BulkUpload key="attendance" kind="attendance" options={classes} today={todayISO()} />;
  }
  return (
    <>
      <PageHeader title="Bulk upload" description="Add students, marks or attendance from an Excel file." />
      <ReportTabs base={base} tab={tab} tabs={TABS} label="Upload type" />
      <div className="max-w-4xl">{body}</div>
    </>
  );
}
