-- Certificates for confirmed toppers: two new types and a link to the topper (its percentage prints
-- in the facts row). Default wording for the new types starts after the name, like the others.
ALTER TABLE `certificates` MODIFY COLUMN `type` enum('completion','merit','attendance','participation','memory_verse','custom','class_topper','attendance_topper') NOT NULL;--> statement-breakpoint
ALTER TABLE `certificates` ADD `topper_id` char(36);--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_topper_id_toppers_id_fk` FOREIGN KEY (`topper_id`) REFERENCES `toppers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE `school_settings` SET `certificate_wording` = json_set(`certificate_wording`, '$.class_topper',
  'of {class} for securing the highest marks in the class in {exam} with {percentage} (grade {grade}) during the academic year {year}.')
WHERE `id` = 1 AND json_extract(`certificate_wording`, '$.class_topper') IS NULL;--> statement-breakpoint
UPDATE `school_settings` SET `certificate_wording` = json_set(`certificate_wording`, '$.attendance_topper',
  'of {class} for the best attendance in the class, {attendance_percent}, during the academic year {year}.')
WHERE `id` = 1 AND json_extract(`certificate_wording`, '$.attendance_topper') IS NULL;
