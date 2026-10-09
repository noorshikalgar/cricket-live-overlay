<img src="apps/studio/public/logo.svg" width="72" alt="Overlay Studio logo" />

# Cricket Live Overlay Studio

Broadcast-style live cricket graphics for OBS, with a drag-and-drop editor.

- **Studio** (`/studio`): design overlays on a 1920×1080 canvas, save them as scenes, and control the show live (put scenes on air, open scorecards, fire banners, point at things).
- **Output** (`/output`): the transparent page you add to OBS as a Browser Source. It mirrors the Studio in real time.
- **Server**: the only part that talks to the cricket API. It polls once for every screen, detects fours, sixes and wickets, and saves your scenes.

---

## 1. Requirements

- [Node.js](https://nodejs.org) **22 or newer** (`node -v`)
- Git
- [OBS Studio](https://obsproject.com) 28+ (for streaming; not needed to try the app)

## 2. Install

```bash
git clone https://github.com/noorshikalgar/cricket-live-overlay.git
cd cricket-live-overlay
npm install
cp .env.example .env
```

`.env` holds your settings and API key. It is gitignored, so it never gets committed.

## 3. Try it with mock data (no API key)

`.env` starts with `CRICKET_PROVIDER=mock`, which replays a recorded T20 match ball by ball. Nothing is fetched from the internet.

```bash
npm run dev
```

1. Open the Studio: **http://localhost:4200/studio**
2. In the top bar's match picker, choose **MUM v CHE (fast replay)** (one ball per second). *(chase)* starts in the second innings.
3. Press **⧉** (next to *Output connected*) to open the Output in its own window, and place it beside the Studio.

You'll see the score bug, batters, bowler and this over update, with FOUR / SIX / WICKET banners firing on their own.

> In development the UI runs on port **4200**. Port 4300 is only the API and live connection.

## 4. Use real live data (CricketLiveApi)

1. Create an account at [cricketliveapi.com](https://cricketliveapi.com) and copy your **API token** from the dashboard.
2. Edit `.env`:
   ```ini
   CRICKET_PROVIDER=cricketliveapi
   CRICKET_API_KEY=paste-your-token-here
   ```
3. Set the limits to match your plan. The server **never** sends more calls than these, even across restarts:
   ```ini
   # free plan
   DAILY_CALL_LIMIT=100
   RATE_LIMIT_PER_MINUTE=5
   POLL_SECONDS=60
   ```
   On a paid plan, raise both limits and set `POLL_SECONDS=0` to spread the daily calls across a whole match (never faster than every 10 s, their cache time).
4. Restart: stop `npm run dev` with **Ctrl+C** and run it again.
5. In the Studio, press **↻** next to the match picker (1 call) and pick a live match.

Each score update costs **1 call**. Card data (scorecard, playing XIs) is 1 call each, fetched once and cached. The top bar shows calls used today; when the daily limit is reached, updates stop until 00:00 UTC.

**Logs:** every API call prints a line in the terminal running the server, with time, endpoint, status, duration, size and calls used; errors are red, calls refused by your limits show as *not sent*, and **CACHE** lines show calls that were saved:

```
[14:03:21] API  ✓ 200  /cricket/commentary/173107   312 ms  7.5 KB   calls 43/100 today · 2/5 min
[14:03:51] API  ✗ 429  /cricket/commentary/173107   120 ms   Too Many Requests
[14:04:02] API  ⊘ not sent  /cricket/scorecard/173107   Per-minute limit of 5 calls reached
[14:04:10] CACHE  scorecard 173107 (age 4 min) · no call
```

The same lines are saved as JSON in `apps/server/data/logs/api-YYYY-MM-DD.jsonl` (7 days kept). Your API key is never printed.

**Caching (no call needed):** the same request again within the API's own refresh time (10 s for the score, 30 s for the scorecard); the last score after a restart or when re-selecting a match within 2 minutes; the match list after a restart; the scorecard and playing XIs for the whole match (refresh with ⟳).

**Saving calls:** switch the top bar to **Manual** and press **⟳ Update now** when you want fresh data, or press **⏸ Pause** during breaks.

**Back to testing without spending calls:** set `CRICKET_PROVIDER=mock` and restart.

## 5. Go live in OBS

For streaming, use the built version (one process, faster pages):

```bash
npm run build
npm start
```

Studio: **http://localhost:4300/studio**. Output: **http://localhost:4300/output**.

In OBS:

1. **Settings → Video**: base and output resolution **1920×1080**.
2. Add your webcam as a **Video Capture Device**.
3. Add a **Browser Source** *above* it:
   - URL `http://localhost:4300/output`
   - Width **1920**, Height **1080**, FPS **60**
   - Leave *Shutdown source when not visible* **off** and *Custom CSS* empty
4. Line up the webcam with the **Camera frame** widget: select the frame in the Studio, copy the transform shown in the settings panel, and enter it in OBS (right-click the webcam → Transform → Edit Transform, *Crop to Bounding Box* on). Or tick **OBS auto-place** in the canvas toolbar to do it automatically (needs OBS's WebSocket server enabled and `OBS_WS_PASSWORD` in `.env`).
5. Optional: **Docks → Custom Browser Docks** → `http://localhost:4300/studio` to run the Studio inside OBS.

`/output` follows the scene you put on air in the Studio. To pin one scene to a Browser Source, use `/output/<sceneId>` (the id is the file name in `apps/server/data/scenes/`).

---

## Using the Studio

### Scenes and going on air
- The scene dropdown picks which scene you are **editing**. **Put on air** sends it to the Output; **● ON AIR** shows it's live.
- **⋯** creates, duplicates, renames, deletes, exports and imports scenes.
- With no widget selected, the right panel shows the scene's **Theme**, **Transition in**, **On-air pointer** and **Background**.

### Widgets
Click a widget in the library to add it, or drag it onto the canvas. Drag to move, handles to resize, **Shift** keeps the aspect ratio, **Alt** skips snapping. Arrow keys nudge (Shift = 10 px), **Ctrl/⌘+D** duplicates, **Delete** removes, **Ctrl/⌘+Z** / **Ctrl/⌘+Shift+Z** undo / redo.

| Group | Widgets |
| --- | --- |
| Live data | Score bug, Batters, Bowler, This over, Partnership, Recent overs, Match info |
| Moments | Event banner, Ticker |
| Cards | Full scorecard, Team card, Player card |
| Studio | Camera frame, Text / Title, Timer, Image / Logo, Clock |

Every widget's look (colours, font, radius, blur, title, enter / exit motion) is in the right panel. Unchanged values follow the scene theme (**Night**, **Clean**, **Team**); **↺** resets a value to the theme.

### Score updates
Top bar: **Auto** (with an interval) or **Manual**, **⏸ Pause / ▶ Resume**, and **⟳ Update now**. A countdown shows the next automatic update.

### Live cards: scorecard, team, player
Left panel → **Live cards**:
- **Scorecard** for any innings: dismissals, who's batting, bowling, extras, yet to bat, fall of wickets.
- **Team** cards: the playing XI with each player's match so far.
- **Players**: the two batters and bowler in one tap, or pick from each team's list.
- **Open as**: *Floating window* (title bar with ⟳ reload, minimise, close), *Widget* (plain), or *New scene* (a dedicated scene around the card, put on air).

Card data never refreshes on its own; press **⟳** on the card or in the panel when you want new data.

### Event banners
The **Event banner** widget fires automatically on FOUR, SIX, WICKET, FIFTY and HUNDRED (choose which in its settings). Because live data lags the TV, the **Event pad** fires them instantly by hand: hotkeys **4**, **6**, **W**, **D** (DRS), **K** (drinks), **B** (break).

### Timer
**Timer** widget: a title (e.g. *STARTING IN*) above a countdown. Modes: countdown for a length (▶ Start, ⏸ Pause, ↺ Reset, +1m in the settings panel), countdown to a clock time, or stopwatch. Shows your end text at zero.

### On-air pointer
Press **◎ Pointer** in the canvas toolbar and move your mouse over the canvas: a dot (or laser ring, cricket ball, bat) follows on the Output with motion blur. Click for a ripple. It stays at its last spot when your mouse leaves the canvas; press **◎ Pointer** again or **Esc** to hide it. Style, colour and size are per scene.

### Transitions and backgrounds
- **Transition in** (per scene): Glide, Fade, Slide, Zoom, Wipe, Stinger (colour sweep with the scene name) or Cut.
- **Background** (per scene): Transparent (OBS sources below show through), Sample pitch, Solid colour, Gradient or Image (**⬆ Upload…**). A non-transparent background covers everything below the Browser Source, including your webcam.

### Emergency blackout
**⛔ Blackout** (top bar, left) or **Ctrl/⌘+Shift+B** covers the whole Output in black with your message (**✎** to edit it). Press again to restore.

### Stream Deck / scripts
With the server running:

```bash
curl -X POST localhost:4300/api/events/SIX   # FOUR SIX WICKET FIFTY HUNDRED MAIDEN DRS DRINKS INNINGS_BREAK
curl -X POST localhost:4300/api/blackout     # toggles; send {"on":true,"text":"Back soon"} as JSON to set it
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Something new doesn't show on the Output | Reload the Output (Cmd/Ctrl+R, or *Refresh* on the OBS Browser Source). |
| Pointer or animations look frozen in the browser | Browsers pause background tabs. Open the Output with **⧉** as its own window beside the Studio. OBS is not affected. |
| Transitions are only a quick fade | **Reduce motion** is ticked in the canvas toolbar. |
| "Daily limit … reached" | The day's API calls are used up. Wait for 00:00 UTC or set `CRICKET_PROVIDER=mock`. |
| `localhost:4300/studio` says "Studio not built" | In development use port 4200; for port 4300 run `npm run build && npm start`. |
| Webcam not visible inside the camera frame | The webcam must be *below* the Browser Source in OBS, and the scene background must be *Transparent*. |

---

## Development

| Command | Does |
| --- | --- |
| `npm run dev` | Server (port 4300) + Angular dev server (port 4200) with live reload |
| `npm run build` | Production build of the Studio and the server |
| `npm start` | Run the production build on port 4300 |
| `npm test` | Server tests |
| `npm run typecheck` | Type-check the shared package and the server |
| `npm run probe -w apps/server -- /cricket/matches/live` | Save a raw API response to `apps/server/data/samples/` (counts against your limits) |

```
packages/shared   types, theme tokens, widget defaults (used by both apps)
apps/server       Fastify + WebSocket server: providers/, poller, events, scenes, cards, OBS bridge
apps/studio       Angular app: studio/ (editor), output/ (OBS page), widgets/, motion/, theme/
```

Local data lives in `apps/server/data/` (scenes, settings, call counts, cached cards, uploads) and is not committed.

**Add a widget:** add its type and defaults in `packages/shared/src/scene.ts` and `defaults.ts`, create a component in `apps/studio/src/app/widgets/<name>/` extending `WidgetBase`, and add one entry with its settings to `widgets/widget-registry.ts`.

**Add a data provider:** implement `CricketProvider` in `apps/server/src/providers/`, map the responses into `MatchState`, and register it in `providers/index.ts`. (`sportmonks` is an unverified stub.)

## Notes

- Use team names, colours and your own logo. Don't show league, broadcaster or player imagery unless you have the rights (player photos on cards are off by default).
- Everything runs on your computer; the API key stays in `.env` on the server and never reaches a browser.
