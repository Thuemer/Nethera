package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

const priorityShaperHandle = "7d00:"
const priorityBandwidthFile = "/etc/nethera-priority-bandwidth.json"

// These are explicit shaping caps, not link speed or an automatic ISP estimate.
type priorityBandwidth struct {
	Enabled      bool `json:"enabled"`
	DownloadKbit int  `json:"downloadKbit"`
	UploadKbit   int  `json:"uploadKbit"`
}
type priorityBandwidthReport struct {
	priorityBandwidth
	Source string `json:"source"`
	Active bool   `json:"active"`
}

func (b priorityBandwidth) validate() error {
	if !b.Enabled {
		if b.DownloadKbit != 0 || b.UploadKbit != 0 {
			return errors.New("disabled bandwidth must have zero rates")
		}
		return nil
	}
	if b.DownloadKbit < 128 || b.UploadKbit < 128 || b.DownloadKbit > 1000000 || b.UploadKbit > 1000000 {
		return errors.New("bandwidth caps must be 128..1000000 kbit/s in both directions")
	}
	return nil
}
func resolvePriorityBandwidth(c priorityControl, read func(string) ([]byte, error)) (priorityBandwidth, string, error) {
	if c.Bandwidth != nil {
		return *c.Bandwidth, "backend", c.Bandwidth.validate()
	}
	data, err := read(priorityBandwidthFile)
	if os.IsNotExist(err) {
		return priorityBandwidth{}, "unconfigured", nil
	}
	if err != nil {
		return priorityBandwidth{}, "local", err
	}
	var b priorityBandwidth
	if err = json.Unmarshal(data, &b); err != nil {
		return b, "local", err
	}
	return b, "local", b.validate()
}
func ownedPriorityRoot(out string) string {
	if strings.Contains(out, "qdisc htb 7d00: root") || strings.Contains(out, "qdisc cake 7d00: root") {
		return priorityShaperHandle
	}
	if strings.Contains(out, "qdisc drr 7e00: root") {
		return priorityHandle
	}
	return ""
}
func (w priorityWorker) deleteOwnedQueue(dev string) error {
	out, err := w.qdisc(dev)
	if err != nil {
		return err
	}
	if handle := ownedPriorityRoot(out); handle != "" {
		return w.command("tc", "qdisc", "del", "dev", dev, "root", "handle", handle)
	}
	return nil
}

// CAKE owns only our 7d00: root. Its tin overrides use priority 7d00:1
// (normal/Bulk) and 7d00:2 (preferred/Best Effort), without rewriting DSCP.
// Separate host fairness prevents a device gaining shares by opening more flows.
func (w priorityWorker) ensureShapedQueue(dev string, rate int, download bool) error {
	out, err := w.qdisc(dev)
	if err != nil {
		return err
	}
	if !ownsPriorityQueue(out) && !freePriorityQueue(out) {
		return fmt.Errorf("foreign root qdisc on %s; left unchanged", dev)
	}
	if strings.Contains(out, "qdisc cake 7d00: root") {
		if w.verifyShapedQueue(dev, rate, download) == nil {
			return nil
		}
		if err = w.command("tc", cakeQueueArgs("change", dev, rate, download)...); err != nil {
			return err
		}
	} else {
		if ownsPriorityQueue(out) {
			if err = w.deleteOwnedQueue(dev); err != nil {
				return err
			}
		}
		if err = w.command("tc", cakeQueueArgs("add", dev, rate, download)...); err != nil {
			return err
		}
	}
	return w.verifyShapedQueue(dev, rate, download)
}
func cakeQueueArgs(verb, dev string, rate int, download bool) []string {
	mode, nat, direction := "dual-srchost", "nat", "egress"
	if download {
		mode, nat, direction = "dual-dsthost", "nonat", "ingress"
	}
	return []string{"qdisc", verb, "dev", dev, "root", "handle", priorityShaperHandle, "cake", "bandwidth", fmt.Sprintf("%dkbit", rate), "diffserv3", mode, nat, direction, "split-gso", "no-ack-filter", "nowash", "rtt", "100ms", "raw", "memlimit", "4mb", "fwmark", "0"}
}
func (w priorityWorker) verifyShapedQueue(dev string, rate int, download bool) error {
	data, err := w.run("tc", "-j", "qdisc", "show", "dev", dev)
	if err != nil {
		return err
	}
	var queues []struct {
		Kind    string `json:"kind"`
		Handle  string `json:"handle"`
		Root    bool   `json:"root"`
		Options struct {
			Bandwidth int64  `json:"bandwidth"`
			Diffserv  string `json:"diffserv"`
			Flowmode  string `json:"flowmode"`
			Nat       *bool  `json:"nat"`
			Wash      *bool  `json:"wash"`
			Ingress   *bool  `json:"ingress"`
			SplitGSO  *bool  `json:"split_gso"`
			AckFilter string `json:"ack-filter"`
			RTT       int    `json:"rtt"`
			Raw       *bool  `json:"raw"`
			Overhead  int    `json:"overhead"`
			Memlimit  int    `json:"memlimit"`
			FWMark    string `json:"fwmark"`
		} `json:"options"`
	}
	if err = json.Unmarshal(data, &queues); err != nil {
		return err
	}
	mode := "dual-srchost"
	if download {
		mode = "dual-dsthost"
	}
	is := func(v *bool, want bool) bool { return v != nil && *v == want }
	for _, q := range queues {
		o := q.Options
		if q.Kind == "cake" && q.Handle == priorityShaperHandle && q.Root && o.Bandwidth == int64(rate)*125 && o.Diffserv == "diffserv3" && o.Flowmode == mode && is(o.Nat, !download) && is(o.Ingress, download) && is(o.Wash, false) && is(o.SplitGSO, true) && is(o.Raw, true) && o.AckFilter == "disabled" && o.RTT == 100000 && o.Overhead == 0 && o.Memlimit == 4194304 && (o.FWMark == "0" || o.FWMark == "0x0") {
			return nil
		}
	}
	return fmt.Errorf("CAKE rate/host-isolation/priority readback failed on %s", dev)
}
