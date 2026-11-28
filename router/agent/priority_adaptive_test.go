package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func adaptiveFixture() priorityAdaptiveConfig {
	return priorityAdaptiveConfig{Enabled: true, MinDownloadKbit: 5000, BaseDownloadKbit: 35000, Reflectors: []string{"1.1.1.1", "9.9.9.9", "8.8.8.8"}}
}
func TestAdaptiveValidationAndSafeRendering(t *testing.T) {
	p := adaptiveFixture()
	b := priorityBandwidth{Enabled: true, DownloadKbit: 1000000, UploadKbit: 10000}
	cfg, e := renderAdaptive(p, b, "wan", "br-lan")
	if e != nil {
		t.Fatal(e)
	}
	for _, s := range []string{"dl_if='br-lan'", "adjust_ul_shaper_rate=0", "max_dl_shaper_rate_kbps=1000000", "base_dl_shaper_rate_kbps=35000", "ping_extra_args='-I wan'"} {
		if !strings.Contains(string(cfg), s) {
			t.Fatal(s)
		}
	}
	p.Reflectors[0] = "1.1.1.1'; reboot"
	if p.validate(1000000) == nil {
		t.Fatal("accepted shell code")
	}
	p = adaptiveFixture()
	if p.validate(20000) == nil {
		t.Fatal("base exceeds allowed maximum")
	}
	if _, e = renderAdaptive(p, b, "wan;reboot", "br-lan"); e == nil {
		t.Fatal("unsafe interface")
	}
}
func TestExplicitBackendBandwidthOverridesLocalAdaptive(t *testing.T) {
	a := newPriorityAdaptive(nil)
	a.read = func(string) ([]byte, error) {
		t.Fatal("read local settings despite explicit override")
		return nil, nil
	}
	b := priorityBandwidth{Enabled: true, DownloadKbit: 60000, UploadKbit: 10000}
	p, e := a.plan(priorityControl{Bandwidth: &b}, b)
	if e != nil || p != nil {
		t.Fatal(p, e)
	}
}
func TestAdaptiveHealthRejectsStaleAndWrongProcess(t *testing.T) {
	a := newPriorityAdaptive(func(string, ...string) ([]byte, error) {
		return []byte(`{"nethera-autorate":{"instances":{"instance1":{"running":true,"pid":123}}}}`), nil
	})
	now := time.Unix(1000, 0)
	for _, v := range []struct {
		health string
		ok     bool
	}{{"999 123", true}, {"989 123", false}, {"1001 123", false}, {"999 456", false}, {"999", false}} {
		a.read = func(path string) ([]byte, error) {
			if path == a.serviceFile {
				return []byte(adaptiveOwner), nil
			}
			return []byte(v.health), nil
		}
		if got := a.healthy(now); got != v.ok {
			t.Fatal(v, got)
		}
	}
}
func TestMatchingControllerDoesNotRestartOrResetRate(t *testing.T) {
	a := newPriorityAdaptive(func(name string, args ...string) ([]byte, error) {
		if name != "ubus" {
			t.Fatal("unexpected controller mutation", name, args)
		}
		return []byte(`{"nethera-autorate":{"instances":{"x":{"running":true,"pid":12}}}}`), nil
	})
	a.dir = t.TempDir()
	p := adaptiveFixture()
	b := priorityBandwidth{Enabled: true, DownloadKbit: 1000000, UploadKbit: 10000}
	cfg, _ := renderAdaptive(p, b, "wan", "br-lan")
	a.read = func(path string) ([]byte, error) {
		if path == a.serviceFile {
			return []byte(adaptiveOwner), nil
		}
		return cfg, nil
	}
	running, e := a.prepare(p, b, "wan", "br-lan")
	if e != nil || !running {
		t.Fatal(running, e)
	}
}
func TestAdaptiveConfigWrittenOnlyInOwnRuntime(t *testing.T) {
	a := newPriorityAdaptive(func(name string, args ...string) ([]byte, error) {
		if name != "ubus" {
			return nil, fmt.Errorf("unexpected %s", name)
		}
		return []byte(`{}`), nil
	})
	a.dir = t.TempDir()
	a.read = func(path string) ([]byte, error) {
		if path == a.serviceFile {
			return []byte(adaptiveOwner), nil
		}
		return nil, os.ErrNotExist
	}
	p := adaptiveFixture()
	b := priorityBandwidth{Enabled: true, DownloadKbit: 1000000, UploadKbit: 10000}
	running, e := a.prepare(p, b, "wan", "br-lan")
	if e != nil || running {
		t.Fatal(running, e)
	}
	if _, e = os.Stat(filepath.Join(a.dir, "config.nethera-priority.sh")); e != nil {
		t.Fatal(e)
	}
}

func TestGeneratedAdaptiveConfigRoundTripsWithoutExtraNewline(t *testing.T) {
	a := newPriorityAdaptive(func(name string, args ...string) ([]byte, error) { return []byte(`{}`), nil })
	a.dir = t.TempDir()
	a.serviceFile = filepath.Join(a.dir, "service")
	os.WriteFile(a.serviceFile, []byte(adaptiveOwner), 0600)
	p := adaptiveFixture()
	b := priorityBandwidth{Enabled: true, DownloadKbit: 1000000, UploadKbit: 10000}
	if _, e := a.prepare(p, b, "wan", "br-lan"); e != nil {
		t.Fatal(e)
	}
	got, _ := os.ReadFile(filepath.Join(a.dir, "config.nethera-priority.sh"))
	want, _ := renderAdaptive(p, b, "wan", "br-lan")
	if string(got) != string(want) {
		t.Fatal("config comparison would restart controller on every refresh")
	}
}

func TestAdaptiveRefusesForeignService(t *testing.T) {
	a := newPriorityAdaptive(func(string, ...string) ([]byte, error) { t.Fatal("foreign service was accessed"); return nil, nil })
	a.read = func(string) ([]byte, error) { return []byte("# another service"), nil }
	if _, err := a.prepare(adaptiveFixture(), priorityBandwidth{Enabled: true, DownloadKbit: 1000000, UploadKbit: 10000}, "wan", "br-lan"); err == nil {
		t.Fatal("accepted foreign service")
	}
	if err := a.stop(); err != nil {
		t.Fatal(err)
	}
}

func TestAdaptiveRateReadbackEnforcesBounds(t *testing.T) {
	for _, tc := range []struct {
		rate int
		ok   bool
	}{{999, false}, {1000, true}, {35000, true}, {1000000, true}, {1000001, false}} {
		data := strings.Replace(matchingPriorityTestCake, "1250000", fmt.Sprint(tc.rate*125), 1)
		w := priorityWorker{run: func(string, ...string) ([]byte, error) { return []byte(data), nil }}
		rate, err := w.cakeRateReadback("wan", 1000, 1000000, false)
		if (err == nil) != tc.ok || (tc.ok && rate != tc.rate) {
			t.Fatal(tc, rate, err)
		}
	}
}

func TestCapacityFirstUsesCeilingAndFastRecovery(t *testing.T) {
	p := adaptiveFixture()
	p.CapacityFirst = true
	for _, maximum := range []int{10000, 60000, 300000, 1000000} {
		b := priorityBandwidth{Enabled: true, DownloadKbit: maximum, UploadKbit: 10000}
		cfg, err := renderAdaptive(p, b, "wan", "br-lan")
		if err != nil {
			t.Fatal(err)
		}
		for _, setting := range []string{fmt.Sprintf("base_dl_shaper_rate_kbps=%d\n", maximum), "shaper_rate_adjust_up_load_high=1.10\n", "shaper_rate_adjust_up_load_low=1.20\n", "shaper_rate_adjust_down_load_low=1.00\n", "dl_owd_delta_thr_ms=10.0\n", "dl_avg_owd_delta_thr_ms=30.0\n"} {
			if !strings.Contains(string(cfg), setting) {
				t.Fatal("missing capacity policy", maximum, setting)
			}
		}
		if p.initialRate(maximum) != maximum {
			t.Fatal("queue initializes below capacity-first ceiling")
		}
	}
	p.CapacityFirst = false
	if p.initialRate(1000000) != 35000 {
		t.Fatal("legacy profile changed")
	}
}
