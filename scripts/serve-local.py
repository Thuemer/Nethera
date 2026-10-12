#!/usr/bin/env python3
"""Serve Nethera with the same public paths as the frontend container."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class NetheraHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        route = urlsplit(path).path
        if route == "/":
            route = "/Website/html/nethera.html"
        elif route.lower() == "/website" or route.lower().startswith("/website/"):
            route = "/Website" + route[len("/website"):]
        elif not route.startswith("/Applikation/"):
            route = "/Applikation" + route
        return super().translate_path(route)


if __name__ == "__main__":
    handler = partial(NetheraHandler, directory=str(PROJECT_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 5500), handler)
    print("Website: http://localhost:5500/", flush=True)
    print("App: http://localhost:5500/index.html?entry=website", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
