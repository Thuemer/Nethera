// nethera-agent publishes telemetry of an OpenWrt router to the Nethera MQTT broker.
// Contract: openspec/changes/mqtt-router-telemetry/specs/mqtt-telemetry-ingestion/spec.md
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	// OpenWrt ships no zoneinfo; the agent evaluates time rules in the router's
	// configured IANA zone and therefore has to carry its own database (~450 KB).
	_ "time/tzdata"
)

// version is set at build time with -ldflags "-X main.version=..."
var version = "dev"

func main() {
	dryRun := flag.Bool("dry-run", false, "collect once and print the messages instead of publishing them")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("nethera-agent", version)
		return
	}

	// procd forwards standard error to the system log (logread -e nethera-agent)
	log.SetOutput(os.Stderr)
	log.SetFlags(0)
	log.SetPrefix("nethera-agent: ")

	cfg, err := LoadConfig(os.Getenv, *dryRun)
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}

	agent := NewAgent(cfg, RouterSources())

	if *dryRun {
		if !agent.DryRun(os.Stdout) {
			os.Exit(1)
		}
		return
	}

	conn, err := NewConnection(cfg, func(*Connection) {
		agent.PublishMetadata()
		agent.SubscribeControl()
	})
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	agent.conn = conn

	// procd stops the service with SIGTERM; Ctrl+C in a terminal sends SIGINT
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Printf("started for router %d, every %s", cfg.RouterID, cfg.Interval)
	// Applies the blocks saved on flash right away, then every new message from the backend
	go agent.RunControl(ctx)
	go agent.RunTimeControl(ctx)

	done := make(chan struct{})
	go func() {
		conn.Run(ctx)
		close(done)
	}()
	agent.Run(ctx)

	<-done
	conn.Close()
	log.Print("stopped")
}
