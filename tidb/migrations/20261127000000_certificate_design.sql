-- The certificate design (components/certificate): a Vicar signs next to the Headmaster.
-- The existing uploaded signature stays the Headmaster's (signature_url); the Vicar's image is
-- stored the same way, in branding_images.
--
-- The design prints "This certificate is proudly presented to" and the name itself, so the
-- default wording now starts after the name. Only wording still equal to the old default is
-- changed: anything the school edited in Settings is kept. Issued certificates keep their text.

alter table school_settings add column vicar_name varchar(120) null after headmaster_name;

alter table school_settings add column vicar_signature_url text null after signature_url;

alter table branding_images modify column kind enum('signature','vicar_signature') not null;

update school_settings set certificate_wording = json_set(certificate_wording, '$.completion',
  'has successfully completed {class} of the Sunday School during the academic year {year}.')
where id = 1 and json_unquote(json_extract(certificate_wording, '$.completion'))
  = 'This is to certify that {student_name} has successfully completed {class} of the Sunday School during the academic year {year}.';

update school_settings set certificate_wording = json_set(certificate_wording, '$.merit',
  'of {class} for securing Rank {rank} in {exam} during the academic year {year}.')
where id = 1 and json_unquote(json_extract(certificate_wording, '$.merit'))
  = 'This certificate is awarded to {student_name} of {class} for securing Rank {rank} in {exam} during the academic year {year}.';

update school_settings set certificate_wording = json_set(certificate_wording, '$.attendance',
  'of {class} in recognition of excellent attendance during the academic year {year}.')
where id = 1 and json_unquote(json_extract(certificate_wording, '$.attendance'))
  = 'This certificate is awarded to {student_name} of {class} in recognition of excellent attendance during the academic year {year}.';

update school_settings set certificate_wording = json_set(certificate_wording, '$.participation',
  'of {class} for participation in {exam} during the academic year {year}.')
where id = 1 and json_unquote(json_extract(certificate_wording, '$.participation'))
  = 'This certificate is awarded to {student_name} of {class} for participation in {exam} during the academic year {year}.';

update school_settings set certificate_wording = json_set(certificate_wording, '$.memory_verse',
  'of {class} for outstanding achievement in Memory Verse recitation during the academic year {year}.')
where id = 1 and json_unquote(json_extract(certificate_wording, '$.memory_verse'))
  = 'This certificate is awarded to {student_name} of {class} for outstanding achievement in Memory Verse recitation during the academic year {year}.';
