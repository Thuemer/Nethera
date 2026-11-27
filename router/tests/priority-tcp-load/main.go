//go:build linux

// Standalone TCP diagnostic. Sends bounded zero data to one allowed private LAN
// client, then exits. Does not change router configuration or use the Internet.
// Arguments: clientIPv4 bytes port(49727/49728) mode(high/normal).
package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"syscall"
	"time"
)

type zeros struct{}

func (zeros) Read(b []byte) (int, error) { clear(b); return len(b), nil }
func main() {
	if len(os.Args) != 5 {
		panic("arguments: clientIPv4 bytes port mode")
	}
	ip := os.Args[1]
	n, _ := strconv.ParseInt(os.Args[2], 10, 64)
	if net.ParseIP(ip) == nil || !net.ParseIP(ip).IsPrivate() || n < 1000000 || n > 100000000 || (os.Args[3] != "49727" && os.Args[3] != "49728") || (os.Args[4] != "high" && os.Args[4] != "normal") {
		panic("invalid test")
	}
	l, e := net.Listen("tcp4", "192.168.1.1:"+os.Args[3])
	if e != nil {
		panic(e)
	}
	defer l.Close()
	go func() { time.Sleep(40 * time.Second); l.Close() }()
	for {
		c, e := l.Accept()
		if e != nil {
			return
		}
		h, _, _ := net.SplitHostPort(c.RemoteAddr().String())
		if h != ip {
			c.Close()
			continue
		}
		func() {
			defer c.Close()
			c.SetDeadline(time.Now().Add(35 * time.Second))
			raw, e := c.(*net.TCPConn).SyscallConn()
			if e != nil {
				panic(e)
			}
			var se error
			e = raw.Control(func(fd uintptr) {
				se = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_PRIORITY, priority(os.Args[4]))
			})
			if e != nil {
				panic(e)
			}
			if se != nil {
				panic(se)
			}
			r, e := http.ReadRequest(bufio.NewReader(c))
			if e != nil {
				return
			}
			r.Body.Close()
			fmt.Fprintf(c, "HTTP/1.1 200 OK\r\nContent-Length: %d\r\nConnection: close\r\n\r\n", n)
			sent, e := io.CopyN(c, zeros{}, n)
			fmt.Println(sent, e)
		}()
		return
	}
}

func priority(s string) int {
	if s == "high" {
		return 0x7d000002
	}
	return 0x7d000001
}
