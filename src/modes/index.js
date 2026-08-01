import { DATA_FIRST_PROFILE } from "./data-first.js";
import { EVIDENCE_FIRST_PROFILE } from "./evidence-first.js";

const PROFILES = [DATA_FIRST_PROFILE, EVIDENCE_FIRST_PROFILE];
const PROFILE_MAP = new Map(PROFILES.map((profile) => [profile.mode, profile]));

export function getModeProfile(mode) {
  const profile = PROFILE_MAP.get(mode);
  if (!profile) throw new Error('unknown mode "' + mode + '"');
  return profile;
}

export function listModeProfiles({ locale = "en" } = {}) {
  const language = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  return PROFILES.map((profile) => ({
    ...profile,
    label: profile.labels[language],
    description: profile.descriptions[language],
    labels: { ...profile.labels },
    descriptions: { ...profile.descriptions }
  }));
}
