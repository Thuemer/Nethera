import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Transitional build for the existing shared-router cloud, not an ownership rollout.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [destination, source] = process.argv.slice(2);
if (!destination || !source) throw new Error('Usage: node prepare-time-release.mjs NEW_DIRECTORY COMMIT|WORKTREE');
const target = resolve(destination);
mkdirSync(target, { recursive: false });
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 100 * 1024 * 1024 });
const backend = '6065a405c8b07090d3e8783e14e556fa1d60afee';
const ingest = '655dd2750942dacd8c228b6b70c04ecede21939c';
const frontend = 'f38f62042b8e9b1fcc7189b489a24b3f4aaf75e2';
const revision = source === 'WORKTREE' ? source : git('rev-parse', `${source}^{commit}`).toString().trim();
const archive = (ref, paths) => execFileSync('tar', ['-xf', '-', '-C', target], { input: git('archive', ref, ...paths) });
const put = (path, data) => {
  mkdirSync(dirname(resolve(target, path)), { recursive: true });
  writeFileSync(resolve(target, path), data);
};
const current = path => source === 'WORKTREE' ? readFileSync(resolve(repo, path)) : git('show', `${revision}:${path}`);
archive(frontend, ['Applikation', 'Website', '.dockerignore']);
// OneDrive duplicate pages are tracked, but were never part of the live image.
put('.dockerignore', readFileSync(resolve(target, '.dockerignore'), 'utf8') + '\n'
  + ['Applikation/index 2.html', 'Website/html/nethera 2.html',
    'Website/html/step_by_step 2.html', 'Website/css/nethera 2.css'].join('\n') + '\n');
archive(backend, ['Backend/Nethera']);
for (const path of ['src/main/java/at/htlleonding/telemetry/DeviceIngestor.java', 'src/test/java/at/htlleonding/telemetry/DeviceIngestorTest.java']) {
  put(`Backend/Nethera/${path}`, git('show', `${ingest}:Backend/Nethera/${path}`));
}
const files = [
  'boundary/PriorityBandwidthResource.java', 'control/PriorityControlService.java', 'control/PriorityDesiredState.java',
  'model/DevicePriority.java', 'model/PriorityControlState.java', 'model/PriorityBandwidthSettings.java',
  'boundary/DeviceTimeLimitsResource.java', 'dto/DeviceTimeLimitDto.java',
  'model/DeviceTimeLimit.java', 'model/TimeControlState.java',
  'repository/DeviceTimeLimitsRepository.java',
  'control/TimeControlChanged.java', 'control/TimeControlPublisher.java',
  'control/TimeControlStatus.java', 'control/TimeDesiredState.java',
  'mqtt/TelemetryMessageHandler.java', 'mqtt/TelemetryPayloadParser.java',
  'telemetry/TelemetryModeConfigInterceptor.java', 'telemetry/TimeIngestor.java', 'telemetry/TimeSample.java',
].map(path => `Backend/Nethera/src/main/java/at/htlleonding/${path}`);
files.push(...[
  'control/PriorityDesiredStateTest.java', 'control/PriorityControlServiceTest.java', 'control/PriorityMigrationTest.java',
  'control/TimeDesiredStateTest.java', 'control/TimeMigrationTest.java',
  'mqtt/PriorityTimeControlIT.java', 'mqtt/TimeControlIT.java', 'mqtt/TimePayloadParserTest.java', 'mqtt/TelemetryMessageHandlerTest.java',
  'mqtt/MqttTelemetryTestResource.java', 'ExampleResourceTest.java',
].map(path => `Backend/Nethera/src/test/java/at/htlleonding/${path}`));
files.push('Backend/Nethera/migrations/20261122_time_control_bridge.sql', 'Backend/Nethera/migrations/20261127_device_priority.sql', 'Backend/Nethera/migrations/20261127_priority_bandwidth.sql');
files.push(...['index.html', 'security.html', 'security.js', 'time-limits.html', 'time-limits.js',
  'tests/rules.test.cjs', 'tests/presentation-browser.cjs', 'tests/time-control-browser.cjs', 'tests/priority-time-browser.cjs'].map(path => `Applikation/${path}`));
for (const path of files) put(path, current(path));

// Keep the running account.js byte-for-byte, including the demo logout cleanup.
let login = git('show', 'c88bfd3:Applikation/account.js').toString();
const logout = "      keycloak.logout({ redirectUri: `${window.location.origin}${window.location.pathname}?screen=account` });";
if (login.split(logout).length !== 2) throw new Error('Unexpected login baseline');
login = login.replace(logout, "      try { sessionStorage.removeItem('nethera-demo-preview'); } catch {}\n      window.NETHERA_DEMO_PREVIEW = false;\n" + logout);
if (createHash('sha256').update(login).digest('hex') !== '8912b216f8c534c814434cc235ceb988f20bae0a0bafc41fe85473e4328a3b2f') {
  throw new Error('Login differs from the verified live version');
}
put('Applikation/account.js', login);
const properties = 'Backend/Nethera/src/main/resources/application.properties';
const marker = '# Time control has its own channel, client id and retained desired state.';
const section = current(properties).toString().split(marker);
if (section.length !== 2) throw new Error('Missing MQTT time configuration');
put(properties, readFileSync(resolve(target, properties), 'utf8') + '\n' + marker + section[1]);
const patch = current('deploy/leocloud/time-schedules-cloud.patch');
execFileSync('git', ['apply', '--check', '-'], { cwd: target, input: patch });
execFileSync('git', ['apply', '-'], { cwd: target, input: patch });
const priorityPatch = current('deploy/leocloud/priority-cloud.patch');
execFileSync('git', ['apply', '--check', '-'], { cwd: target, input: priorityPatch });
execFileSync('git', ['apply', '-'], { cwd: target, input: priorityPatch });
const manifest = { source: revision, backend, ingest, frontend, files, adapters: ['time-schedules-cloud.patch', 'priority-cloud.patch'] };
put('release-source.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ directory: target, ...manifest }, null, 2));
