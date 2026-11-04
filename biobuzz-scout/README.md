# BioBuzz Scout

A scouting app for robotics competitions that works **with no internet at the venue**.

- **Scouts** fill in one robot per match on their phone, with the same questions as the paper sheet.
- After each match, the **lead** scans a QR code on each scout's phone. No Wi‑Fi, accounts or passwords needed.
- The lead's device merges everything: results **by match** and **by robot**, with duplicate reports averaged and disagreements flagged. It can also export a spreadsheet.

It's a plain website hosted free on GitHub Pages. Once a phone has opened it and added it to the home screen, it runs in airplane mode.

---

## For scouts

**Before the event (on Wi‑Fi):**
1. Open the app link.
2. Add it to your home screen:
   - **iPhone:** in Safari, tap **Share**, then **Add to Home Screen**.
   - **Android:** open the Chrome menu **⋮**, then **Add to Home screen** or **Install app**.
3. Open it from the home screen and type your name once.

**Event morning:** once the lead has the schedule, tap **Get schedule from lead** on the Scout tab and point your camera at the lead's code. If it comes in parts, scan every part.

**Match mode (recommended):** after picking your position and match, tap **Start match** right when the match starts. The screen shows only **Auto** with a 0:30 countdown, then an 8-second transition, then only **Teleop** with a 2:00 countdown. The bar turns red at 1:00 left for the endgame. When time runs out, it shows the result and notes questions and **Save report**. If the match is delayed or you started late, use **‹ Back** and **Next ›** to move between periods. **Full form** shows everything again. If the phone locks or the app closes mid-match, reopening it picks the timer back up.

**Quick notes:** in Teleop and after the match, tap any chips that apply: *Fast cycles, Great driver, Tips the Hive, Wins Flowers, Plays defense, Slow intake, Got penalties, Robot tipped over*. It's much faster than typing. The lead sees counts like "Plays defense 3/4" and can filter by them. Use the notes box only for anything unusual.

**During the event:**
1. **Scout** tab: tap your **alliance position** (**Red 1, Red 2, Blue 1, Blue 2**; required) and enter the match number. The team number and name fill in. You can change spots any match. With no schedule, just type the team number. Then tap through the match, using **+** for every piece scored and every missed shot.
2. Tap **Save report**. The match number moves up by one, ready for the next match.
3. When the lead comes by, open **Hand off** and show the code. After they hear the beep, tap **Lead scanned it**.

If you miss a hand-off, nothing is lost. Your code keeps every report the lead hasn't scanned yet.

## For the lead

**Unlocking the Lead screens:** the **Lead** tab is hidden on every phone until you enter the lead PIN. Tap **Lead login** at the bottom of the Scout tab, or tap the app's title 5 times, and enter the PIN. That phone stays unlocked until you tap **Lock** at the top of the Lead screens. Lock it before handing your phone to anyone.

The PIN keeps scouts out of the Lead screens. It isn't strong security, because the app is a public website, but the team's merged data never leaves the lead's phone anyway. To change the PIN, see **Lead → Data → Change the lead PIN**.

**Before an event, picking it and its teams:**
1. **Lead → Schedule → Find an event.** It lists this season's upcoming Michigan events from FTCScout, so search by name or city and tap yours. Any event works, with any number of teams. You can also type an event code under **Type an event code instead**. The code is the end of the event's address on ftc-events.firstinspires.org, such as `USMICOQ`.
2. Picking an event downloads its **team list**, so every team's name fills in, including out-of-state and rookie teams. This needs a moment of internet.

**Event morning, loading the match schedule:**
1. With any internet (cell data is fine), tap **Download teams + schedule**. If it says the schedule isn't posted yet, wait a few minutes and try again.
2. No signal? Type it into **No signal? Type or paste it**, one match per line: `match red1 red2 blue1 blue2`.
3. Check a few matches against the printed schedule, then hold up **Share with scouts** so each scout can scan every part. Scanning it also moves each scout's phone onto the new event.
4. If the schedule changes, load it again and have scouts rescan.

Once a schedule is loaded, **Matches** also lists robots nobody scouted, in red.

**Several events in a season:** every report remembers its event. The lead's screens show the current event by default. Tap **All events** at the top of the Lead screens for season-long averages. The spreadsheet always includes every event, with an Event column.

**After each match:**
1. Open the **Lead** tab, then **Scan**, and tap **Start camera**. Allow camera access the first time.
2. Point at each scout's code. A beep plus a green banner means it worked. Scanning the same code twice is harmless.
3. **Scouts heard from** shows who has handed off and up to which match. Use it to spot who you missed.
4. Check **Matches** and **Robots** for the merged results. Tap a team for every report and all the notes. Orange **!** marks are places two scouts disagreed.
5. **Data** tab: tap **Save backup** every few matches and at lunch. Everything the lead scans lives only on that device. If it dies, restore the backup on another device with **Restore or combine a backup**. After every 5 new reports, the app reminds you with a banner after scanning and a **!** on the Data tab.
6. **Save spreadsheet (CSV)** opens in Excel or Google Sheets for alliance selection.

**If the camera won't start:** use **Take or pick a photo of the code** under the viewfinder. On an iPhone home-screen app, check **Settings → Safari → Camera**.

**Second lead phone:** to copy everything (reports, deletions, pick lists) to another phone with no internet, go to **Data → Second lead phone → Show transfer codes**. On the other phone, unlock Lead, open **Scan**, start the camera and point it at the codes. They change every 1.5 seconds and loop, and the receiving phone says when every part is in. Use it to share the lead role or to swap if a battery is dying. A saved backup file also works with **Restore or combine a backup**.

**Pick list:** tap ☆ next to a team on **Robots** to star it. On **Picks**, sort teams into **1st pick**, **2nd pick** or **Avoid** with the menu, and order each tier with ▲ ▼. Tier labels show on Robots and in the spreadsheet, and **Save pick list (CSV)** exports just the list. Pick lists are kept per event.

**Official results:** when you have internet, open **Official → Download official results**. It pulls scores and rankings from FTCScout and saves them for offline use. It then shows:
- **Scout check:** how often each scout's match result and bonus RP agree with the official score, with each mistake listed.
- **Official rankings** beside your scouted averages.
- Official scores on each **Matches** card, with any scouted result that doesn't match.
- An **Official rank** column on **Robots**.

Bonus RP checking works when FTCScout's ranking-point names match the option names in `config.js` (for example "Swarm" → `swarmRp`). Download again later for newer matches.

**End of the day:** scouts can clear old reports on **Hand off** → **Delete handed-off reports**. Save a lead backup first.

---

## Updating for a new season

Every season has a new game, so the questions change. **You only edit one file: `config.js`.** The scout form, QR codes, Matches and Robots screens, and the spreadsheet all build themselves from it.

1. On GitHub, open `config.js` and click the pencil icon to edit.
2. Change `season` to something new, like `"newgame-2027"`. This starts each phone on fresh, separate data. Update `ftcSeason` to the new FTC season year, and `event` to your first event's code.
3. Change `appName`, and the `colors` if you like.
4. Rewrite the `sections` list to match the new paper sheet. Each field is one line. The types are:

   | type | looks like | use it for |
   |---|---|---|
   | `counter` | big + / − buttons | game pieces scored |
   | `yesno` | Yes / No buttons | "Did it park?" |
   | `choice` | pick one | match result, climb level |
   | `checks` | tick any | ranking points earned |
   | `text` | typing box | notes |

   Example:
   ```js
   { id: "climb", type: "choice", label: "End-game climb", short: "Climb",
     options: [ { id: "none", label: "None" }, { id: "low", label: "Low" }, { id: "high", label: "High", tone: "good" } ] },
   ```
   - `id`: short, unique within the section; letters, numbers and dashes only.
   - `label`: the question scouts see. `short` is the column heading on the lead's screens.
   - `tone` (optional): `"good"`, `"warn"` or `"bad"` colors that option's badge.
   - Counters all add into the **Total** column, except ones marked `miss: true` (missed shots). Those are used for the **Accuracy** columns instead.
   - A checks field with `tags: true` shows as quick-note chips. Keep the list short (8 or fewer) so scouts actually use it.
   - Each section's `phase` (`"auto"`, `"teleop"` or `"after"`) decides when match mode shows it. Match lengths are in `matchTiming`.
   - Give choice or checks options an `rp:` number, such as `rp: 3` on Win, and the lead's screens add up **ranking points** per match.

5. Click **Commit changes**. GitHub Pages republishes in about a minute.
6. Have everyone open the app once **with internet** to pick up the change. Do this before the event, not during it.

> **Don't change fields in the middle of an event.** A phone with old settings and a phone with new settings refuse each other's codes, with a message telling the scout to update. That keeps bad data out, but it's a hassle mid-competition.

**Team names:** `teams.js` holds every Michigan FTC team (from [FTCScout](https://ftcscout.org/teams?regions=USMI)), so scouts only type the number. To add an out-of-state team or fix a name, add it to `teams` in `config.js`, for example `"1234": "Hive Mind",`. Entries there win over `teams.js`. To refresh the whole list for a new season, ask whoever maintains the app to re-download it from FTCScout.

## Publishing on GitHub Pages (one-time setup)

1. Create a free GitHub organization for the team, so the app doesn't depend on one person's account. Add next year's lead as an owner when you hand off.
2. Create a repository in it (for example `biobuzz-scout`) and upload these files.
3. In the repository, go to **Settings → Pages**. Under **Build and deployment**, pick **Deploy from a branch**, then **main** and **/ (root)**, and click **Save**.
4. After about a minute the link appears at the top of that page: `https://<org-name>.github.io/<repo-name>/`. Share it with scouts.

## How it works (for the curious)

- `index.html`, `styles.css` and `app.js` are the app. `config.js` holds the season's questions. `teams.js` holds Michigan team names.
- `sw.js` saves the app on the phone so it opens offline. It always shows the saved copy first, then downloads any update in the background for next time.
- Reports are stored in the phone's browser storage. Clearing Safari or Chrome website data erases them, so hand off before doing that.
- QR codes hold several reports each, packed tightly. A long backlog splits into "Code 1 of 3…".
- `vendor/` holds two open-source libraries: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) for making codes and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0) for reading them. `fonts/` holds Barlow Condensed and Atkinson Hyperlegible (SIL Open Font License).

### Trying it on a computer

From this folder, run `python3 -m http.server 8000` and open http://localhost:8000.
