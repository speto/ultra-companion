import { describe, expect, it } from "vitest";
import { parseGPX } from "@/services/gpxParser";

const validTrack = `
<trk><name>Race Route</name><trkseg>
  <trkpt lat="48.0" lon="17.0"><ele>100</ele></trkpt>
  <trkpt lat="48.1" lon="17.1"><ele>120</ele></trkpt>
</trkseg></trk>`;

describe("parseGPX", () => {
  it("extracts waypoint name, type, description, coordinates, and elevation", () => {
    const route = parseGPX(
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="48.20849" lon="16.37208">
    <ele>171</ele>
    <name>Vienna Control</name>
    <type>control</type>
    <desc>Open 24h with water nearby</desc>
  </wpt>
  ${validTrack}
</gpx>`,
      "race.gpx",
    );

    expect(route.waypoints).toEqual([
      {
        name: "Vienna Control",
        type: "control",
        description: "Open 24h with water nearby",
        latitude: 48.20849,
        longitude: 16.37208,
        elevationMeters: 171,
      },
    ]);
  });

  it("preserves raw waypoint type strings", () => {
    const route = parseGPX(
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="48.20849" lon="16.37208">
    <name>Water Stop</name>
    <type>water stop</type>
  </wpt>
  ${validTrack}
</gpx>`,
      "race.gpx",
    );

    expect(route.waypoints[0].type).toBe("water stop");
  });

  it("ignores invalid waypoints", () => {
    const route = parseGPX(
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="not-a-number" lon="16.37208"><name>Bad latitude</name></wpt>
  <wpt lat="48.20849"><name>Missing longitude</name></wpt>
  <wpt lat="48.209" lon="16.373"><name>Valid</name></wpt>
  ${validTrack}
</gpx>`,
      "race.gpx",
    );

    expect(route.waypoints).toEqual([
      {
        name: "Valid",
        type: null,
        description: null,
        latitude: 48.209,
        longitude: 16.373,
        elevationMeters: null,
      },
    ]);
  });

  it("returns empty waypoints when none exist", () => {
    const route = parseGPX(
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  ${validTrack}
</gpx>`,
      "race.gpx",
    );

    expect(route.waypoints).toEqual([]);
  });
});
