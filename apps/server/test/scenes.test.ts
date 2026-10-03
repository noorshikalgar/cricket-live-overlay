import { describe, expect, it } from 'vitest';
import { createStarterScenes } from '@cos/shared';
import { validateScene } from '../src/scenes';

describe('validateScene background', () => {
  const base = createStarterScenes()[0];

  it('defaults older scenes to transparent', () => {
    const { background: _b, ...old } = base;
    expect(validateScene(old)?.background?.kind).toBe('transparent');
  });

  it('keeps a valid background', () => {
    const s = validateScene({ ...base, background: { kind: 'gradient', color: '#112233', color2: '#445566', image: '', dim: 0.3 } });
    expect(s?.background).toEqual({ kind: 'gradient', color: '#112233', color2: '#445566', image: '', dim: 0.3 });
  });

  it('rejects remote images, bad colours and out-of-range dim', () => {
    const s = validateScene({
      ...base,
      background: { kind: 'image', color: 'red;}', color2: '#000', image: 'https://evil.example/x.png', dim: 5 },
    });
    expect(s?.background).toMatchObject({ kind: 'image', color: '#0B0F17', image: '', dim: 0.8 });
  });
});
