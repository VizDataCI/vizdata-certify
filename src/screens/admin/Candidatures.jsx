/* Suivi des candidatures à l'académie.
 *
 * Le tableau de suivi demandé : une ligne par candidature, un statut qui
 * avance de « Nouveau » à « Inscrit », et un export pour travailler hors de
 * l'écran. Rien n'est affiché publiquement — cet écran vit derrière
 * l'authentification, et la table est fermée par la politique
 * `candidatures_admin_all`.
 *
 * L'écran charge ses propres données plutôt que de passer par le registre des
 * certificats : les candidatures n'ont rien à voir avec les certificats, et
 * les mêler ferait grossir un chargement déjà large pour les écrans qui n'en
 * ont pas besoin.
 */

import { useEffect, useMemo, useState } from "react";
import * as academie from "../../academie/api.js";
import {
  FORMULE_LABEL, FORMULES, NIVEAUX, NIVEAU_LABEL, STATUTS, STATUT_META,
  nomFichierExport, parStatut, versCsv,
} from "../../academie/candidature.js";
import { telecharger } from "../../academie/telechargement.js";
import { fmtShort } from "../../lib/dates.js";
import { Modal } from "../../ui/primitives.jsx";

/** Pastille de statut, aux couleurs des badges du registre. */
const Pastille = ({ statut }) => {
  const m = STATUT_META[statut];
  return <span className={"vz-badge " + (m?.tone || "gris")}>{m?.label || statut}</span>;
};

/** Ligne d'une fiche : intitulé à gauche, valeur à droite. */
const Ligne = ({ cle, children }) => (
  <div className="vz-dl-row">
    <dt>{cle}</dt>
    <dd>{children}</dd>
  </div>
);

function AdminCandidatures(p) {
  /* `null` signifie « chargement en cours ». En mode démonstration il n'y a
     rien à charger : la liste part vide, et l'écran le dit tout de suite. */
  const [lignes, setLignes] = useState(academie.estBranchee ? null : []);
  const [cohortes, setCohortes] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [fCohorte, setFCohorte] = useState("");
  const [fFormule, setFFormule] = useState("");
  const [ouverte, setOuverte] = useState(null);

  useEffect(() => {
    if (!academie.estBranchee) return;
    let vivant = true;
    Promise.all([academie.listerCandidatures(), academie.listerCohortes()])
      .then(([c, co]) => { if (vivant) { setLignes(c); setCohortes(co); } })
      .catch((e) => { if (vivant) { setErr(e.message); setLignes([]); } });
    return () => { vivant = false; };
  }, []);

  const libelleCohorte = useMemo(() => {
    const index = new Map(cohortes.map((c) => [c.id, c.libelle]));
    return (id) => (id ? index.get(id) || "Cohorte inconnue" : "Aucune cohorte");
  }, [cohortes]);

  const filtrees = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return (lignes || []).filter((l) => {
      if (fStatut && l.statut !== fStatut) return false;
      if (fCohorte && l.cohorte_id !== fCohorte) return false;
      if (fFormule && l.formule !== fFormule) return false;
      if (!terme) return true;
      return `${l.reference} ${l.nom} ${l.email} ${l.whatsapp} ${l.profession} ${l.entreprise}`
        .toLowerCase()
        .includes(terme);
    });
  }, [lignes, q, fStatut, fCohorte, fFormule]);

  const compte = parStatut(lignes || []);

  /** Modifie une candidature en base, puis reflète la réponse à l'écran.
      L'ordre compte : si la base refuse, l'écran ne doit pas montrer un
      changement qui n'a pas eu lieu. */
  const modifier = async (id, champs) => {
    try {
      await academie.majCandidature(id, champs);
      setLignes((xs) => xs.map((x) => (x.id === id ? { ...x, ...champs } : x)));
      setOuverte((o) => (o && o.id === id ? { ...o, ...champs } : o));
      p.notify("Candidature mise à jour.");
    } catch (e) {
      p.notify(e.message);
    }
  };

  const exporter = () => {
    if (!filtrees.length) { p.notify("Aucune candidature à exporter."); return; }
    telecharger(nomFichierExport(), versCsv(filtrees, { libelleCohorte }));
    p.notify(`${filtrees.length} candidature${filtrees.length > 1 ? "s" : ""} exportée${filtrees.length > 1 ? "s" : ""}.`);
  };

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Académie Citizen Data Analyst</div>
          <h1 style={{ marginTop: 8 }}>Candidatures</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="vz-btn" onClick={exporter}>Exporter ({filtrees.length})</button>
          <button className="vz-btn vz-btn-primary" onClick={() => p.setPage("cohortes")}>Cohortes</button>
        </div>
      </div>

      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}

      {!academie.estBranchee && (
        <div className="vz-alert warn" style={{ marginBottom: 14 }}>
          Les candidatures vivent dans le registre du serveur : cet écran reste vide en mode démonstration.
        </div>
      )}

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        {STATUTS.map((s) => (
          <div className="vz-stat" key={s.cle}>
            <div className="vz-eyebrow">{s.label}</div>
            <div className="vz-stat-val">{compte[s.cle]}</div>
            <div className="vz-stat-sub">
              {s.cle === "INSCRIT" ? "Inscriptions confirmées" : s.cle === "NOUVEAU" ? "À contacter" : " "}
            </div>
          </div>
        ))}
      </div>

      <div className="vz-card">
        <div className="vz-card-head" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="vz-input" style={{ maxWidth: 330 }} placeholder="Rechercher : nom, e-mail, WhatsApp, référence"
                 value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="vz-select" style={{ width: "auto" }} value={fStatut} onChange={(e) => setFStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
            </select>
            <select className="vz-select" style={{ width: "auto" }} value={fCohorte} onChange={(e) => setFCohorte(e.target.value)}>
              <option value="">Toutes les cohortes</option>
              {cohortes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
            <select className="vz-select" style={{ width: "auto" }} value={fFormule} onChange={(e) => setFFormule(e.target.value)}>
              <option value="">Toutes les formules</option>
              {FORMULES.map((f) => <option key={f.cle} value={f.cle}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr>
                <th>Référence</th><th>Reçue le</th><th>Candidat</th><th>Contact</th>
                <th>Profession</th><th>Niveau</th><th>Formule</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((l) => (
                <tr key={l.id}>
                  <td className="vz-ref" style={{ color: "var(--bleu)", whiteSpace: "nowrap" }}>{l.reference}</td>
                  <td className="vz-mono vz-small" style={{ whiteSpace: "nowrap" }}>{fmtShort(l.created_at)}</td>
                  <td style={{ fontWeight: 500 }}>{l.nom}</td>
                  <td className="vz-small">
                    <a href={`https://wa.me/${l.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{l.whatsapp}</a>
                    <div className="vz-muted" style={{ wordBreak: "break-all" }}>{l.email}</div>
                  </td>
                  <td className="vz-small">
                    {l.profession}
                    {l.entreprise && <div className="vz-muted">{l.entreprise}</div>}
                  </td>
                  <td className="vz-small">{NIVEAU_LABEL[l.niveau] || l.niveau}</td>
                  <td className="vz-small">{FORMULE_LABEL[l.formule] || l.formule}</td>
                  <td>
                    <select className="vz-select" style={{ width: "auto", height: 29, fontSize: 12 }}
                            value={l.statut} onChange={(e) => modifier(l.id, { statut: e.target.value })}
                            aria-label={`Statut de ${l.reference}`}>
                      {STATUTS.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="vz-rowactions">
                      <button className="vz-linkbtn" onClick={() => setOuverte(l)}>Voir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lignes === null && <div className="vz-empty">Chargement des candidatures…</div>}
        {lignes !== null && filtrees.length === 0 && (
          <div className="vz-empty">
            {lignes.length === 0
              ? "Aucune candidature pour l'instant. La page /academie en enregistre dès sa mise en ligne."
              : "Aucune candidature ne correspond à ces filtres."}
          </div>
        )}
      </div>

      <p className="vz-small vz-muted" style={{ marginTop: 10 }}>
        {filtrees.length} résultat{filtrees.length > 1 ? "s" : ""} sur {(lignes || []).length} candidature{(lignes || []).length > 1 ? "s" : ""}.
        L'export reprend exactement les lignes filtrées, au format CSV point-virgule lisible par Excel.
      </p>

      {ouverte && (
        <DetailCandidature
          c={ouverte}
          cohorte={libelleCohorte(ouverte.cohorte_id)}
          onFermer={() => setOuverte(null)}
          onModifier={modifier}
        />
      )}
    </>
  );
}

/** Fiche d'une candidature : tout ce qui n'entre pas dans une ligne de tableau. */
function DetailCandidature({ c, cohorte, onFermer, onModifier }) {
  const [notes, setNotes] = useState(c.notes || "");
  const modifiees = notes !== (c.notes || "");

  return (
    <Modal title={`Candidature ${c.reference}`} onClose={onFermer} wide
           foot={
             <>
               <button className="vz-btn" onClick={onFermer}>Fermer</button>
               <button className="vz-btn vz-btn-primary" disabled={!modifiees}
                       onClick={() => onModifier(c.id, { notes })}>
                 Enregistrer les notes
               </button>
             </>
           }>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 18 }}>{c.nom}</h3>
        <Pastille statut={c.statut} />
      </div>

      <dl className="vz-dl" style={{ border: "1px solid var(--trait)", borderRadius: 8, overflow: "hidden" }}>
        <Ligne cle="Reçue le">{fmtShort(c.created_at)}</Ligne>
        <Ligne cle="Cohorte">{cohorte}</Ligne>
        <Ligne cle="WhatsApp">
          <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a>
        </Ligne>
        <Ligne cle="E-mail"><a href={`mailto:${c.email}`}>{c.email}</a></Ligne>
        <Ligne cle="Profession">{c.profession}</Ligne>
        <Ligne cle="Entreprise">{c.entreprise || "Non renseignée"}</Ligne>
        <Ligne cle="Niveau Excel">{NIVEAU_LABEL[c.niveau] || c.niveau}</Ligne>
        <Ligne cle="Formule retenue">{FORMULE_LABEL[c.formule] || c.formule}</Ligne>
        <Ligne cle="Origine">{c.source}</Ligne>
      </dl>

      {c.motivation && (
        <>
          <div className="vz-eyebrow" style={{ margin: "18px 0 7px" }}>Motivation du candidat</div>
          <p style={{ whiteSpace: "pre-wrap", background: "var(--surface)", border: "1px solid var(--trait)", borderRadius: 8, padding: "12px 14px", fontSize: 13.5 }}>
            {c.motivation}
          </p>
        </>
      )}

      <div className="vz-eyebrow" style={{ margin: "18px 0 7px" }}>Statut du dossier</div>
      <select className="vz-select" value={c.statut} onChange={(e) => onModifier(c.id, { statut: e.target.value })}>
        {STATUTS.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
      </select>

      <div className="vz-eyebrow" style={{ margin: "18px 0 7px" }}>Notes internes</div>
      <textarea className="vz-textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Appelée le 12/11, demande les échéances du paiement en deux fois." />
      <p className="vz-small vz-muted" style={{ marginTop: 8 }}>
        Ces notes ne sortent jamais de cet écran : elles ne figurent ni dans l'accusé de
        réception, ni sur la page publique. Elles sont reprises dans l'export.
      </p>

      <div className="vz-eyebrow" style={{ margin: "18px 0 7px" }}>Niveaux déclarés</div>
      <p className="vz-small vz-muted">
        {NIVEAUX.find((n) => n.cle === c.niveau)?.aide || "Niveau non précisé"}
      </p>
    </Modal>
  );
}

export { AdminCandidatures };
