#!/usr/bin/env python3
"""Bounded live-router diagnostic: two direct, identical TCP downloads.

The client must already be preferred. Only one test connection is temporarily
classified normal. The preferred connection uses the production device rules.
The worker resumes and reconciles its original desired state in finally; a
router-side watchdog covers interruption of this client. No other table changes.
"""
import argparse
import concurrent.futures
import ipaddress
import json
import re
import socket
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--router', default='root@192.168.1.1')
    parser.add_argument('--ssh-key')
    parser.add_argument('--client-ip', required=True)
    parser.add_argument('--seconds', type=int, default=25, choices=range(10, 41))
    args = parser.parse_args()
    client = ipaddress.IPv4Address(args.client_ip)
    if not client.is_private or args.router.startswith('-'):
        parser.error('private client IPv4 and SSH target required')
    ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5']
    if args.ssh_key:
        ssh += ['-o', 'IdentitiesOnly=yes', '-i', args.ssh_key]
    ssh.append(args.router)

    def remote(command):
        return subprocess.run(ssh + [command], check=True, capture_output=True,
                              text=True, timeout=20).stdout

    state = json.loads(remote('cat /etc/nethera-priority.json'))
    neighbor = remote(f'ip -4 neigh show to {client}')
    mac = re.search(r'\blladdr ([0-9a-f:]{17})\b', neighbor.lower())
    if not mac or state.get('devices', {}).get(mac[1]) != 'high':
        parser.error('client must be online and already preferred in the frontend')
    ack = json.loads(remote('/usr/bin/nethera-priority --priority-apply /etc/nethera-priority.json'))
    if not ack.get('applied') or not ack.get('bandwidth', {}).get('active'):
        raise RuntimeError('active shaping readback required')
    queue = json.loads(remote('tc -j qdisc show dev br-lan'))
    if not any(q.get('kind') == 'cake' and q.get('handle') == '7d00:' and q.get('root') for q in queue):
        parser.error('this diagnostic requires the CAKE priority worker')
    holders = []
    for _ in range(2):
        sock = socket.socket()
        sock.bind((str(client), 0))
        holders.append(sock)
    high, normal = [s.getsockname()[1] for s in holders]
    for s in holders:
        s.close()
    marker = '/tmp/nethera-wan-check-' + uuid.uuid4().hex
    restore = ('p=$(pidof nethera-priority); if [ -n "$p" ]; then kill -CONT "$p"; fi; '
               '/usr/bin/nethera-priority --priority-apply /etc/nethera-priority.json')
    setup = (f'p=$(pidof nethera-priority); [ -n "$p" ] || exit 1; touch {marker}; '
             f'nohup sh -c \'sleep {args.seconds + 35}; if [ -f {marker} ]; then '
             f'{restore}; rm {marker}; fi\' >{marker}.log 2>&1 </dev/null & '
             'kill -STOP "$p"')
    remote(setup)
    try:
        remote(f'nft add rule inet nethera_priority classify ip saddr {client} tcp sport {normal} counter meta priority set 0x7d000001; '
               f'nft add rule inet nethera_priority classify ip daddr {client} tcp dport {normal} counter meta priority set 0x7d000001; '
               f'nft add rule inet nethera_priority classify ip daddr {client} tcp dport {high} counter')

        def download(port):
            result = subprocess.run([
                'curl', '-4', '--http1.1', '--interface', str(client), '--local-port', str(port),
                '--silent', '--show-error', '--fail', '--max-time', str(args.seconds),
                '-o', '/dev/null', '-w', '%{http_code} %{size_download} %{time_total} %{speed_download}',
                'https://proof.ovh.net/files/100Mb.dat',
            ], capture_output=True, text=True, timeout=args.seconds + 5)
            fields = result.stdout.split()
            if result.returncode not in (0, 28) or len(fields) != 4 or fields[0] not in ('200', '206') or int(fields[1]) < 131072:
                raise RuntimeError('test download failed: ' + result.stderr.strip())
            # Exit 28 is the intentional duration limit for this bounded load.
            return {'bytes': int(fields[1]), 'seconds': float(fields[2]),
                    'mbps': round(float(fields[3]) * 8 / 1e6, 3)}

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            preferred, ordinary = list(pool.map(download, (high, normal)))
        print(json.dumps({'preferred': preferred, 'normal': ordinary,
                          'ratio': round(preferred['mbps'] / ordinary['mbps'], 3),
                          'bandwidth': ack['bandwidth'],
                          'scope': 'two direct TCP flows on one preferred client; not phone acceptance'}, indent=2))
    finally:
        restored = json.loads(remote(restore))
        if not restored.get('applied'):
            raise RuntimeError('original priority reconciliation failed')
        remote(f'if [ -f {marker} ]; then rm {marker}; fi')


if __name__ == '__main__':
    main()
