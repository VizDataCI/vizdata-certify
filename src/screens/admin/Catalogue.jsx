/* Domaines et programmes — le catalogue des certifications.
 *
 * Deux niveaux, et pourquoi
 * -------------------------
 * Le registre ne connaissait qu'une liste plate de « types » : EXCEL, PBI,
 * DATA. Or VIZDATA délivre six certifications Excel distinctes — débutant,
 * intermédiaire, avancé, expert, tableaux croisés dynamiques, structuration.
 * Un code par domaine ne pouvait pas les porter.
 *
 *   Domaine   — EXCEL, POWER BI, DATA…
 *   Programme — « Excel — Niveau avancé », avec son code unique et son intitulé
 *               exact, celui qui sera imprimé sur le certificat.
 *
 * Le code du programme entre dans la référence : VIZ-2026-EXCEL-AVA-000001. Il
 * ne doit donc plus changer dès qu'un certificat a été délivré — l'écran le dit
 * plutôt que de l'interdire sans explication.
 *
 * Ajouter un domaine ou un programme ne demande aucune intervention technique :
 * c'est tout l'objet de cet écran.
 */

import { useState } from "react";
import { Field, Modal } from "../../ui/primitives.jsx";
import { IconePlus } from "../../ui/icones.jsx";

const vide = { code: "", name: "", description: "", default_duration: 20, status: "ACTIVE", sort_order: 100 };

function AdminCatalogue(p) {
  const [modal, setModal] = useState(null);
  /* Les erreurs d'écriture sont montrées dans le formulaire qui les provoque,
     pas ici : un message en haut de page pendant qu'une modale est ouverte
     passe inaperçu. */

  const domaines = p.db.domains || [];
  const programmes = p.db.types || [];

  const programmesDe = (domaine) => programmes.filter((t) => t.domain_id === domaine.id);
  const certificatsDe = (programme) => p.db.certificates.filter((c) => c.certificate_type_id === programme.id).length;
  const orphelins = programmes.filter((t) => !domaines.some((d) => d.id === t.domain_id));

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Catalogue</div>
          <h1 style={{ marginTop: 8 }}>Domaines & programmes</h1>
          <p className="vz-small vz-muted" style={{ marginTop: 8, maxWidth: 560, lineHeight: 1.7 }}>
            Un domaine regroupe les programmes d'un même champ de compétence. Chaque programme porte
            l'intitulé exact imprimé sur le certificat, et un code unique qui entre dans la référence.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="vz-btn" onClick={() => setModal({ type: "domaine", valeur: null })}>
            <IconePlus size={16} /> Domaine
          </button>
          <button
            className="vz-btn vz-btn-accent"
            onClick={() => setModal({ type: "programme", valeur: null })}
            disabled={domaines.length === 0}
          >
            <IconePlus size={16} /> Programme
          </button>
        </div>
      </div>


      {domaines.length === 0 && (
        <div className="vz-card">
          <div className="vz-empty">
            Aucun domaine n'est encore défini.<br />
            <span className="vz-small">Commencez par créer un domaine, « Excel » ou « Power BI » par exemple, puis ajoutez-y des programmes.</span>
          </div>
        </div>
      )}

      {domaines.map((d) => {
        const liste = programmesDe(d);
        return (
          <section key={d.id} className="vz-card" style={{ marginBottom: 16 }}>
            <div className="vz-card-head">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 15 }}>{d.name}</h3>
                  <span className="vz-mono vz-small" style={{ color: "var(--violet)" }}>{d.code}</span>
                  {d.status !== "ACTIVE" && <span className="vz-badge gris">Inactif</span>}
                </div>
                {d.description && <p className="vz-small vz-muted" style={{ marginTop: 5 }}>{d.description}</p>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="vz-linkbtn" onClick={() => setModal({ type: "domaine", valeur: d })}>Modifier</button>
                <button className="vz-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => setModal({ type: "programme", valeur: null, domaine: d })}>
                  <IconePlus size={14} /> Programme
                </button>
              </div>
            </div>

            {liste.length === 0 ? (
              <div className="vz-empty" style={{ padding: "28px 20px" }}>
                Ce domaine ne contient encore aucun programme.
              </div>
            ) : (
              <div className="vz-tablewrap">
                <table className="vz-table">
                  <thead>
                    <tr><th>Code</th><th>Intitulé de la certification</th><th>Durée</th><th>Statut</th><th>Délivrés</th><th></th></tr>
                  </thead>
                  <tbody>
                    {liste.map((t) => (
                      <tr key={t.id}>
                        <td className="vz-mono vz-small" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{t.code}</td>
                        <td style={{ fontWeight: 500 }}>
                          {t.name}
                          {t.description && <div className="vz-small vz-muted" style={{ fontWeight: 400, marginTop: 3 }}>{t.description}</div>}
                        </td>
                        <td className="vz-mono vz-small">{t.default_duration} h</td>
                        <td>{t.status === "ACTIVE" ? <span className="vz-badge vert">Actif</span> : <span className="vz-badge gris">Inactif</span>}</td>
                        <td className="vz-mono vz-small">{certificatsDe(t)}</td>
                        <td>
                          <div className="vz-rowactions">
                            <button className="vz-linkbtn" onClick={() => setModal({ type: "programme", valeur: t })}>Modifier</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {/* Un programme peut se retrouver sans domaine après une migration : il
          doit rester visible et reclassable, pas disparaître de l'écran. */}
      {orphelins.length > 0 && (
        <section className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Programmes sans domaine</h3></div>
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Code</th><th>Intitulé</th><th>Délivrés</th><th></th></tr></thead>
              <tbody>
                {orphelins.map((t) => (
                  <tr key={t.id}>
                    <td className="vz-mono vz-small">{t.code}</td>
                    <td>{t.name}</td>
                    <td className="vz-mono vz-small">{certificatsDe(t)}</td>
                    <td><div className="vz-rowactions"><button className="vz-linkbtn" onClick={() => setModal({ type: "programme", valeur: t })}>Rattacher</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modal?.type === "domaine" && (
        <FormulaireDomaine {...p} domaine={modal.valeur} onClose={() => setModal(null)} />
      )}
      {modal?.type === "programme" && (
        <FormulaireProgramme {...p} programme={modal.valeur} domaineParDefaut={modal.domaine} onClose={() => setModal(null)} />
      )}
    </>
  );
}

/* --- domaine -------------------------------------------------------------- */

function FormulaireDomaine({ domaine, onClose, ...p }) {
  const nouveau = !domaine;
  const [f, setF] = useState(() => (domaine ? { ...domaine } : { ...vide, sort_order: ((p.db.domains || []).length + 1) * 10 }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const enregistrer = async () => {
    if (busy) return;
    const code = f.code.trim().toUpperCase();
    if (!code || !f.name.trim()) { setErr("Le code et le nom du domaine sont obligatoires."); return; }
    if (!/^[A-Z0-9-]+$/.test(code)) { setErr("Le code ne peut contenir que des lettres sans accent, des chiffres et des tirets."); return; }
    if ((p.db.domains || []).some((d) => d.code === code && d.id !== domaine?.id)) {
      setErr("Ce code de domaine existe déjà.");
      return;
    }

    const champs = {
      code,
      name: f.name.trim(),
      description: f.description || "",
      status: f.status,
      sort_order: Number(f.sort_order) || 100,
    };

    setBusy(true);
    setErr("");
    try {
      if (nouveau) await p.actions.ajouterDomaine(champs);
      else await p.actions.majDomaine(domaine.id, champs);
      p.notify(nouveau ? "Domaine créé." : "Domaine mis à jour.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={nouveau ? "Nouveau domaine" : `Domaine : ${domaine.name}`}
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={enregistrer} disabled={busy}>
            {busy ? "Enregistrement…" : nouveau ? "Créer le domaine" : "Enregistrer"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="vz-form-grid">
        <Field label="Code" hint="Sans espace ni accent. Il identifie le domaine.">
          <input className="vz-input vz-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EXCEL" />
        </Field>
        <Field label="Nom du domaine">
          <input className="vz-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Excel" />
        </Field>
        <Field label="Ordre d'affichage" hint="Les petits nombres passent devant.">
          <input className="vz-input" type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
        </Field>
        <Field label="Statut">
          <select className="vz-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="ACTIVE">Actif</option>
            <option value="INACTIVE">Inactif</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Description">
          <input className="vz-input" value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Tableur, analyse et structuration des données." />
        </Field>
      </div>
    </Modal>
  );
}

/* --- programme ------------------------------------------------------------ */

function FormulaireProgramme({ programme, domaineParDefaut, onClose, ...p }) {
  const nouveau = !programme;
  const domaines = p.db.domains || [];
  const modeles = p.db.templates || [];

  const [f, setF] = useState(() =>
    programme
      ? { ...programme }
      : {
          ...vide,
          domain_id: domaineParDefaut?.id ?? domaines[0]?.id ?? null,
          template_id: modeles[0]?.id ?? null,
          sort_order: 100,
        }
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const delivres = programme ? p.db.certificates.filter((c) => c.certificate_type_id === programme.id).length : 0;

  const enregistrer = async () => {
    if (busy) return;
    const code = f.code.trim().toUpperCase();
    if (!code || !f.name.trim()) { setErr("Le code et l'intitulé sont obligatoires."); return; }
    if (!/^[A-Z0-9-]+$/.test(code)) { setErr("Le code ne peut contenir que des lettres sans accent, des chiffres et des tirets."); return; }
    if (!f.domain_id) { setErr("Choisissez le domaine du programme."); return; }
    if ((p.db.types || []).some((t) => t.code === code && t.id !== programme?.id)) {
      setErr("Ce code de programme existe déjà.");
      return;
    }

    const champs = {
      domain_id: f.domain_id,
      template_id: f.template_id || null,
      code,
      name: f.name.trim(),
      description: f.description || "",
      default_duration: Number(f.default_duration) || 20,
      /* La validité n'est plus appliquée : les certificats délivrés depuis la
         refonte sont sans expiration. La colonne reste pour les anciens. */
      validity_period: null,
      status: f.status,
      sort_order: Number(f.sort_order) || 100,
    };

    setBusy(true);
    setErr("");
    try {
      if (nouveau) await p.actions.ajouterProgramme(champs);
      else await p.actions.majProgramme(programme.id, champs);
      p.notify(nouveau ? "Programme créé." : "Programme mis à jour.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={nouveau ? "Nouveau programme de certification" : `Programme : ${programme.name}`}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={enregistrer} disabled={busy}>
            {busy ? "Enregistrement…" : nouveau ? "Créer le programme" : "Enregistrer"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      {delivres > 0 && (
        <div className="vz-alert warn" style={{ marginBottom: 16 }}>
          {delivres} certificat{delivres > 1 ? "s ont" : " a"} déjà été délivré{delivres > 1 ? "s" : ""} sous ce programme.
          Le code entre dans leur référence : le modifier maintenant désaccorderait les références déjà imprimées.
        </div>
      )}
      <div className="vz-form-grid">
        <Field label="Domaine">
          <select className="vz-select" value={f.domain_id ?? ""} onChange={(e) => setF({ ...f, domain_id: domaines.find((d) => String(d.id) === e.target.value)?.id ?? null })}>
            <option value="">Choisir un domaine</option>
            {domaines.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </Field>
        <Field label="Code unique" hint="Entre dans la référence : VIZ-2026-CODE-000001">
          <input className="vz-input vz-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EXCEL-AVA" />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Intitulé exact de la certification" hint="Tel qu'il sera imprimé sur le certificat.">
          <input className="vz-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Excel : Niveau avancé" />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Description" hint="Une phrase, affichée sur le certificat et sur la page de vérification.">
          <input className="vz-input" value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Fonctions imbriquées, bases de données, consolidation et automatisation." />
        </Field>
      </div>
      <div className="vz-form-grid" style={{ marginTop: 14 }}>
        <Field label="Durée par défaut (heures)">
          <input className="vz-input" type="number" min="1" value={f.default_duration} onChange={(e) => setF({ ...f, default_duration: e.target.value })} />
        </Field>
        <Field label="Modèle de certificat">
          <select className="vz-select" value={f.template_id ?? ""} onChange={(e) => setF({ ...f, template_id: modeles.find((m) => String(m.id) === e.target.value)?.id ?? null })}>
            {modeles.length === 0 && <option value="">Modèle officiel VIZDATA</option>}
            {modeles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Ordre d'affichage">
          <input className="vz-input" type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
        </Field>
        <Field label="Statut" hint="Un programme inactif n'est plus proposé à l'attribution.">
          <select className="vz-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="ACTIVE">Actif</option>
            <option value="INACTIVE">Inactif</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export { AdminCatalogue };
