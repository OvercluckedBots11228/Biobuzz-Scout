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

**During the event:**
1. **Scout** tab: enter the team number and match number, then tap through the match. Use **+** for every piece scored.
2. Tap **Save report**. The match number moves up by one, ready for the next match.
3. When the lead comes by, open **Hand off** and show the code. After they hear the beep, tap **Lead scanned it**.

If you miss a hand-off, nothing is lost. Your code keeps every report the lead hasn't scanned yet.

## For the lead

1. Open the **Lead** tab, then **Scan**, and tap **Start camera**. Allow camera access the first time.
2. Point at each scout's code. A beep plus a green banner means it worked. Scanning the same code twice is harmless.
3. **Scouts heard from** shows who has handed off and up to which match. Use it to spot who you missed.
4. Check **Matches** and **Robots** for the merged results. Tap a team for every report and all the notes. Orange **!** marks are places two scouts disagreed.
5. **Data** tab: tap **Save backup** every few matches and at lunch. Everything the lead scans lives only on that device. If it dies, restore the backup on another device with **Restore or combine a backup**.
6. **Save spreadsheet (CSV)** opens in Excel or Google Sheets for alliance selection.

**If the camera won't start:** use **Take or pick a photo of the code** under the viewfinder. On an iPhone home-screen app, check **Settings → Safari → Camera**.

**More than one lead device:** each lead saves a backup and loads the other's backup with **Restore or combine a backup**. Duplicates are skipped automatically.

**End of the day:** scouts can clear old reports on **Hand off** → **Delete handed-off reports**. Save a lead backup first.

---

## Updating for a new season

Every season has a new game, so the questions change. **You only edit one file: `config.js`.** The scout form, QR codes, Matches and Robots screens, and the spreadsheet all build themselves from it.

1. On GitHub, open `config.js` and click the pencil icon to edit.
2. Change `season` to something new, like `"newgame-2027"`. This starts each phone on fresh, separate data.
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
   - Counters all add into the **Total** column.

5. Click **Commit changes**. GitHub Pages republishes in about a minute.
6. Have everyone open the app once **with internet** to pick up the change. Do this before the event, not during it.

> **Don't change fields in the middle of an event.** A phone with old settings and a phone with new settings refuse each other's codes, with a message telling the scout to update. That keeps bad data out, but it's a hassle mid-competition.

To pre-fill team names, add them to `teams` in `config.js`: `"1234": "Hive Mind",`.

## Publishing on GitHub Pages (one-time setup)

1. Create a free GitHub organization for the team, so the app doesn't depend on one person's account. Add next year's lead as an owner when you hand off.
2. Create a repository in it (for example `biobuzz-scout`) and upload these files.
3. In the repository, go to **Settings → Pages**. Under **Build and deployment**, pick **Deploy from a branch**, then **main** and **/ (root)**, and click **Save**.
4. After about a minute the link appears at the top of that page: `https://<org-name>.github.io/<repo-name>/`. Share it with scouts.

## How it works (for the curious)

- `index.html`, `styles.css` and `app.js` are the app. `config.js` holds the season's questions.
- `sw.js` saves the app on the phone so it opens offline. It always shows the saved copy first, then downloads any update in the background for next time.
- Reports are stored in the phone's browser storage. Clearing Safari or Chrome website data erases them, so hand off before doing that.
- QR codes hold several reports each, packed tightly. A long backlog splits into "Code 1 of 3…".
- `vendor/` holds two open-source libraries: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) for making codes and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0) for reading them. `fonts/` holds Barlow Condensed and Atkinson Hyperlegible (SIL Open Font License).

### Trying it on a computer

From this folder, run `python3 -m http.server 8000` and open http://localhost:8000.
