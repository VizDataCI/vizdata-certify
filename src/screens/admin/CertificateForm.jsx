/* Attribution d'une certification — et modification d'un certificat délivré.
 *
 * Un certificat ne peut jamais exister sans titulaire : c'est la première
 * règle, et elle est tenue par la base, où `certificates.user_id` est NOT NULL
 * et référence `users(id)`. L'écran commence donc par le titulaire, et non par
 * la certification.
 *
 * Deux façons de le désigner, et une seule contrainte
 * --------------------------------------------------
 * On cherche d'abord parmi les titulaires enregistrés — par nom ou par
 * adresse. S'il n'existe pas, on le crée ici même, sans quitter le formulaire :
 * son compte d'accès est ouvert et son invitation partie avant que la
 * certification ne lui soit attribuée. L'ancien écran demandait d'aller créer
 * le compte dans la console Supabase puis de revenir, ce qui faisait de
 * l'attribution une opération en deux visites.
 *
 * Si l'adresse est déjà connue, le compte existant est réutilisé : un même
 * titulaire reçoit plusieurs certifications au cours de son parcours, et un
 * doublon lui donnerait un second espace, vide.
 *
 * Ni expiration ni score
 * ----------------------
 * Les deux champs ont disparu du formulaire. Pour un certificat ancien qui en
 * porte, ils restent affichés en lecture seule, comme une mention d'archive :
 * on ne réécrit pas ce qui a été délivré.
 */

import { useState } from "react";
import { SKILLS } from "../../data/seed.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { Field, Modal } from "../../ui/primitives.jsx";

function CertificateForm({ cert, titulaire: titulaireImpose, onClose, ...p }) {
  const nouveau = !cert;
  const programmes = (p.db.types || []).filter((t) => t.status !== "INACTIVE" || !nouveau);
  const domaines = p.db.domains || [];
  const competences = p.db.skills?.length ? p.db.skills : SKILLS;

  /* --- titulaire -------------------------------------------------------- */
  const titulaireInitial = cert ? p.userOf(cert) : titulaireImpose || null;
  const [titulaire, setTitulaire] = useState(titulaireInitial);
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(null);

  /* --- programme -------------------------------------------------------- */
  const programmeInitial = cert ? p.typeOf(cert) : null;
  const [domaineId, setDomaineId] = useState(
    () => programmeInitial?.domain_id ?? domaines[0]?.id ?? null
  );
  const [programmeId, setProgrammeId] = useState(() => programmeInitial?.id ?? null);

  /* Ces deux listes se recalculent à chaque frappe, et c'est sans conséquence :
     un catalogue de certifications se compte en dizaines d'entrées. Les
     mémoriser coûterait plus en complexité qu'en cycles. */
  const programmesDuDomaine = programmes.filter((t) => t.domain_id === domaineId);
  const programme = programmes.find((t) => t.id === programmeId) || null;

  /* --- reste du certificat ---------------------------------------------- */
  const [f, setF] = useState(() => ({
    issue_date: cert?.issue_date || new Date().toISOString().slice(0, 10),
    duration: cert?.duration ?? "",
    trainer: cert?.trainer || "Fabrice BOH",
    signatory: cert?.signatory || "Direction VIZDATA",
    skills: cert?.skills || [],
  }));
  const [avertir, setAvertir] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /* Deux caractères au minimum : au premier, la liste entière remonterait et
     n'aiderait personne à choisir. */
  const resultats = (() => {
    const q = recherche.trim().toLowerCase();
    if (q.length < 2) return [];
    return (p.db.users || [])
      .filter((u) => u.role === "CERTIFIED" && u.account_status !== "DISABLED")
      .filter((u) => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  })();

  const choisirProgramme = (id) => {
    const t = programmes.find((x) => String(x.id) === String(id));
    setProgrammeId(t?.id ?? null);
    /* La durée suit le programme choisi, sauf si elle a été saisie à la main. */
    if (t && (f.duration === "" || f.duration === programme?.default_duration)) {
      setF((v) => ({ ...v, duration: t.default_duration }));
    }
  };

  const choisirDomaine = (id) => {
    const d = domaines.find((x) => String(x.id) === String(id));
    setDomaineId(d?.id ?? null);
    const premier = programmes.find((t) => t.domain_id === d?.id);
    setProgrammeId(premier?.id ?? null);
    if (premier) setF((v) => ({ ...v, duration: premier.default_duration }));
  };

  const basculerCompetence = (id) =>
    setF((v) => ({ ...v, skills: v.skills.includes(id) ? v.skills.filter((s) => s !== id) : [...v.skills, id] }));

  /* --- création d'un titulaire depuis le formulaire --------------------- */
  const creerTitulaire = async () => {
    const c = creation;
    if (!c.first_name.trim() || !c.last_name.trim()) { setErr("Le prénom et le nom sont obligatoires."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) { setErr("L'adresse e-mail n'est pas valide."); return; }

    setBusy(true);
    setErr("");
    try {
      const r = await p.actions.inviterTitulaire({
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
      });
      setTitulaire(r.titulaire);
      setCreation(null);
      setRecherche("");
      p.notify(
        r.existe
          ? "Ce titulaire était déjà enregistré : son compte existant est réutilisé."
          : r.invitation_envoyee
          ? "Titulaire créé. Son invitation vient de partir."
          : "Titulaire créé. L'invitation n'a pas pu être envoyée — il pourra passer par « mot de passe oublié »."
      );
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  /* --- enregistrement --------------------------------------------------- */
  const enregistrer = async () => {
    if (busy) return;
    if (!titulaire) { setErr("Choisissez le certifié à qui attribuer cette certification."); return; }
    if (!programme) { setErr("Choisissez le programme de certification."); return; }
    if (!f.issue_date) { setErr("La date de délivrance est obligatoire."); return; }

    const champs = {
      user_id: titulaire.id,
      certificate_type_id: programme.id,
      issue_date: f.issue_date,
      duration: Number(f.duration) || programme.default_duration,
      trainer: f.trainer,
      signatory: f.signatory,
    };

    setBusy(true);
    setErr("");
    try {
      await p.actions.enregistrerCertificat({
        id: nouveau ? null : cert.id,
        programme,
        champs: nouveau ? champs : { ...champs, reference: cert.reference },
        skillIds: f.skills,
        notifier: nouveau && avertir,
      });
      p.notify(nouveau ? "Certification attribuée. Référence et QR code générés." : "Certificat mis à jour.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const peutAttribuer = peut(p.session, "attribuer_certificats");

  return (
    <Modal
      title={nouveau ? "Attribuer une certification" : `Modifier — ${cert.reference}`}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={enregistrer} disabled={busy || !peutAttribuer}>
            {busy ? "Enregistrement…" : nouveau ? "Attribuer la certification" : "Enregistrer"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      {!peutAttribuer && (
        <div className="vz-alert warn" style={{ marginBottom: 14 }}>
          Votre compte n'a pas l'autorisation d'attribuer des certifications.
        </div>
      )}

      {/* --- 1. le certifié ------------------------------------------------ */}
      <section className="vz-etape">
        <div className="vz-etape-tete">
          <span className="vz-etape-num">1</span>
          <div>
            <div className="vz-label">Certifié</div>
            <div className="vz-small vz-muted">À qui cette certification est-elle délivrée ?</div>
          </div>
        </div>

        {titulaire ? (
          <div className="vz-choix">
            <div>
              <div style={{ fontWeight: 600 }}>{titulaire.first_name} {titulaire.last_name}</div>
              <div className="vz-small vz-muted">{titulaire.email}</div>
            </div>
            {nouveau && !titulaireImpose && (
              <button className="vz-linkbtn" onClick={() => { setTitulaire(null); setRecherche(""); }}>Changer</button>
            )}
          </div>
        ) : creation ? (
          <div className="vz-card" style={{ background: "var(--surface)" }}>
            <div className="vz-card-body">
              <div className="vz-eyebrow" style={{ marginBottom: 12 }}>Nouveau certifié</div>
              <div className="vz-form-grid">
                <Field label="Prénom"><input className="vz-input" value={creation.first_name} onChange={(e) => setCreation({ ...creation, first_name: e.target.value })} autoFocus /></Field>
                <Field label="Nom"><input className="vz-input" value={creation.last_name} onChange={(e) => setCreation({ ...creation, last_name: e.target.value })} /></Field>
                <Field label="Adresse e-mail" hint="Son invitation y sera envoyée."><input className="vz-input" type="email" value={creation.email} onChange={(e) => setCreation({ ...creation, email: e.target.value })} /></Field>
                <Field label="Téléphone"><input className="vz-input" value={creation.phone} onChange={(e) => setCreation({ ...creation, phone: e.target.value })} placeholder="+225 …" /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="vz-btn vz-btn-primary vz-btn-sm" onClick={creerTitulaire} disabled={busy}>
                  {busy ? "Création…" : "Créer et inviter"}
                </button>
                <button className="vz-btn vz-btn-sm" onClick={() => { setCreation(null); setErr(""); }}>Annuler</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <input
              className="vz-input"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher par nom ou adresse e-mail"
              autoFocus
            />
            {resultats.length > 0 && (
              <div className="vz-resultats">
                {resultats.map((u) => (
                  <button key={u.id} className="vz-resultat" onClick={() => { setTitulaire(u); setRecherche(""); }}>
                    <span style={{ fontWeight: 500 }}>{u.first_name} {u.last_name}</span>
                    <span className="vz-small vz-muted">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
            {recherche.trim().length >= 2 && resultats.length === 0 && (
              <div className="vz-alert info" style={{ marginTop: 10 }}>
                <span>
                  Aucun certifié ne correspond à « {recherche.trim()} ».
                  <button
                    className="vz-linkbtn"
                    style={{ marginLeft: 6 }}
                    onClick={() => {
                      /* Ce qui a été tapé sert de point de départ : une adresse
                         si elle en a la forme, un nom sinon. */
                      const q = recherche.trim();
                      const estAdresse = q.includes("@");
                      const mots = estAdresse ? [] : q.split(/\s+/);
                      setCreation({
                        first_name: mots[0] || "",
                        last_name: mots.slice(1).join(" ") || "",
                        email: estAdresse ? q : "",
                        phone: "",
                      });
                      setErr("");
                    }}
                  >
                    Le créer maintenant
                  </button>
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {/* --- 2. la certification ------------------------------------------ */}
      <section className="vz-etape">
        <div className="vz-etape-tete">
          <span className="vz-etape-num">2</span>
          <div>
            <div className="vz-label">Certification</div>
            <div className="vz-small vz-muted">Le domaine, puis le programme exact.</div>
          </div>
        </div>

        {domaines.length === 0 ? (
          <div className="vz-alert warn">
            Aucun domaine n'est défini. Créez d'abord un domaine et un programme dans « Domaines & programmes ».
          </div>
        ) : (
          <div className="vz-form-grid">
            <Field label="Domaine">
              <select className="vz-select" value={domaineId ?? ""} onChange={(e) => choisirDomaine(e.target.value)}>
                {domaines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Programme" hint={programme ? `Code ${programme.code}` : "Aucun programme dans ce domaine."}>
              <select className="vz-select" value={programmeId ?? ""} onChange={(e) => choisirProgramme(e.target.value)}>
                <option value="">— Choisir —</option>
                {programmesDuDomaine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
        )}

        {programme?.description && (
          <p className="vz-small vz-muted" style={{ marginTop: 10, lineHeight: 1.7 }}>{programme.description}</p>
        )}
      </section>

      {/* --- 3. la délivrance --------------------------------------------- */}
      <section className="vz-etape">
        <div className="vz-etape-tete">
          <span className="vz-etape-num">3</span>
          <div>
            <div className="vz-label">Délivrance</div>
            <div className="vz-small vz-muted">
              {nouveau ? "La référence et le QR code sont générés automatiquement." : `Référence ${cert.reference}, délivrée le ${fmtShort(cert.issue_date)}.`}
            </div>
          </div>
        </div>

        <div className="vz-form-grid">
          <Field label="Date de délivrance">
            <input className="vz-input" type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} />
          </Field>
          <Field label="Durée (heures)">
            <input className="vz-input" type="number" min="1" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder={programme ? String(programme.default_duration) : ""} />
          </Field>
          <Field label="Formateur">
            <input className="vz-input" value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} />
          </Field>
          <Field label="Responsable signataire">
            <input className="vz-input" value={f.signatory} onChange={(e) => setF({ ...f, signatory: e.target.value })} />
          </Field>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="vz-label" style={{ marginBottom: 9 }}>Compétences validées</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {competences.map((s) => (
              <button
                key={s.id}
                className={"vz-chip vz-chip-bascule" + (f.skills.includes(s.id) ? " on" : "")}
                onClick={() => basculerCompetence(s.id)}
                type="button"
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="vz-small vz-muted" style={{ marginTop: 8 }}>
            Les six premières figurent sur le certificat imprimé ; toutes apparaissent sur la page de vérification.
          </p>
        </div>

        {nouveau && (
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, cursor: "pointer" }}>
            <input type="checkbox" checked={avertir} onChange={(e) => setAvertir(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <span className="vz-label">Avertir le certifié par e-mail</span>
              <span className="vz-small vz-muted" style={{ display: "block", marginTop: 3 }}>
                Il recevra un message l'invitant à consulter sa certification dans son espace.
              </span>
            </span>
          </label>
        )}
      </section>

      {/* Mentions d'archive : ce qui a été délivré ne se réécrit pas. */}
      {!nouveau && (cert.expiry_date || cert.score != null) && (
        <section className="vz-etape" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <div className="vz-alert warn">
            <span>
              Ce certificat porte des mentions qui ne sont plus utilisées par le registre et n'apparaissent
              plus nulle part :
              {cert.expiry_date ? ` expiration au ${fmtShort(cert.expiry_date)}` : ""}
              {cert.expiry_date && cert.score != null ? "," : ""}
              {cert.score != null ? ` score de ${cert.score}/100` : ""}.
              Elles sont conservées en l'état, comme trace de ce qui a été délivré.
            </span>
          </div>
        </section>
      )}
    </Modal>
  );
}

export { CertificateForm };
