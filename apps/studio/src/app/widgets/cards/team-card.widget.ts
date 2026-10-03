import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { battingTeam, type Team } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { WidgetBase } from '../widget-base';
import { findTeam, sameName } from './card-data';

export interface TeamCardProps {
  /** 'batting' | 'bowling' follow the live game; '0' | '1' pin a team */
  side: string;
  showRoles: boolean;
  showScores: boolean;
  minimized: boolean;
}

interface Row {
  name: string;
  role: string;
  captain: boolean;
  keeper: boolean;
  /** "64* (92)", "2-34", "yet to bat", "" */
  line: string;
  live: boolean;
  muted: boolean;
}

/** Playing XI with what each player has done in this match: batted, batting now, yet to bat, bowling figures. */
@Component({
  selector: 'cos-team-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel card" [class.minimized]="p().minimized" [style.--team]="team()?.primaryColor ?? null">
      <div class="card-head">
        <span class="card-title">{{ team()?.name ?? 'Team' }}</span>
        <span class="card-sub">Playing XI</span>
        @if (p().showScores && scoreLine()) {
          <span class="card-score">{{ scoreLine() }}</span>
        }
      </div>
      @if (!p().minimized) {
        <div class="card-body">
          @if (rows().length) {
            <table class="tbl">
              <tbody>
                @for (r of rows(); track r.name) {
                  <tr [class.live]="r.live">
                    <td class="name">
                      {{ r.name }}@if (r.captain) {<span class="tag-mini">C</span>}@if (r.keeper) {<span class="tag-mini">WK</span>}
                    </td>
                    @if (p().showRoles) {
                      <td class="role muted">{{ short(r.role) }}</td>
                    }
                    <td [class.muted]="r.muted" [class.big]="!r.muted">{{ r.line }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="card-empty">{{ editing() ? 'Load the playing XIs from the Cards panel (1 API call).' : '' }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) * 0.029);
    }
    .card {
      height: auto;
      max-height: 100%;
    }
    td.name {
      width: 56%;
    }
    td.role {
      text-align: left;
      width: 5.5em;
      letter-spacing: 0.06em;
      font-size: 0.7em;
    }
    .tbl td {
      padding-top: 0.3em;
      padding-bottom: 0.3em;
    }
  `,
})
export class TeamCardWidget extends WidgetBase<TeamCardProps> {
  protected readonly defaults: TeamCardProps = { side: 'batting', showRoles: true, showScores: true, minimized: false };
  private readonly store = inject(LiveStore);

  /** "Batting Allrounder" → "BAT AR", short enough for a narrow column */
  protected short(role: string): string {
    const r = role.toLowerCase();
    if (!r) return '';
    if (r.includes('wk') || r.includes('keeper')) return 'WK';
    if (r.includes('allrounder')) return r.includes('bowl') ? 'BOWL AR' : r.includes('bat') ? 'BAT AR' : 'AR';
    if (r.includes('bowl')) return 'BOWL';
    if (r.includes('bat')) return 'BAT';
    return role.toUpperCase().slice(0, 6);
  }

  protected readonly team = computed<Team | null>(() => {
    const m = this.match();
    if (!m) return null;
    const side = this.p().side;
    if (side === '0' || side === '1') return m.teams[Number(side)];
    const bat = battingTeam(m) ?? m.teams[0];
    return side === 'bowling' ? (m.teams.find((t) => t.shortCode !== bat.shortCode) ?? m.teams[1]) : bat;
  });

  protected readonly scoreLine = computed(() => {
    const t = this.team();
    const inns = (this.match()?.innings ?? []).filter((i) => i.battingTeam === t?.shortCode);
    return inns.map((i) => `${i.runs}/${i.wickets} (${i.overs})`).join(' & ');
  });

  protected readonly rows = computed<Row[]>(() => {
    const t = this.team();
    if (!t) return [];
    const sc = this.store.scorecard();
    const batInns = (sc?.innings ?? []).filter((i) => i.team === t.shortCode || sameName(i.teamName, t.name));
    const bowlInns = (sc?.innings ?? []).filter((i) => !batInns.includes(i));
    const squad = findTeam(this.store.squads(), t.shortCode) ?? findTeam(this.store.squads(), t.name);

    const lineFor = (name: string, id: string | null): Omit<Row, 'name' | 'role' | 'captain' | 'keeper'> => {
      const match = (p: { id: string | null; name: string }) => (!!id && p.id === id) || sameName(p.name, name);
      const bat = batInns.flatMap((i) => i.batters).filter(match).at(-1);
      const bowl = bowlInns.flatMap((i) => i.bowlers).filter(match).at(-1);
      if (bat) {
        const star = bat.status !== 'out' ? '*' : '';
        return { line: `${bat.runs}${star} (${bat.balls})`, live: bat.status === 'batting', muted: false };
      }
      if (bowl) return { line: `${bowl.wickets}-${bowl.runs} (${bowl.overs})`, live: false, muted: false };
      const yet = batInns.some((i) => i.yetToBat.some((n) => sameName(n, name)));
      return { line: yet || batInns.length ? 'yet to bat' : '', live: false, muted: true };
    };

    if (squad?.playingXI.length) {
      return squad.playingXI.map((p) => ({
        name: p.name,
        role: p.role,
        captain: p.captain,
        keeper: p.keeper,
        ...lineFor(p.name, p.id),
      }));
    }
    // no squads loaded: fall back to the batting card + yet to bat
    const inn = batInns.at(-1);
    if (!inn) return [];
    return [
      ...inn.batters.map((b) => ({ name: b.name, role: '', captain: b.captain, keeper: b.keeper, ...lineFor(b.name, b.id) })),
      ...inn.yetToBat.map((n) => ({ name: n, role: '', captain: false, keeper: false, line: 'yet to bat', live: false, muted: true })),
    ];
  });
}
