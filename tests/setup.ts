import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll} from 'vitest';

const testRoot = path.join(os.tmpdir(), `motion-flow-tests-${process.pid}`);
process.env.MOTION_DATA_DIR = testRoot;

afterAll(async () => {
  const {closeDbForTests} = await import('../src/lib/db');
  closeDbForTests();
  fs.rmSync(testRoot, {recursive: true, force: true});
});
