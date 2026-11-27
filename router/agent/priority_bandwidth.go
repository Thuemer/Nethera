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
	if strings.Contains(out, "qdisc htb 7d00: root") {
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

func priorityClassSteps(dev string, rate int, verb string) [][]string {
	high := rate * 2 / 3
	normal := rate - high
	return [][]string{
		{"class", verb, "dev", dev, "parent", priorityShaperHandle, "classid", "7d00:1", "htb", "rate", fmt.Sprintf("%dkbit", rate), "ceil", fmt.Sprintf("%dkbit", rate), "quantum", "1514"},
		{"class", verb, "dev", dev, "parent", "7d00:1", "classid", "7d00:10", "htb", "rate", fmt.Sprintf("%dkbit", high), "ceil", fmt.Sprintf("%dkbit", rate), "prio", "0", "quantum", "3000"},
		{"class", verb, "dev", dev, "parent", "7d00:1", "classid", "7d00:20", "htb", "rate", fmt.Sprintf("%dkbit", normal), "ceil", fmt.Sprintf("%dkbit", rate), "prio", "1", "quantum", "1500"},
	}
}
func (w priorityWorker) ensureShapedQueue(dev string, rate int) error {
	out, err := w.qdisc(dev)
	if err != nil {
		return err
	}
	if ownedPriorityRoot(out) == priorityShaperHandle && !strings.Contains(out, "qdisc drr") {
		for _, step := range priorityClassSteps(dev, rate, "change") {
			if err = w.command("tc", step...); err != nil {
				return err
			}
		}
		return w.verifyShapedQueue(dev, rate)
	}
	if !ownsPriorityQueue(out) && !freePriorityQueue(out) {
		return fmt.Errorf("foreign root qdisc on %s; left unchanged", dev)
	}
	if ownsPriorityQueue(out) {
		if err = w.deleteOwnedQueue(dev); err != nil {
			return err
		}
	}
	steps := [][]string{{"qdisc", "add", "dev", dev, "root", "handle", priorityShaperHandle, "htb", "default", "20"}}
	steps = append(steps, priorityClassSteps(dev, rate, "add")...)
	steps = append(steps,
		[]string{"qdisc", "add", "dev", dev, "parent", "7d00:10", "handle", "7e01:", "fq_codel"},
		[]string{"qdisc", "add", "dev", dev, "parent", "7d00:20", "handle", "7e02:", "fq_codel"})
	for _, step := range steps {
		if err = w.command("tc", step...); err != nil {
			_ = w.deleteOwnedQueue(dev)
			return err
		}
	}
	return w.verifyShapedQueue(dev, rate)
}
func (w priorityWorker) verifyShapedQueue(dev string, rate int) error {
	out, err := w.qdisc(dev)
	if err != nil {
		return err
	}
	if ownedPriorityRoot(out) != priorityShaperHandle || !strings.Contains(out, "qdisc fq_codel 7e01:") || !strings.Contains(out, "qdisc fq_codel 7e02:") {
		return fmt.Errorf("shaped queue readback failed on %s", dev)
	}
	data, err := w.run("tc", "-j", "-d", "class", "show", "dev", dev)
	if err != nil {
		return err
	}
	var classes []struct {
		Kind    string `json:"class"`
		Handle  string `json:"handle"`
		Parent  string `json:"parent"`
		Rate    int64  `json:"rate"`
		Ceil    int64  `json:"ceil"`
		Prio    int    `json:"prio"`
		Quantum int    `json:"quantum"`
	}
	if err = json.Unmarshal(data, &classes); err != nil {
		return err
	}
	total, high, normal := false, false, false
	for _, class := range classes {
		if class.Kind != "htb" {
			continue
		}
		if class.Handle == "7d00:1" {
			total = class.Rate == int64(rate)*125 && class.Ceil == int64(rate)*125
		}
		if class.Handle == "7d00:10" {
			high = class.Parent == "7d00:1" && class.Rate == int64(rate*2/3)*125 && class.Ceil == int64(rate)*125 && class.Prio == 0 && class.Quantum == 3000
		}
		if class.Handle == "7d00:20" {
			normal = class.Parent == "7d00:1" && class.Rate == int64(rate-rate*2/3)*125 && class.Ceil == int64(rate)*125 && class.Prio == 1 && class.Quantum == 1500
		}
	}
	if !total || !high || !normal {
		return fmt.Errorf("bandwidth/class readback failed on %s", dev)
	}
	if !strings.Contains(out, "default 0x20") && !strings.Contains(out, "default 20 ") {
		return fmt.Errorf("normal default class missing on %s", dev)
	}
	return nil
}
