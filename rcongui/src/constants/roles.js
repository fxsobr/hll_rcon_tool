/**
 * Hell Let Loose - Roles Constants
 * 
 * This file contains all available roles in Hell Let Loose.
 * Source: rcon/types.py - Roles enum and ROLES_TO_LABELS
 * 
 * Keep this file in sync with the backend Python definitions.
 */

/**
 * Role values (internal identifiers)
 * These match the values used by the game and backend API
 */
export const ROLES = {
  COMMANDER: "armycommander",
  SQUAD_LEAD: "officer",
  RIFLEMAN: "rifleman",
  ENGINEER: "engineer",
  MEDIC: "medic",
  ANTI_TANK: "antitank",
  AUTOMATIC_RIFLEMAN: "automaticrifleman",
  ASSAULT: "assault",
  MACHINE_GUNNER: "heavymachinegunner",
  SUPPORT: "support",
  SPOTTER: "spotter",
  SNIPER: "sniper",
  TANK_COMMANDER: "tankcommander",
  CREWMAN: "crewman",
  ARTILLERY_OBSERVER: "artilleryobserver",
  ARTILLERY_ENGINEER: "artilleryengineer",
  ARTILLERY_SUPPORT: "artillerysupport",
};

/**
 * Mapping of role values to display labels
 * Source: rcon/types.py - ROLES_TO_LABELS
 */
export const ROLES_TO_LABELS = {
  [ROLES.COMMANDER]: "Commander",
  [ROLES.SQUAD_LEAD]: "Squad Lead",
  [ROLES.RIFLEMAN]: "Rifleman",
  [ROLES.ENGINEER]: "Engineer",
  [ROLES.MEDIC]: "Medic",
  [ROLES.ANTI_TANK]: "Anti-Tank",
  [ROLES.AUTOMATIC_RIFLEMAN]: "Automatic Rifleman",
  [ROLES.ASSAULT]: "Assault",
  [ROLES.MACHINE_GUNNER]: "Machinegunner",
  [ROLES.SUPPORT]: "Support",
  [ROLES.SPOTTER]: "Spotter",
  [ROLES.SNIPER]: "Sniper",
  [ROLES.TANK_COMMANDER]: "Tank Commander",
  [ROLES.CREWMAN]: "Crewman",
  [ROLES.ARTILLERY_OBSERVER]: "Artillery Observer",
  [ROLES.ARTILLERY_ENGINEER]: "Artillery Engineer",
  [ROLES.ARTILLERY_SUPPORT]: "Artillery Support",
};

/**
 * Get all available roles as an array of {value, label} objects
 * Ordered to match rcon/utils.py - ALL_ROLES
 * 
 * @returns {Array<{value: string, label: string}>} Array of role objects
 */
export const getAllRoles = () => [
  { value: ROLES.COMMANDER, label: ROLES_TO_LABELS[ROLES.COMMANDER] },
  { value: ROLES.SQUAD_LEAD, label: ROLES_TO_LABELS[ROLES.SQUAD_LEAD] },
  { value: ROLES.RIFLEMAN, label: ROLES_TO_LABELS[ROLES.RIFLEMAN] },
  { value: ROLES.ASSAULT, label: ROLES_TO_LABELS[ROLES.ASSAULT] },
  { value: ROLES.AUTOMATIC_RIFLEMAN, label: ROLES_TO_LABELS[ROLES.AUTOMATIC_RIFLEMAN] },
  { value: ROLES.MEDIC, label: ROLES_TO_LABELS[ROLES.MEDIC] },
  { value: ROLES.SUPPORT, label: ROLES_TO_LABELS[ROLES.SUPPORT] },
  { value: ROLES.MACHINE_GUNNER, label: ROLES_TO_LABELS[ROLES.MACHINE_GUNNER] },
  { value: ROLES.ANTI_TANK, label: ROLES_TO_LABELS[ROLES.ANTI_TANK] },
  { value: ROLES.ENGINEER, label: ROLES_TO_LABELS[ROLES.ENGINEER] },
  { value: ROLES.TANK_COMMANDER, label: ROLES_TO_LABELS[ROLES.TANK_COMMANDER] },
  { value: ROLES.CREWMAN, label: ROLES_TO_LABELS[ROLES.CREWMAN] },
  { value: ROLES.SPOTTER, label: ROLES_TO_LABELS[ROLES.SPOTTER] },
  { value: ROLES.SNIPER, label: ROLES_TO_LABELS[ROLES.SNIPER] },
  { value: ROLES.ARTILLERY_OBSERVER, label: ROLES_TO_LABELS[ROLES.ARTILLERY_OBSERVER] },
  { value: ROLES.ARTILLERY_ENGINEER, label: ROLES_TO_LABELS[ROLES.ARTILLERY_ENGINEER] },
  { value: ROLES.ARTILLERY_SUPPORT, label: ROLES_TO_LABELS[ROLES.ARTILLERY_SUPPORT] },
];

/**
 * Get the display label for a role value
 * 
 * @param {string} roleValue - The role value (e.g., "armycommander")
 * @returns {string} The display label (e.g., "Commander") or the role value if not found
 */
export const getRoleLabel = (roleValue) => {
  return ROLES_TO_LABELS[roleValue] || roleValue;
};

/**
 * Check if a role value is valid
 * 
 * @param {string} roleValue - The role value to check
 * @returns {boolean} True if the role is valid
 */
export const isValidRole = (roleValue) => {
  return Object.values(ROLES).includes(roleValue);
};

/**
 * Leadership roles (can lead squads or command)
 */
export const LEADER_ROLES = [
  ROLES.COMMANDER,
  ROLES.SQUAD_LEAD,
  ROLES.TANK_COMMANDER,
  ROLES.SPOTTER,
];

/**
 * Check if a role is a leadership role
 * 
 * @param {string} roleValue - The role value to check
 * @returns {boolean} True if the role is a leadership role
 */
export const isLeaderRole = (roleValue) => {
  return LEADER_ROLES.includes(roleValue);
};

