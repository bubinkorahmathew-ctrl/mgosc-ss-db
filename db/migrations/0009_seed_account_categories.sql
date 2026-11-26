-- Phase F: the starting income and expense categories. More can be added (and these switched off) in Accounts -> Settings.
INSERT INTO `account_categories` (`name`, `type`) VALUES
  ('Charity collection', 'income'),
  ('Donation', 'income'),
  ('OVBS fee', 'income'),
  ('Other income', 'income'),
  ('Event expense', 'expense'),
  ('Prizes and gifts', 'expense'),
  ('Stationery', 'expense'),
  ('Food and refreshments', 'expense'),
  ('Printing', 'expense'),
  ('OVBS expense', 'expense'),
  ('Other expense', 'expense');
