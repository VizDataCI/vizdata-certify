/* Registre des certificats : recherche, filtres, tri, pagination.
 *
 * Les filtres portent sur ce que l'on cherche réellement dans un registre :
 * une personne, une référence, un domaine, un programme, une période. Ils se
 * combinent, et le compte affiché dit toujours combien de lignes la
 * combinaison retient. Sans ce compte, on ne sait pas si une liste vide vient
 * d'un filtre ou d'un registre vide.
 *
 * Le tri est tenu par la colonne cliquée, pas par un menu : c'est le geste
 * qu'on fait sans y penser dans un tableau.
 *
 * La pagination n'est pas un ornement : au-delà de quelques centaines de
 * certificats, une table complète devient illisible et lente à peindre.
 */

import { useState, useMemo } from "react";
import { STATUS_META, effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { Badge, Vide } from "../../ui/primitives.jsx";
import {
  IconePlus, IconeCertificats, IconeVoir, IconeDocument, IconeModifier,
  IconeRevoquer, IconeGauche, IconeDroite, IconeTri, IconeHaut, IconeBas, IconeFiltrer,
} from "../../ui/icones.jsx";

const PAR_PAGE = 25;

/* Les colonnes triables et la valeur sur laquelle elles trient. Le tableau
   décrit le tri une fois ; l'entête et la comparaison s'en servent tous les
   deux, ce qui évite qu'une colonne annonce un tri qu'elle n'applique pas. */
const COLONNES = {
  reference: (c) => c.reference || "",
  certifie: (c, p) => `${p.userOf(c).last_name} ${p.userOf(c).first_name}`.toLowerCase(),
  certification: (c, p) => (p.typeOf(c).name || "").toLowerCase(),
  date: (c) => c.issue_date || "",
  statut: (c) => effectiveStatus(c),
};

function AdminCertificates(p) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [domaine, setDomaine] = useState("");
  const [programme, setProgramme] = useState("");
  const [depuis, setDepuis] = useState("");
  const [jusqua, setJusqua] = useState("");
  const [page, setPage] = useState(1);
  const [tri, setTri] = useState({ col: "date", sens: -1 });

  const domaines = p.db.domains || [];
  const programmes = p.db.types || [];
  const programmesFiltres = domaine ? programmes.filter((t) => String(t.domain_id) === String(domaine)) : programmes;

  /* Tout changement de filtre ramène en première page : rester page 4 d'un
     résultat qui n'en compte plus qu'une afficherait une liste vide. */
  const filtrer = (setter) => (valeur) => { setter(valeur); setPage(1); };

  const basculerTri = (col) => {
    setTri((t) => (t.col === col ? { col, sens: -t.sens } : { col, sens: col === "date" ? -1 : 1 }));
    setPage(1);
  };

  const lignes = useMemo(() => {
    const texte = q.trim().toLowerCase();
    const retenues = p.db.certificates.filter((c) => {
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

    const valeur = COLONNES[tri.col] || COLONNES.date;
    return retenues.sort((a, b) => {
      const va = valeur(a, p);
      const vb = valeur(b, p);
      if (va === vb) return 0;
      return va > vb ? tri.sens : -tri.sens;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [p.db.certificates, p.db.users, p.db.types, q, status, programme, domaine, depuis, jusqua, tri]);

  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const pageSure = Math.min(page, pages);
  const debut = (pageSure - 1) * PAR_PAGE;
  const visibles = lignes.slice(debut, debut + PAR_PAGE);

  const filtreActif = q || status || domaine || programme || depuis || jusqua;
  const peutAttribuer = peut(p.session, "attribuer_certificats");
  const peutRevoquer = peut(p.session, "revoquer_certificats");

  const reinitialiser = () => {
    setQ(""); setStatus(""); setDomaine(""); setProgramme(""); setDepuis(""); setJusqua(""); setPage(1);
  };

  const Entete = ({ col, children, droite }) => (
    <th className="vz-th-tri" onClick={() => basculerTri(col)} style={droite ? { textAlign: "right" } : null}>
      <span>
        {children}
        {tri.col === col
          ? (tri.sens === 1 ? <IconeHaut size={13} /> : <IconeBas size={13} />)
          : <IconeTri size={13} style={{ opacity: .35 }} />}
      </span>
    </th>
  );

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Registre</div>
          <h1 style={{ marginTop: 8 }}>Certificats</h1>
          <p>
            {p.db.certificates.length} certificat{p.db.certificates.length > 1 ? "s" : ""} délivré
            {p.db.certificates.length > 1 ? "s" : ""} depuis l'ouverture du registre.
          </p>
        </div>
        {peutAttribuer && (
          <button className="vz-btn vz-btn-accent" onClick={() => p.setModal({ type: "form", c: null })}>
            <IconePlus size={16} />
            Attribuer une certification
          </button>
        )}
      </div>

      <div className="vz-card">
        <div className="vz-card-head vz-filtres">
          <input
            className="vz-input vz-search"
            style={{ maxWidth: 290 }}
            placeholder="Référence, nom, e-mail, certification"
            value={q}
            onChange={(e) => filtrer(setQ)(e.target.value)}
            aria-label="Rechercher un certificat"
          />
          <select className="vz-select" style={{ width: "auto" }} value={domaine} aria-label="Domaine"
            onChange={(e) => { filtrer(setDomaine)(e.target.value); setProgramme(""); }}>
            <option value="">Tous les domaines</option>
            {domaines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="vz-select" style={{ width: "auto" }} value={programme} aria-label="Programme"
            onChange={(e) => filtrer(setProgramme)(e.target.value)}>
            <option value="">Tous les programmes</option>
            {programmesFiltres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="vz-select" style={{ width: "auto" }} value={status} aria-label="Statut"
            onChange={(e) => filtrer(setStatus)(e.target.value)}>
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
          {filtreActif && (
            <button className="vz-btn vz-btn-sm vz-btn-ghost" onClick={reinitialiser}>
              <IconeFiltrer size={14} /> Tout effacer
            </button>
          )}
        </div>

        {lignes.length === 0 ? (
          filtreActif ? (
            <Vide
              icone={IconeFiltrer}
              titre="Aucun certificat ne correspond"
              action={<button className="vz-btn vz-btn-sm" onClick={reinitialiser}>Effacer les filtres</button>}
            >
              Aucun des {p.db.certificates.length} certificats du registre ne satisfait cette combinaison de filtres.
            </Vide>
          ) : (
            <Vide
              icone={IconeCertificats}
              titre="Aucun certificat délivré"
              action={peutAttribuer && (
                <button className="vz-btn vz-btn-accent vz-btn-sm" onClick={() => p.setModal({ type: "form", c: null })}>
                  <IconePlus size={15} /> Attribuer la première
                </button>
              )}
            >
              Chaque certification délivrée recevra une référence unique et deviendra vérifiable publiquement.
            </Vide>
          )
        ) : (
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead>
                <tr>
                  <Entete col="reference">Référence</Entete>
                  <Entete col="certifie">Certifié</Entete>
                  <Entete col="certification">Certification</Entete>
                  <th>Domaine</th>
                  <Entete col="date">Délivré le</Entete>
                  <Entete col="statut">Statut</Entete>
                  <th aria-label="Actions" />
                </tr>
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
                        <div style={{ fontWeight: 500 }}>{u.first_name} {u.last_name}</div>
                        <div className="vz-small vz-muted">{u.email}</div>
                      </td>
                      <td>{t.name}</td>
                      <td className="vz-small vz-muted">{d?.name || "Non rattaché"}</td>
                      <td className="vz-nums vz-small" style={{ whiteSpace: "nowrap" }}>{fmtShort(c.issue_date)}</td>
                      <td><Badge status={effectiveStatus(c)} /></td>
                      <td>
                        <div className="vz-rowactions">
                          <button className="vz-linkbtn" onClick={() => p.setModal({ type: "detail", c })} title="Voir la fiche">
                            <IconeVoir size={15} />
                          </button>
                          <button className="vz-linkbtn" onClick={() => p.setModal({ type: "cert", c })} title="Voir le certificat">
                            <IconeDocument size={15} />
                          </button>
                          {peutAttribuer && (
                            <button className="vz-linkbtn" onClick={() => p.setModal({ type: "form", c })} title="Modifier">
                              <IconeModifier size={15} />
                            </button>
                          )}
                          {peutRevoquer && effectiveStatus(c) !== "REVOKED" && (
                            <button className="vz-linkbtn danger" onClick={() => p.setModal({ type: "revoke", c })} title="Révoquer">
                              <IconeRevoquer size={15} />
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
        )}

        {lignes.length > 0 && (
          <div className="vz-pagination">
            <span className="vz-small vz-muted">
              {debut + 1} à {Math.min(debut + PAR_PAGE, lignes.length)} sur {lignes.length}
              {filtreActif ? " résultats filtrés" : " certificats"}
            </span>
            {pages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="vz-btn vz-btn-sm" disabled={pageSure === 1} onClick={() => setPage(pageSure - 1)}>
                  <IconeGauche size={14} /> Précédent
                </button>
                <span className="vz-small vz-muted vz-nums">Page {pageSure} sur {pages}</span>
                <button className="vz-btn vz-btn-sm" disabled={pageSure === pages} onClick={() => setPage(pageSure + 1)}>
                  Suivant <IconeDroite size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export { AdminCertificates };
