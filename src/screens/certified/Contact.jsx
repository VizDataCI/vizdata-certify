/* Joindre VIZDATA, depuis l'espace du titulaire.
 *
 * Un certifié qui a une question : une erreur sur son nom, un certificat qui
 * manque, une attestation à demander : n'avait aucun moyen de nous écrire sans
 * sortir de l'application et chercher l'adresse ailleurs. Beaucoup
 * n'écrivaient simplement pas.
 *
 * Quatre voies, et chacune pour une raison :
 *   - le site, pour qui cherche l'entreprise avant la formation ;
 *   - l'accueil général et le service formation, parce qu'un message envoyé
 *     au mauvais bureau attend une réponse qui ne viendra pas ;
 *  , WhatsApp, qui est à Abidjan la voie la plus courte, et de loin.
 *
 * Les messages partent avec un objet déjà écrit, et avec la référence du
 * compte quand on la connaît : un message qui arrive sous « (sans objet) » et
 * sans dire de qui il vient coûte un aller-retour avant même de commencer.
 */

import { ORGANISME, mailtoUrl, whatsappUrl } from "../../lib/organisme.js";
import { IconeCourriel, IconeExterne, IconeMessage, IconeSite } from "../../ui/icones.jsx";

function ContactVizdata({ session }) {
  const qui = [session?.first_name, session?.last_name].filter(Boolean).join(" ").trim();
  const signature = qui ? ` Je suis ${qui}` : "";
  const objet = qui ? `Espace certifié : ${qui}` : "Espace certifié VIZDATA CERTIFY";
  const corps = `Bonjour,${signature}, titulaire d'une certification VIZDATA.\n\n`;
  const message = `Bonjour VIZDATA,${signature}, titulaire d'une certification VIZDATA. J'ai une question au sujet de mon espace certifié.`;

  return (
    <section className="vz-card vz-contact">
      <div className="vz-card-body">
        <div className="vz-eyebrow">Une question ?</div>
        <h3 className="vz-contact-titre">Contacter VIZDATA</h3>
        <p className="vz-contact-intro">
          Une erreur sur votre nom, une certification qui manque, une attestation à demander :
          écrivez-nous, nous répondons.
        </p>

        <div className="vz-contact-boutons">
          <a className="vz-btn vz-btn-primary" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer">
            <IconeMessage size={16} />
            WhatsApp
            <span className="vz-contact-detail">{ORGANISME.whatsappAffiche}</span>
          </a>
          <a className="vz-btn" href={mailtoUrl(ORGANISME.email, objet, corps)}>
            <IconeCourriel size={16} />
            Accueil
            <span className="vz-contact-detail">{ORGANISME.email}</span>
          </a>
          <a className="vz-btn" href={mailtoUrl(ORGANISME.emailFormation, objet, corps)}>
            <IconeCourriel size={16} />
            Formation
            <span className="vz-contact-detail">{ORGANISME.emailFormation}</span>
          </a>
          <a className="vz-btn" href={ORGANISME.site} target="_blank" rel="noopener noreferrer">
            <IconeSite size={16} />
            Site
            {/* La flèche « lien externe » se place AVANT la coordonnée : la
                coordonnée occupe toute une ligne, et l'icône posée après elle
                retombait seule sur un troisième rang. */}
            <IconeExterne size={13} />
            <span className="vz-contact-detail">{ORGANISME.siteAffiche}</span>
          </a>
        </div>
      </div>
    </section>
  );
}

export { ContactVizdata };
