import { Injectable, Pipe, type PipeTransform, computed, inject } from '@angular/core';
import type { MatchState, OverlayLanguage } from '@cos/shared';
import { LiveStore } from './live.store';

/**
 * Marathi for the overlay's own labels. Keys are the English text, so a missing
 * entry simply shows the English. Player, team, series and venue names are not
 * translated: they come from the API as they are.
 */
const MR: Record<string, string> = {
  // moments
  FOUR: 'चौकार',
  SIX: 'षटकार',
  WICKET: 'बाद',
  OUT: 'बाद',
  FIFTY: 'अर्धशतक',
  CENTURY: 'शतक',
  HUNDRED: 'शतक',
  MAIDEN: 'निर्धाव षटक',
  OVER: 'षटक पूर्ण',
  'END OF OVER': 'षटक पूर्ण',
  DRS: 'DRS',
  'DRS REVIEW': 'DRS पुनरावलोकन',
  'INNINGS END': 'डाव संपला',
  'INNINGS BREAK': 'डावांमधील विश्रांती',
  'DRINKS BREAK': 'पेय विश्रांती',
  RESULT: 'निकाल',
  Scorecard: 'धावफलक',
  'FREE HIT': 'फ्री हिट',
  VS: 'वि.',
  vs: 'वि.',
  LIVE: 'थेट',

  // people and sides
  Batter: 'फलंदाज',
  Batters: 'फलंदाज',
  Bowler: 'गोलंदाज',
  Batting: 'फलंदाजी',
  Bowling: 'गोलंदाजी',
  batting: 'खेळत आहे',
  Player: 'खेळाडू',
  Team: 'संघ',
  'Playing XI': 'अंतिम अकरा',
  'Yet to bat': 'फलंदाजी बाकी',
  'Yet to feature in this match': 'या सामन्यात अद्याप खेळला नाही',

  // match info
  Series: 'मालिका',
  Venue: 'मैदान',
  Toss: 'नाणेफेक',
  Status: 'स्थिती',
  'Match info': 'सामन्याची माहिती',

  // numbers
  Runs: 'धावा',
  RUNS: 'धावा',
  runs: 'धावा',
  Balls: 'चेंडू',
  balls: 'चेंडू',
  Overs: 'षटके',
  OVERS: 'षटके',
  ov: 'ष.',
  'This over': 'हे षटक',
  'THIS OVER': 'हे षटक',
  Over: 'षटक',
  Partnership: 'भागीदारी',
  "P'SHIP": 'भागीदारी',
  Target: 'लक्ष्य',
  TARGET: 'लक्ष्य',
  Need: 'हव्यात',
  NEED: 'हव्यात',
  'Runs needed': 'आवश्यक धावा',
  'Balls left': 'उरलेले चेंडू',
  'Run rate': 'धावगती',
  Projected: 'अंदाजे धावसंख्या',
  CRR: 'धावगती',
  RRR: 'आवश्यक धावगती',
  SR: 'स्ट्रा. रेट',
  Econ: 'इकॉनॉमी',
  Mdns: 'निर्धाव',
  M: 'नि.',
  O: 'ष.',
  R: 'धा.',
  B: 'चें.',
  W: 'बळी',
  '4s': 'चौकार',
  '6s': 'षटकार',
  Extras: 'अवांतर',
  Total: 'एकूण',
  'Fall of wkts': 'गडी बाद क्रम',
  innings: 'डाव',
  '1st innings': 'पहिला डाव',
  '2nd innings': 'दुसरा डाव',
  '3rd innings': 'तिसरा डाव',
  '4th innings': 'चौथा डाव',
  'Waiting for the first ball': 'पहिल्या चेंडूची प्रतीक्षा',
};

const DICTS: Record<OverlayLanguage, Record<string, string> | null> = { en: null, mr: MR };

/** The overlay language from the global settings, and the lookup for widget labels. */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly store = inject(LiveStore);
  readonly lang = computed<OverlayLanguage>(() => this.store.settings().language ?? 'en');

  /** English label → current language (falls back to the English) */
  t(en: string): string {
    const dict = DICTS[this.lang()];
    return dict?.[en] ?? en;
  }

  /** a banner title from the server ("SIX", "END OF OVER 12") in the current language */
  eventTitle(title: string): string {
    if (this.lang() === 'en') return title;
    const over = /^END OF OVER (\d+)$/.exec(title);
    if (over && this.lang() === 'mr') return `षटक ${over[1]} पूर्ण`;
    return this.t(title);
  }

  /**
   * The one-line match situation. In Marathi a live chase is composed from the
   * numbers ("CHE ला 64 चेंडूंत 103 धावा हव्यात"); anything else keeps the API's text.
   */
  status(m: MatchState | null): string {
    if (!m) return '';
    if (this.lang() !== 'mr') return m.statusText;
    const inn = m.innings.at(-1);
    if (m.phase === 'live' && m.target !== null && inn && m.ballsRemaining !== null) {
      const need = m.target - inn.runs;
      if (need > 0) {
        const team = m.teams.find((t) => t.shortCode === inn.battingTeam);
        return `${team?.name ?? inn.battingTeam} ला ${m.ballsRemaining} चेंडूंत ${need} धावा हव्यात`;
      }
    }
    return m.statusText;
  }
}

/** `{{ 'Batter' | tr }}` in widget templates; re-runs when the language changes */
@Pipe({ name: 'tr', pure: false })
export class TrPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(en: string): string {
    return this.i18n.t(en);
  }
}
