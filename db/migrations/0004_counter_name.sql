-- number_counters is keyed by (name, year) instead of (kind, year). TiDB cannot always change a
-- primary key in place, so the (tiny) table is rebuilt: create, copy, swap.
CREATE TABLE `number_counters_next` (
  `name` varchar(20) NOT NULL,
  `year` int NOT NULL,
  `last_value` int NOT NULL DEFAULT 0,
  CONSTRAINT `number_counters_name_year_pk` PRIMARY KEY (`name`, `year`)
);--> statement-breakpoint
INSERT INTO `number_counters_next` (`name`, `year`, `last_value`) SELECT `name`, `year`, `last_value` FROM `number_counters`;--> statement-breakpoint
DROP TABLE `number_counters`;--> statement-breakpoint
RENAME TABLE `number_counters_next` TO `number_counters`;
