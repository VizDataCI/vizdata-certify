/* Espace d'administration : navigation, chargement du registre, modales.
 *
 * Le registre est chargé une fois puis substitué à l'objet local, dans la même
 * forme : les écrans en aval ignorent leur source. Les écritures passent toutes
 * par `creerActions`, qui prend la bifurcation « distant ou démonstration » une
 * seule fois — voir actions.js.
 *
 * La navigation est filtrée par les autorisations du compte. Un gestionnaire ne
 * voit pas les écrans qu'il ne pourrait pas utiliser : montrer un bouton dont
 * la base refusera l'action n'informe personne. Mais ce filtrage n'est qu'une
 * commodité d'affichage — l'autorisation réelle est tenue par la base.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import * as api from "../../data/api.js";
import { isAuthConfigured } from "../../lib/auth.js";
import { estAdmin, estAdministration, peut } from "../../lib/permissions.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { AppShell } from "../../ui/AppShell.jsx";
import { creerActions } from "./actions.js";
import { AdminCandidatures } from "./Candidatures.jsx";
import { AdminCatalogue } from "./Catalogue.jsx";
import { CertificateDetail } from "./CertificateDetail.jsx";
import { CertificateForm } from "./CertificateForm.jsx";
import { AdminCertificates } from "./Certificates.jsx";
import { AdminCohortes } from "./Cohortes.jsx";
import { AdminCertified } from "./Certified.jsx";
import { AdminDashboard } from "./Dashboard.jsx";
import { HolderForm } from "./HolderForm.jsx";
import { AdminImport } from "./Import.jsx";
import { AdminNotifications } from "./Notifications.jsx";
import { RevokeModal } from "./RevokeModal.jsx";
import { AdminSettings } from "./Settings.jsx";
import { AdminStats } from "./Stats.jsx";
import { AdminUtilisateurs } from "./Utilisateurs.jsx";
import { AdminVerifications } from "./Verifications.jsx";

/** Écrans de l'académie : un second métier dans la même application. Ils
    chargent leurs propres données et n'attendent pas le registre. */
const PAGES_ACADEMIE = ["candidatures", "cohortes"];

function AdminSpace(p) {
  const [page, setPage] = useState(p.route.page || "dashboard");
  const [modal, setModal] = useState(null);
  const [registry, setRegistry] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isAuthConfigured) return;
    let alive = true;
    api.fetchRegistry()
      .then((r) => { if (alive) setRegistry(r); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const db = isAuthConfigured ? registry : p.db;
  const pageAcademie = PAGES_ACADEMIE.includes(page);

  /* `dbRef` sert aux actions : elles sont asynchrones, et un `db` capturé à la
     construction serait périmé dès la première écriture. */
  const dbRef = useRef(db);
  dbRef.current = db;

  const recharger = () => api.fetchRegistry().then(setRegistry);

  const actions = useMemo(
    () => creerActions({ remote: isAuthConfigured, dbRef, setDb: p.setDb, session: p.session, recharger }),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [p.session?.id]
  );

  /* Le garde vient après les hooks, jamais avant : un retour anticipé placé
     plus haut sauterait des appels de hooks d'un rendu au suivant, ce que React
     interdit. */
  if (!p.session || !estAdministration(p.session)) { p.go({ view: "login" }); return null; }

  const admin = estAdmin(p.session);

  const nav = [
    { group: "Pilotage" },
    { key: "dashboard", label: "Tableau de bord" },
    { group: "Certifications" },
    { key: "certificates", label: "Certificats" },
    { key: "certified", label: "Certifiés" },
    admin && { key: "catalogue", label: "Domaines & programmes" },
    peut(p.session, "attribuer_certificats") && { key: "import", label: "Import" },
    { group: "Suivi" },
    { key: "verifications", label: "Vérifications" },
    { key: "notifications", label: "Notifications" },
    { key: "stats", label: "Statistiques" },
    admin && { group: "Configuration" },
    admin && { key: "users", label: "Utilisateurs & rôles" },
    admin && { key: "settings", label: "Paramètres" },
    { group: "Académie" },
    { key: "candidatures", label: "Candidatures" },
    { key: "cohortes", label: "Cohortes" },
  ].filter(Boolean);

  /* Un gestionnaire qui atterrit sur un écran réservé — adresse recopiée,
     rôle modifié en cours de session — est ramené au tableau de bord plutôt
     que de voir un écran vide. */
  const autorisee = nav.some((n) => n.key === page);
  const pageCourante = autorisee ? page : "dashboard";

  /* Les accès par identifiant suivent la source retenue. */
  const shared = db
    ? {
        ...p,
        db,
        userOf: (c) => db.users.find((u) => u.id === c.user_id) || { first_name: "—", last_name: "", email: "" },
        typeOf: (c) => db.types.find((t) => t.id === c.certificate_type_id) || { name: "—", code: "", description: "" },
        domainOf: (t) => t?.certification_domains || (db.domains || []).find((d) => d.id === t?.domain_id) || null,
        remote: isAuthConfigured,
        actions,
        setModal,
        setPage,
        recharger,
      }
    : null;

  return (
    <AppShell
      nav={nav}
      current={pageCourante}
      onNav={setPage}
      session={p.session}
      go={p.go}
      logout={p.logout}
      title={admin ? "VIZDATA CERTIFY — Administration" : "VIZDATA CERTIFY — Gestion"}
      sub="CERTIFY"
    >
      <div className="vz-page">
        {err && !pageAcademie && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
        {!shared && !err && !pageAcademie && <div className="vz-card"><div className="vz-empty">Chargement du registre…</div></div>}

        {pageCourante === "candidatures" && <AdminCandidatures {...p} setPage={setPage} />}
        {pageCourante === "cohortes" && <AdminCohortes {...p} setPage={setPage} />}
        {shared && pageCourante === "dashboard" && <AdminDashboard {...shared} />}
        {shared && pageCourante === "certificates" && <AdminCertificates {...shared} />}
        {shared && pageCourante === "certified" && <AdminCertified {...shared} />}
        {shared && pageCourante === "catalogue" && <AdminCatalogue {...shared} />}
        {shared && pageCourante === "verifications" && <AdminVerifications {...shared} />}
        {shared && pageCourante === "notifications" && <AdminNotifications {...shared} />}
        {shared && pageCourante === "import" && <AdminImport {...shared} />}
        {shared && pageCourante === "stats" && <AdminStats {...shared} />}
        {shared && pageCourante === "users" && <AdminUtilisateurs {...shared} />}
        {shared && pageCourante === "settings" && <AdminSettings {...shared} />}
      </div>

      {shared && modal?.type === "cert" && <CertificateModal cert={p.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "share" && <ShareModal cert={p.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "form" && <CertificateForm cert={modal.c} titulaire={modal.titulaire} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "holder" && <HolderForm titulaire={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "revoke" && <RevokeModal cert={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "detail" && <CertificateDetail cert={modal.c} {...shared} setModal={setModal} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

export { AdminSpace };
