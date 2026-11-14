/* Les écritures de l'administration, en un seul endroit.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Chaque écran portait jusqu'ici sa propre bifurcation « si le registre
 * distant est configuré, appeler l'API ; sinon, modifier l'objet local ».
 * Le même raisonnement était donc réécrit dans le formulaire de certificat,
 * dans les paramètres, dans l'import — avec des divergences inévitables : le
 * registre local créait un titulaire à la volée là où le distant refusait.
 *
 * Ici, la bifurcation est prise une fois. Les écrans appellent toujours la
 * même méthode et ne savent pas d'où vient la donnée. Deux bénéfices : les
 * deux régimes se comportent pareil, et la démonstration reste une
 * démonstration honnête du produit.
 *
 * Ce que ce module ne fait pas
 * ----------------------------
 * Il ne vérifie aucune autorisation. Les autorisations sont tenues par la base
 * — politiques RLS, `has_perm()`, et un déclencheur qui empêche un
 * gestionnaire d'élargir ses propres droits. Ce module laisse remonter le refus
 * tel quel : c'est ainsi qu'on sait que le contrôle a bien lieu là où il compte.
 */

import * as api from "../../data/api.js";
import { nextReference, slugify } from "../../lib/certificates.js";
import { token } from "../../data/seed.js";

/** Prochain identifiant d'une collection locale. */
const prochainId = (liste) => (liste.length ? Math.max(...liste.map((x) => Number(x.id) || 0)) : 0) + 1;

function creerActions({ remote, dbRef, setDb, session, recharger }) {
  /* Le registre local est lu à travers une référence : les méthodes sont
     asynchrones, et l'objet `db` capturé à la construction serait périmé dès
     la première écriture. */
  const local = () => dbRef.current;

  /** Journalise une action. Le journal ne doit jamais faire échouer l'acte
   *  qu'il journalise : un certificat délivré reste délivré même si la trace
   *  n'a pas pu être écrite. */
  const journaliser = async (action, entityId, metadata, entityType = "certificate") => {
    if (remote) {
      await api.logAction(session.id, action, entityId, metadata, entityType);
      return;
    }
    setDb((d) => ({
      ...d,
      audit_logs: [
        {
          id: prochainId(d.audit_logs),
          actor: `${session.first_name} ${session.last_name}`,
          action,
          entity_type: entityType,
          entity_id: entityId,
          metadata,
          created_at: new Date().toISOString(),
        },
        ...d.audit_logs,
      ],
    }));
  };

  const tracerNotification = (champs) =>
    setDb((d) => ({
      ...d,
      notifications: [
        { id: prochainId(d.notifications || []), created_at: new Date().toISOString(), channel: "email", ...champs },
        ...(d.notifications || []),
      ],
    }));

  return {
    /* --- titulaires ------------------------------------------------------ */

    /** Crée un titulaire, ou retrouve celui qui porte déjà cette adresse.
     *
     *  Renvoie { titulaire, existe, invitation_envoyee, avertissement }.
     *  Le doublon n'est pas une erreur : c'est le cas courant quand on
     *  attribue une seconde certification à quelqu'un. */
    async inviterTitulaire({ email, first_name, last_name, phone, role }) {
      const adresse = email.trim().toLowerCase();

      if (remote) {
        /* La création d'un compte d'authentification demande la clé secrète :
           elle appartient à la fonction Edge, qui vérifie elle-même
           l'autorisation de l'appelant. */
        const r = await api.inviteHolder({ email: adresse, first_name, last_name, phone, role });
        if (!r.existe) {
          await journaliser("HOLDER_CREATED", r.titulaire.id, adresse, "user");
          await api.notifier("INVITATION", r.titulaire.id, { first_name });
        }
        await recharger();
        return r;
      }

      const existant = local().users.find((u) => u.email.toLowerCase() === adresse);
      if (existant) return { titulaire: existant, existe: true, invitation_envoyee: false };

      const titulaire = {
        id: prochainId(local().users),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: adresse,
        phone: phone || "",
        username: slugify(`${first_name} ${last_name}`),
        linkedin_url: "",
        public_profile: false,
        role: role || "CERTIFIED",
        account_status: "ACTIVE",
        must_change_password: true,
        permissions: {},
        invited_at: new Date().toISOString(),
        created_by: session.id,
      };
      setDb((d) => ({ ...d, users: [...d.users, titulaire] }));
      tracerNotification({ user_id: titulaire.id, recipient: adresse, kind: "INVITATION", subject: "Votre accès à VIZDATA CERTIFY", status: "SENT", sent_at: new Date().toISOString() });
      await journaliser("HOLDER_CREATED", titulaire.id, adresse, "user");
      return { titulaire, existe: false, invitation_envoyee: true };
    },

    async changerRole(utilisateur, role, permissions) {
      if (remote) {
        await api.setAccountRole(utilisateur.id, role, permissions);
        await journaliser("ROLE_CHANGED", utilisateur.id, `${utilisateur.email} → ${role}`, "user");
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, role, permissions } : u)),
      }));
      await journaliser("ROLE_CHANGED", utilisateur.id, `${utilisateur.email} → ${role}`, "user");
    },

    /** Active ou désactive un compte. On ne supprime jamais : effacer un
     *  titulaire effacerait la trace des certificats qu'il a obtenus — et la
     *  clé étrangère est en RESTRICT, la base refuserait de toute façon. */
    async changerStatutCompte(utilisateur, status) {
      if (remote) {
        await api.setAccountStatus(utilisateur.id, status);
        await journaliser(status === "DISABLED" ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED", utilisateur.id, utilisateur.email, "user");
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, account_status: status } : u)),
      }));
      await journaliser(status === "DISABLED" ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED", utilisateur.id, utilisateur.email, "user");
    },

    async changerEmail(utilisateur, email) {
      const adresse = email.trim().toLowerCase();
      if (remote) {
        await api.setAccountEmail(utilisateur.id, adresse);
        await journaliser("EMAIL_CHANGED", utilisateur.id, `${utilisateur.email} → ${adresse}`, "user");
        await api.notifier("PROFIL_MODIFIE", utilisateur.id, { detail: "Votre adresse e-mail a été modifiée par l'administration." });
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, email: adresse } : u)),
      }));
      await journaliser("EMAIL_CHANGED", utilisateur.id, `${utilisateur.email} → ${adresse}`, "user");
    },

    async majTitulaire(utilisateur, champs) {
      if (remote) {
        await api.updateProfile(utilisateur.id, champs);
        await journaliser("HOLDER_UPDATED", utilisateur.id, utilisateur.email, "user");
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, ...champs } : u)),
      }));
      await journaliser("HOLDER_UPDATED", utilisateur.id, utilisateur.email, "user");
    },

    /* --- domaines et programmes ------------------------------------------ */

    async ajouterDomaine(champs) {
      if (remote) {
        const cree = await api.createDomain(champs);
        await journaliser("DOMAIN_CREATED", cree.id, champs.code, "domain");
        await recharger();
        return cree;
      }
      const cree = { id: prochainId(local().domains), ...champs };
      setDb((d) => ({ ...d, domains: [...d.domains, cree] }));
      await journaliser("DOMAIN_CREATED", cree.id, champs.code, "domain");
      return cree;
    },

    async majDomaine(id, champs) {
      if (remote) {
        await api.updateDomain(id, champs);
        await journaliser("DOMAIN_UPDATED", id, champs.code || "", "domain");
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, domains: d.domains.map((x) => (x.id === id ? { ...x, ...champs } : x)) }));
      await journaliser("DOMAIN_UPDATED", id, champs.code || "", "domain");
    },

    async ajouterProgramme(champs) {
      if (remote) {
        const cree = await api.createProgram(champs);
        await journaliser("PROGRAM_CREATED", cree.id, champs.code, "program");
        await recharger();
        return cree;
      }
      const cree = { id: prochainId(local().types), ...champs };
      setDb((d) => ({ ...d, types: [...d.types, cree] }));
      await journaliser("PROGRAM_CREATED", cree.id, champs.code, "program");
      return cree;
    },

    async majProgramme(id, champs) {
      if (remote) {
        await api.updateProgram(id, champs);
        await journaliser("PROGRAM_UPDATED", id, champs.code || "", "program");
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, types: d.types.map((x) => (x.id === id ? { ...x, ...champs } : x)) }));
      await journaliser("PROGRAM_UPDATED", id, champs.code || "", "program");
    },

    /* --- certificats ----------------------------------------------------- */

    /** Délivre ou modifie un certificat.
     *
     *  La référence et le jeton public sont produits par la base lorsqu'elle
     *  est là : deux administrateurs qui délivrent au même instant ne doivent
     *  pas obtenir le même numéro. En démonstration, le calcul est local,
     *  faute de mieux. */
    async enregistrerCertificat({ id, programme, champs, skillIds, notifier: avertir = true }) {
      if (remote) {
        if (id) {
          await api.updateCertificate(id, champs, skillIds);
          await journaliser("CERTIFICATE_UPDATED", id, champs.reference || "");
          await recharger();
          return { id };
        }
        const cree = await api.createCertificate(
          { code: programme.code, ...champs, issued_by: session.id, template_id: programme.template_id || null },
          skillIds
        );
        await journaliser("CERTIFICATE_CREATED", cree.id, cree.reference);
        if (avertir) {
          await api.notifier("CERTIFICAT_ATTRIBUE", champs.user_id, {
            certification: programme.name,
            domain: programme.certification_domains?.name || "",
            reference: cree.reference,
          });
        }
        await recharger();
        return cree;
      }

      if (id) {
        setDb((d) => ({
          ...d,
          certificates: d.certificates.map((c) => (c.id === id ? { ...c, ...champs, skills: skillIds ?? c.skills } : c)),
        }));
        await journaliser("CERTIFICATE_UPDATED", id, champs.reference || "");
        return { id };
      }

      const annee = new Date(champs.issue_date).getFullYear();
      const cree = {
        id: prochainId(local().certificates),
        reference: nextReference(local().certificates, programme.code, annee),
        public_token: token(),
        template_id: programme.template_id || 1,
        issued_by: session.id,
        status: "ACTIVE",
        expiry_date: null,
        score: null,
        pdf_url: "",
        revoke_reason: "",
        created_at: new Date().toISOString(),
        ...champs,
        skills: skillIds || [],
      };
      setDb((d) => ({ ...d, certificates: [cree, ...d.certificates] }));
      await journaliser("CERTIFICATE_CREATED", cree.id, cree.reference);
      if (avertir) {
        const titulaire = local().users.find((u) => u.id === champs.user_id);
        tracerNotification({
          user_id: champs.user_id,
          recipient: titulaire?.email || "",
          kind: "CERTIFICAT_ATTRIBUE",
          subject: `Votre certification ${programme.name} est disponible`,
          status: "SENT",
          sent_at: new Date().toISOString(),
          payload: { reference: cree.reference },
        });
      }
      return cree;
    },

    async changerStatutCertificat(cert, status, motif) {
      if (remote) {
        await api.setCertificateStatus(cert.id, status, motif);
        await journaliser(status === "REVOKED" ? "CERTIFICATE_REVOKED" : "CERTIFICATE_CANCELLED", cert.id, cert.reference);
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        certificates: d.certificates.map((c) => (c.id === cert.id ? { ...c, status, revoke_reason: motif || "" } : c)),
      }));
      await journaliser(status === "REVOKED" ? "CERTIFICATE_REVOKED" : "CERTIFICATE_CANCELLED", cert.id, cert.reference);
    },

    journaliser,
  };
}

export { creerActions, prochainId };
