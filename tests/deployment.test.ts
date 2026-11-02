import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const bash =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : '/bin/bash';
const source = process.cwd();

// Fake external commands exercise the real shell scripts without a Docker daemon,
// live volumes, Git configuration changes, or host-wide cleanup.
const mocks = `
docker() {
  printf '%s\\n' "$*" >> events.log
  case "$*" in
    'compose version'|'compose config --quiet') return 0 ;;
    'compose up --help') printf '%s\\n' '--wait-timeout' ;;
    'compose ps --status running -q advent') [[ \${MOCK_FIRST:-0} == 1 ]] || echo old-container ; return 0 ;;
    'inspect --format {{.Image}} old-container') echo sha256:old ;;
    'compose build --pull advent') [[ \${MOCK_FAIL:-} != build ]] ;;
    'compose exec -T advent node dist/scripts/manage.js backup') [[ \${MOCK_FAIL:-} != backup ]] ;;
    'compose up -d --no-build --remove-orphans --wait --wait-timeout 180 advent') [[ \${MOCK_FAIL:-} != health ]] ;;
    'compose ps -q advent') echo new-container ;;
    'inspect --format {{.Image}} new-container') echo "\${MOCK_NEW_IMAGE:-sha256:new}" ;;
    'image rm sha256:old') [[ \${MOCK_FAIL:-} != cleanup ]] ;;
    *) echo "Unexpected Docker command: $*" >&2; return 90 ;;
  esac
}
flock() { [[ \${MOCK_FAIL:-} != lock ]]; }
git() {
  printf 'git %s\\n' "$*" >> events.log
  case "$*" in
    'diff --quiet'|'diff --cached --quiet') [[ \${MOCK_FAIL:-} != dirty ]] ;;
    '-c pull.rebase=false pull --ff-only')
      [[ \${ADVENT_SKIP_POST_MERGE:-0} == 1 ]] || return 91
      [[ \${MOCK_FAIL:-} != pull ]] ;;
    'rev-parse --show-toplevel') pwd ;;
    'config --local --get core.hooksPath'|'config --get core.hooksPath')
      [[ \${MOCK_HOOK:-0} == 0 ]] || echo other-hooks
      return 0 ;;
    'rev-parse --git-path hooks') echo .git/hooks ;;
    'config --local pull.rebase false'|'config --local pull.ff only') return 0 ;;
    *) echo "Unexpected Git command: $*" >&2; return 92 ;;
  esac
}
export -f docker flock git
`;

describe.skipIf(!existsSync(bash))(
  'server deployment scripts (mock Docker/Git)',
  () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(path.join(os.tmpdir(), 'advent-deploy-'));
      await mkdir(path.join(root, 'scripts'));
      await mkdir(path.join(root, '.githooks'));
      for (const file of [
        'scripts/deploy.sh',
        'scripts/update.sh',
        'scripts/install-deploy-hook.sh',
        '.githooks/post-merge',
      ]) {
        await copyFile(path.join(source, file), path.join(root, file));
      }
      await writeFile(
        path.join(root, '.env'),
        'PUBLIC_ORIGIN=https://example.com\n',
      );
      await writeFile(path.join(root, 'mock.sh'), mocks);
      await writeFile(path.join(root, 'events.log'), '');
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const events = () => readFile(path.join(root, 'events.log'), 'utf8');
    function run(
      file = 'scripts/deploy.sh',
      env: Record<string, string> = {},
      args: string[] = [],
    ) {
      return exec(
        bash,
        ['-c', 'source ./mock.sh; bash "$@"', 'test', file, ...args],
        {
          cwd: root,
          env: { ...process.env, ...env },
          timeout: 20000,
        },
      );
    }

    it('builds before backup, replaces only the project, waits for health and removes only the previous image', async () => {
      await run();
      const log = await events();
      expect(log.indexOf('compose build')).toBeLessThan(
        log.indexOf('manage.js backup'),
      );
      expect(log.indexOf('manage.js backup')).toBeLessThan(
        log.indexOf('compose up -d'),
      );
      expect(log).toContain(
        'compose up -d --no-build --remove-orphans --wait --wait-timeout 180 advent',
      );
      expect(log.indexOf('compose up -d')).toBeLessThan(
        log.indexOf('image rm sha256:old'),
      );
      expect(log).not.toMatch(/prune|compose down|volume rm|--force/);
    });
    for (const stage of ['build', 'backup']) {
      it(`keeps the current service untouched when ${stage} fails`, async () => {
        await expect(
          run('scripts/deploy.sh', { MOCK_FAIL: stage }),
        ).rejects.toThrow();
        const log = await events();
        expect(log).not.toContain('compose up -d');
        expect(log).not.toContain('image rm');
      });
    }
    it('keeps the previous image and reports health failures without automatic rollback', async () => {
      await expect(
        run('scripts/deploy.sh', { MOCK_FAIL: 'health' }),
      ).rejects.toThrow('no automatic code or database rollback');
      expect(await events()).not.toContain('image rm');
    });
    it('does not delete an unchanged image', async () => {
      await run('scripts/deploy.sh', { MOCK_NEW_IMAGE: 'sha256:old' });
      expect(await events()).not.toContain('image rm');
    });
    it('treats a still-referenced previous image as non-fatal', async () => {
      const result = await run('scripts/deploy.sh', { MOCK_FAIL: 'cleanup' });
      expect(result.stdout).toContain('deployment succeeded');
    });
    it('rejects concurrent deployments before Docker changes', async () => {
      await expect(
        run('scripts/deploy.sh', { MOCK_FAIL: 'lock' }),
      ).rejects.toThrow('Another deployment');
      expect(await events()).toBe('');
    });
    it('pulls fast-forward only, suppresses the hook, and deploys even if pull has no changes', async () => {
      await run('scripts/update.sh');
      const log = await events();
      expect(log).toContain('git -c pull.rebase=false pull --ff-only');
      expect(log.match(/compose build --pull advent/g)).toHaveLength(1);
    });
    for (const stage of ['dirty', 'pull']) {
      it(`does not deploy after ${stage} update failure`, async () => {
        await expect(
          run('scripts/update.sh', { MOCK_FAIL: stage }),
        ).rejects.toThrow();
        expect(await events()).not.toContain('compose build');
      });
    }
    it('skips post-merge deployment when invoked by the update wrapper', async () => {
      await run('.githooks/post-merge', { ADVENT_SKIP_POST_MERGE: '1' });
      expect(await events()).toBe('');
    });
    it('deploys from the optional post-merge hook and reports failures explicitly', async () => {
      await run('.githooks/post-merge');
      expect(await events()).toContain('compose build');
      await expect(
        run('.githooks/post-merge', { MOCK_FAIL: 'build' }),
      ).rejects.toThrow('AUTO-DEPLOY FAILED');
    });
    it('installs only repository-local hook and fast-forward settings', async () => {
      await run('scripts/install-deploy-hook.sh');
      const log = await events();
      expect(
        await readFile(path.join(root, '.git/hooks/post-merge'), 'utf8'),
      ).toContain('# private-advent-auto-deploy');
      expect(
        await readFile(path.join(root, '.githooks/post-merge'), 'utf8'),
      ).toBe(await readFile(path.join(source, '.githooks/post-merge'), 'utf8'));
      expect(log).toContain('git config --local pull.ff only');
      expect(log).not.toContain('--global');
    });
    it('refuses to overwrite an existing hooks configuration', async () => {
      await expect(
        run('scripts/install-deploy-hook.sh', { MOCK_HOOK: '1' }),
      ).rejects.toThrow('existing hooksPath');
      expect(await events()).not.toContain(
        'git config --local core.hooksPath .githooks',
      );
    });
    it('preserves unrelated hooks and disables only its own installed shim', async () => {
      await mkdir(path.join(root, '.git/hooks'), { recursive: true });
      await writeFile(
        path.join(root, '.git/hooks/pre-commit'),
        'keep this hook',
      );
      await run('scripts/install-deploy-hook.sh');
      await run('scripts/install-deploy-hook.sh', {}, ['--disable']);
      expect(existsSync(path.join(root, '.git/hooks/post-merge'))).toBe(false);
      expect(
        await readFile(path.join(root, '.git/hooks/pre-commit'), 'utf8'),
      ).toBe('keep this hook');
    });
    it('refuses to replace or disable someone else’s post-merge hook', async () => {
      await mkdir(path.join(root, '.git/hooks'), { recursive: true });
      await writeFile(
        path.join(root, '.git/hooks/post-merge'),
        'existing custom hook',
      );
      await expect(run('scripts/install-deploy-hook.sh')).rejects.toThrow(
        'existing post-merge hook',
      );
      await expect(
        run('scripts/install-deploy-hook.sh', {}, ['--disable']),
      ).rejects.toThrow('existing post-merge hook');
      expect(
        await readFile(path.join(root, '.git/hooks/post-merge'), 'utf8'),
      ).toBe('existing custom hook');
    });
  },
);
