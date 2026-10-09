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
  Chase: 'पाठलाग',
  'Batter {n}': 'फलंदाज {n}',
  'On strike': 'स्ट्राइकवर',
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
  'Last {n} overs': 'शेवटची {n} षटके',
  '{n} maiden': '{n} निर्धाव षटक',
  '{n} maidens': '{n} निर्धाव षटके',
  'yet to bat': 'फलंदाजी बाकी',
  'not out': 'नाबाद',
  'No other live matches': 'इतर थेट सामने नाहीत',
  // extras line: b 0, lb 3, w 4, nb 2
  b: 'बाय',
  lb: 'लेग बाय',
  w: 'वाइड',
  nb: 'नो बॉल',
  RR: 'धावगती',
  // captain / keeper tags and team-card roles
  C: 'क.',
  WK: 'य.र.',
  BAT: 'फलंदाज',
  BOWL: 'गोलंदाज',
  AR: 'अष्टपैलू',
  'BAT AR': 'फलं. अष्टपैलू',
  'BOWL AR': 'गोलं. अष्टपैलू',
  AM: 'म.पू.',
  PM: 'म.उ.',
  // the widgets' own default texts (a user's own text is never touched)
  'LIVE COMMENTARY': 'थेट समालोचन',
  'LIVE SCORES': 'थेट धावसंख्या',
  'STARTING IN': 'सुरुवात होईल',
  'STARTING NOW': 'आता सुरू होत आहे',
  'BACK IN': 'पुन्हा भेटू',
  Commentary: 'समालोचन',
  'Your Name': 'तुमचे नाव',
  'Decision pending': 'निर्णय प्रलंबित',
  'Batters —': 'फलंदाज —',
  'Bowler —': 'गोलंदाज —',
  'Match info —': 'सामन्याची माहिती —',
};

/** texts widgets start with; only these are swapped, so a user's own wording is never changed */
const DEFAULT_TEXTS = new Set(['LIVE COMMENTARY', 'LIVE SCORES', 'STARTING IN', 'STARTING NOW', 'BACK IN', 'Commentary', 'Your Name']);

/** ball-chip notation (W, wd, 2nb, 1lb, 4b) in Marathi */
const MR_CHIP: Record<string, string> = { W: 'बाद', wd: 'वा', nb: 'नो', lb: 'लेबा', b: 'बा' };

/** fragments of player roles and styles from the API */
const MR_STYLE: [RegExp, string][] = [
  [/right[- ]hand(ed)? bat(ter|sman)?/i, 'उजव्या हाताचा फलंदाज'],
  [/left[- ]hand(ed)? bat(ter|sman)?/i, 'डाव्या हाताचा फलंदाज'],
  [/right[- ]arm/i, 'उजव्या हाताचा'],
  [/left[- ]arm/i, 'डाव्या हाताचा'],
  [/fast[- ]medium/i, 'वेगवान-मध्यमगती'],
  [/medium[- ]fast/i, 'मध्यमगती-वेगवान'],
  [/fast/i, 'वेगवान'],
  [/medium/i, 'मध्यमगती'],
  [/off[- ]?(break|spin)/i, 'ऑफ-स्पिन'],
  [/leg[- ]?(break|spin)( googly)?/i, 'लेग-स्पिन'],
  [/orthodox/i, 'फिरकी'],
  [/wrist[- ]spin/i, 'मनगटी फिरकी'],
  [/(wicket[- ]?keeper|wk)[- ]?bat(ter|sman)?/i, 'यष्टिरक्षक फलंदाज'],
  [/wicket[- ]?keeper/i, 'यष्टिरक्षक'],
  [/bowling all[- ]?rounder/i, 'गोलंदाजी अष्टपैलू'],
  [/batting all[- ]?rounder/i, 'फलंदाजी अष्टपैलू'],
  [/all[- ]?rounder/i, 'अष्टपैलू'],
  [/bat(ter|sman)/i, 'फलंदाज'],
  [/bowler/i, 'गोलंदाज'],
];

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

  /** a label with {n} placeholders: tf('Last {n} overs', { n: 6 }) */
  tf(en: string, vars: Record<string, string | number>): string {
    return this.t(en).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  }

  /** ball chip: "2nb" → "2नो", "W" → "बाद" (digits and • stay) */
  chip(label: string): string {
    if (this.lang() !== 'mr') return label;
    const m = /^(\d*)(W|wd|nb|lb|b)$/.exec(label);
    return m ? `${m[1]}${MR_CHIP[m[2]]}` : label;
  }

  /** how out: "c Kabir Shah b Neel Pandey" → "झे. Kabir Shah गो. Neel Pandey" */
  dismissal(text: string): string {
    if (this.lang() !== 'mr' || !text) return text;
    if (/^not out$/i.test(text.trim())) return 'नाबाद';
    if (/^batting$/i.test(text.trim())) return 'खेळत आहे';
    return text
      .replace(/^c & b /i, 'झे. व गो. ')
      .replace(/^c(?:t)? (.+?) b /i, 'झे. $1 गो. ')
      .replace(/^st (.+?) b /i, 'यष्टिचीत $1 गो. ')
      .replace(/^lbw b /i, 'पायचीत गो. ')
      .replace(/^hit wicket b /i, 'हिट विकेट गो. ')
      .replace(/^b /i, 'त्रि. गो. ')
      .replace(/^run out/i, 'धावचीत')
      .replace(/^retired hurt/i, 'जखमी निवृत्त');
  }

  /** player role / batting & bowling style from the API, in the current language */
  styleText(text: string): string {
    if (this.lang() !== 'mr' || !text) return text;
    let out = text;
    for (const [re, mr] of MR_STYLE) out = out.replace(re, mr);
    return out;
  }

  /**
   * Common API sentences (toss, chase, result) rebuilt in Marathi; anything
   * else comes back unchanged.
   */
  apiText(text: string): string {
    if (this.lang() !== 'mr' || !text) return text;
    const t = text.trim();
    let m = /^(.+?) (?:won|have won|has won) the toss and (?:chose|elected|opted|decided) to (bat|bowl|field)/i.exec(t);
    if (m) return `${m[1]} ने नाणेफेक जिंकून ${/bat/i.test(m[2]) ? 'फलंदाजी' : 'गोलंदाजी'} निवडली`;
    m = /^(.+?) needs? (\d+) runs? (?:from|in|off) (\d+) balls?/i.exec(t);
    if (m) return `${m[1]} ला ${m[3]} चेंडूंत ${m[2]} धावा हव्यात`;
    m = /^(.+?) needs? (\d+) runs?/i.exec(t);
    if (m) return `${m[1]} ला ${m[2]} धावा हव्यात`;
    m = /^(.+?) won by (\d+) runs?/i.exec(t);
    if (m) return `${m[1]} ${m[2]} धावांनी विजयी`;
    m = /^(.+?) won by (\d+) wick(?:et)?s?/i.exec(t);
    if (m) return `${m[1]} ${m[2]} गडी राखून विजयी`;
    m = /^(.+?) won/i.exec(t);
    if (m && /super over/i.test(t)) return `${m[1]} सुपर ओव्हरमध्ये विजयी`;
    if (/^match tied/i.test(t)) return 'सामना बरोबरीत';
    if (/no result|abandoned/i.test(t)) return 'सामना रद्द';
    if (/innings break/i.test(t)) return 'डावांमधील विश्रांती';
    if (/rain|wet outfield/i.test(t)) return 'पावसामुळे खेळ थांबला';
    if (/stumps/i.test(t)) return 'दिवसाचा खेळ संपला';
    return text;
  }

  /** a widget's default text in the current language; anything the user typed stays as is */
  defaultText(text: string): string {
    const key = text.trim();
    return this.lang() === 'mr' && DEFAULT_TEXTS.has(key) ? (MR[key] ?? text) : text;
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
    return this.apiText(m.statusText);
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
