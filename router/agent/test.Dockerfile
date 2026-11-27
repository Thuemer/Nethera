FROM golang:1.27.2
RUN apt-get update && apt-get install -y --no-install-recommends nftables && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
