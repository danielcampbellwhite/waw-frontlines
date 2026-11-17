import type { CampaignScale, NationId } from '../core/types.ts';

/**
 * Skeleton metadata for campaigns planned for later phases. These are listed (greyed out, "Coming in Phase 4")
 * but have NO scenario data and can never be loaded: loadScenario() rejects them.
 *
 * Dates are the commonly cited campaign dates and are UNVERIFIED placeholders until the campaign is built
 * (each must be sourced in docs/HISTORICAL_SOURCES.md at that time). Play times are rough design targets.
 */
export interface PlannedCampaign {
  id: string;
  campaignId: string;
  title: string;
  scale: CampaignScale;
  startDate: string;
  endDate: string;
  estimatedPlayMinutes: [number, number];
  nations: NationId[];
  blurb: string;
  datesVerified: false;
}

const p = (id: string, title: string, scale: CampaignScale, startDate: string, endDate: string, mins: [number, number], nations: NationId[], blurb: string): PlannedCampaign => ({
  id: `${id}.${scale}`, campaignId: id, title, scale, startDate, endDate, estimatedPlayMinutes: mins, nations, blurb, datesVerified: false,
});

export const PLANNED_CAMPAIGNS: PlannedCampaign[] = [
  p('battle_of_britain', 'Battle of Britain', 'standard', '1940-07-10T00:00:00Z', '1940-10-31T00:00:00Z', [180, 360], ['GBR', 'GER'], 'The air war over southern England.'),
  p('barbarossa', 'Operation Barbarossa', 'grand', '1941-06-22T00:00:00Z', '1941-12-05T00:00:00Z', [480, 900], ['GER', 'SOV'], 'The German invasion of the Soviet Union.'),
  p('north_africa', 'North Africa 1940-43', 'grand', '1940-09-13T00:00:00Z', '1943-05-13T00:00:00Z', [600, 1200], ['GBR', 'GER', 'ITA', 'USA'], 'Desert war from the Italian invasion of Egypt to the Tunisian surrender.'),
  p('stalingrad', 'Stalingrad', 'standard', '1942-08-23T00:00:00Z', '1943-02-02T00:00:00Z', [240, 480], ['GER', 'SOV'], 'The battle for the city on the Volga.'),
  p('kursk', 'Kursk', 'short', '1943-07-05T00:00:00Z', '1943-07-23T00:00:00Z', [60, 120], ['GER', 'SOV'], 'The last great German offensive in the East.'),
  p('normandy', 'Normandy 1944', 'standard', '1944-06-06T00:00:00Z', '1944-08-30T00:00:00Z', [240, 480], ['USA', 'GBR', 'CAN', 'GER'], 'The Allied invasion of north-west Europe and the breakout.'),
  p('italy', 'Italian Campaign 1943-45', 'grand', '1943-07-10T00:00:00Z', '1945-05-02T00:00:00Z', [600, 1200], ['USA', 'GBR', 'GER', 'ITA'], 'The Allied campaign from Sicily up the Italian peninsula.'),
  p('pacific', 'Pacific War', 'grand', '1941-12-07T00:00:00Z', '1945-09-02T00:00:00Z', [720, 1500], ['USA', 'JPN', 'GBR', 'AUS'], 'The war against Japan.'),
  p('berlin_1945', 'Battle of Berlin', 'short', '1945-04-16T00:00:00Z', '1945-05-02T00:00:00Z', [60, 120], ['SOV', 'GER'], 'The final Soviet offensive in Europe.'),
];
