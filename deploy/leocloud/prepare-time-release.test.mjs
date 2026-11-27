import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', args, {cwd:repo,maxBuffer:100*1024*1024});
const text = (root, path) => readFileSync(join(root,path),'utf8');

test('combined release preserves verified login and DNS/time baseline while adding priority', () => {
  const temp=mkdtempSync(join(tmpdir(),'nethera-release-check-'));
  try {
    const baseline=join(temp,'baseline'), combined=join(temp,'combined');
    // Reconstruct the last verified release using its original generator and immutable commit.
    const old=git('show','52c9989:deploy/leocloud/prepare-time-release.mjs').toString()
      .replace("const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');",`const repo = ${JSON.stringify(repo)};`);
    execFileSync('node',['--input-type=module','-e',`process.argv=['node','baseline',${JSON.stringify(baseline)},'52c9989'];\n${old}`],{cwd:repo});
    execFileSync('node',['deploy/leocloud/prepare-time-release.mjs',combined,'WORKTREE'],{cwd:repo});
    const account=text(combined,'Applikation/account.js');
    assert.equal(account,text(baseline,'Applikation/account.js'));
    assert.equal(createHash('sha256').update(account).digest('hex'),'8912b216f8c534c814434cc235ceb988f20bae0a0bafc41fe85473e4328a3b2f');
    const files=root=>readdirSync(root,{recursive:true,withFileTypes:true})
      .filter(e=>e.isFile()).map(e=>join(e.parentPath||e.path,e.name));
    const allowed=new Set(['Applikation/security.html','Applikation/security.js','Applikation/tests/rules.test.cjs','Applikation/tests/presentation-browser.cjs']);
    for(const file of files(join(baseline,'Applikation'))){
      const relative=file.slice(baseline.length+1);
      if(!allowed.has(relative)) assert.deepEqual(readFileSync(join(combined,relative)),readFileSync(file),relative);
    }
    for(const path of ['boundary/SecurityStateResource.java','control/DnsDesiredState.java','model/SecurityPreset.java',
      'control/TimeControlPublisher.java','control/TimeControlStatus.java','boundary/DeviceTimeLimitsResource.java']){
      assert.equal(text(combined,'Backend/Nethera/src/main/java/at/htlleonding/'+path),text(baseline,'Backend/Nethera/src/main/java/at/htlleonding/'+path),path);
    }
    assert.equal(text(combined,'Backend/Nethera/src/main/resources/application.properties'),text(baseline,'Backend/Nethera/src/main/resources/application.properties'));
    const resource=text(combined,'Backend/Nethera/src/main/java/at/htlleonding/boundary/RouterControlResource.java');
    assert.doesNotMatch(resource,/CurrentRouter|currentRouter/);
    assert.match(resource,/device\.getRouter\(\)\.getId\(\) != routerId/);
    assert.match(resource,/boolean timeControl, boolean devicePriority/);
    assert.match(resource,/@Authenticated\s+@PUT/);
    const telemetry=text(combined,'Backend/Nethera/src/main/java/at/htlleonding/mqtt/TelemetryMessageHandler.java');
    assert.match(telemetry,/control\|time\|priority/);
    const manifest=JSON.parse(text(combined,'release-source.json'));
    for(const suffix of ['PriorityControlService.java','DevicePriority.java','20261127_device_priority.sql','PriorityTimeControlIT.java','PriorityBandwidthResource.java','20261127_priority_bandwidth.sql']){
      assert.ok(manifest.files.some(f=>f.endsWith(suffix)),suffix);
    }
    assert.deepEqual(manifest.adapters,['time-schedules-cloud.patch','priority-cloud.patch']);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
