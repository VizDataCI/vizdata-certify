/* ============================================================================
   VIZDATA CERTIFY — MVP
   Plateforme de gestion, délivrance, archivage, partage et vérification
   des certificats délivrés par VIZDATA.

   Ce module porte l'état applicatif, le routage et la persistance ;
   les écrans vivent dans src/screens, les briques d'interface dans src/ui.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { BASE_URL, SKILLS } from "./data/seed.js";
import { STORE_KEY, loadDb } from "./data/store.js";
import * as api from "./data/api.js";
import { currentUser, isAuthConfigured, onAuthChange, signIn, signOut } from "./lib/auth.js";
import { effectiveStatus } from "./lib/certificates.js";
import { AdminSpace } from "./screens/admin/AdminSpace.jsx";
import { CertifiedSpace } from "./screens/certified/CertifiedSpace.jsx";
import { About } from "./screens/public/About.jsx";
import { Home } from "./screens/public/Home.jsx";
import { Login } from "./screens/public/Login.jsx";
import { PublicProfile } from "./screens/public/PublicProfile.jsx";
import { VerifyResult } from "./screens/public/VerifyResult.jsx";
import { VerifySearch } from "./screens/public/VerifySearch.jsx";

export default function App() {
  const [db, setDb] = useState(loadDb);
  const [route, setRoute] = useState({ view: "home" });
  const [session, setSession] = useState(null);
  const [toast, setToast] = useState("");
  const saveTimer = useRef(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  /* --- persistance : écriture différée dans le stockage du navigateur --- */
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* quota atteint ou stockage indisponible */ }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [db]);

  /* --- session --- */

  /** Profil applicatif du compte authentifié.
      Une fois Supabase configuré, il vient de la table users : le rôle est donc
      porté par la base et non plus par le registre du navigateur. */
  const profileFor = async (account) => {
    if (!account) return null;
    if (isAuthConfigured) return api.fetchProfile(account.id);
    return dbRef.current.users.find((u) => u.email.toLowerCase() === account.email) || null;
  };

  useEffect(() => {
    let alive = true;
    currentUser()
      .then(profileFor)
      .then((profile) => { if (alive) setSession(profile); })
      .catch(() => { if (alive) setSession(null); });
    const unsubscribe = onAuthChange((account) => {
      profileFor(account).then((profile) => setSession(profile)).catch(() => setSession(null));
    });
    return () => { alive = false; unsubscribe(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /** Connexion : Supabase valide l'identité, le registre fournit le profil. */
  const login = async (email, password) => {
    const account = await signIn(email, password);
    const profile = await profileFor(account);
    if (!profile) {
      /* Compte authentifié mais absent du registre : on ne laisse pas de session orpheline. */
      await signOut();
      throw new Error(
        isAuthConfigured
          ? "Ce compte n'est rattaché à aucun titulaire du registre."
          : "Aucun compte ne correspond à cette adresse."
      );
    }
    setSession(profile);
    go(profile.role === "ADMIN" ? { view: "admin", page: "dashboard" } : { view: "dashboard" });
  };

  const logout = async () => {
    await signOut();
    setSession(null);
    go({ view: "home" });
  };

  const notify = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  /* --- helpers d'accès --- */
  const userOf = (c) => db.users.find((u) => u.id === c.user_id);
  const typeOf = (c) => db.types.find((t) => t.id === c.certificate_type_id);
  const certByToken = (t) => db.certificates.find((c) => c.public_token === t);
  const certByRef = (r) => db.certificates.find((c) => c.reference.toUpperCase().trim() === r.toUpperCase().trim());
  const verifyUrl = (c) => `${BASE_URL}/verify/${c.public_token}`;

  const log = (action, entity_id, metadata) =>
    setDb((d) => ({
      ...d,
      audit_logs: [
        { id: (d.audit_logs.at(-1)?.id || 0) + 1, actor: session ? `${session.first_name} ${session.last_name}` : "Public", action, entity_type: "certificate", entity_id, metadata, created_at: new Date().toISOString() },
        ...d.audit_logs,
      ],
    }));

  const recordVerification = (certId, source) =>
    setDb((d) => ({
      ...d,
      verifications: [...d.verifications, { id: (d.verifications.at(-1)?.id || 0) + 1, certificate_id: certId, verified_at: new Date().toISOString(), source, country: "CI" }],
    }));

  const recordShare = (certId, platform) => {
    setDb((d) => ({ ...d, shares: [...d.shares, { id: (d.shares.at(-1)?.id || 0) + 1, certificate_id: certId, platform, shared_at: new Date().toISOString() }] }));
    log("CERTIFICATE_SHARED", certId, platform);
  };

  const go = (r) => { setRoute(r); window.scrollTo(0, 0); };

  /* --- registre public ---------------------------------------------------
     Supabase quand il est configuré, registre local sinon. Les deux chemins
     rendent la même forme d'objet ; les champs que les fonctions Supabase ne
     renvoient pas restent simplement absents, et l'interface s'adapte. */

  /** Projection publique d'un certificat local, alignée sur les fonctions Supabase. */
  const toPublic = (c) => {
    const u = userOf(c);
    const t = typeOf(c);
    return {
      reference: c.reference,
      holder_name: `${u.first_name} ${u.last_name}`,
      certification: t.name,
      issuer: "VIZDATA",
      issue_date: c.issue_date,
      expiry_date: c.expiry_date,
      score: c.score,
      status: effectiveStatus(c),
      revoke_reason: c.revoke_reason,
      public_token: c.public_token,
      description: t.description,
      duration: c.duration,
      trainer: c.trainer,
      signatory: c.signatory,
      /* Les compétences sont des identifiants dans le registre local et des
         noms côté base : on aligne sur les noms. */
      skills: (c.skills || []).map((id) => SKILLS.find((s) => s.id === id)?.name).filter(Boolean),
      /* Seul le registre local permet d'alimenter l'historique et les compteurs. */
      local_record: c,
    };
  };

  const findByReference = async (reference) => {
    if (isAuthConfigured) return api.verifyByReference(reference);
    const c = certByRef(reference);
    if (!c) return null;
    recordVerification(c.id, "reference");
    log("CERTIFICATE_VERIFIED", c.id, c.reference);
    return toPublic(c);
  };

  const findByToken = async (token, source = "qr") => {
    if (isAuthConfigured) return api.verifyByToken(token, source);
    const c = certByToken(token);
    if (!c) return null;
    recordVerification(c.id, source);
    log("CERTIFICATE_VERIFIED", c.id, c.reference);
    return toPublic(c);
  };

  /** Certificats visibles par le compte connecté, dans la forme commune. */
  const myCertificates = async () => {
    if (isAuthConfigured) {
      const rows = await api.fetchMyCertificates(`${session.first_name} ${session.last_name}`);
      /* La table porte le statut stocké ; on lui applique la même règle
         d'expiration que effective_status() côté base. */
      return rows.map((c) => ({ ...c, status: effectiveStatus(c) }));
    }
    return db.certificates.filter((c) => c.user_id === session.id).map(toPublic);
  };

  /** Enregistre le profil du titulaire connecté. */
  const saveProfile = async (fields) => {
    if (isAuthConfigured) {
      const updated = await api.updateProfile(session.id, fields);
      setSession(updated);
      return updated;
    }
    const merged = { ...session, ...fields };
    setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === merged.id ? merged : u)) }));
    setSession(merged);
    return merged;
  };

  /** Comptabilise un partage : par RPC côté base, en local sinon. */
  const recordPublicShare = async (cert, platform) => {
    if (isAuthConfigured) {
      if (cert.public_token) await api.recordShare(cert.public_token, platform);
      return;
    }
    if (cert.local_record) recordShare(cert.local_record.id, platform);
  };

  const findProfile = async (username) => {
    if (isAuthConfigured) return api.publicProfile(username);
    const u = db.users.find((x) => x.username === username);
    if (!u || !u.public_profile) return [];
    return db.certificates
      .filter((c) => c.user_id === u.id && effectiveStatus(c) === "ACTIVE")
      .map((c) => ({
        holder_name: `${u.first_name} ${u.last_name}`,
        certification: typeOf(c).name,
        reference: c.reference,
        issue_date: c.issue_date,
        public_token: c.public_token,
      }));
  };

  /* --- rendu --- */
  const shared = { db, setDb, session, setSession, login, logout, route, go, notify, userOf, typeOf, certByToken, certByRef, verifyUrl, log, recordVerification, recordShare, recordPublicShare, toPublic, findByReference, findByToken, findProfile, myCertificates, saveProfile };

  let screen;
  switch (route.view) {
    case "verify": screen = <VerifySearch {...shared} />; break;
    case "verifyResult": screen = <VerifyResult {...shared} />; break;
    case "login": screen = <Login {...shared} />; break;
    case "about": screen = <About {...shared} />; break;
    case "publicProfile": screen = <PublicProfile {...shared} />; break;
    case "dashboard":
    case "myprofile":
    case "mysettings": screen = <CertifiedSpace {...shared} />; break;
    case "admin": screen = <AdminSpace {...shared} />; break;
    default: screen = <Home {...shared} />;
  }

  return (
    <div className="vz">
      {screen}
      {toast && <div className="vz-toast">{toast}</div>}
    </div>
  );
}
