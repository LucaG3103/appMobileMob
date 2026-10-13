#!/usr/bin/env python3
"""Build the small static files the Lyon provider needs from the TCL GTFS zip.

Download GTFS_TCL.ZIP from data.grandlyon.com (free account), then:

    python3 scripts/build_lyon_static.py path/to/GTFS_TCL.ZIP

Writes src/data/lyon/stops.json (id, name, lat, lon) and
src/data/lyon/lines.json (line code -> short name, colour). Only stops and
routes are kept: the realtime feed already lists each journey's stops, so the
huge stop_times.txt is not needed on the phone.
"""
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "lyon"


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def code(stop_id):
    """Same normalisation as stopCode() in src/data/siriLite.ts."""
    parts = [p for p in stop_id.split(":") if p]
    numeric = [p for p in parts if re.fullmatch(r"\d+", p)]
    return numeric[-1] if numeric else (parts[-1] if parts else stop_id)


def main(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        stops = {}
        for r in rows(z, "stops.txt"):
            # Keep boarding points only (location_type empty or 0), one per code.
            if r.get("location_type") not in (None, "", "0"):
                continue
            stops.setdefault(
                code(r["stop_id"]),
                {
                    "id": code(r["stop_id"]),
                    "name": r["stop_name"],
                    "latitude": round(float(r["stop_lat"]), 6),
                    "longitude": round(float(r["stop_lon"]), 6),
                },
            )
        lines = {
            r["route_id"]: {
                "shortName": r.get("route_short_name") or r["route_id"],
                "color": "#" + (r.get("route_color") or "0B6BCB"),
            }
            for r in rows(z, "routes.txt")
        }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stops.json").write_text(json.dumps(list(stops.values()), ensure_ascii=False, separators=(",", ":")))
    (OUT / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1))
    print(f"{len(stops)} stops, {len(lines)} lines -> {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
