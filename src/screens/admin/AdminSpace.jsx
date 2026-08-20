/* Espace administrateur : navigation et modales.

   Le registre est chargé une fois puis substitué à l'objet local, dans la même
   forme. Les écrans en aval ignorent donc leur source. Les écritures, elles,
   passent encore par le registre local : voir « Où en est la migration ». */

import { useState, useEffect } from "react";
import * as api from "../../data/api.js";
import { isAuthConfigured } from "../../lib/auth.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { AppShell } from "../../ui/AppShell.jsx";
import { CertificateDetail } from "./CertificateDetail.jsx";
import { CertificateForm } from "./CertificateForm.jsx";
import { AdminCertificates } from "./Certificates.jsx";
import { AdminCertified } from "./Certified.jsx";
import { AdminDashboard } from "./Dashboard.jsx";
import { AdminImport } from "./Import.jsx";
import { RevokeModal } from "./RevokeModal.jsx";
import { AdminSettings } from "./Settings.jsx";
import { AdminStats } from "./Stats.jsx";
import { AdminVerifications } from "./Verifications.jsx";

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

  if (!p.session || p.session.role !== "ADMIN") { p.go({ view: "login" }); return null; }

  const nav = [
    { group: "Administration" },
    { key: "dashboard", label: "Dashboard" },
    { key: "certificates", label: "Certificats" },
    { key: "certified", label: "Certifiés" },
    { key: "verifications", label: "Vérifications" },
    { key: "import", label: "Import" },
    { key: "stats", label: "Statistiques" },
    { key: "settings", label: "Paramètres" },
  ];

  const db = isAuthConfigured ? registry : p.db;

  const recharger = () => api.fetchRegistry().then(setRegistry);

  /* Écritures distantes. Chacune est suivie d'un rechargement : plutôt que de
     rejouer la modification côté client, on redemande l'état à la base, qui
     seule fait autorité — et qui a pu appliquer des règles ou refuser. */
  const distant = {
    saveCertificate: async ({ id, code, fields, skillIds }) => {
      const trace = { actor: p.session.id };
      if (id) {
        await api.updateCertificate(id, fields, skillIds);
        await api.logAction(trace.actor, "CERTIFICATE_UPDATED", id, fields.reference || "");
      } else {
        const cree = await api.createCertificate({ code, ...fields }, skillIds);
        await api.logAction(trace.actor, "CERTIFICATE_CREATED", cree.id, cree.reference);
      }
      await recharger();
    },
    setStatus: async (cert, status, reason) => {
      await api.setCertificateStatus(cert.id, status, reason);
      await api.logAction(p.session.id, status === "REVOKED" ? "CERTIFICATE_REVOKED" : "CERTIFICATE_CANCELLED", cert.id, cert.reference);
      await recharger();
    },
    addType: async (fields) => {
      await api.createType(fields);
      await recharger();
    },
  };

  /* Les accès par identifiant suivent la source retenue. */
  const shared = db
    ? {
        ...p,
        db,
        userOf: (c) => db.users.find((u) => u.id === c.user_id) || { first_name: "—", last_name: "", email: "" },
        typeOf: (c) => db.types.find((t) => t.id === c.certificate_type_id) || { name: "—", code: "", description: "" },
        remote: isAuthConfigured,
        actions: isAuthConfigured ? distant : null,
        setModal,
      }
    : null;

  return (
    <AppShell nav={nav} current={page} onNav={setPage} session={p.session} go={p.go} logout={p.logout} title="VIZDATA CERTIFY — Administration" sub="CERTIFY">
      <div className="vz-page">
        {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
        {shared?.remote && (
          <div className="vz-alert info" style={{ marginBottom: 14 }}>
            Registre Supabase. Un certificat ne peut être délivré qu'à un titulaire déjà enregistré : la création d'un compte passe par la console Supabase.
          </div>
        )}
        {!shared && !err && <div className="vz-card"><div className="vz-empty">Chargement du registre…</div></div>}
        {shared && page === "dashboard" && <AdminDashboard {...shared} setPage={setPage} />}
        {shared && page === "certificates" && <AdminCertificates {...shared} />}
        {shared && page === "certified" && <AdminCertified {...shared} />}
        {shared && page === "verifications" && <AdminVerifications {...shared} />}
        {shared && page === "import" && <AdminImport {...shared} />}
        {shared && page === "stats" && <AdminStats {...shared} />}
        {shared && page === "settings" && <AdminSettings {...shared} />}
      </div>

      {shared && modal?.type === "cert" && <CertificateModal cert={p.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "share" && <ShareModal cert={p.toPublic(modal.c)} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "form" && <CertificateForm cert={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "revoke" && <RevokeModal cert={modal.c} {...shared} onClose={() => setModal(null)} />}
      {shared && modal?.type === "detail" && <CertificateDetail cert={modal.c} {...shared} setModal={setModal} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

export { AdminSpace };
