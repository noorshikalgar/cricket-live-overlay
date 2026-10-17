import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OwnPhotoFolder, hasAlpha } from '../src/photo-sources';

/** the first bytes of a PNG with the given IHDR colour type */
function png(colourType: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(600, 16);
  b.writeUInt32BE(600, 20);
  b[24] = 8;
  b[25] = colourType;
  return b;
}

describe('hasAlpha', () => {
  it('spots transparent PNGs and ignores opaque ones and JPEGs', () => {
    expect(hasAlpha(png(6), 'image/png')).toBe(true);
    expect(hasAlpha(png(2), 'image/png')).toBe(false);
    expect(hasAlpha(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg')).toBe(false);
  });
});

describe('your photos folder', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'photos-'));
  writeFileSync(path.join(dir, 'Virat Kohli.png'), png(6));
  writeFileSync(path.join(dir, 'rohit-sharma.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  writeFileSync(path.join(dir, 'JASPRIT_BUMRAH.webp'), Buffer.from('RIFF0000WEBPVP8 '));
  writeFileSync(path.join(dir, 'Varun Chakravarthy.png'), png(2));
  writeFileSync(path.join(dir, 'notes.txt'), 'not a photo');
  mkdirSync(path.join(dir, 'MUM'));
  mkdirSync(path.join(dir, 'IND'));
  writeFileSync(path.join(dir, 'MUM', 'Rahul Sharma.png'), png(6));
  writeFileSync(path.join(dir, 'IND', 'Rahul Sharma.png'), png(2));
  const folder = new OwnPhotoFolder(dir);

  it('matches names whatever the case, spaces, dashes or underscores', () => {
    expect(path.basename(folder.find('Virat Kohli')!.file)).toBe('Virat Kohli.png');
    expect(path.basename(folder.find('Rohit Sharma')!.file)).toBe('rohit-sharma.jpg');
    expect(path.basename(folder.find('Jasprit Bumrah')!.file)).toBe('JASPRIT_BUMRAH.webp');
  });
  it('matches a near spelling of the surname, not a different player', () => {
    expect(path.basename(folder.find('Varun Chakaravarthy')!.file)).toBe('Varun Chakravarthy.png');
    expect(folder.find('Virat Singh')).toBeNull();
    expect(folder.find('Tilak Varma')).toBeNull();
  });
  it("prefers the player's team folder for shared names", () => {
    expect(folder.find('Rahul Sharma', 'IND')!.team).toBe('IND');
    expect(folder.find('Rahul Sharma', 'MUM')!.team).toBe('MUM');
  });
  it('ignores files that are not photos and writes a naming guide', () => {
    expect(folder.count).toBe(6);
    expect(folder.find('notes')).toBeNull();
  });
  it('reads a transparent PNG as a cut-out', () => {
    expect(folder.read(folder.find('Virat Kohli')!).cutout).toBe(true);
    expect(folder.read(folder.find('Rohit Sharma')!).cutout).toBe(false);
  });
});
