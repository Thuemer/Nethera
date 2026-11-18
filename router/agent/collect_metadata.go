package main

import (
	"encoding/json"
	"fmt"
)

// collectMetadata reads model and firmware from "ubus call system board"
func collectMetadata(src Sources) (metadataPayload, error) {
	out, err := src.Run("ubus", "call", "system", "board")
	if err != nil {
		return metadataPayload{}, fmt.Errorf("ubus call system board: %w", err)
	}
	var board struct {
		Model   string `json:"model"`
		Release struct {
			Description string `json:"description"`
		} `json:"release"`
	}
	if err := json.Unmarshal(out, &board); err != nil {
		return metadataPayload{}, fmt.Errorf("ubus call system board: %w", err)
	}
	return metadataPayload{
		V:        schemaVersion,
		TS:       src.Now().Unix(),
		Model:    board.Model,
		Firmware: board.Release.Description,
	}, nil
}
