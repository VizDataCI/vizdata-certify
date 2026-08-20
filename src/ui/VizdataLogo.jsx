/* Logo VIZDATA en SVG — net à toute taille, fidèle à l'impression. */

const VZ_TEAL = "#1E7FA6";
const VZ_PURPLE = "#4A2A63";
const VZ_ORANGE = "#F28C28";

function VizdataMark({ size = 28 }) {
  const R = 19, W = 13;
  const teal = "M17 72 L70 18 L128 73 L182 18";
  const purple = "M71 67 L127 121 L182 67";
  return (
    <svg width={size * 1.45} height={size} viewBox="-6 -6 213 152" fill="none" aria-hidden="true" style={{ display: "block" }}>
      {/* branche supérieure */}
      <path d={teal} stroke={VZ_TEAL} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" />
      {[[17, 72], [70, 18], [128, 73], [182, 18]].map(([x, y], i) => <circle key={"t" + i} cx={x} cy={y} r={R} fill={VZ_TEAL} />)}
      <circle cx="126" cy="20" r={R} fill={VZ_ORANGE} />
      {/* réserve blanche entre les deux branches */}
      <path d={purple} stroke="#FFFFFF" strokeWidth={W + 13} strokeLinecap="round" strokeLinejoin="round" />
      {[[71, 67], [127, 121], [182, 67]].map(([x, y], i) => <circle key={"w" + i} cx={x} cy={y} r={R + 6.5} fill="#FFFFFF" />)}
      {/* branche inférieure */}
      <path d={purple} stroke={VZ_PURPLE} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" />
      {[[71, 67], [127, 121], [182, 67]].map(([x, y], i) => <circle key={"p" + i} cx={x} cy={y} r={R} fill={VZ_PURPLE} />)}
    </svg>
  );
}

function VizdataLogo({ w = 108 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: w * 0.06 }}>
      <VizdataMark size={w * 0.62} />
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: w * 0.29, color: VZ_PURPLE, letterSpacing: "-.005em", lineHeight: 1 }}>
        vizdata
      </div>
    </div>
  );
}

export { VizdataMark, VizdataLogo };
