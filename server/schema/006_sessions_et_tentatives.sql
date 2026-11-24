-- ---------------------------------------------------------------------------
-- CE QUI S'EST PASSÉ SUR LE COMPTE PENDANT QU'ON N'ÉTAIT PAS LÀ
--
-- Le registre refusait déjà les essais en masse : dix tentatives par adresse
-- et quarante par poste, par quart d'heure. Mais il les refusait EN SILENCE.
-- Quelqu'un pouvait passer la nuit à essayer des mots de passe sur le compte
-- d'administration, et personne ne l'apprenait jamais — ni le titulaire du
-- compte, ni VIZDATA. Un refus que personne ne voit ne protège que de
-- l'attaque qui réussit du premier coup.
--
-- Deux colonnes suffisent, et elles ne grandissent pas :
--   * `failed_attempts` compte les échecs DEPUIS la dernière connexion
--     réussie, et retombe à zéro à cette connexion. C'est ce chiffre qu'on
--     annonce en entrant : « trois tentatives ont échoué depuis votre
--     dernière visite » se comprend sans explication.
--   * `last_failed_at` garde la date du dernier échec et ne retombe jamais :
--     elle reste consultable dans l'écran de sécurité, longtemps après.
--
-- Pourquoi pas une table d'historique : parce qu'elle serait alimentée par
-- n'importe qui depuis l'extérieur, et qu'un journal que l'attaquant remplit
-- lui-même est un moyen de remplir le disque, pas une mesure de sécurité.
-- Deux compteurs par compte sont bornés par construction.
-- ---------------------------------------------------------------------------

alter table users add column failed_attempts integer not null default 0;
alter table users add column last_failed_at text;

-- Les sessions portent déjà `last_seen`, mis à jour à chaque requête. Il ne
-- servait à rien : une session restait valable trente jours même sans être
-- touchée une seule fois. C'est le code qui s'en sert désormais pour couper
-- les sessions d'administration laissées ouvertes — voir Comptes::DUREES.
-- Aucune colonne à ajouter, seulement un index : la liste des sessions d'un
-- compte se demande à chaque ouverture de l'écran de sécurité.
create index if not exists idx_sessions_user on sessions (user_id, last_seen desc);
