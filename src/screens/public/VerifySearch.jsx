/* Saisie d'une référence à vérifier.
 *
 * C'est la page d'un employeur qui tient un certificat en main. Elle n'a qu'un
 * travail : lui faire poser la question en une fois. Tout ce qui n'y concourt
 * pas en a été retiré.
 *
 * Elle se présentait comme une boîte de connexion : un sceau de marque, un
 * titre centré, un champ étroit au milieu d'une carte de 440 px. Rien ne
 * disait OÙ trouver la référence qu'on lui demandait, et c'est pourtant la
 * seule chose qu'il ignore. Le libellé le dit désormais, et le QR code — qui
 * est le chemin le plus court, et celui que l'on prend de toute façon — est
 * nommé à côté du champ plutôt que laissé deviner.
 */

import { useState, useEffect, useRef } from "react";
import { REFERENCE_EXEMPLE } from "../../data/seed.js";
import { IconeQr } from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

function VerifySearch(p) {
  const [ref, setRef] = useState(p.route.prefill || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const launched = useRef(false);

  const submit = async (value) => {
    const query = (value ?? ref).trim();
    if (!query || busy) return;
    setBusy(true);
    setErr("");
    try {
      const certificate = await p.findByReference(query);
      if (!certificate) {
        setErr("Aucun certificat ne correspond à cette référence. Vérifiez la saisie, tirets compris.");
        setBusy(false);
        return;
      }
      /* Le certificat déjà résolu voyage avec la route : la page n'a pas à
         redemander ce qu'elle vient d'obtenir, ce qui compterait une seconde
         consultation. L'adresse, elle, devient partageable. */
      p.go({ view: "verifyResult", token: certificate.public_token, certificate, source: "reference" });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  /* Référence arrivée depuis l'accueil : on vérifie sans faire ressaisir. */
  useEffect(() => {
    if (p.route.prefill && !launched.current) {
      launched.current = true;
      submit(p.route.prefill);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <PublicShell {...p}>
      <div className="vz-verif">
        <div className="vz-verif-tete">
          <div className="vz-eyebrow">Registre officiel VIZDATA</div>
          <h1 className="vz-titre-section">Vérifier un certificat</h1>
          <p className="vz-chapeau">
            Toute certification délivrée par VIZDATA porte une référence unique. Saisissez-la pour
            consulter son statut au registre — aucun compte n'est nécessaire.
          </p>
        </div>

        <div className="vz-verif-champ">
          <label className="vz-label" htmlFor="vz-ref-verif">Référence du certificat</label>
          <input
            id="vz-ref-verif"
            className="vz-input vz-input-ref"
            placeholder={REFERENCE_EXEMPLE}
            value={ref}
            onChange={(e) => { setRef(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="off"
            spellCheck="false"
            autoFocus
          />
          <p className="vz-verif-aide">
            Elle est imprimée en haut à droite du certificat, sous la mention « Certificat n° ».
          </p>

          {err && <div className="vz-alert err" style={{ marginTop: 14 }}>{err}</div>}

          <button
            className="vz-btn vz-btn-primary vz-btn-lg"
            style={{ width: "100%", marginTop: 16 }}
            onClick={() => submit()}
            disabled={busy}
          >
            {busy ? "Vérification…" : "Vérifier au registre"}
          </button>
        </div>

        {/* Le QR code est le chemin le plus court, et celui qu'on prend de
            toute façon : le dire ici évite de ressaisir vingt-cinq signes à
            celui qui a le document sous les yeux. */}
        <div className="vz-verif-qr">
          <IconeQr size={19} />
          <div>
            <strong>Le certificat porte un QR code</strong>
            <p>Scannez-le avec l'appareil photo du téléphone : il ouvre directement cette vérification.</p>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export { VerifySearch };
