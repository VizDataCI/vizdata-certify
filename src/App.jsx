/* ============================================================================
   VIZDATA CERTIFY
   Plateforme de gestion, délivrance, archivage, consultation et vérification
   des certifications délivrées par VIZDATA.

   Ce module porte l'état applicatif, le routage et la persistance ;
   les écrans vivent dans src/screens, les briques d'interface dans src/ui.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { BASE_URL, SKILLS } from "./data/seed.js";
import { STORE_KEY, loadDb } from "./data/store.js";
import * as api from "./data/api.js";
import { currentUser, isAuthConfigured, onAuthChange, signIn, signOut } from "./lib/auth.js";
import { effectiveStatus } from "./lib/certificates.js";
import { estAdministration } from "./lib/permissions.js";
import { currentRoute, onNavigate, pushRoute, toPath } from "./lib/router.js";
import { NotFound } from "./screens/public/NotFound.jsx";
import { Academie } from "./screens/academie/Academie.jsx";
import { AdminSpace } from "./screens/admin/AdminSpace.jsx";
import { CertifiedSpace } from "./screens/certified/CertifiedSpace.jsx";
import { About } from "./screens/public/About.jsx";
import { Home } from "./screens/public/Home.jsx";
import { Login } from "./screens/public/Login.jsx";
import { ForgotPassword, NewPassword } from "./screens/public/MotDePasse.jsx";
import { PublicProfile } from "./screens/public/PublicProfile.jsx";
import { VerifyResult } from "./screens/public/VerifyResult.jsx";
import { VerifySearch } from "./screens/public/VerifySearch.jsx";

export default function App() {
  const [db, setDb] = useState(loadDb);
  const [route, setRoute] = useState(currentRoute);
  const [session, setSession] = useState(null);
  /* Tant que la session n'est pas connue, les écrans protégés doivent
     patienter plutôt que de rediriger. Avec Supabase, la session était lue
     dans le stockage du navigateur, donc connue dès le premier rendu ; elle
     vient désormais du serveur, et un accès direct à /espace renvoyait vers
     la connexion une personne parfaitement connectée. */
  const [sessionConnue, setSessionConnue] = useState(!isAuthConfigured);
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

  /** Profil applicatif du compte connecté.
   *
   *  Le registre rend le profil complet — rôle et autorisations compris — dès
   *  la connexion : il n'y a plus de compte d'authentification à rapprocher
   *  d'un profil en un second aller-retour, comme du temps où les deux
   *  vivaient dans des tables séparées. En démonstration, le profil se cherche
   *  dans le registre local par correspondance d'adresse. */
  const profileFor = async (account) => {
    if (!account) return null;
    if (isAuthConfigured) return account;
    return dbRef.current.users.find((u) => u.email.toLowerCase() === account.email) || null;
  };

  useEffect(() => {
    let alive = true;
    currentUser()
      .then(profileFor)
      .then((profile) => { if (alive) { setSession(profile); setSessionConnue(true); } })
      .catch(() => { if (alive) { setSession(null); setSessionConnue(true); } });
    const unsubscribe = onAuthChange((account) => {
      profileFor(account).then((profile) => setSession(profile)).catch(() => setSession(null));
    });
    return () => { alive = false; unsubscribe(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /** Écran d'accueil d'un compte, selon son rôle et l'état de son mot de passe. */
  const accueilDe = (profile) => {
    /* Un compte qui n'a pas encore choisi son mot de passe est envoyé le
       choisir. Le laisser entrer avec le mot de passe provisoire d'une
       invitation reviendrait à n'avoir jamais demandé qu'il en choisisse un. */
    if (profile.must_change_password) return { view: "newPassword" };
    if (estAdministration(profile)) return { view: "admin", page: "dashboard" };
    return { view: "dashboard" };
  };

  /** Connexion : le registre valide l'identité et fournit le profil. */
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
    if (profile.account_status === "DISABLED") {
      await signOut();
      throw new Error("Ce compte a été désactivé. Contactez VIZDATA.");
    }
    setSession(profile);
    go(accueilDe(profile));
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
  /* Le domaine se lit soit à plat (registre local), soit sur la relation
     imbriquée que PostgREST renvoie. Les deux formes coexistent le temps
     qu'un écran soit alimenté par l'une ou par l'autre. */
  const domainOf = (t) =>
    t?.certification_domains || (db.domains || []).find((d) => d.id === t?.domain_id) || null;
  const certByToken = (t) => db.certificates.find((c) => c.public_token === t);
  const certByRef = (r) => db.certificates.find((c) => c.reference.toUpperCase().trim() === r.toUpperCase().trim());
  /* L'adresse est construite par le routeur, jamais à la main : c'est elle qui
     part dans les QR codes imprimés, et un chemin périmé y resterait gravé.
     Le lien a un temps pointé vers /verify/ alors que le routage attendait
     /verifier/ — un certificat imprimé entre-temps aurait été invérifiable. */
  const verifyUrl = (c) => BASE_URL + toPath({ view: "verifyResult", token: c.public_token });

  /* Le prochain identifiant est le PLUS GRAND plus un, jamais « celui du
     dernier élément plus un » : le journal est rangé du plus récent au plus
     ancien, si bien que le dernier élément est le plus VIEUX. La version
     précédente repartait donc de 1 à chaque écriture et produisait des
     identifiants en double, que React signalait comme clés dupliquées. */
  const prochainId = (liste) => (liste.length ? Math.max(...liste.map((x) => Number(x.id) || 0)) : 0) + 1;

  const log = (action, entity_id, metadata) =>
    setDb((d) => ({
      ...d,
      audit_logs: [
        { id: prochainId(d.audit_logs), actor: session ? `${session.first_name} ${session.last_name}` : "Public", action, entity_type: "certificate", entity_id, metadata, created_at: new Date().toISOString() },
        ...d.audit_logs,
      ],
    }));

  const recordVerification = (certId, source) =>
    setDb((d) => ({
      ...d,
      verifications: [...d.verifications, { id: prochainId(d.verifications), certificate_id: certId, verified_at: new Date().toISOString(), source, country: "CI" }],
    }));

  const recordShare = (certId, platform) => {
    setDb((d) => ({ ...d, shares: [...d.shares, { id: (d.shares.at(-1)?.id || 0) + 1, certificate_id: certId, platform, shared_at: new Date().toISOString() }] }));
    log("CERTIFICATE_SHARED", certId, platform);
  };

  /* Toute navigation passe par l'historique du navigateur : l'adresse suit
     l'écran, et les boutons précédent / suivant fonctionnent. */
  const go = (r) => {
    pushRoute(r);
    setRoute(r);
    window.scrollTo(0, 0);
  };

  useEffect(() => onNavigate(setRoute), []);

  /* --- registre public ---------------------------------------------------
     Le registre quand il est configuré, le jeu de démonstration sinon. Les deux
     chemins rendent la même forme d'objet ; les champs que le registre ne
     renvoie pas restent simplement absents, et l'interface s'adapte. */

  /** Projection publique d'un certificat local, alignée sur celle du registre.
   *  Ni la date d'expiration ni le score n'en font partie : ils ne sont plus
   *  exposés, et la vue publique du registre ne les porte plus non plus. */
  const toPublic = (c) => {
    const u = userOf(c);
    const t = typeOf(c);
    const d = domainOf(t);
    return {
      id: c.id,
      reference: c.reference,
      holder_name: u ? `${u.first_name} ${u.last_name}` : "Titulaire inconnu",
      certification: t?.name || "Programme inconnu",
      domain: d?.name || "",
      program_code: t?.code || "",
      issuer: "VIZDATA",
      issue_date: c.issue_date,
      status: effectiveStatus(c),
      revoke_reason: c.revoke_reason,
      public_token: c.public_token,
      description: t?.description || "",
      duration: c.duration,
      trainer: c.trainer,
      signatory: c.signatory,
      created_at: c.created_at,
      /* Les compétences sont des identifiants dans le registre local et des
         noms côté base : on aligne sur les noms. */
      skills: (c.skills || []).map((id) => (db.skills || SKILLS).find((s) => s.id === id)?.name).filter(Boolean),
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
    if (!u || !u.public_profile || u.account_status === "DISABLED") return [];
    return db.certificates
      .filter((c) => c.user_id === u.id && effectiveStatus(c) === "ACTIVE")
      .map((c) => {
        const t = typeOf(c);
        return {
          holder_name: `${u.first_name} ${u.last_name}`,
          certification: t?.name || "Programme inconnu",
          domain: domainOf(t)?.name || "",
          reference: c.reference,
          issue_date: c.issue_date,
          public_token: c.public_token,
        };
      });
  };

  /* --- rendu --- */
  const shared = {
    db, setDb, session, setSession, sessionConnue, login, logout, route, go, notify,
    userOf, typeOf, domainOf, certByToken, certByRef, verifyUrl, log,
    recordVerification, recordShare, recordPublicShare, toPublic,
    findByReference, findByToken, findProfile, myCertificates, saveProfile,
  };

  let screen;
  switch (route.view) {
    case "verify": screen = <VerifySearch {...shared} />; break;
    case "verifyResult": screen = <VerifyResult {...shared} />; break;
    case "login": screen = <Login {...shared} />; break;
    case "forgotPassword": screen = <ForgotPassword {...shared} />; break;
    case "newPassword": screen = <NewPassword {...shared} />; break;
    case "about": screen = <About {...shared} />; break;
    case "academie": screen = <Academie {...shared} />; break;
    case "publicProfile": screen = <PublicProfile {...shared} />; break;
    case "dashboard":
    case "myprofile":
    case "mysettings": screen = <CertifiedSpace {...shared} />; break;
    case "admin": screen = <AdminSpace {...shared} />; break;
    case "notFound": screen = <NotFound {...shared} />; break;
    default: screen = <Home {...shared} />;
  }

  return (
    <div className="vz">
      {screen}
      {toast && <div className="vz-toast">{toast}</div>}
    </div>
  );
}
