-- 5e Bardic Inspiration (SRD 5.2.1 p. 33) given to another hero rides the same hand-off as
-- Help: the bard inserts the die ("Bardic Inspiration d8", or "… d8 Valor" from a College of
-- Valor bard for Combat Inspiration), the target's sheet adds it and deletes the row.
alter table public.hero_effects drop constraint if exists hero_effects_effect_check;
alter table public.hero_effects add constraint hero_effects_effect_check
  check (effect = 'Helped' or effect ~ '^Bardic Inspiration d(6|8|10|12)( Valor)?$');
