// rights.js — the 21 constitutional rights across 4 clusters, plus the
// per-module Level-of-Assurance map. Exercising a right is a module gated by
// the GovID at the right's required LoA.

export const CLUSTERS = ["substrate", "survival", "development", "participation"];

export const RIGHTS = [
  // substrate (8)
  { slug: "body", name: "Body", cluster: "substrate", loa: 1 },
  { slug: "free_will", name: "Free Will", cluster: "substrate", loa: 1 },
  { slug: "identity", name: "Identity", cluster: "substrate", loa: 1 },
  { slug: "truth", name: "Truth", cluster: "substrate", loa: 1 },
  { slug: "language", name: "Language", cluster: "substrate", loa: 1 },
  { slug: "communication", name: "Communication", cluster: "substrate", loa: 1 },
  { slug: "family", name: "Family", cluster: "substrate", loa: 1 },
  { slug: "healthy_planet", name: "Healthy Planet", cluster: "substrate", loa: 1 },
  // survival (7)
  { slug: "clean_water", name: "Clean Water", cluster: "survival", loa: 1 },
  { slug: "food", name: "Food", cluster: "survival", loa: 1 },
  { slug: "health", name: "Health", cluster: "survival", loa: 2 },
  { slug: "energy", name: "Energy", cluster: "survival", loa: 1 },
  { slug: "shelter", name: "Shelter", cluster: "survival", loa: 1 },
  { slug: "be_safe", name: "Be Safe", cluster: "survival", loa: 1 },
  { slug: "peace", name: "Peace", cluster: "survival", loa: 1 },
  // development (3)
  { slug: "education", name: "Education", cluster: "development", loa: 1 },
  { slug: "rest", name: "Rest", cluster: "development", loa: 1 },
  { slug: "technology", name: "Technology", cluster: "development", loa: 1 },
  // participation (3)
  { slug: "justice", name: "Justice", cluster: "participation", loa: 2 },
  { slug: "business", name: "Business", cluster: "participation", loa: 2 },
  { slug: "travel", name: "Travel", cluster: "participation", loa: 1 },
];

// Modules = the 21 rights plus a few platform modules. Value is required LoA.
const MODULES = {
  ...Object.fromEntries(RIGHTS.map(r => [r.slug, r.loa])),
  pay: 1,         // generating a non-custodial payment reference needs only a GovID
  learning: 1,    // the education thread
  succession: 3,  // naming/changing an heir (Generational law) — requires in-person LoA-3
};

export const moduleLoA = slug => (slug in MODULES ? MODULES[slug] : null);
export const listRights = () => RIGHTS;
