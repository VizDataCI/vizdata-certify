-- ---------------------------------------------------------------------------
-- DEUX TYPES DE CERTIFICAT : PARTICIPATION ET COMPÉTENCES
--
-- Une formation ne produit pas toujours la même attestation. Suivre un
-- programme et valider les compétences qu'il enseigne sont deux faits
-- distincts : le premier se constate, le second s'évalue. Les confondre sous
-- un seul document ferait dire au certificat plus qu'il ne sait — et un
-- employeur qui le lit mérite de savoir ce qui a été vérifié.
--
-- D'où une colonne, et non deux tables : tout le reste est identique — même
-- référence, même registre, même QR code, même page de vérification. Seuls
-- changent le titre du document, la formule qui l'accompagne et la présence
-- des compétences validées.
--
-- Le défaut vaut COMPETENCES : c'est ce que tous les certificats déjà
-- délivrés attestent, et c'était le seul titre que portait le document.
-- Aucun certificat existant ne change donc de nature.
-- ---------------------------------------------------------------------------

alter table certificates
  add column kind text not null default 'COMPETENCES'
  check (kind in ('COMPETENCES', 'PARTICIPATION'));

-- La vue publique est reconstruite pour porter le type : la page de
-- vérification et le document imprimé le lisent, et ils ne lisent que la vue.
-- Une vue ne se modifie pas en SQLite, elle se remplace.
drop view if exists v_certificats_publics;

create view v_certificats_publics as
select
  c.id                       as id,
  c.reference                as reference,
  c.public_token             as public_token,
  u.first_name || ' ' || u.last_name as holder_name,
  u.username                 as holder_username,
  t.name                     as certification,
  t.code                     as program_code,
  t.description              as description,
  coalesce(d.name, '')       as domain,
  'VIZDATA'                  as issuer,
  c.issue_date               as issue_date,
  c.status                   as status,
  c.kind                     as kind,
  c.revoke_reason            as revoke_reason,
  c.duration                 as duration,
  c.trainer                  as trainer,
  c.signatory                as signatory,
  c.expiry_date              as expiry_date,
  c.created_at               as created_at
from certificates c
join users u on u.id = c.user_id
join certificate_types t on t.id = c.certificate_type_id
left join certification_domains d on d.id = t.domain_id;
