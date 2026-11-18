/* Tableau de bord : piloter, pas contempler.
 *
 * Les indicateurs répondent à une période choisie, et pas seulement au total
 * depuis l'ouverture du registre : « combien de certifications ce mois-ci »
 * est la question qu'on se pose, « combien depuis toujours » celle qu'on
 * regarde une fois.
 *
 * Tout ce qui est affiché vient du registre. Aucun chiffre n'est inventé pour
 * remplir une carte : quand une période ne contient rien, la carte affiche
 * zéro et le graphique le dit. Un tableau de bord qui embellit ne sert plus à
 * décider.
 *
 * Les répartitions par domaine et par programme sont calculées côté client, à
 * partir du registre déjà chargé. Une agrégation côté base serait plus
 * économe, mais imposerait un aller-retour de plus à chaque changement de
 * période, et le registre d'un organisme de formation se compte en milliers de
 * lignes, pas en millions.
 */

import { useMemo, useState } from "react";
import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { monthlySeries } from "../../lib/series.js";
import { Badge, BarChart, Stat, Vide } from "../../ui/primitives.jsx";
import {
  IconeCertificats, IconeCertifies, IconeVerification, IconeCatalogue,
  IconeRevoquer, IconeAuthentique, IconeUtilisateurs, IconeHistorique,
  IconePlus, IconeInfo, IconeDroite, IconeStats,
} from "../../ui/icones.jsx";

const PERIODES = [
  { cle: "30", label: "30 derniers jours", jours: 30 },
  { cle: "90", label: "90 derniers jours", jours: 90 },
  { cle: "365", label: "12 derniers mois", jours: 365 },
  { cle: "tout", label: "Depuis l'ouverture", jours: null },
];

function AdminDashboard(p) {
  const [periode, setPeriode] = useState("30");
  const choisie = PERIODES.find((x) => x.cle === periode) || PERIODES[0];

  const depuis = useMemo(() => {
    if (!choisie.jours) return null;
    const d = new Date();
    d.setDate(d.getDate() - choisie.jours);
    return d;
  }, [choisie]);

  const dansLaPeriode = (valeur) => {
    if (!depuis || !valeur) return Boolean(valeur) || !depuis;
    return new Date(valeur) >= depuis;
  };

  const certs = p.db.certificates;
  const titulaires = (p.db.users || []).filter((u) => u.role === "CERTIFIED");
  const domaines = p.db.domains || [];
  const programmes = p.db.types || [];

  const surPeriode = depuis ? certs.filter((c) => dansLaPeriode(c.issue_date)) : certs;
  const nouveauxTitulaires = depuis
    ? titulaires.filter((u) => u.created_at && new Date(u.created_at) >= depuis).length
    : titulaires.length;
  const verifsPeriode = depuis
    ? p.db.verifications.filter((v) => new Date(v.verified_at) >= depuis).length
    : p.db.verifications.length;

  const par = (s) => certs.filter((c) => effectiveStatus(c) === s).length;

  /* Répartitions. On compte sur la période choisie : une répartition « depuis
     toujours » masque les programmes qui viennent d'être ouverts. */
  const parDomaine = domaines
    .map((d) => ({
      nom: d.name,
      n: surPeriode.filter((c) => p.typeOf(c).domain_id === d.id).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const parProgramme = programmes
    .map((t) => ({ nom: t.name, code: t.code, n: surPeriode.filter((c) => c.certificate_type_id === t.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const maxDomaine = Math.max(1, ...parDomaine.map((x) => x.n));
  const maxProgramme = Math.max(1, ...parProgramme.map((x) => x.n));

  const recents = [...certs]
    .sort((a, b) => new Date(b.created_at || b.issue_date) - new Date(a.created_at || a.issue_date))
    .slice(0, 6);

  const enAttente = titulaires.filter((u) => u.must_change_password).length;
  const notificationsRatees = (p.db.notifications || []).filter((n) => n.status === "FAILED" || n.status === "PENDING").length;
  const journal = (p.db.audit_logs || []).slice(0, 8);

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Vue d'ensemble</div>
          <h1 style={{ marginTop: 8 }}>Tableau de bord</h1>
          <p>Activité du registre, certifications délivrées et consultations publiques.</p>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="vz-select"
            style={{ width: "auto" }}
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            aria-label="Période observée"
          >
            {PERIODES.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
          </select>
          {peut(p.session, "attribuer_certificats") && (
            <button className="vz-btn vz-btn-accent" onClick={() => p.setModal({ type: "form", c: null })}>
              <IconePlus size={16} />
              Attribuer une certification
            </button>
          )}
        </div>
      </div>

      {(enAttente > 0 || notificationsRatees > 0) && (
        <div className="vz-alert info" style={{ marginBottom: 18 }}>
          <IconeInfo size={17} />
          <span>
            {enAttente > 0 && (
              <>
                {enAttente} certifié{enAttente > 1 ? "s n'ont" : " n'a"} pas encore activé son compte.{" "}
              </>
            )}
            {notificationsRatees > 0 && (
              <>
                {notificationsRatees} notification{notificationsRatees > 1 ? "s" : ""} n'
                {notificationsRatees > 1 ? "ont" : "a"} pas été remise{notificationsRatees > 1 ? "s" : ""}.{" "}
                <button className="vz-linkbtn" style={{ padding: 0 }} onClick={() => p.setPage("notifications")}>
                  Voir le détail
                </button>
              </>
            )}
          </span>
        </div>
      )}

      <div className="vz-grid vz-stats" style={{ marginBottom: 18 }}>
        <Stat
          label="Certifications"
          value={certs.length}
          sub="Délivrées depuis l'ouverture"
          icone={IconeCertificats}
          ton="bleu"
        />
        <Stat
          label={choisie.jours ? "Sur la période" : "Sur l'ensemble"}
          value={surPeriode.length}
          sub={choisie.label.toLowerCase()}
          icone={IconeStats}
          ton="violet"
        />
        <Stat
          label="En vigueur"
          value={par("ACTIVE")}
          sub="Vérifiables publiquement"
          icone={IconeAuthentique}
          ton="vert"
        />
        <Stat
          label="Révoquées"
          value={par("REVOKED")}
          sub="Retirées par VIZDATA"
          icone={IconeRevoquer}
          ton="rouge"
        />
        <Stat
          label="Certifiés"
          value={titulaires.length}
          sub="Titulaires enregistrés"
          icone={IconeCertifies}
          ton="gris"
        />
        <Stat
          label="Nouveaux certifiés"
          value={nouveauxTitulaires}
          sub={choisie.jours ? choisie.label.toLowerCase() : "au total"}
          icone={IconeUtilisateurs}
          ton="gris"
        />
        <Stat
          label="Vérifications"
          value={verifsPeriode}
          sub={choisie.jours ? choisie.label.toLowerCase() : "consultations publiques"}
          icone={IconeVerification}
          ton="orange"
        />
        <Stat
          label="Domaines actifs"
          value={parDomaine.length}
          sub="Ayant délivré sur la période"
          icone={IconeCatalogue}
          ton="gris"
        />
      </div>

      <div className="vz-grid vz-deux">
        <div className="vz-card">
          <div className="vz-card-head">
            <h3>Par domaine</h3>
            <span className="vz-small vz-muted">{choisie.label}</span>
          </div>
          <div className="vz-card-body">
            {parDomaine.length === 0 ? (
              <div className="vz-empty" style={{ padding: "26px 0" }}>Aucune certification délivrée sur cette période.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {parDomaine.map((x) => (
                  <Jauge key={x.nom} nom={x.nom} n={x.n} max={maxDomaine} couleur="var(--bleu)" />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="vz-card">
          <div className="vz-card-head">
            <h3>Par programme</h3>
            <span className="vz-small vz-muted">Les huit premiers</span>
          </div>
          <div className="vz-card-body">
            {parProgramme.length === 0 ? (
              <div className="vz-empty" style={{ padding: "26px 0" }}>Aucune certification délivrée sur cette période.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {parProgramme.map((x) => (
                  <Jauge key={x.code} nom={x.nom} n={x.n} max={maxProgramme} couleur="var(--violet)" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="vz-grid vz-deux" style={{ marginTop: 18 }}>
        <div className="vz-card">
          <div className="vz-card-head">
            <h3>Dernières certifications délivrées</h3>
            <button className="vz-linkbtn" onClick={() => p.setPage("certificates")} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Tout voir <IconeDroite size={14} />
            </button>
          </div>
          {recents.length === 0 ? (
            <Vide icone={IconeCertificats} titre="Aucune certification délivrée">
              Les certifications que vous attribuerez apparaîtront ici, de la plus récente à la plus ancienne.
            </Vide>
          ) : (
            <div className="vz-tablewrap">
              <table className="vz-table">
                <thead><tr><th>Référence</th><th>Certifié</th><th>Statut</th></tr></thead>
                <tbody>
                  {recents.map((c) => {
                    const u = p.userOf(c);
                    return (
                      <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => p.setModal({ type: "detail", c })}>
                        <td className="vz-ref" style={{ color: "var(--bleu)" }}>{c.reference}</td>
                        <td>{u.first_name} {u.last_name}</td>
                        <td><Badge status={effectiveStatus(c)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="vz-card">
          <div className="vz-card-head">
            <h3>Certifications délivrées par mois</h3>
            <span className="vz-small vz-muted">12 derniers mois</span>
          </div>
          <div className="vz-card-body"><BarChart data={monthlySeries(certs, "issue_date")} /></div>
        </div>
      </div>

      <div className="vz-card" style={{ marginTop: 18 }}>
        <div className="vz-card-head">
          <h3>Activité récente</h3>
          <span className="vz-small vz-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconeHistorique size={14} /> Journal des actions
          </span>
        </div>
        {journal.length === 0 ? (
          <Vide icone={IconeHistorique} titre="Le journal est vide">
            Chaque délivrance, révocation ou modification de compte y laisse une trace horodatée.
          </Vide>
        ) : (
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Action</th><th>Objet</th><th>Auteur</th><th>Date</th></tr></thead>
              <tbody>
                {journal.map((l) => (
                  <tr key={l.id}>
                    <td><span className="vz-badge bleu">{libelleAction(l.action)}</span></td>
                    <td className="vz-ref vz-small">{typeof l.metadata === "string" ? l.metadata : ""}</td>
                    <td className="vz-small">{l.actor || nomAuteur(p.db.users, l.actor_id)}</td>
                    <td className="vz-small vz-muted">{fmtShort(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* Le journal stocke des codes : ils sont écrits pour durer, pas pour être lus.
   La table de correspondance les rend en français ; un code inconnu reste
   affiché tel quel plutôt que de disparaître. */
const ACTIONS = {
  CERTIFICATE_ISSUED: "Certification délivrée",
  CERTIFICATE_UPDATED: "Certification modifiée",
  CERTIFICATE_REVOKED: "Certification révoquée",
  CERTIFICATE_RESTORED: "Certification rétablie",
  HOLDER_CREATED: "Titulaire créé",
  HOLDER_UPDATED: "Compte modifié",
  DOMAIN_CREATED: "Domaine créé",
  DOMAIN_UPDATED: "Domaine modifié",
  PROGRAM_CREATED: "Programme créé",
  PROGRAM_UPDATED: "Programme modifié",
  INVITATION_SENT: "Invitation envoyée",
  PASSWORD_RESET: "Mot de passe réinitialisé",
  COHORTE_PUBLISHED: "Cohorte publiée",
};
const libelleAction = (code) => ACTIONS[code] || code;

/** Le registre distant stocke l'identifiant de l'auteur ; le local, son nom. */
function nomAuteur(users, id) {
  const u = (users || []).find((x) => x.id === id);
  return u ? `${u.first_name} ${u.last_name}` : "Inconnu";
}

function Jauge({ nom, n, max, couleur }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5, marginBottom: 7 }}>
        <span style={{ fontWeight: 500 }}>{nom}</span>
        <span className="vz-nums vz-muted" style={{ fontWeight: 600 }}>{n}</span>
      </div>
      <div className="vz-jauge"><div style={{ width: `${(n / max) * 100}%`, background: couleur }} /></div>
    </div>
  );
}

export { AdminDashboard };
