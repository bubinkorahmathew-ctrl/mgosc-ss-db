-- Views and the rows every new database starts with. drizzle-kit does not generate these.
-- (The live database already had them when it moved to Drizzle; there this migration is marked
-- as applied without running: see scripts/db-baseline.ts.)

INSERT INTO `school_settings` (`id`, `school_name`, `certificate_wording`) VALUES (1, 'MGOSC Sunday School', json_object(
  'completion',    'has successfully completed {class} of the Sunday School during the academic year {year}.',
  'merit',         'of {class} for securing Rank {rank} in {exam} during the academic year {year}.',
  'attendance',    'of {class} in recognition of excellent attendance during the academic year {year}.',
  'participation', 'of {class} for participation in {exam} during the academic year {year}.',
  'memory_verse',  'of {class} for outstanding achievement in Memory Verse recitation during the academic year {year}.',
  'custom',        ''
));
--> statement-breakpoint

-- fixed id: the app refers to it (lib/config.ts NOT_ASSIGNED_PRAYER_UNIT); inactive, so never offered on forms
INSERT INTO `prayer_units` (`id`, `name`, `active`) VALUES ('00000000-0000-4000-8000-000000000001', 'Not assigned', false);
--> statement-breakpoint

INSERT INTO `grade_scales` (`id`, `min_percent`, `max_percent`, `grade`, `is_pass`) VALUES
  (uuid(), 90.00, 100.00, 'A+', true),
  (uuid(), 80.00, 89.99, 'A', true),
  (uuid(), 70.00, 79.99, 'B+', true),
  (uuid(), 60.00, 69.99, 'B', true),
  (uuid(), 50.00, 59.99, 'C', true),
  (uuid(), 40.00, 49.99, 'D', true),
  (uuid(), 0.00, 39.99, 'F', false);
--> statement-breakpoint

CREATE VIEW `v_student_age` AS
SELECT `id`, `dob`,
  timestampdiff(year, `dob`, date(convert_tz(utc_timestamp(), '+00:00', '+05:30'))) AS `age_years`,
  timestampdiff(month, `dob`, date(convert_tz(utc_timestamp(), '+00:00', '+05:30'))) % 12 AS `age_months`
FROM `students`;
--> statement-breakpoint

-- One row per subject a student sat (students absent for the whole exam are left out).
-- AB (is_absent) has no percentage or grade and is not passed.
CREATE VIEW `v_subject_results` AS
SELECT mk.exam_id, mk.student_id, mk.subject_id, mk.marks_obtained, mk.is_absent, s.max_marks, s.pass_percent,
  CASE WHEN mk.is_absent THEN NULL ELSE round(mk.marks_obtained / s.max_marks * 100, 2) END AS subject_percent,
  CASE WHEN mk.is_absent THEN 'AB' ELSE (
    SELECT g.grade FROM grade_scales g
    WHERE round(mk.marks_obtained / s.max_marks * 100, 2) BETWEEN g.min_percent AND g.max_percent
    ORDER BY g.min_percent DESC LIMIT 1
  ) END AS grade,
  (NOT mk.is_absent AND mk.marks_obtained * 100 >= s.pass_percent * s.max_marks) AS passed
FROM marks mk
JOIN subjects s ON s.id = mk.subject_id
LEFT JOIN exam_attendance ea ON ea.exam_id = mk.exam_id AND ea.student_id = mk.student_id
WHERE ea.status IS NULL OR ea.status <> 'absent';
--> statement-breakpoint

-- One row per student per exam: totals, percentage, overall grade, result and RANK() (ties share a place).
CREATE VIEW `v_exam_results` AS
SELECT x.exam_id, x.student_id, x.exam_status, x.total_obtained, x.total_max, x.subjects_entered, x.percentage,
  (SELECT g.grade FROM grade_scales g WHERE x.percentage BETWEEN g.min_percent AND g.max_percent
    ORDER BY g.min_percent DESC LIMIT 1) AS overall_grade,
  x.result,
  CASE WHEN x.percentage IS NULL THEN NULL
    ELSE rank() OVER (PARTITION BY x.exam_id, x.percentage IS NULL ORDER BY x.percentage DESC) END AS class_rank
FROM (
  SELECT b.exam_id, b.student_id, ea.status AS exam_status,
    CASE WHEN ea.status = 'absent' THEN NULL ELSE a.total_obtained END AS total_obtained,
    CASE WHEN ea.status = 'absent' THEN NULL ELSE a.total_max END AS total_max,
    CASE WHEN ea.status = 'absent' THEN 0 ELSE coalesce(a.subjects_entered, 0) END AS subjects_entered,
    CASE WHEN ea.status = 'absent' OR a.total_max IS NULL OR a.total_max = 0 THEN NULL
      ELSE round(a.total_obtained / a.total_max * 100, 2) END AS percentage,
    CASE WHEN ea.status = 'absent' THEN 'Absent'
      WHEN a.subjects_entered IS NULL THEN NULL
      WHEN a.failed > 0 THEN 'Fail'
      WHEN a.subjects_entered >= (SELECT count(*) FROM subjects) THEN 'Pass'
      ELSE NULL END AS result
  FROM (
    SELECT exam_id, student_id FROM marks
    UNION
    SELECT exam_id, student_id FROM exam_attendance
  ) b
  LEFT JOIN (
    SELECT exam_id, student_id,
      round(sum(CASE WHEN is_absent THEN 0 ELSE marks_obtained END), 2) AS total_obtained,
      sum(max_marks) AS total_max,
      count(*) AS subjects_entered,
      sum(CASE WHEN passed THEN 0 ELSE 1 END) AS failed
    FROM v_subject_results
    GROUP BY exam_id, student_id
  ) a ON a.exam_id = b.exam_id AND a.student_id = b.student_id
  LEFT JOIN exam_attendance ea ON ea.exam_id = b.exam_id AND ea.student_id = b.student_id
) x;
