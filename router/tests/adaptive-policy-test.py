#!/usr/bin/env python3
"""Exercise the vendored controller's real rate decision block without networking.

These deterministic rate-transition checks complement hardware measurements;
they do not simulate TCP, Wi-Fi, or establish usable ISP capacity.
Requires Bash >=4 (OpenWrt dependency). On macOS with Bash 3, run via:
NETHERA_TEST_BASH="ssh root@router /bin/bash" python3 router/tests/adaptive-policy-test.py
"""
import os
import shlex
import pathlib
import subprocess
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'vendor/cake-autorate/cake-autorate.sh'
text = SOURCE.read_text()
start = text.index('load_condition[dl]=${dl_rate_load_condition}')
end = text.index('set_shaper_rate "dl"', start)
DECISION = text[start:end]


def transition(rate, achieved, delayed=False, load='low', ceiling=1000000, rounds=1):
    setup = r'''
set -u
declare -A achieved_rate_kbps shaper_rate_kbps base_shaper_rate_kbps
 declare -A min_shaper_rate_kbps max_shaper_rate_kbps bufferbloat_detected
 declare -A compensated_owd_delta_thr_us compensated_avg_owd_delta_thr_us avg_owd_delta_us
 declare -A t_last_bufferbloat_us t_last_decay_us achieved_rate_updated load_condition
 connection_active_thr_kbps=1000
 bufferbloat_refractory_period_us=300000 decay_refractory_period_us=1000000
 shaper_rate_min_adjust_down_bufferbloat=990 shaper_rate_max_adjust_down_bufferbloat=750
 shaper_rate_adjust_up_load_high=1100 shaper_rate_adjust_down_load_low=1000 shaper_rate_adjust_up_load_low=1200
 for d in dl ul; do
 achieved_rate_kbps[$d]=0; shaper_rate_kbps[$d]=10000; base_shaper_rate_kbps[$d]=10000
 min_shaper_rate_kbps[$d]=1000; max_shaper_rate_kbps[$d]=10000
 bufferbloat_detected[$d]=0; compensated_owd_delta_thr_us[$d]=30000
 compensated_avg_owd_delta_thr_us[$d]=60000; avg_owd_delta_us[$d]=60000
 t_last_bufferbloat_us[$d]=0; t_last_decay_us[$d]=0; achieved_rate_updated[$d]=1
 done
 ul_rate_load_condition=idle
 log_msg(){ printf '%s\n' "$*" >&2; exit 1; }
'''
    setup += f'''
shaper_rate_kbps[dl]={rate}; achieved_rate_kbps[dl]={achieved}
base_shaper_rate_kbps[dl]={ceiling}; max_shaper_rate_kbps[dl]={ceiling}
bufferbloat_detected[dl]={int(delayed)}; dl_rate_load_condition={load}
for ((n=1;n<={rounds};n++)); do
 t_start_us=$((n*2000000)); achieved_rate_updated[dl]=1
'''
    command = shlex.split(os.environ.get('NETHERA_TEST_BASH', 'bash'))
    result = subprocess.run(command + ['-s'], input=setup + DECISION + '\ndone\nprintf "%s" "${shaper_rate_kbps[dl]}"',
                            capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError('Bash >=4 required; policy execution failed: ' + result.stderr.strip())
    return int(result.stdout)


class AdaptivePolicyTest(unittest.TestCase):
    def test_idle_jitter_cannot_reduce_rate(self):
        self.assertEqual(transition(300000, 0, True), 360000)
        self.assertEqual(transition(300000, 999, True), 360000)

    def test_active_congestion_still_reduces_rate(self):
        self.assertEqual(transition(300000, 250000, True, 'high'), 225000)

    def test_normal_or_preferred_can_probe_spare_capacity(self):
        # Decisions depend on total load, not device priority or TCP count.
        self.assertEqual(transition(300000, 250000, False, 'high'), 330000)

    def test_idle_recovers_from_transient_floor_without_low_base(self):
        self.assertEqual(transition(1000, 0, True, rounds=40), 1000000)

    def test_recovery_obeys_multiple_link_ceilings(self):
        for maximum in (10000, 60000, 300000, 1000000):
            with self.subTest(maximum=maximum):
                self.assertEqual(transition(maximum, 0, True, ceiling=maximum), maximum)
                self.assertEqual(transition(maximum, maximum, False, 'high', ceiling=maximum), maximum)


if __name__ == '__main__':
    unittest.main()
