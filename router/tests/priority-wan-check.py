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
import urllib.parse



def _watchdog_setup(marker, restore, delay):
    # BusyBox installations may lack nohup. Ignore HUP before forking and
    # detach every standard descriptor so this survives the SSH disconnect.
    return (f'p=$(pidof nethera-priority); [ -n "$p" ] || exit 1; touch {marker}; '
            f"trap '' HUP; (sleep {delay}; if [ -f {marker} ]; then "
            f'{restore}; rm {marker}; fi) >{marker}.log 2>&1 </dev/null & '
            'kill -STOP "$p"')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--router', default='root@192.168.1.1')
    parser.add_argument('--ssh-key')
    parser.add_argument('--client-ip', required=True)
    parser.add_argument('--url', default='https://mensura.cdn-apple.com/api/v1/gm/large')
    parser.add_argument('--seconds', type=int, default=25, choices=range(10, 41))
    parser.add_argument('--streams', type=int, default=1, choices=range(1, 5), help='parallel connections per priority group')
    args = parser.parse_args()
    test_url = urllib.parse.urlsplit(args.url)
    if test_url.scheme != "https" or not test_url.hostname or test_url.username or test_url.password:
        parser.error("HTTPS test URL without embedded credentials required")
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
    for _ in range(2 * args.streams):
        sock = socket.socket()
        sock.bind((str(client), 0))
        holders.append(sock)
    ports = [s.getsockname()[1] for s in holders]
    high, normal = ports[:args.streams], ports[args.streams:]
    for s in holders:
        s.close()
    marker = '/tmp/nethera-wan-check-' + uuid.uuid4().hex
    restore = ('p=$(pidof nethera-priority); if [ -n "$p" ]; then kill -CONT "$p"; fi; '
               '/usr/bin/nethera-priority --priority-apply /etc/nethera-priority.json')
    setup = _watchdog_setup(marker, restore, args.seconds + 35)
    remote(setup)
    try:
        rules = []
        for port in normal:
            rules += [f'nft add rule inet nethera_priority classify ip saddr {client} tcp sport {port} counter meta priority set 0x7d000001',
                      f'nft add rule inet nethera_priority classify ip daddr {client} tcp dport {port} counter meta priority set 0x7d000001']
        for port in high:
            rules.append(f'nft add rule inet nethera_priority classify ip daddr {client} tcp dport {port} counter')
        remote(' && '.join(rules))

        def download(port):
            result = subprocess.run([
                'curl', '-4', '--http1.1', '--interface', str(client), '--local-port', str(port),
                '--silent', '--show-error', '--fail', '--max-time', str(args.seconds),
                '-o', '/dev/null', '-w', '%{http_code} %{size_download} %{time_total} %{speed_download}',
                args.url,
            ], capture_output=True, text=True, timeout=args.seconds + 5)
            fields = result.stdout.split()
            if result.returncode not in (0, 28) or len(fields) != 4 or fields[0] not in ('200', '206') or int(fields[1]) < 131072 or float(fields[2]) > args.seconds + 3:
                raise RuntimeError('test download failed: ' + result.stderr.strip())
            # Exit 28 is the intentional duration limit for this bounded load.
            return {'bytes': int(fields[1]), 'seconds': float(fields[2]),
                    'mbps': round(float(fields[3]) * 8 / 1e6, 3)}

        with concurrent.futures.ThreadPoolExecutor(max_workers=2 * args.streams) as pool:
            results = list(pool.map(download, high + normal))
        preferred = sum(r['mbps'] for r in results[:args.streams])
        ordinary = sum(r['mbps'] for r in results[args.streams:])
        evidence = remote('tc -j -s qdisc show dev br-lan')
        print(json.dumps({'preferredMbps': round(preferred, 3), 'normalMbps': round(ordinary, 3),
                          'flows': results, 'ratio': round(preferred / ordinary, 3),
                          'bandwidthBefore': ack['bandwidth'], 'queueAfter': json.loads(evidence),
                          'scope': 'direct TCP groups on one preferred client; not phone acceptance'}, indent=2))
    finally:
        restored = json.loads(remote(restore))
        if not restored.get('applied'):
            raise RuntimeError('original priority reconciliation failed')
        remote(f'if [ -f {marker} ]; then rm {marker}; fi')


if __name__ == '__main__':
    main()
