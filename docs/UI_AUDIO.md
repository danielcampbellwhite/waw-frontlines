# UI and audio notes (UI agent)

## Audio licensing
Sound effects are real recordings, **CC0 / public domain only**. Each source page was opened and its licence read on 2026-11-16; files were trimmed, converted to mono Ogg Vorbis (q2), loudness-normalised, and in a few cases pitched down, low-passed or crossfaded into loops. About 0.9 MB total in `public/audio/`. The same list is shown in the in-game Credits screen (source of truth: `src/audio/credits.ts`). Music, and the fallback for any sample that fails to load, stay procedural (Web Audio synth), so nothing breaks if a file is missing.
Fonts (Big Shoulders Display, Barlow Semi Condensed) are SIL Open Font Licence, loaded from Google Fonts in `src/index.css`.

### Credits
| File(s) | Source page | Author | Licence | Retrieved | Processing |
|---|---|---|---|---|---|
| `ui_click.ogg`, `ui_panel_open.ogg`, `ui_panel_close.ogg`, `ui_select_1.ogg`, `ui_select_2.ogg`, `ui_confirm.ogg`, `ui_error.ogg`, `ui_pause.ogg`, `ui_resume.ogg`, `ui_speed.ogg`, `ui_notify.ogg`, `ui_save.ogg`, `ui_load.ogg`, `ord_move.ogg`, `ord_attack.ogg`, `ord_defend.ogg`, `ord_generic.ogg` | [Interface Sounds](https://opengameart.org/content/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 | 2026-11-16 | |
| `sting_obj_captured.ogg`, `sting_obj_lost.ogg`, `sting_defeat.ogg` | [85 Short music jingles](https://opengameart.org/content/85-short-music-jingles) | Kenney (kenney.nl) | CC0 1.0 | 2026-11-16 | Defeat and objective-lost stings are pitched down. |
| `rifle_1.ogg`, `rifle_2.ogg`, `rifle_3.ogg`, `smg_short.ogg`, `mg_long.ogg`, `smg_long.ogg` | [The Free Firearm Sound Library (Mosin Nagant, Arisaka, Springfield 1917, PPSh, Carl Gustav M45)](https://opengameart.org/content/the-free-firearm-sound-library) | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (uploaded by bart) | CC0 1.0 | 2026-11-16 | Original recordings, trimmed to single shots and bursts. |
| `art_fire_1.ogg`, `art_fire_2.ogg`, `art_fire_4.ogg`, `impact_1.ogg`, `impact_2.ogg` | [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx) | rubberduck | CC0 1.0 | 2026-11-16 | |
| `art_fire_3.ogg`, `impact_3.ogg`, `impact_wall.ogg` | [Cannon fire, Cannon hit, Battle at sea](https://opengameart.org/content/cannon-fire) | Thimras | CC0 1.0 | 2026-11-16 | Also https://opengameart.org/content/cannon-hit and https://opengameart.org/content/battle-at-sea |
| `battle_start.ogg` | [Muffled Distant Explosion](https://opengameart.org/content/muffled-distant-explosion) | NenadSimic | CC0 1.0 | 2026-11-16 | |
| `impact_4.ogg` | [Synthesized explosion](https://opengameart.org/content/synthesized-explosion) | qubodup | CC0 1.0 | 2026-11-16 | |
| `tank_loop.ogg` | [Steamboat Engine Sound](https://opengameart.org/content/steamboat-engine-sound) | Spring Spring | CC0 1.0 | 2026-11-16 | Pitched down, low-passed and made seamless. |
| `truck_loop.ogg` | [Generator (loop)](https://opengameart.org/content/generator-loop) | YCbCr | CC0 1.0 | 2026-11-16 | Pitched down and low-passed. |
| `rumble_loop.ogg` | [underwater or space engine rumble](https://opengameart.org/content/underwater-or-space-engine-rumble) | gmason | CC0 1.0 | 2026-11-16 | Low-passed sub-bass bed under tank movement. |
| `radio_bed.ogg` | [Radio Noise 1](https://opengameart.org/content/radio-noise-1) | Kresiek The Furry | CC0 1.0 | 2026-11-16 | |
| `radio_squelch_1.ogg`, `radio_squelch_2.ogg` | [Frequency Static Sound Effects](https://opengameart.org/content/frequency-static-sound-effects) | bretbernhoft | CC0 1.0 (public domain) | 2026-11-16 | |
| `event_telegraph.ogg` | [Typewriter sounds](https://opengameart.org/content/typewriter-sounds) | Cassie-OrbitGames | CC0 1.0 | 2026-11-16 | |
| `alert_beep.ogg` | [Alert/menu effect](https://opengameart.org/content/alertmenu-effect) | chrispwns (Chris Naron) | CC0 1.0 | 2026-11-16 | |
| `sting_victory.ogg` | [Win sound effect](https://opengameart.org/content/win-sound-effect) | Listener | Public domain (listed CC0) | 2026-11-16 | |

### Rejected sources (not shipped)
- [Gunshot Sounds (sounds.zip)](https://opengameart.org/content/gunshot-sounds): Page says CC0 but the archive ships a CC-BY 3.0 notice.
- [Gunshots (kurt)](https://opengameart.org/content/gunshots): Provenance of the recordings is questioned in the comments.
- [racing car engine sound loops](https://opengameart.org/content/racing-car-engine-sound-loops): Derived from sampling+ sources; comments dispute the CC0 relicensing.
- [War on Water: SNDFX](https://opengameart.org/content/war-on-water-sndfx): Author states the originals cannot be credited, so provenance is unknown.
- [Classic fanfare lick](https://opengameart.org/content/classic-fanfare-lick): Comments raise similarity to a commercial default clip.
- [Well Done](https://opengameart.org/content/well-done): Filename says CC-BY 3 while the page says CC0.

### Weak matches (honest gaps)
- No CC0 WW2-era recording of a tank or truck was found. The engine loop is CC0 steam/generator recordings pitched down and low-passed plus a sub-bass rumble: usable ambience, not period-accurate. Aircraft have no sound at all (the stylised propeller loop was dropped as misleading).
- Artillery fire and shell impacts come from generic cannon/bang packs, not howitzer recordings.
- Defeat and objective-lost stings are Kenney jingles pitched down; no dedicated CC0 defeat sting was found.
- Machine-gun bursts are PPSh and Carl Gustav SMG recordings standing in for MGs, used only in battles with `mg` equipment; no belt-fed MG recording was available.

### Event to sound mapping (`src/audio/cues.ts`, tested in `tests/ui.audio-cues.test.ts`)
- Commands: issue_order maps to order_move / order_attack / order_defend / order (the first three after a short radio squelch); failures play error; resolve_event and create_operation confirm.
- State diffs sampled at 2 Hz by `useAudioBridge`: new `state.battles` entry -> battle_start; new BattleReport -> short notification; new player-facing GameEvent -> telegraph; objective status change -> captured/lost sting (judged from the player side); `state.result` -> victory/defeat sting; own units starting to move -> radio acknowledge squelch.
- UI: unit select, panel open/close (every Modal), pause/resume, speed change, save/load.
- Throttling: per-cue minimum gap plus a global budget of 6 non-sting cues per second (`CueGate`); at most one cue per category per diff, so 600 units changing state make at most one sound.
- Battle audio (gunfire, artillery, impacts, engines) is gated by the zoom threshold and viewport (see Contextual mixing). Samples are lazy-loaded by group: UI and radio at unlock, combat when a battle is audible, engines when a vehicle is audible, stings on first use.

## Contextual mixing (`src/audio/mix.ts`, pure and unit-tested)
Sound effects are strictly ON or OFF; nothing fades with zoom or distance.
- Threshold: `ZOOM_SFX = 7.0` (map zoom). Below it there are no unit or battle effects at all.
- At or above it, a battle makes sound only if its position is inside the viewport, and a moving ground unit makes engine sound only if it is inside the viewport. Sources outside the viewport are silent.
- Level is constant (full) whatever the zoom or the source's distance from the screen centre. Stereo pan still follows screen x. Battle size only changes how often shots are fired, not loudness.
- Concurrency: at most `MAX_VOICES = 6` battle voices (the largest fights win); engines are one shared loop that is on while any moving ground unit is on screen.
- Anti-click: gates and the engine loop change level with a ~12 ms time-constant ramp (settles in about 40 ms). When a battle leaves the view its gate closes, so scheduled tails are cut too.
- Ambience bed is switched by the same threshold, not crossfaded: below `ZOOM_SFX` music is high and radio chatter is on; at or above it music drops to a constant low level and radio is off. Wind ambience is constant.
- There is no distant-artillery layer and no aircraft sound. Air units are silent: no CC0 aircraft recording was good enough, and a stylised propeller loop would mislead.
- Machine-gun bursts (PPSh/Carl Gustav recordings, the closest CC0 stand-ins) are used only in battles where a participant holds the catalogue's `mg` equipment; other battles use single rifle shots. The catalogue has no submachine-gun category.
Volumes (master/music/effects/ambience/mute) persist in localStorage.

## Integration for the app shell
- `GameScreen` calls `useAudioSetup()` (unlock on first gesture, sync volumes) and `useAudioBridge()` (2 Hz feed from engine + map `onViewChange`).
- `MainMenu` also unlocks audio. `audio.sfx('click'|'order'|'alert'|'confirm')` plays UI sounds.

## Tutorial, Help and campaign list (finishing phase)
- `src/ui/tutorial/steps.ts` holds the 8 tour steps (map, selecting, orders, supply/fuel, fog, reports, speed/pause, saves), each anchored to an existing UI class (`.map-wrap`, `.left-panel`, `.right-panel`, `.tb-res`, `.map-tools`, `.bottom-panel`, `.tb-speed`, `.tb-tools`); `Tour.tsx` is the in-game spotlight overlay and `TutorialDialog` the main-menu walkthrough. UI only: no engine commands; the game modal `'tour'` pauses the clock and restores the speed like Save/Menu do.
- First run: GameScreen opens the tour once (`tourSeen` in UI settings, kept by Restore defaults). Replay: Help (?) button in the top bar (or F1) then "Replay the tutorial", or Game menu. Skip with Skip tour or Esc; arrow keys and Enter step through.
- Settings: Game tab holds the default difficulty (preselects the nation screen); Keyboard shortcuts tab lists rebindable keys plus fixed controls (`FIXED_CONTROLS`). Both new fields are default-merged, so old stored settings still load; the settings key is unchanged.
- Campaign select: only non-planned campaigns are cards; planned ones appear as dashed, non-interactive "Coming soon" tiles and become cards automatically when their meta stops being `planned`.

## Pacing, dispatches and order previews
- **Auto-slow on action** (Settings > Game, default on; `autoSlow` in UI settings): `src/ui/game/autoSlow.ts` watches first contact (a battle involving the player, or a visible enemy within 15 km of an own unit), a city or objective location (kind city, value >= 5, or named in an objective) changing owner, a unit destroyed, surrendered or routed, and a historical event firing. It samples every 5 game minutes, drops to 1x via `engine.setSpeed(1)` (never pauses, nothing is restored; `lastSpeed` is set to 1) and raises one toast "Slowed to 1x. ..." with a Go to button.
- **Battle reports**: `reportHeadline` (reportText.ts) gives a one-line headline, who attacked whom, where, outcome and losses, built only from the report and the units that fought. It heads the report detail and is the Notifications/toast text. Sound: a battle lost by the player plays the existing `alert` cue, every other outcome the existing `report` cue; no new samples, and the zoom-based SFX rules are untouched.
- **Dispatches** tab (`dispatches.ts`): the campaign's own historical event titles plus the first sentence of their text, and objective results, newest first, with date and time stamps and Go to. No UI-written history.
- **Top bar** shows date and time, weather and temperature, and Day/Night (night = 21:00 to 05:00, the same rule fog of war uses).
- **Order preview** (`orderPreview.ts`, read-only): ETA from `military.estimateEtaMinutes` (straight line, the sim routes along roads so it can differ), fuel burn from the unit catalog (% of a tank per hour moving), best-case supply at the destination from `military.sourcesForSide` + `supplyLevelFromDistance` (straight-line distance to the nearest own source), and terrain (open water or off the map). A clean order is sent at once with an info toast "Move: ETA about 6h". If anything is worth confirming (open water, thin or no supply, not enough fuel) the order is held in `pendingOrder` and `OrderConfirm` asks "Send order anyway" or Cancel (Esc). Preview errors never block an order.
