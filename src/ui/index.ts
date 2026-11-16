// Public surface of src/ui (owner: UI agent). Importing this also loads the stylesheet.
import './ui.css';
export { MainMenu, Credits, StaffMapBackdrop, type MainMenuProps } from './screens/MainMenu';
export { CampaignSelect, type ScenarioMetaLike } from './screens/CampaignSelect';
export { NationSelect, DEFAULT_GAME_SETTINGS, type NationSelectProps } from './screens/NationSelect';
export { BriefingScreen } from './screens/Briefing';
export { EndScreen } from './screens/EndScreen';
export { SaveLoadDialog } from './screens/SaveLoad';
export { SettingsPanel } from './screens/Settings';
export { GameScreen, type GameScreenProps } from './game/GameScreen';
export { useEngineState, useSimMinutes } from './hooks/useEngineState';
export { settingsStore, useUiSettings, DEFAULT_KEYBINDS } from './settings';
export type { SaveApi, SaveSlotInfo } from './saveApi';
export { audio, useAudioSetup } from '../audio';
