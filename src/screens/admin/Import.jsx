/* Import en série, avec analyse préalable ligne à ligne.
 *
 * Ce que l'import fait désormais
 * -----------------------------
 * Il crée les titulaires manquants. C'était impossible jusqu'ici : le compte
 * d'authentification demande la clé secrète, et l'import se contentait de
 * refuser les lignes dont l'adresse était inconnue. Depuis que la fonction Edge
 * `inviter-titulaire` existe, chaque titulaire absent est créé et invité avant
 * que sa certification ne lui soit attribuée.
 *
 * L'analyse avant l'écriture n'est pas une politesse : un fichier de cinquante
 * lignes dont trois sont fautives doit pouvoir être corrigé avant d'avoir
 * délivré quarante-sept certificats. Rien n'est écrit tant que l'aperçu n'a pas
 * été vu.
 *
 * Les colonnes DATE_EXPIRATION et SCORE ont disparu : ces deux mentions ne sont
 * plus portées par le registre. Un fichier qui les contient encore n'est pas
 * refusé — elles sont simplement ignorées, et l'écran le dit.
 */

import { useState } from "react";

const EXEMPLE_CSV = `NOM;PRENOM;EMAIL;PROGRAMME;DATE_DELIVRANCE
DIALLO;Awa;awa.diallo@example.ci;EXCEL-AVA;2026-11-02
BAMBA;Ibrahim;ibrahim.bamba@example.ci;PBI-ANA;2026-11-02
KOFFI;Adjoua;adjoua.koffi@example.ci;DATA-ANA;2026-11-03
ZADI;Paul;paul.zadi@example.ci;INCONNU;2026-11-03
BOH;Fabrice;fabrice.boh@vizdata.ci;EXCEL-TCD;2026-11-04`;

const OBLIGATOIRES = ["NOM", "PRENOM", "EMAIL", "PROGRAMME", "DATE_DELIVRANCE"];
/* Tolérance sur les intitulés : les anciens fichiers nommaient la colonne
   CERTIFICATION et la date DATE_EMISSION. Les refuser obligerait à réécrire
   des fichiers par ailleurs valides. */
const SYNONYMES = { CERTIFICATION: "PROGRAMME", DATE_EMISSION: "DATE_DELIVRANCE", CODE: "PROGRAMME" };
const IGNOREES = ["DATE_EXPIRATION", "SCORE"];

function lireCSV(texte) {
  const lignes = texte.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return { entete: [], lignes: [] };
  const sep = lignes[0].includes(";") ? ";" : lignes[0].includes("\t") ? "\t" : ",";
  const decouper = (l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
  const entete = decouper(lignes[0]).map((h) => {
    const brut = h.toUpperCase().replace(/\s+/g, "_");
    return SYNONYMES[brut] || brut;
  });
  return { entete, lignes: lignes.slice(1).map(decouper) };
}

function AdminImport(p) {
  const [texte, setTexte] = useState("");
  const [analyse, setAnalyse] = useState(null);
  const [bilan, setBilan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progression, setProgression] = useState(null);

  const analyser = (brut) => {
    const { entete, lignes } = lireCSV(brut);
    const manquantes = OBLIGATOIRES.filter((h) => !entete.includes(h));
    const rang = (k) => entete.indexOf(k);
    const vues = new Set();

    const items = lignes.map((r, i) => {
      const lire = (k) => (rang(k) >= 0 ? r[rang(k)] || "" : "");
      const nom = lire("NOM");
      const prenom = lire("PRENOM");
      const email = lire("EMAIL").toLowerCase();
      const code = lire("PROGRAMME").toUpperCase();
      const date = lire("DATE_DELIVRANCE");
      const fautes = [];

      if (!nom || !prenom) fautes.push("Nom ou prénom manquant");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fautes.push("Adresse e-mail invalide");
      const programme = (p.db.types || []).find((t) => t.code === code);
      if (!programme) fautes.push(`Programme « ${code || "vide"} » inconnu`);
      if (!date || isNaN(new Date(date))) fautes.push("Date de délivrance invalide");

      const cle = email + "|" + code;
      let doublon = "";
      if (vues.has(cle)) doublon = "Doublon dans le fichier";
      vues.add(cle);

      const titulaire = (p.db.users || []).find((u) => u.email.toLowerCase() === email);
      if (!doublon && programme && titulaire &&
          p.db.certificates.some((c) => c.certificate_type_id === programme.id && c.user_id === titulaire.id)) {
        doublon = "Certification déjà délivrée à ce titulaire";
      }

      return { ligne: i + 2, nom, prenom, email, code, date, programme, titulaire, fautes, doublon };
    });

    const colonnesIgnorees = IGNOREES.filter((c) => entete.includes(c));
    setAnalyse({ entete, manquantes, items, colonnesIgnorees });
    setBilan(null);
  };

  const surFichier = (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => { setTexte(String(lecteur.result)); analyser(String(lecteur.result)); };
    lecteur.readAsText(fichier);
  };

  const importer = async () => {
    if (busy) return;
    const retenues = analyse.items.filter((it) => it.fautes.length === 0 && !it.doublon);

    setBusy(true);
    let delivres = 0;
    let crees = 0;
    const refus = [];

    for (let i = 0; i < retenues.length; i++) {
      const it = retenues[i];
      setProgression({ fait: i, total: retenues.length });
      try {
        /* Le titulaire d'abord : un certificat ne peut pas exister sans lui.
           Si l'adresse est déjà connue, le compte existant est réutilisé. */
        let titulaire = it.titulaire;
        if (!titulaire) {
          const r = await p.actions.inviterTitulaire({
            email: it.email,
            first_name: it.prenom,
            last_name: it.nom,
          });
          titulaire = r.titulaire;
          if (!r.existe) crees++;
        }

        await p.actions.enregistrerCertificat({
          id: null,
          programme: it.programme,
          champs: {
            user_id: titulaire.id,
            certificate_type_id: it.programme.id,
            issue_date: it.date,
            duration: it.programme.default_duration,
            trainer: "Fabrice BOH",
            signatory: "Direction VIZDATA",
          },
          skillIds: [],
          /* Pas de courrier par ligne sur un import de masse : cinquante
             messages partis d'un coup finissent en indésirables, et le
             fournisseur d'envoi applique des quotas. */
          notifier: false,
        });
        delivres++;
      } catch (e) {
        refus.push(`Ligne ${it.ligne} : ${e.message}`);
      }
    }

    setProgression(null);
    setBusy(false);
    setBilan({
      delivres,
      titulaires: crees,
      ecartees: analyse.items.length - retenues.length,
      refus,
    });
    setAnalyse(null);
    setTexte("");
  };

  const pretes = analyse ? analyse.items.filter((i) => !i.fautes.length && !i.doublon).length : 0;
  const codes = (p.db.types || []).map((t) => t.code);

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Délivrance en série</div>
          <h1 style={{ marginTop: 8 }}>Import</h1>
        </div>
      </div>

      {bilan && (
        <div className={"vz-alert " + (bilan.refus.length ? "warn" : "ok")} style={{ marginBottom: 16 }}>
          <div>
            <strong>
              {bilan.delivres} certification{bilan.delivres > 1 ? "s" : ""} délivrée{bilan.delivres > 1 ? "s" : ""}.
            </strong>
            {bilan.titulaires > 0 && (
              <div style={{ marginTop: 4 }}>
                {bilan.titulaires} nouveau{bilan.titulaires > 1 ? "x" : ""} certifié{bilan.titulaires > 1 ? "s" : ""} créé
                {bilan.titulaires > 1 ? "s" : ""} et invité{bilan.titulaires > 1 ? "s" : ""}.
              </div>
            )}
            {bilan.ecartees > 0 && (
              <div style={{ marginTop: 4 }}>
                {bilan.ecartees} ligne{bilan.ecartees > 1 ? "s" : ""} écartée{bilan.ecartees > 1 ? "s" : ""} à l'analyse.
              </div>
            )}
            {bilan.refus.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {bilan.refus.slice(0, 8).map((m) => <li key={m} className="vz-small">{m}</li>)}
              </ul>
            )}
            <div style={{ marginTop: 6 }} className="vz-small">
              Références et QR codes générés automatiquement. Aucun avis n'a été envoyé : prévenez les
              titulaires depuis leur fiche si nécessaire.
            </div>
          </div>
        </div>
      )}

      <div className="vz-card">
        <div className="vz-card-head">
          <h3 style={{ fontSize: 14 }}>1. Déposer le fichier</h3>
          <button className="vz-linkbtn" onClick={() => { setTexte(EXEMPLE_CSV); analyser(EXEMPLE_CSV); }}>Charger un exemple</button>
        </div>
        <div className="vz-card-body">
          <p className="vz-small vz-muted" style={{ marginBottom: 12, lineHeight: 1.75 }}>
            Colonnes attendues : <span className="vz-mono">NOM · PRENOM · EMAIL · PROGRAMME · DATE_DELIVRANCE</span>.
            Séparateur point-virgule, tabulation ou virgule. La colonne PROGRAMME reçoit le code du programme
            {codes.length > 0 && <> — <span className="vz-mono">{codes.slice(0, 8).join(", ")}{codes.length > 8 ? "…" : ""}</span></>}.
            Les titulaires inconnus sont créés et invités automatiquement.
          </p>
          <input type="file" accept=".csv,.txt,text/csv" onChange={surFichier} className="vz-input" style={{ paddingTop: 6, marginBottom: 12 }} />
          <textarea className="vz-textarea" placeholder="…ou collez directement le contenu du fichier ici." value={texte} onChange={(e) => setTexte(e.target.value)} />
          <button className="vz-btn vz-btn-primary" style={{ marginTop: 12 }} disabled={!texte.trim()} onClick={() => analyser(texte)}>
            Analyser le fichier
          </button>
        </div>
      </div>

      {analyse && (
        <div className="vz-card" style={{ marginTop: 16 }}>
          <div className="vz-card-head">
            <h3 style={{ fontSize: 14 }}>2. Vérifier l'aperçu</h3>
            <span className="vz-chip">{analyse.items.length} ligne{analyse.items.length > 1 ? "s" : ""}</span>
          </div>

          {(analyse.manquantes.length > 0 || analyse.colonnesIgnorees.length > 0) && (
            <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              {analyse.manquantes.length > 0 && (
                <div className="vz-alert err">Colonnes obligatoires absentes : {analyse.manquantes.join(", ")}.</div>
              )}
              {analyse.colonnesIgnorees.length > 0 && (
                <div className="vz-alert info">
                  Colonnes ignorées : {analyse.colonnesIgnorees.join(", ")}. Ces mentions ne sont plus portées
                  par le registre ; le reste du fichier est traité normalement.
                </div>
              )}
            </div>
          )}

          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Ligne</th><th>Titulaire</th><th>E-mail</th><th>Programme</th><th>Délivrance</th><th>État</th></tr></thead>
              <tbody>
                {analyse.items.map((it) => (
                  <tr key={it.ligne}>
                    <td className="vz-mono vz-small vz-muted">{it.ligne}</td>
                    <td>
                      {it.prenom} {it.nom}
                      {!it.titulaire && it.fautes.length === 0 && (
                        <div className="vz-small" style={{ color: "var(--bleu)" }}>Compte à créer</div>
                      )}
                    </td>
                    <td className="vz-small vz-muted">{it.email}</td>
                    <td className="vz-mono vz-small">{it.code}</td>
                    <td className="vz-mono vz-small">{it.date}</td>
                    <td className="vz-small">
                      {it.fautes.length > 0 ? <span style={{ color: "var(--rouge)" }}>{it.fautes.join(" · ")}</span>
                        : it.doublon ? <span style={{ color: "var(--orange)" }}>{it.doublon}</span>
                        : <span style={{ color: "var(--vert)" }}>Prête</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="vz-card-head" style={{ borderTop: "1px solid var(--trait)", borderBottom: 0 }}>
            <span className="vz-small vz-muted">
              {progression
                ? `Délivrance en cours : ${progression.fait} sur ${progression.total}…`
                : `${pretes} ligne${pretes > 1 ? "s prêtes" : " prête"} · ${analyse.items.length - pretes} écartée${analyse.items.length - pretes > 1 ? "s" : ""}`}
            </span>
            <button
              className="vz-btn vz-btn-primary"
              disabled={busy || pretes === 0 || analyse.manquantes.length > 0}
              onClick={importer}
            >
              {busy ? "Délivrance en cours…" : `Délivrer ${pretes} certification${pretes > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export { AdminImport };
