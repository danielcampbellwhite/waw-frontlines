/**
 * Provenance of every shipped sound file (public/audio/*.ogg). Only CC0 / public-domain sources are used.
 * Each source page was opened and its licence checked on the retrieval date; files were trimmed, converted to
 * mono Ogg Vorbis and loudness-normalised (some pitched/low-passed or crossfaded into loops). Nothing is CC-BY/NC.
 */
export interface SoundCredit { pack: string; author: string; url: string; licence: string; retrieved: string; files: string[]; note?: string }

const R = '2026-11-16';
export const SOUND_CREDITS: SoundCredit[] = [
  { pack: 'Interface Sounds', author: 'Kenney (kenney.nl)', url: 'https://opengameart.org/content/interface-sounds', licence: 'CC0 1.0', retrieved: R,
    files: ['ui_click', 'ui_panel_open', 'ui_panel_close', 'ui_select_1', 'ui_select_2', 'ui_confirm', 'ui_error', 'ui_pause', 'ui_resume', 'ui_speed', 'ui_notify', 'ui_save', 'ui_load', 'ord_move', 'ord_attack', 'ord_defend', 'ord_generic'] },
  { pack: '85 Short music jingles', author: 'Kenney (kenney.nl)', url: 'https://opengameart.org/content/85-short-music-jingles', licence: 'CC0 1.0', retrieved: R,
    files: ['sting_obj_captured', 'sting_obj_lost', 'sting_defeat'], note: 'Defeat and objective-lost stings are pitched down.' },
  { pack: 'The Free Firearm Sound Library (Mosin Nagant, Arisaka, Springfield 1917, PPSh, Carl Gustav M45)', author: 'Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (uploaded by bart)', url: 'https://opengameart.org/content/the-free-firearm-sound-library', licence: 'CC0 1.0', retrieved: R,
    files: ['rifle_1', 'rifle_2', 'rifle_3', 'smg_short', 'mg_long', 'smg_long'], note: 'Original recordings, trimmed to single shots and bursts.' },
  { pack: '25 CC0 bang / firework SFX', author: 'rubberduck', url: 'https://opengameart.org/content/25-cc0-bang-firework-sfx', licence: 'CC0 1.0', retrieved: R, files: ['art_fire_1', 'art_fire_2', 'art_fire_4', 'impact_1', 'impact_2'] },
  { pack: 'Cannon fire, Cannon hit, Battle at sea', author: 'Thimras', url: 'https://opengameart.org/content/cannon-fire', licence: 'CC0 1.0', retrieved: R, files: ['art_fire_3', 'impact_3', 'impact_wall'],
    note: 'Also https://opengameart.org/content/cannon-hit and https://opengameart.org/content/battle-at-sea' },
  { pack: 'Muffled Distant Explosion', author: 'NenadSimic', url: 'https://opengameart.org/content/muffled-distant-explosion', licence: 'CC0 1.0', retrieved: R, files: ['battle_start'] },
  { pack: 'Synthesized explosion', author: 'qubodup', url: 'https://opengameart.org/content/synthesized-explosion', licence: 'CC0 1.0', retrieved: R, files: ['impact_4'] },
  { pack: 'Steamboat Engine Sound', author: 'Spring Spring', url: 'https://opengameart.org/content/steamboat-engine-sound', licence: 'CC0 1.0', retrieved: R, files: ['tank_loop'], note: 'Pitched down, low-passed and made seamless.' },
  { pack: 'Generator (loop)', author: 'YCbCr', url: 'https://opengameart.org/content/generator-loop', licence: 'CC0 1.0', retrieved: R, files: ['truck_loop'], note: 'Pitched down and low-passed.' },
  { pack: 'underwater or space engine rumble', author: 'gmason', url: 'https://opengameart.org/content/underwater-or-space-engine-rumble', licence: 'CC0 1.0', retrieved: R, files: ['rumble_loop'], note: 'Low-passed sub-bass bed under tank movement.' },
  { pack: 'Radio Noise 1', author: 'Kresiek The Furry', url: 'https://opengameart.org/content/radio-noise-1', licence: 'CC0 1.0', retrieved: R, files: ['radio_bed'] },
  { pack: 'Frequency Static Sound Effects', author: 'bretbernhoft', url: 'https://opengameart.org/content/frequency-static-sound-effects', licence: 'CC0 1.0 (public domain)', retrieved: R, files: ['radio_squelch_1', 'radio_squelch_2'] },
  { pack: 'Typewriter sounds', author: 'Cassie-OrbitGames', url: 'https://opengameart.org/content/typewriter-sounds', licence: 'CC0 1.0', retrieved: R, files: ['event_telegraph'] },
  { pack: 'Alert/menu effect', author: 'chrispwns (Chris Naron)', url: 'https://opengameart.org/content/alertmenu-effect', licence: 'CC0 1.0', retrieved: R, files: ['alert_beep'] },
  { pack: 'Win sound effect', author: 'Listener', url: 'https://opengameart.org/content/win-sound-effect', licence: 'Public domain (listed CC0)', retrieved: R, files: ['sting_victory'] },
];

/** Sources inspected and rejected (licence unclear, mixed or incompatible). Kept for the audit trail. */
export const REJECTED_SOUNDS: { pack: string; url: string; reason: string }[] = [
  { pack: 'Gunshot Sounds (sounds.zip)', url: 'https://opengameart.org/content/gunshot-sounds', reason: 'Page says CC0 but the archive ships a CC-BY 3.0 notice.' },
  { pack: 'Gunshots (kurt)', url: 'https://opengameart.org/content/gunshots', reason: 'Provenance of the recordings is questioned in the comments.' },
  { pack: 'racing car engine sound loops', url: 'https://opengameart.org/content/racing-car-engine-sound-loops', reason: 'Derived from sampling+ sources; comments dispute the CC0 relicensing.' },
  { pack: 'War on Water: SNDFX', url: 'https://opengameart.org/content/war-on-water-sndfx', reason: 'Author states the originals cannot be credited, so provenance is unknown.' },
  { pack: 'Classic fanfare lick', url: 'https://opengameart.org/content/classic-fanfare-lick', reason: 'Comments raise similarity to a commercial default clip.' },
  { pack: 'Well Done', url: 'https://opengameart.org/content/well-done', reason: 'Filename says CC-BY 3 while the page says CC0.' },
];

export const SOUND_FILES: string[] = SOUND_CREDITS.flatMap(c => c.files);
