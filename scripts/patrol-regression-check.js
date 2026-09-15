'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const roundsArg = process.argv.find(arg => /^--rounds=[1-3]$/.test(arg));
const rounds = roundsArg ? Number(roundsArg.split('=')[1]) : 1;
const targets = [
  'patrol-trigger-policy-check.js', 'patrol-single-step-check.js',
  'daily-third-task-check.js', 'daily-event-mail-entry-check.js', 'task-lock-recovery-check.js',
  'goal-system-v3-check.js', 'goal-ui-check.js', 'goal-material-routing-check.js',
  'navigation-routing-check.js', 'sandbox-task-navigation-check.js', 'sandbox-task-sync-check.js',
  'system-task-cooldown-check.js', 'nonlinear-task-routing-check.js', 'mixed-task-deadlock-check.js',
  'task-resource-pipeline-check.js', 'task-story-alignment-check.js', 'story-system-consistency-check.js',
  'story-activation-check.js', 'chapter-story-check.js', 'chapter-gate-order-check.js',
  'ledger-story-task-check.js', 'task-story-resource-match-check.js', 'map-task-story-dedupe-check.js',
  'reserve-presentation-check.js', 'action-system-check.js', 'season-emergency-check.js',
  'world-event-system-check.js', 'world-event-idle-check.js', 'threat-action-check.js',
  'water-grass-guidance-check.js', 'task-social-check.js', 'settlement-causality-check.js',
  'numeric-feedback-check.js', 'early-entry-task-check.js', 'recent-ui-regression-check.js',
  'loop-safety-check.js', 'long-run-soak-check.js'
];
const report = { startedAt: new Date().toISOString(), rounds, testsPerRound: targets.length, results: [] };
for (let round = 1; round <= rounds; round++) {
  for (const target of targets) {
    const start = Date.now();
    const result = spawnSync(process.execPath, [path.join(__dirname, target)], {
      cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env: Object.assign({}, process.env, { NODE_NO_WARNINGS: '1' })
    });
    // A Node process can exit zero with an unresolved Promise. Require the
    // test's final completion message as well as its exit status.
    const completed = /(?:check|regression)[^\n]*\bok\b/i.test(result.stdout || '');
    const passed = result.status === 0 && !result.error && completed;
    report.results.push({ round, target, passed, exitCode: result.status,
      durationMs: Date.now() - start, stdout: result.stdout || '', stderr: result.stderr || '',
      error: result.error ? result.error.message : !completed ? 'Missing test completion message' : '' });
    console.log(`${passed ? 'PASS' : 'FAIL'} round ${round} ${target}`);
    if (!passed) console.error((result.stderr || result.stdout || result.error || 'No completion message').toString().slice(-3000));
  }
}
report.finishedAt = new Date().toISOString();
report.passed = report.results.filter(result => result.passed).length;
report.failed = report.results.length - report.passed;
fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'reports', 'patrol-trigger-regression.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`patrol regression ${report.failed ? 'FAILED' : 'ok'}: ${report.passed}/${report.results.length} completed checks`);
process.exitCode = report.failed ? 1 : 0;
