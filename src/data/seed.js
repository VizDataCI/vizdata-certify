/* Jeu de données de démonstration, reconstruit à chaque registre vierge. */

import { TODAY } from "../lib/dates.js";

const BASE_URL = "https://certify.vizdata.ci";

const SKILLS = [
  { id: 1, name: "Excel avancé" },
  { id: 2, name: "Data Analysis" },
  { id: 3, name: "Power Query" },
  { id: 4, name: "Power BI" },
  { id: 5, name: "Data Visualization" },
  { id: 6, name: "DAX" },
  { id: 7, name: "Tableaux croisés dynamiques" },
  { id: 8, name: "Storytelling data" },
  { id: 9, name: "SQL" },
  { id: 10, name: "Modélisation" },
];

const SEED_TYPES = [
  { id: 1, code: "EXCEL", name: "Excel Data Analyst", description: "Analyse de données avancée sous Excel.", default_duration: 40, validity_period: 24, status: "ACTIVE" },
  { id: 2, code: "PBI", name: "Power BI Analyst", description: "Modélisation et restitution sous Power BI.", default_duration: 35, validity_period: 24, status: "ACTIVE" },
  { id: 3, code: "DATA", name: "Data Analyst", description: "Parcours complet d'analyse de données.", default_duration: 80, validity_period: 36, status: "ACTIVE" },
  { id: 4, code: "EXPERT", name: "Microsoft Excel Expert", description: "Maîtrise experte de Microsoft Excel.", default_duration: 60, validity_period: null, status: "ACTIVE" },
  { id: 5, code: "VIZ", name: "Data Visualization", description: "Conception de visualisations et de tableaux de bord.", default_duration: 25, validity_period: 24, status: "ACTIVE" },
];

const SEED_USERS = [
  { id: 1, first_name: "Fabrice", last_name: "BOH", email: "fabrice.boh@vizdata.ci", username: "fabrice-boh", linkedin_url: "https://linkedin.com/in/fabriceboh", public_profile: true, role: "CERTIFIED" },
  { id: 2, first_name: "Aminata", last_name: "KONÉ", email: "aminata.kone@example.ci", username: "aminata-kone", linkedin_url: "", public_profile: true, role: "CERTIFIED" },
  { id: 3, first_name: "Serge", last_name: "N'GUESSAN", email: "serge.nguessan@example.ci", username: "serge-nguessan", linkedin_url: "", public_profile: false, role: "CERTIFIED" },
  { id: 4, first_name: "Mariam", last_name: "TOURÉ", email: "mariam.toure@example.ci", username: "mariam-toure", linkedin_url: "", public_profile: true, role: "CERTIFIED" },
  { id: 5, first_name: "Kouassi", last_name: "YAO", email: "kouassi.yao@example.ci", username: "kouassi-yao", linkedin_url: "", public_profile: false, role: "CERTIFIED" },
  { id: 99, first_name: "Direction", last_name: "VIZDATA", email: "admin@vizdata.ci", username: "vizdata", linkedin_url: "", public_profile: false, role: "ADMIN" },
];

const rawCerts = [
  [1, 1, 1, "VIZ-2026-EXCEL-000125", "2026-07-15", "2028-07-15", "ACTIVE", 92, [1, 3, 7]],
  [2, 1, 2, "VIZ-2026-PBI-000142", "2026-05-20", "2028-05-20", "ACTIVE", 88, [4, 6, 5]],
  [3, 1, 3, "VIZ-2025-DATA-000067", "2025-03-10", "2026-03-10", "ACTIVE", 81, [2, 9, 10]],
  [4, 2, 1, "VIZ-2026-EXCEL-000131", "2026-06-02", "2028-06-02", "ACTIVE", 95, [1, 7]],
  [5, 2, 5, "VIZ-2026-VIZ-000018", "2026-07-28", "2028-07-28", "ACTIVE", 90, [5, 8]],
  [6, 3, 2, "VIZ-2026-PBI-000138", "2026-04-11", "2028-04-11", "ACTIVE", 79, [4, 6]],
  [7, 3, 4, "VIZ-2026-EXPERT-000009", "2026-02-19", null, "ACTIVE", 97, [1, 3, 7, 10]],
  [8, 3, 3, "VIZ-2025-DATA-000071", "2025-11-05", null, "REVOKED", 74, [2, 9]],
  [9, 4, 1, "VIZ-2026-EXCEL-000104", "2026-01-23", "2028-01-23", "ACTIVE", 85, [1, 7]],
  [10, 4, 5, "VIZ-2026-VIZ-000011", "2026-03-30", "2028-03-30", "ACTIVE", 91, [5, 8]],
  [11, 4, 2, "VIZ-2026-PBI-000150", "2026-08-01", "2028-08-01", "ACTIVE", 93, [4, 6, 10]],
  [12, 5, 3, "VIZ-2026-DATA-000082", "2026-05-14", "2029-05-14", "ACTIVE", 87, [2, 9, 10]],
  [13, 5, 1, "VIZ-2025-EXCEL-000098", "2025-06-08", "2026-06-08", "ACTIVE", 76, [1, 3]],
  [14, 5, 4, "VIZ-2026-EXPERT-000012", "2026-06-25", null, "CANCELLED", 68, [1]],
  [15, 2, 3, "VIZ-2026-DATA-000079", "2026-02-05", "2029-02-05", "ACTIVE", 84, [2, 5, 9]],
];

function token(n = 14) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function buildSeed() {
  const certificates = rawCerts.map(([id, uid, tid, ref, issue, exp, status, score, skills]) => ({
    id,
    reference: ref,
    public_token: token(),
    user_id: uid,
    certificate_type_id: tid,
    issue_date: issue,
    expiry_date: exp,
    status,
    score,
    duration: SEED_TYPES.find((t) => t.id === tid).default_duration,
    trainer: "Fabrice BOH",
    signatory: "Direction VIZDATA",
    pdf_url: "",
    skills,
    revoke_reason: status === "REVOKED" ? "Non-respect de la charte d'usage du certificat." : "",
    created_at: issue,
  }));

  const verifications = [];
  let vid = 1;
  certificates.forEach((c) => {
    const n = c.status === "ACTIVE" ? 2 + Math.floor(Math.random() * 7) : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const base = new Date(c.issue_date).getTime();
      const t = base + Math.random() * (TODAY.getTime() - base);
      verifications.push({
        id: vid++,
        certificate_id: c.id,
        verified_at: new Date(t).toISOString(),
        source: ["qr", "reference", "lien"][Math.floor(Math.random() * 3)],
        country: ["CI", "CI", "CI", "FR", "SN", "BF"][Math.floor(Math.random() * 6)],
      });
    }
  });

  const shares = [];
  let sid = 1;
  certificates.slice(0, 9).forEach((c) => {
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++)
      shares.push({
        id: sid++,
        certificate_id: c.id,
        platform: ["linkedin", "whatsapp", "email", "copy_link"][Math.floor(Math.random() * 4)],
        shared_at: new Date().toISOString(),
      });
  });

  const audit_logs = certificates.map((c, i) => ({
    id: i + 1,
    actor: "Direction VIZDATA",
    action: "CERTIFICATE_CREATED",
    entity_type: "certificate",
    entity_id: c.id,
    metadata: c.reference,
    created_at: c.created_at + "T09:00:00",
  }));

  return { users: SEED_USERS, types: SEED_TYPES, certificates, verifications, shares, audit_logs };
}

export { BASE_URL, SKILLS, token, buildSeed };
