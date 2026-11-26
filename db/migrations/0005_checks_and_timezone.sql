ALTER TABLE `academic_years` ADD CONSTRAINT `academic_years_dates_check` CHECK (`academic_years`.`end_date` > `academic_years`.`start_date`);--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_weight_check` CHECK (`exams`.`weight` between 0 and 100);--> statement-breakpoint
ALTER TABLE `grade_scales` ADD CONSTRAINT `grade_scales_range_check` CHECK (`grade_scales`.`min_percent` between 0 and 100 and `grade_scales`.`max_percent` between 0 and 100 and `grade_scales`.`min_percent` <= `grade_scales`.`max_percent`);--> statement-breakpoint
ALTER TABLE `prayer_units` ADD CONSTRAINT `prayer_units_name_check` CHECK (char_length(trim(`prayer_units`.`name`)) > 0);--> statement-breakpoint
ALTER TABLE `school_settings` ADD CONSTRAINT `school_settings_one_row_check` CHECK (`school_settings`.`id` = 1);--> statement-breakpoint
ALTER TABLE `school_settings` ADD CONSTRAINT `school_settings_topper_pct_check` CHECK (`school_settings`.`attendance_topper_min_pct` between 0 and 100);--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_max_marks_check` CHECK (`subjects`.`max_marks` > 0);--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_pass_percent_check` CHECK (`subjects`.`pass_percent` between 0 and 100);--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_full_name_check` CHECK (char_length(trim(`profiles`.`full_name`)) > 0);--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_full_name_check` CHECK (char_length(trim(`registrations`.`full_name`)) > 0);--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_full_name_check` CHECK (char_length(trim(`students`.`full_name`)) > 0);--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_title_check` CHECK (char_length(trim(`activities`.`title`)) > 0);--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_range_check` CHECK (`marks`.`marks_obtained` >= 0);--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_absent_zero_check` CHECK (not `marks`.`is_absent` or `marks`.`marks_obtained` = 0);--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_value_check` CHECK (`toppers`.`value` between 0 and 100);--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_period_check` CHECK (`toppers`.`period_end` >= `toppers`.`period_start`);
--> statement-breakpoint
-- Age as on today in the school's time zone (school_settings.timezone, e.g. Asia/Riyadh), not India time.
DROP VIEW `v_student_age`;--> statement-breakpoint
CREATE VIEW `v_student_age` AS
SELECT s.`id`, s.`dob`,
  timestampdiff(year, s.`dob`, date(convert_tz(utc_timestamp(), '+00:00', coalesce((SELECT `timezone` FROM `school_settings` WHERE `id` = 1), 'Asia/Riyadh')))) AS `age_years`,
  timestampdiff(month, s.`dob`, date(convert_tz(utc_timestamp(), '+00:00', coalesce((SELECT `timezone` FROM `school_settings` WHERE `id` = 1), 'Asia/Riyadh')))) % 12 AS `age_months`
FROM `students` s;