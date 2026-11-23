-- The icon and colour the super admin picked for each menu section (null = the built-in look).

alter table school_settings add column nav_icons json null after certificate_wording;
