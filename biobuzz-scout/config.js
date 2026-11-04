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
//             add  miss: true  for a "missed shots" counter: it is left out of
//             the Total and used to work out accuracy for its section
//    yesno    Yes / No buttons
//    choice   pick one option from a list
//    checks   tick any number of options (e.g. ranking points earned)
//             add  tags: true  to show them as quick-note chips; the lead's
//             screens then count them ("Plays defense: 3 of 4 matches")
//    text     free-typed notes
//
//  Options on choice and checks fields can carry  rp: <number>  — the ranking
//  points that option is worth. The lead's screens add them up per match.
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

  // FTC season year and region, used to find events on FTCScout.
  ftcSeason: 2026,
  region: "USMI",

  // The event phones start on. The lead can pick any other event on
  // Lead → Schedule → Find an event. "code" is the end of the event's address on
  // ftc-events.firstinspires.org (…/2026/USMICOQ → "USMICOQ").
  event: { code: "USMICOQ", name: "Coloma Qualifier" },

  // Lead PIN, stored scrambled so it can't be read here at a glance. To change it,
  // unlock the Lead screens, go to Lead → Data → "Change the lead PIN", and paste
  // the line it gives you over this one. Delete this line to turn the lock off.
  leadPinHash: "a23115c7b194fb4402aaa6aa146e05d4a0bfdb22d59d412f2af8ae40dd186a75",

  // Match mode timer, in seconds. Each section below says which period it
  // belongs to ("auto", "teleop" or "after" the match); match mode shows only
  // the sections for the current period.
  matchTiming: { auto: 30, transition: 8, teleop: 120, endgameAt: 60, endgameText: "1:00 left: Nectar may go into Flowers" },

  // Two counters whose difference is at least this big get flagged when two
  // scouts watched the same robot in the same match.
  flagDifference: 3,

  // Every Michigan FTC team is already in teams.js, and the lead's event download
  // adds names for every team at the event. Use this only to fix a name; anything
  // here wins over both. Format: "team number": "team name"
  teams: {
    // "1234": "Hive Mind",
    "37927": "2PawR - Wasps", // rookie team at Coloma, missing from the FTCScout Michigan list
  },

  // Colors used by counters. Any CSS color works.
  colors: {
    pollen: "#d9a400",
    nectar: "#7b55d6",
    missed: "#8c8577",
  },

  sections: [
    {
      id: "auto",
      title: "Auto",
      short: "Auto",
      phase: "auto",
      hint: "Autonomous period. Tap + for each piece scored or shot missed (leave at 0 if none).",
      fields: [
        { id: "pollen", type: "counter", label: "Pollen", color: "pollen" },
        { id: "nectar", type: "counter", label: "Nectar", color: "nectar" },
        { id: "missed", type: "counter", label: "Missed", color: "missed", miss: true },
        { id: "leave", type: "yesno", label: "LEAVE completed?", short: "Leave" },
        { id: "pick", type: "yesno", label: "Can pick POLLEN from FLOWERS?", short: "Auto pick" },
        { id: "park", type: "yesno", label: "PARK in LOADING ZONE?", short: "Auto park" },
      ],
    },
    {
      id: "tele",
      title: "Teleop",
      short: "Teleop",
      phase: "teleop",
      hint: "Driver-controlled period. Tap + for each piece scored or shot missed.",
      fields: [
        { id: "pollen", type: "counter", label: "Pollen", color: "pollen" },
        { id: "nectar", type: "counter", label: "Nectar", color: "nectar" },
        { id: "missed", type: "counter", label: "Missed", color: "missed", miss: true },
        { id: "pick", type: "yesno", label: "Can pick POLLEN from FLOWERS?", short: "Tele pick" },
        {
          id: "score", type: "choice", label: "Can score in FLOWERS?", short: "Flowers",
          options: [
            { id: "pollen", label: "Pollen" },
            { id: "nectar", label: "Nectar" },
            { id: "both", label: "Both" },
            { id: "none", label: "Neither" },
          ],
        },
        { id: "park", type: "yesno", label: "PARK in LOADING ZONE?", short: "End park" },
      ],
    },
    {
      id: "final",
      title: "Final results",
      short: "Final",
      phase: "after",
      hint: "Pick one match result and mark every RP earned.",
      fields: [
        {
          id: "result", type: "choice", label: "Alliance match result", short: "Result",
          options: [
            { id: "win", label: "Win (3 RP)", short: "W", tone: "good", rp: 3 },
            { id: "tie", label: "Tie (1 RP)", short: "T", rp: 1 },
            { id: "loss", label: "Loss", short: "L", tone: "bad", rp: 0 },
          ],
        },
        {
          id: "rp", type: "checks", label: "Bonus RP earned", short: "Bonus RP",
          options: [
            { id: "swarm", label: "Swarm", rp: 1 },
            { id: "p1", label: "Pollinator 1", rp: 1 },
            { id: "p2", label: "Pollinator 2", rp: 1 },
          ],
        },
      ],
    },
    {
      id: "rel",
      title: "Reliability & notes",
      short: "Robot",
      phase: ["teleop", "after"],
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
          // Quick notes: tap during or after the match. Keep this list short.
          id: "tags", type: "checks", tags: true, label: "Quick notes (tap any that apply)", short: "Notes",
          options: [
            { id: "fast", label: "Fast cycles", tone: "good" },
            { id: "driver", label: "Great driver", tone: "good" },
            { id: "hive", label: "Tips the Hive", tone: "good" },
            { id: "flowers", label: "Wins Flowers", tone: "good" },
            { id: "defense", label: "Plays defense" },
            { id: "slow", label: "Slow intake", tone: "warn" },
            { id: "penalty", label: "Got penalties", tone: "bad" },
            { id: "tipped", label: "Robot tipped over", tone: "bad" },
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
