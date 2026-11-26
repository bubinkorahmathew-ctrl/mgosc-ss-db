CREATE TABLE `rate_limits` (
	`key` char(64) NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `rate_limits_key_window_start_pk` PRIMARY KEY(`key`,`window_start`),
	CONSTRAINT `rate_limits_count_check` CHECK(`rate_limits`.`count` >= 0)
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_idx` ON `rate_limits` (`window_start`);