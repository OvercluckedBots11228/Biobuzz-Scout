// ============================================================================
//  SEASON SETTINGS — this is the only file you need to edit for a new game.
// ============================================================================
//
//  Everything the scouts fill in, and every column on the lead's Matches and
//  Robots screens, is built from the list below. See README.md, section
//  "Updating for a new season", for a walkthrough.
//
//  Field types:
//    counter  big + / − buttons for things you tally (game pieces scored)
//    yesno    Yes / No buttons
//    choice   pick one option from a list
//    checks   tick any number of options (e.g. ranking points earned)
//    text     free-typed notes
//
//  Rules:
//    - Every "id" must be unique inside its section and use only letters,
//      numbers and dashes. Ids are what get saved, so don't rename one in the
//      middle of a season or old reports will lose that value.
//    - When you start a new season, change "season" below. Each season keeps
//      its own data on the phones, and phones on different seasons can't
//      swap QR codes by mistake.
// ============================================================================

window.SCOUT_CONFIG = {
  season: "biobuzz-2026",
  appName: "BioBuzz Scout",
  tagline: "One robot · one match",

  // Two counters whose difference is at least this big get flagged when two
  // scouts watched the same robot in the same match.
  flagDifference: 3,

  // Every Michigan FTC team is already in teams.js. Use this only to add a team
  // from another state or fix a name; anything here wins over teams.js.
  // Format: "team number": "team name"
  teams: {
    // "1234": "Hive Mind",
  },

  // Colors used by counters. Any CSS color works.
  colors: {
    pollen: "#d9a400",
    nectar: "#7b55d6",
  },

  sections: [
    {
      id: "auto",
      title: "Autonomous",
      short: "Auto",
      hint: "HIVE pieces scored before the driver period. Tap + for each piece.",
      fields: [
        { id: "pollen", type: "counter", label: "Pollen", color: "pollen" },
        { id: "nectar", type: "counter", label: "Nectar", color: "nectar" },
        { id: "leave", type: "yesno", label: "LEAVE completed?", short: "Leave" },
        { id: "pick", type: "yesno", label: "Picked POLLEN from FLOWERS?", short: "Auto pick" },
        { id: "park", type: "yesno", label: "PARKED in LOADING ZONE?", short: "Auto park" },
      ],
    },
    {
      id: "tele",
      title: "Teleop",
      short: "Teleop",
      hint: "HIVE pieces scored during the driver period.",
      fields: [
        { id: "pollen", type: "counter", label: "Pollen", color: "pollen" },
        { id: "nectar", type: "counter", label: "Nectar", color: "nectar" },
        { id: "pick", type: "yesno", label: "Picked POLLEN from FLOWERS?", short: "Tele pick" },
        {
          id: "score", type: "choice", label: "Scored in FLOWERS?", short: "Flowers",
          options: [
            { id: "pollen", label: "Pollen" },
            { id: "nectar", label: "Nectar" },
            { id: "both", label: "Both" },
            { id: "none", label: "Neither" },
          ],
        },
        { id: "park", type: "yesno", label: "PARKED in LOADING ZONE?", short: "End park" },
      ],
    },
    {
      id: "final",
      title: "Final results",
      short: "Final",
      fields: [
        {
          id: "result", type: "choice", label: "Alliance match result", short: "Result",
          options: [
            { id: "win", label: "Win", short: "W", tone: "good" },
            { id: "tie", label: "Tie", short: "T" },
            { id: "loss", label: "Loss", short: "L", tone: "bad" },
          ],
        },
        {
          id: "rp", type: "checks", label: "Ranking points earned", short: "RP",
          options: [
            { id: "swarm", label: "Swarm" },
            { id: "p1", label: "Pollinator 1" },
            { id: "p2", label: "Pollinator 2" },
          ],
        },
      ],
    },
    {
      id: "rel",
      title: "Reliability & notes",
      short: "Robot",
      fields: [
        {
          id: "status", type: "choice", label: "Robot reliability this match", short: "Robot",
          options: [
            { id: "ok", label: "No issues", short: "OK", tone: "good" },
            { id: "some", label: "Some issues", short: "Issues", tone: "warn" },
            { id: "dnf", label: "Disabled / DNF", short: "DNF", tone: "bad" },
          ],
        },
        {
          id: "notes", type: "text", label: "Notes (optional)",
          placeholder: "Cycle speed, defense, penalties, mechanical issues, unusual behavior",
          maxLength: 280,
        },
      ],
    },
  ],
};
