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
import { projectionPublique } from "../../lib/certificates.js";
import { estAdmin, estAdministration, peut } from "../../lib/permissions.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { AppShell } from "../../ui/AppShell.jsx";
import {
  IconeTableau, IconeCertificats, IconeCertifies, IconeCatalogue, IconeImport,
  IconeVerification, IconeNotifications, IconeStats, IconeUtilisateurs,
  IconeParametres, IconeCandidatures, IconeCohortes, IconeVerrou,
} from "../../ui/icones.jsx";
import { creerActions } from "./actions.js";
import { AdminCandidatures } from "./Candidatures.jsx";
import { AdminCatalogue } from "./Catalogue.jsx";
import { CertificateDetail } from "./CertificateDetail.jsx";
import { CertificateForm } from "./CertificateForm.jsx";
import { AdminCertificates } from "./Certificates.jsx";
import { AdminCohortes } from "./Cohortes.jsx";
import { AdminCertified } from "./Certified.jsx";
import { AdminDashboard } from "./Dashboard.jsx";
import { HolderDetail } from "./HolderDetail.jsx";
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
     interdit.
     Et il n'agit qu'une fois la session CONNUE : rediriger avant mettrait
     dehors un administrateur parfaitement connecté, simplement parce que la
     réponse du serveur n'est pas encore arrivée. */
  const horsAdministration = p.sessionConnue && (!p.session || !estAdministration(p.session));

  /* La redirection part d'un effet, jamais du rendu.
     Appelée pendant le rendu, elle changeait l'état de App au moment où React
     dessinait AdminSpace : « Cannot update a component while rendering a
     different component ». Et surtout, la course se perdait parfois contre la
     session qui venait de s'ouvrir, ce qui renvoyait à l'écran de connexion
     quelqu'un qui venait de s'y connecter. */
  useEffect(() => {
    if (horsAdministration) p.go({ view: "login" });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [horsAdministration]);

  if (!p.sessionConnue) {
    return (
      <div className="vz-public">
        <div className="vz-public-body">
          <div className="vz-slip" style={{ maxWidth: 380 }}>
            <div className="vz-empty">Ouverture de l'espace d'administration…</div>
          </div>
        </div>
      </div>
    );
  }
  if (horsAdministration) return null;
  if (!p.session) return null;

  const admin = estAdmin(p.session);

  const nav = [
    { group: "Pilotage" },
    { key: "dashboard", label: "Tableau de bord", icone: IconeTableau },
    { group: "Certifications" },
    { key: "certificates", label: "Certificats", icone: IconeCertificats },
    { key: "certified", label: "Certifiés", icone: IconeCertifies },
    admin && { key: "catalogue", label: "Domaines et programmes", icone: IconeCatalogue },
    peut(p.session, "attribuer_certificats") && { key: "import", label: "Import", icone: IconeImport },
    { group: "Suivi" },
    { key: "verifications", label: "Vérifications", icone: IconeVerification },
    { key: "notifications", label: "Notifications", icone: IconeNotifications },
    { key: "stats", label: "Statistiques", icone: IconeStats },
    admin && { group: "Configuration" },
    admin && { key: "users", label: "Utilisateurs et rôles", icone: IconeUtilisateurs },
    admin && { key: "settings", label: "Paramètres", icone: IconeParametres },
    /* La sécurité du compte vit dans l'espace personnel. Sans cette entrée,
       elle n'était atteignable que par un lien discret en pied de barre :
       un administrateur ne pouvait ni changer son mot de passe ni activer son
       second facteur sans connaître l'adresse. */
    { key: "securite", label: "Ma sécurité", icone: IconeVerrou, aller: { view: "dashboard", tab: "settings" } },
    { group: "Académie" },
    { key: "candidatures", label: "Candidatures", icone: IconeCandidatures },
    { key: "cohortes", label: "Cohortes", icone: IconeCohortes },
  ].filter(Boolean);

  /* Un gestionnaire qui atterrit sur un écran réservé — adresse recopiée,
     rôle modifié en cours de session — est ramené au tableau de bord plutôt
     que de voir un écran vide. */
  const autorisee = nav.some((n) => n.key === page);
  const pageCourante = autorisee ? page : "dashboard";

  /* Les accès par identifiant suivent la source retenue. */
  const userOf = (c) => db?.users.find((u) => u.id === c.user_id) || { first_name: "Titulaire", last_name: "inconnu", email: "" };
  const typeOf = (c) => db?.types.find((t) => t.id === c.certificate_type_id) || { name: "Programme inconnu", code: "", description: "" };
  const domainOf = (t) => t?.certification_domains || (db?.domains || []).find((d) => d.id === t?.domain_id) || null;

  const shared = db
    ? {
        ...p,
        db,
        userOf,
        typeOf,
        domainOf,
        /* La projection de App lit la base de App. Ici, c'est l'instantané du
           registre qui fait foi : sans cette redéfinition, un certificat ouvert
           depuis l'administration s'imprimait au nom de « Titulaire inconnu ». */
        toPublic: (c) => projectionPublique(c, { userOf, typeOf, domainOf, skills: db.skills || [] }),
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
      title={admin ? "Administration du registre" : "Gestion du registre"}
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

      {shared && modal?.type === "cert" && <CertificateModal cert={shared.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "share" && <ShareModal cert={shared.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "form" && <CertificateForm cert={modal.c} titulaire={modal.titulaire} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "holder" && <HolderForm titulaire={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "titulaire" && <HolderDetail titulaire={modal.c} {...shared} setModal={setModal} onClose={() => setModal(null)} />}
      {shared && modal?.type === "revoke" && <RevokeModal cert={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "detail" && <CertificateDetail cert={modal.c} {...shared} setModal={setModal} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

export { AdminSpace };
