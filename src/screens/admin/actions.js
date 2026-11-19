/* Les écritures de l'administration, en un seul endroit.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Chaque écran portait sa propre bifurcation « si le registre distant est
 * configuré, appeler l'API ; sinon, modifier l'objet local ». Le même
 * raisonnement était donc réécrit dans le formulaire de certificat, dans les
 * paramètres, dans l'import — avec des divergences inévitables. Ici, la
 * bifurcation est prise une fois : les écrans appellent toujours la même
 * méthode et ignorent d'où vient la donnée.
 *
 * Ce que le passage à notre propre registre a retiré d'ici
 * --------------------------------------------------------
 * La journalisation et l'envoi des courriers. L'application les déclenchait
 * après coup, en appels séparés — elle pouvait donc les oublier, et une
 * écriture non journalisée ne se voit pas. Le serveur les fait désormais dans
 * la transaction qui écrit. Le registre local, lui, les simule : c'est ce qui
 * permet à la démonstration de montrer un journal et des notifications sans
 * qu'aucun serveur ne tourne.
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

  /** Journal du registre local. Côté serveur, il n'y a rien à faire : la
   *  journalisation a lieu dans la transaction qui écrit. */
  const journaliser = (action, entityId, metadata, entityType = "certificate") => {
    if (remote) return;
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

  const tracerNotification = (champs) => {
    if (remote) return;
    setDb((d) => ({
      ...d,
      notifications: [
        { id: prochainId(d.notifications || []), created_at: new Date().toISOString(), channel: "email", ...champs },
        ...(d.notifications || []),
      ],
    }));
  };

  return {
    /* --- titulaires ------------------------------------------------------ */

    /** Crée un titulaire, ou retrouve celui qui porte déjà cette adresse.
     *
     *  Le doublon n'est pas une erreur : c'est le cas courant quand on
     *  attribue une seconde certification à quelqu'un. */
    async inviterTitulaire({ email, first_name, last_name, phone, role }) {
      const adresse = email.trim().toLowerCase();

      if (remote) {
        const r = await api.inviteHolder({ email: adresse, first_name, last_name, phone, role });
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
      journaliser("HOLDER_CREATED", titulaire.id, adresse, "user");
      return { titulaire, existe: false, invitation_envoyee: true };
    },

    async changerRole(utilisateur, role, permissions) {
      if (remote) {
        await api.setAccountRole(utilisateur.id, role, permissions);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, role, permissions } : u)) }));
      journaliser("ROLE_CHANGED", utilisateur.id, `${utilisateur.email} → ${role}`, "user");
    },

    /** Active ou désactive. On ne supprime jamais : effacer un titulaire
     *  effacerait la trace des certificats qu'il a obtenus — et la clé
     *  étrangère est en RESTRICT, la base refuserait de toute façon. */
    async changerStatutCompte(utilisateur, status) {
      if (remote) {
        await api.setAccountStatus(utilisateur.id, status);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, account_status: status } : u)) }));
      journaliser(status === "DISABLED" ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED", utilisateur.id, utilisateur.email, "user");
    },

    /* Retrait du second facteur par un administrateur : le secours de
       dernier recours quand le téléphone ET les codes de secours sont perdus. */
    async retirerDoubleFacteur(utilisateur) {
      if (remote) {
        await api.retirerDoubleFacteur(utilisateur.id);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, totp_actif: false } : u)) }));
      journaliser(DOUBLE_FACTEUR_RETIRE, utilisateur.id, utilisateur.email, user);
    },

    async changerEmail(utilisateur, email) {
      const adresse = email.trim().toLowerCase();
      if (remote) {
        await api.setAccountEmail(utilisateur.id, adresse);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, email: adresse } : u)) }));
      journaliser("EMAIL_CHANGED", utilisateur.id, `${utilisateur.email} → ${adresse}`, "user");
    },

    async majTitulaire(utilisateur, champs) {
      if (remote) {
        await api.updateAccount(utilisateur.id, champs);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === utilisateur.id ? { ...u, ...champs } : u)) }));
      journaliser("HOLDER_UPDATED", utilisateur.id, utilisateur.email, "user");
    },

    /** Renvoie une invitation à un compte qui n'a pas encore de mot de passe. */
    async relancerInvitation(utilisateur) {
      if (remote) return api.resendInvitation(utilisateur.id);
      tracerNotification({ user_id: utilisateur.id, recipient: utilisateur.email, kind: "INVITATION", subject: "Votre accès à VIZDATA CERTIFY", status: "SENT", sent_at: new Date().toISOString() });
      return { envoye: true };
    },

    /* --- domaines et programmes ------------------------------------------ */

    async ajouterDomaine(champs) {
      if (remote) {
        const cree = await api.createDomain(champs);
        await recharger();
        return cree;
      }
      const cree = { id: prochainId(local().domains), ...champs };
      setDb((d) => ({ ...d, domains: [...d.domains, cree] }));
      journaliser("DOMAIN_CREATED", cree.id, champs.code, "domain");
      return cree;
    },

    async majDomaine(id, champs) {
      if (remote) {
        await api.updateDomain(id, champs);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, domains: d.domains.map((x) => (x.id === id ? { ...x, ...champs } : x)) }));
      journaliser("DOMAIN_UPDATED", id, champs.code || "", "domain");
    },

    async ajouterProgramme(champs) {
      if (remote) {
        const cree = await api.createProgram(champs);
        await recharger();
        return cree;
      }
      const cree = { id: prochainId(local().types), ...champs };
      setDb((d) => ({ ...d, types: [...d.types, cree] }));
      journaliser("PROGRAM_CREATED", cree.id, champs.code, "program");
      return cree;
    },

    async majProgramme(id, champs) {
      if (remote) {
        await api.updateProgram(id, champs);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, types: d.types.map((x) => (x.id === id ? { ...x, ...champs } : x)) }));
      journaliser("PROGRAM_UPDATED", id, champs.code || "", "program");
    },

    /* --- compétences ----------------------------------------------------- *
     *
     * Le référentiel est commun à tous les programmes, et il se remplit à la
     * main. Une compétence ne s'invente pas au moment d'attribuer : ce qui
     * figure sur un certificat engage VIZDATA.
     *
     * Le serveur rend la compétence existante si le nom est déjà pris, sans
     * créer de doublon : « Power Query » saisi deux fois donnerait deux cases
     * à cocher identiques. */
    async ajouterCompetence(nom) {
      const propre = (nom || "").trim();
      if (!propre) throw new Error("Nommez la compétence à ajouter.");
      if (remote) {
        const creee = await api.createSkill({ name: propre });
        await recharger();
        return creee;
      }
      const deja = (local().skills || []).find((s) => s.name.toLowerCase() === propre.toLowerCase());
      if (deja) return deja;
      const creee = { id: prochainId(local().skills || []), name: propre, description: "" };
      setDb((d) => ({ ...d, skills: [...(d.skills || []), creee] }));
      journaliser("SKILL_CREATED", creee.id, propre, "skill");
      return creee;
    },

    async majCompetence(id, champs) {
      if (remote) {
        await api.updateSkill(id, champs);
        await recharger();
        return;
      }
      setDb((d) => ({ ...d, skills: (d.skills || []).map((x) => (x.id === id ? { ...x, ...champs } : x)) }));
      journaliser("SKILL_UPDATED", id, champs.name || "", "skill");
    },

    /* --- certificats ----------------------------------------------------- */

    /** Délivre ou modifie un certificat.
     *
     *  Côté serveur, la référence et le jeton public sont produits dans la
     *  transaction d'insertion : deux administrateurs qui délivrent au même
     *  instant ne peuvent pas obtenir le même numéro. En démonstration, le
     *  calcul est local, faute de mieux. */
    async enregistrerCertificat({ id, programme, champs, skillIds, notifier: avertir = true }) {
      if (remote) {
        if (id) {
          const maj = await api.updateCertificate(id, champs, skillIds);
          await recharger();
          return maj;
        }
        const cree = await api.createCertificate(champs, skillIds, { notifier: avertir });
        await recharger();
        return cree;
      }

      if (id) {
        setDb((d) => ({
          ...d,
          certificates: d.certificates.map((c) => (c.id === id ? { ...c, ...champs, skills: skillIds ?? c.skills } : c)),
        }));
        journaliser("CERTIFICATE_UPDATED", id, champs.reference || "");
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
      journaliser("CERTIFICATE_CREATED", cree.id, cree.reference);
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
        await recharger();
        return;
      }
      setDb((d) => ({
        ...d,
        certificates: d.certificates.map((c) => (c.id === cert.id ? { ...c, status, revoke_reason: motif || "" } : c)),
      }));
      journaliser(status === "REVOKED" ? "CERTIFICATE_REVOKED" : "CERTIFICATE_CANCELLED", cert.id, cert.reference);
    },

    journaliser,
  };
}

export { creerActions, prochainId };
