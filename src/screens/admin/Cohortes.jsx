/* Cohortes trimestrielles de l'académie.
 *
 * Cet écran existe pour que la page de vente n'ait jamais à être modifiée pour
 * annoncer une session. Les dates, le lieu, le nombre de places et les deux
 * tarifs se saisissent ici ; `cohorte_publique()` les expose, et la page les
 * affiche.
 *
 * Une cohorte se prépare en brouillon, puis se publie. Publier dépublie les
 * autres : la page n'annonce qu'une session à la fois, et l'intention doit
 * être lisible plutôt que déduite d'un tri par date.
 */

import { useEffect, useMemo, useState } from "react";
import * as academie from "../../academie/api.js";
import { montant } from "../../academie/candidature.js";
import { fmtShort } from "../../lib/dates.js";
import { IconeCandidatures, IconePlus } from "../../ui/icones.jsx";
import { Field, Modal } from "../../ui/primitives.jsx";

const STATUTS_COHORTE = [
  { cle: "BROUILLON", label: "Brouillon", tone: "gris" },
  { cle: "OUVERTE", label: "Ouverte aux candidatures", tone: "vert" },
  { cle: "COMPLETE", label: "Complète", tone: "orange" },
  { cle: "CLOTUREE", label: "Clôturée", tone: "gris" },
];

const META = Object.fromEntries(STATUTS_COHORTE.map((s) => [s.cle, s]));

/** Cohorte vierge. Aucune date par défaut : elles viennent de VIZDATA. */
const NEUVE = {
  libelle: "",
  date_debut: "",
  date_fin: "",
  lieu: "Abidjan, Côte d'Ivoire",
  places: "",
  tarif_integral: 500000,
  tarif_echelonne: 600000,
  statut: "BROUILLON",
  note_publique: "",
};

function AdminCohortes(p) {
  const [cohortes, setCohortes] = useState(academie.estBranchee ? null : []);
  const [candidatures, setCandidatures] = useState([]);
  const [err, setErr] = useState("");
  const [edition, setEdition] = useState(null);

  const charger = () =>
    Promise.all([academie.listerCohortes(), academie.listerCandidatures()])
      .then(([co, ca]) => { setCohortes(co); setCandidatures(ca); })
      .catch((e) => { setErr(e.message); setCohortes([]); });

  useEffect(() => {
    if (!academie.estBranchee) return;
    charger();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* Les compteurs se déduisent des candidatures, jamais d'un champ tenu à
     jour à la main : un compteur stocké finit toujours par mentir. */
  const compteurs = useMemo(() => {
    const index = new Map();
    for (const c of candidatures) {
      const e = index.get(c.cohorte_id) || { total: 0, inscrits: 0 };
      e.total += 1;
      if (c.statut === "INSCRIT") e.inscrits += 1;
      index.set(c.cohorte_id, e);
    }
    return index;
  }, [candidatures]);

  const agir = async (action, message) => {
    try {
      await action();
      await charger();
      p.notify(message);
    } catch (e) {
      p.notify(e.message);
    }
  };

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Académie Citizen Data Analyst</div>
          <h1 style={{ marginTop: 8 }}>Cohortes</h1>
          <p>Les sessions annoncées sur la page de l'académie : dates, places et tarifs.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="vz-btn" onClick={() => p.setPage("candidatures")}>
            <IconeCandidatures size={16} /> Candidatures
          </button>
          <button className="vz-btn vz-btn-accent" disabled={!academie.estBranchee}
                  onClick={() => setEdition({ ...NEUVE })}>
            <IconePlus size={16} /> Nouvelle cohorte
          </button>
        </div>
      </div>

      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}

      {!academie.estBranchee ? (
        <div className="vz-alert warn">
          Les cohortes vivent dans le registre du serveur : cet écran reste vide en mode démonstration.
        </div>
      ) : (
        <div className="vz-alert info" style={{ marginBottom: 14 }}>
          La page <strong>/academie</strong> affiche la cohorte publiée : ses dates, son lieu, ses
          places restantes et ses deux tarifs. Sans cohorte publiée, elle annonce le programme
          sans date et invite à écrire sur WhatsApp.
        </div>
      )}

      <div className="vz-card">
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr>
                <th>Cohorte</th><th>Dates</th><th>Lieu</th><th>Places</th>
                <th>Tarifs</th><th>Candidatures</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(cohortes || []).map((c) => {
                const n = compteurs.get(c.id) || { total: 0, inscrits: 0 };
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>
                      {c.libelle}
                      {c.publiee && <span className="vz-chip" style={{ marginLeft: 8, color: "var(--vert)", borderColor: "#BFE0D1" }}>publiée</span>}
                    </td>
                    <td className="vz-mono vz-small" style={{ whiteSpace: "nowrap" }}>
                      {c.date_debut ? fmtShort(c.date_debut) : "Non datée"}
                      {c.date_fin ? ` → ${fmtShort(c.date_fin)}` : ""}
                    </td>
                    <td className="vz-small">{c.lieu}</td>
                    <td className="vz-small">
                      {c.places ? `${n.inscrits} / ${c.places}` : `${n.inscrits} inscrit${n.inscrits > 1 ? "s" : ""}`}
                    </td>
                    <td className="vz-small" style={{ whiteSpace: "nowrap" }}>
                      {montant(c.tarif_integral)}
                      <div className="vz-muted">{montant(c.tarif_echelonne)} en 2 fois</div>
                    </td>
                    <td className="vz-small">{n.total}</td>
                    <td><span className={"vz-badge " + (META[c.statut]?.tone || "gris")}>{META[c.statut]?.label || c.statut}</span></td>
                    <td>
                      <div className="vz-rowactions">
                        <button className="vz-linkbtn" onClick={() => setEdition(c)}>Modifier</button>
                        {!c.publiee && (
                          <button className="vz-linkbtn" onClick={() => agir(() => academie.publierCohorte(c.id), `${c.libelle} est désormais la cohorte annoncée sur la page.`)}>
                            Publier
                          </button>
                        )}
                        {c.publiee && (
                          <button className="vz-linkbtn" onClick={() => agir(() => academie.enregistrerCohorte({ id: c.id, publiee: false }), `${c.libelle} n'est plus annoncée.`)}>
                            Dépublier
                          </button>
                        )}
                        {n.total === 0 && (
                          <button className="vz-linkbtn danger" onClick={() => agir(() => academie.supprimerCohorte(c.id), "Cohorte supprimée.")}>
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cohortes === null && <div className="vz-empty">Chargement des cohortes…</div>}
        {cohortes !== null && cohortes.length === 0 && (
          <div className="vz-empty">
            Aucune cohorte. Créez la première session pour annoncer ses dates et ses tarifs sur la page de vente.
          </div>
        )}
      </div>

      {edition && (
        <FormulaireCohorte
          cohorte={edition}
          onFermer={() => setEdition(null)}
          onEnregistrer={async (champs) => {
            await agir(() => academie.enregistrerCohorte(champs), champs.id ? "Cohorte mise à jour." : "Cohorte créée.");
            setEdition(null);
          }}
        />
      )}
    </>
  );
}

function FormulaireCohorte({ cohorte, onFermer, onEnregistrer }) {
  const [v, setV] = useState({
    ...NEUVE,
    ...cohorte,
    date_debut: cohorte.date_debut || "",
    date_fin: cohorte.date_fin || "",
    places: cohorte.places ?? "",
    note_publique: cohorte.note_publique || "",
  });
  const [envoi, setEnvoi] = useState(false);
  const champ = (cle) => (e) => setV((x) => ({ ...x, [cle]: e.target.value }));

  const valide =
    v.libelle.trim().length >= 3 &&
    Number(v.tarif_integral) > 0 &&
    Number(v.tarif_echelonne) > 0 &&
    (!v.date_debut || !v.date_fin || v.date_fin >= v.date_debut);

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      await onEnregistrer({
        ...(cohorte.id ? { id: cohorte.id } : {}),
        libelle: v.libelle.trim(),
        /* Une date vide doit devenir null, pas une chaîne vide : Postgres
           refuse '' pour une colonne date. */
        date_debut: v.date_debut || null,
        date_fin: v.date_fin || null,
        lieu: v.lieu.trim(),
        places: v.places === "" ? null : Number(v.places),
        tarif_integral: Number(v.tarif_integral),
        tarif_echelonne: Number(v.tarif_echelonne),
        statut: v.statut,
        note_publique: v.note_publique.trim(),
      });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal title={cohorte.id ? `Cohorte ${cohorte.libelle}` : "Nouvelle cohorte"} onClose={onFermer}
           foot={
             <>
               <button className="vz-btn" onClick={onFermer}>Annuler</button>
               <button className="vz-btn vz-btn-primary" disabled={!valide || envoi} onClick={enregistrer}>
                 {envoi ? "Enregistrement…" : "Enregistrer"}
               </button>
             </>
           }>
      <div className="vz-form-grid">
        <Field label="Libellé" hint="Tel qu'il s'affiche sur la page : « Cohorte T1 2027 ».">
          <input className="vz-input" value={v.libelle} onChange={champ("libelle")} placeholder="Cohorte T1 2027" />
        </Field>
        <Field label="Lieu">
          <input className="vz-input" value={v.lieu} onChange={champ("lieu")} />
        </Field>
        <Field label="Date de début" hint="Laissez vide si elle n'est pas arrêtée.">
          <input className="vz-input" type="date" value={v.date_debut} onChange={champ("date_debut")} />
        </Field>
        <Field label="Date de fin">
          <input className="vz-input" type="date" value={v.date_fin} onChange={champ("date_fin")} />
        </Field>
        <Field label="Nombre de places" hint="Vide = non communiqué sur la page.">
          <input className="vz-input" type="number" min="1" value={v.places} onChange={champ("places")} placeholder="20" />
        </Field>
        <Field label="Statut">
          <select className="vz-select" value={v.statut} onChange={champ("statut")}>
            {STATUTS_COHORTE.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Tarif en paiement intégral (FCFA)">
          <input className="vz-input" type="number" min="1" step="1000" value={v.tarif_integral} onChange={champ("tarif_integral")} />
        </Field>
        <Field label="Tarif en deux versements (FCFA)" hint={`Soit ${montant(Number(v.tarif_echelonne || 0) / 2)} par versement.`}>
          <input className="vz-input" type="number" min="1" step="1000" value={v.tarif_echelonne} onChange={champ("tarif_echelonne")} />
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label="Note affichée sur la page" hint="Courte, affichée dans le bandeau. Laissez vide s'il n'y a rien à préciser.">
          <input className="vz-input" value={v.note_publique} onChange={champ("note_publique")}
                 placeholder="Clôture des candidatures le 15 janvier" />
        </Field>
      </div>

      {Number(v.tarif_echelonne) <= Number(v.tarif_integral) && (
        <div className="vz-alert warn" style={{ marginTop: 14 }}>
          Le paiement échelonné n'est pas plus élevé que le paiement intégral : la page
          n'affichera aucune économie pour le règlement en une fois.
        </div>
      )}
      {v.date_debut && v.date_fin && v.date_fin < v.date_debut && (
        <div className="vz-alert err" style={{ marginTop: 14 }}>
          La date de fin précède la date de début.
        </div>
      )}
    </Modal>
  );
}

export { AdminCohortes };
