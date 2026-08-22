/* Rendu SVG d'un QR code. */

import { useMemo } from "react";
import { buildQR } from "../lib/qr.js";

/* La zone de silence vaut 4 modules : c'est ce qu'impose la norme, et un lecteur
   peine à isoler le code du fond en deçà. Elle était réglée à 2 partout, ce qui
   s'ajoutait à un rendu trop petit pour être scannable. */
function QRCode({ value, size = 160, quiet = 4, color = "#0C1526" }) {
  const qr = useMemo(() => buildQR(value || " "), [value]);
  if (!qr) return null;
  const total = qr.size + quiet * 2;
  const rects = [];
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++)
      if (qr.matrix[r][c]) rects.push(<rect key={r + "-" + c} x={c + quiet} y={r + quiet} width="1" height="1" fill={color} />);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" role="img" aria-label="QR code de vérification">
      <rect width={total} height={total} fill="#FFFFFF" />
      {rects}
    </svg>
  );
}

export { QRCode };
