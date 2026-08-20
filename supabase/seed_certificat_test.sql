-- Certificat de test, pour prouver le cas passant de la vérification publique.
--
-- Rattaché au premier titulaire du registre et au type EXCEL. La référence et
-- le jeton public sont produits par les fonctions du projet, next_reference()
-- et new_public_token(), plutôt que saisis en dur.
--
-- Pour le retirer ensuite :
--   delete from public.certificates where reference = '<la référence affichée>';
-- La suppression emporte les lignes liées de certificate_skills, verifications
-- et shares, toutes déclarées « on delete cascade ».

with nouveau as (
  insert into public.certificates (
    reference, public_token, user_id, certificate_type_id,
    issue_date, expiry_date, status, score, duration, trainer, signatory
  )
  select
    public.next_reference('EXCEL', 2026),
    public.new_public_token(),
    u.id,
    t.id,
    date '2026-07-15',
    date '2028-07-15',
    'ACTIVE',
    92,
    t.default_duration,
    'Fabrice BOH',
    'Direction VIZDATA'
  from (select id from public.users order by created_at limit 1) u,
       (select id, default_duration from public.certificate_types where code = 'EXCEL') t
  returning id, reference, public_token
),
competences as (
  insert into public.certificate_skills (certificate_id, skill_id)
  select n.id, s.id
    from nouveau n, public.skills s
   where s.name in ('Excel avancé', 'Tableaux croisés dynamiques', 'Data Analysis')
  returning certificate_id
)
select reference, public_token, (select count(*) from competences) as competences_liees
  from nouveau;
