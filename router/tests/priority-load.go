//go:build linux

// Diagnostic only: send two synthetic UDP loads to an explicitly chosen LAN host.
// Run as root on the router; does not edit configuration. Duration is capped at 15s.
package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"sync"
	"syscall"
	"time"
)

func main() {
	host := flag.String("host", "", "LAN IP of an authorized test device")
	seconds := flag.Int("seconds", 8, "duration, 1..15 seconds")
	flag.Parse()
	ip := net.ParseIP(*host)
	if ip == nil || !ip.IsPrivate() || *seconds < 1 || *seconds > 15 {
		fmt.Fprintln(os.Stderr, "private LAN host and duration 1..15 required")
		os.Exit(1)
	}
	var wg sync.WaitGroup
	for _, entry := range []struct {
		port     int
		priority int
	}{{49724, 0x7d000002}, {49725, 0x7d000001}} {
		conn, err := net.DialUDP("udp", nil, &net.UDPAddr{IP: ip, Port: entry.port})
		if err != nil {
			panic(err)
		}
		raw, err := conn.SyscallConn()
		if err != nil {
			panic(err)
		}
		var setErr error
		if err = raw.Control(func(fd uintptr) {
			setErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_PRIORITY, entry.priority)
		}); err != nil {
			panic(err)
		}
		if setErr != nil {
			panic(setErr)
		}
		wg.Add(1)
		go func(c *net.UDPConn) {
			defer wg.Done()
			defer c.Close()
			packet := make([]byte, 1400)
			deadline := time.Now().Add(time.Duration(*seconds) * time.Second)
			for time.Now().Before(deadline) {
				_, _ = c.Write(packet)
				time.Sleep(200 * time.Microsecond)
			}
		}(conn)
	}
	wg.Wait()
}
