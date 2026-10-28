import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WASM_PATH, MEDIAPIPE_VERSION } from '../src/index';

describe('MediaPipe version pin', () => {
  it('matches the installed @mediapipe/tasks-vision', () => {
    const pkg = JSON.parse(readFileSync(
      resolve(__dirname, '../node_modules/@mediapipe/tasks-vision/package.json'), 'utf8',
    ));
    expect(MEDIAPIPE_VERSION).toBe(pkg.version);
  });

  it('pins the default WASM path to that version', () => {
    expect(DEFAULT_WASM_PATH).toContain(`@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/`);
    expect(DEFAULT_WASM_PATH).not.toContain('@latest');
  });
});
