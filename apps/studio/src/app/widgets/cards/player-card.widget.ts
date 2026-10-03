import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LiveStore } from '../../core/live.store';
import { WidgetBase } from '../widget-base';
import { findPlayer, playerFigures, sameName, teamColorFor } from './card-data';

export interface PlayerCardProps {
  playerId: string;
  playerName: string;
  /** remote headshot from the provider; off by default (rights on a public stream) */
  showPhoto: boolean;
  minimized: boolean;
}

/** One player: role and styles from the squads, this match's batting and bowling from the scorecard and live state. */
@Component({
  selector: 'cos-player-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel card" [class.minimized]="p().minimized" [style.--team]="color()">
      <div class="card-head">
        <span class="card-title">{{ name() || 'Player' }}</span>
        @if (info()?.player?.captain) {<span class="tag-mini">C</span>}
        @if (info()?.player?.keeper) {<span class="tag-mini">WK</span>}
        <span class="card-sub">{{ info()?.team?.name ?? '' }}</span>
        @if (p().minimized && headline()) {
          <span class="card-score">{{ headline() }}</span>
        }
      </div>
      @if (!p().minimized) {
        <div class="card-body pc">
          @if (p().showPhoto && info()?.player?.imageUrl) {
            <img class="photo" [src]="info()!.player.imageUrl" alt="" referrerpolicy="no-referrer" />
          }
          <div class="cols">
            @if (info(); as i) {
              <div class="meta">
                <span class="role">{{ i.player.role }}</span>
                <span class="muted">{{ styles() }}</span>
              </div>
            }
            @if (batting(); as b) {
              <div class="stat">
                <span class="k">Batting</span>
                <span class="v"><b>{{ b.runs }}{{ b.status !== 'out' ? '*' : '' }}</b> <span class="muted">({{ b.balls }})</span></span>
                <span class="muted d">{{ b.fours }}×4 · {{ b.sixes }}×6 · SR {{ b.strikeRate.toFixed(1) }}</span>
                @if (b.status === 'out') {
                  <span class="muted d dis">{{ b.dismissal }}</span>
                } @else if (b.status === 'batting') {
                  <span class="d live">batting</span>
                }
              </div>
            }
            @if (bowling(); as w) {
              <div class="stat">
                <span class="k">Bowling</span>
                <span class="v"><b>{{ w.wickets }}-{{ w.runs }}</b> <span class="muted">({{ w.overs }})</span></span>
                <span class="muted d">Econ {{ w.economy.toFixed(2) }} · {{ w.maidens }} maiden{{ w.maidens === 1 ? '' : 's' }}</span>
              </div>
            }
            @if (!batting() && !bowling() && !info()) {
              <div class="card-empty">{{ editing() ? 'Pick a player in the Cards panel.' : '' }}</div>
            } @else if (!batting() && !bowling()) {
              <div class="muted">Yet to feature in this match</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) * 0.068);
    }
    .pc {
      display: flex;
      gap: 0.9em;
      align-items: stretch;
    }
    .photo {
      width: auto;
      height: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: calc(var(--radius) * 0.8);
      background: var(--chip);
    }
    .cols {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      gap: 0.5em 1.4em;
    }
    .meta {
      flex-basis: 100%;
      display: flex;
      gap: 0.7em;
      align-items: baseline;
      font-size: 0.85em;
    }
    .role {
      font-weight: 600;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.05em;
      min-width: 0;
    }
    .k {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.7em;
      color: var(--muted);
      font-weight: 500;
    }
    .v {
      font-size: 1.5em;
      font-variant-numeric: tabular-nums;
    }
    .d {
      font-size: 0.8em;
      font-variant-numeric: tabular-nums;
    }
    .dis {
      max-width: 14em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .live {
      color: var(--accent);
      font-weight: 600;
    }
  `,
})
export class PlayerCardWidget extends WidgetBase<PlayerCardProps> {
  protected readonly defaults: PlayerCardProps = { playerId: '', playerName: '', showPhoto: false, minimized: false };
  private readonly store = inject(LiveStore);

  protected readonly info = computed(() => findPlayer(this.store.squads(), this.p().playerId, this.p().playerName));
  protected readonly name = computed(() => this.info()?.player.name ?? this.p().playerName);

  private readonly figures = computed(() => playerFigures(this.store.scorecard(), this.p().playerId, this.name()));

  /** live state is fresher than the scorecard for the two batters and the bowler */
  protected readonly batting = computed(() => {
    const live = this.match()?.batters.find((b) => sameName(b.name, this.name()));
    const card = this.figures().batting;
    if (live) {
      return {
        ...(card ?? { dismissal: 'batting', id: null, captain: false, keeper: false }),
        name: live.name,
        runs: live.runs,
        balls: live.balls,
        fours: live.fours,
        sixes: live.sixes,
        strikeRate: live.strikeRate,
        status: 'batting' as const,
      };
    }
    return card;
  });

  protected readonly bowling = computed(() => {
    const live = this.match()?.bowler;
    if (live && sameName(live.name, this.name())) {
      return { ...live, id: null, wides: 0, noBalls: 0 };
    }
    return this.figures().bowling;
  });

  protected readonly styles = computed(() => {
    const p = this.info()?.player;
    return [p?.battingStyle, p?.bowlingStyle].filter(Boolean).join(' · ');
  });

  protected readonly headline = computed(() => {
    const b = this.batting();
    if (b) return `${b.runs}${b.status !== 'out' ? '*' : ''} (${b.balls})`;
    const w = this.bowling();
    return w ? `${w.wickets}-${w.runs}` : '';
  });

  protected readonly color = computed(() => teamColorFor(this.match(), this.info()?.team.code ?? this.info()?.team.name ?? ''));
}
