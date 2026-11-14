/* Registre des certificats : recherche, filtres, pagination.
 *
 * Les filtres portent sur ce que l'on cherche réellement dans un registre :
 * une personne, une référence, un domaine, un programme, une période. Ils se
 * combinent, et le compte affiché dit toujours combien de lignes la combinaison
 * retient — sans quoi l'on ne sait pas si une liste vide vient d'un filtre ou
 * d'un registre vide.
 *
 * La pagination n'est pas un ornement : au-delà de quelques centaines de
 * certificats, une table complète devient illisible et lente à peindre.
 */

import { useState, useMemo } from "react";
import { STATUS_META, effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { Badge } from "../../ui/primitives.jsx";

const PAR_PAGE = 25;

function AdminCertificates(p) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [domaine, setDomaine] = useState("");
  const [programme, setProgramme] = useState("");
  const [depuis, setDepuis] = useState("");
  const [jusqua, setJusqua] = useState("");
  const [page, setPage] = useState(1);

  const domaines = p.db.domains || [];
  const programmes = p.db.types || [];
  const programmesFiltres = domaine ? programmes.filter((t) => String(t.domain_id) === String(domaine)) : programmes;

  /* Tout changement de filtre ramène en première page : rester page 4 d'un
     résultat qui n'en compte plus qu'une afficherait une liste vide. */
  const filtrer = (setter) => (valeur) => { setter(valeur); setPage(1); };

  const lignes = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return p.db.certificates.filter((c) => {
      const u = p.userOf(c);
      const t = p.typeOf(c);
      if (texte) {
        const foin = `${c.reference} ${u.first_name} ${u.last_name} ${u.email} ${t.name} ${t.code}`.toLowerCase();
        if (!foin.includes(texte)) return false;
      }
      if (status && effectiveStatus(c) !== status) return false;
      if (programme && String(c.certificate_type_id) !== String(programme)) return false;
      if (domaine && String(t.domain_id) !== String(domaine)) return false;
      if (depuis && c.issue_date < depuis) return false;
      if (jusqua && c.issue_date > jusqua) return false;
      return true;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [p.db.certificates, p.db.users, p.db.types, q, status, programme, domaine, depuis, jusqua]);

  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const pageSure = Math.min(page, pages);
  const visibles = lignes.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE);

  const filtreActif = q || status || domaine || programme || depuis || jusqua;
  const peutAttribuer = peut(p.session, "attribuer_certificats");
  const peutRevoquer = peut(p.session, "revoquer_certificats");

  const reinitialiser = () => {
    setQ(""); setStatus(""); setDomaine(""); setProgramme(""); setDepuis(""); setJusqua(""); setPage(1);
  };

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Registre</div>
          <h1 style={{ marginTop: 8 }}>Certificats</h1>
        </div>
        {peutAttribuer && (
          <button className="vz-btn vz-btn-primary" onClick={() => p.setModal({ type: "form", c: null })}>+ Attribuer une certification</button>
        )}
      </div>

      <div className="vz-card">
        <div className="vz-card-head vz-filtres">
          <input
            className="vz-input"
            style={{ maxWidth: 300 }}
            placeholder="Référence, nom, e-mail, certification"
            value={q}
            onChange={(e) => filtrer(setQ)(e.target.value)}
          />
          <select className="vz-select" style={{ width: "auto" }} value={domaine} onChange={(e) => { filtrer(setDomaine)(e.target.value); setProgramme(""); }}>
            <option value="">Tous les domaines</option>
            {domaines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="vz-select" style={{ width: "auto" }} value={programme} onChange={(e) => filtrer(setProgramme)(e.target.value)}>
            <option value="">Tous les programmes</option>
            {programmesFiltres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="vz-select" style={{ width: "auto" }} value={status} onChange={(e) => filtrer(setStatus)(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <label className="vz-filtre-date">
            <span className="vz-small vz-muted">Du</span>
            <input className="vz-input" type="date" value={depuis} onChange={(e) => filtrer(setDepuis)(e.target.value)} />
          </label>
          <label className="vz-filtre-date">
            <span className="vz-small vz-muted">au</span>
            <input className="vz-input" type="date" value={jusqua} onChange={(e) => filtrer(setJusqua)(e.target.value)} />
          </label>
          {filtreActif && <button className="vz-linkbtn" onClick={reinitialiser}>Tout effacer</button>}
        </div>

        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr><th>Référence</th><th>Certifié</th><th>Certification</th><th>Domaine</th><th>Délivré le</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const u = p.userOf(c);
                const t = p.typeOf(c);
                const d = p.domainOf(t);
                return (
                  <tr key={c.id}>
                    <td className="vz-ref" style={{ color: "var(--bleu)", whiteSpace: "nowrap" }}>{c.reference}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {u.first_name} {u.last_name}
                      <div className="vz-small vz-muted">{u.email}</div>
                    </td>
                    <td>{t.name}</td>
                    <td className="vz-small vz-muted">{d?.name || "—"}</td>
                    <td className="vz-mono vz-small" style={{ whiteSpace: "nowrap" }}>{fmtShort(c.issue_date)}</td>
                    <td><Badge status={effectiveStatus(c)} /></td>
                    <td>
                      <div className="vz-rowactions">
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "detail", c })}>Voir</button>
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "cert", c })}>Certificat</button>
                        {peutAttribuer && <button className="vz-linkbtn" onClick={() => p.setModal({ type: "form", c })}>Modifier</button>}
                        {peutRevoquer && effectiveStatus(c) !== "REVOKED" && (
                          <button className="vz-linkbtn danger" onClick={() => p.setModal({ type: "revoke", c })}>Révoquer</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {lignes.length === 0 && (
          <div className="vz-empty">
            {filtreActif
              ? "Aucun certificat ne correspond à ces filtres."
              : "Aucun certificat n'a encore été délivré."}
          </div>
        )}

        {pages > 1 && (
          <div className="vz-pagination">
            <button className="vz-btn vz-btn-sm" disabled={pageSure === 1} onClick={() => setPage(pageSure - 1)}>Précédent</button>
            <span className="vz-small vz-muted">Page {pageSure} sur {pages}</span>
            <button className="vz-btn vz-btn-sm" disabled={pageSure === pages} onClick={() => setPage(pageSure + 1)}>Suivant</button>
          </div>
        )}
      </div>

      <p className="vz-small vz-muted" style={{ marginTop: 10 }}>
        {lignes.length} résultat{lignes.length > 1 ? "s" : ""} sur {p.db.certificates.length} certificat
        {p.db.certificates.length > 1 ? "s" : ""} délivré{p.db.certificates.length > 1 ? "s" : ""}.
      </p>
    </>
  );
}

export { AdminCertificates };
