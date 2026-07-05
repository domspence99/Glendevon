#!/usr/bin/env node
// Fetches the VRBO iCal feed, merges it with manually-tracked direct bookings,
// and writes data/availability.json for the front-end calendar to read.
//
// Usage:
//   VRBO_ICAL_URL="https://www.vrbo.com/icalendar/xxxxxxx.ics" npm run sync-availability
//
// If VRBO_ICAL_URL is not set, the script still runs and writes out the
// manual blocks only, so it can be tested before the real feed is available.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const MANUAL_BLOCKS_PATH = path.join(DATA_DIR, 'manual-blocks.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'availability.json');

const VRBO_ICAL_URL = process.env.VRBO_ICAL_URL;

function unfoldICS(text) {
  // RFC 5545: a line beginning with a space or tab is a continuation of the previous line
  return text.replace(/\r?\n[ \t]/g, '');
}

function dateValueToISO(value) {
  // value looks like 20260710 (date-only) or 20260710T160000Z (date-time)
  const digits = value.replace(/[^0-9]/g, '');
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function parseICSEvents(icsText) {
  const unfolded = unfoldICS(icsText);
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start && current?.end) {
        events.push({ start: current.start, end: current.end, source: 'vrbo' });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    // Property lines look like "DTSTART;VALUE=DATE:20260710" or "SUMMARY:Reserved"
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const name = line.slice(0, colonIndex).split(';')[0];
    const value = line.slice(colonIndex + 1).trim();

    if (name === 'DTSTART') current.start = dateValueToISO(value);
    if (name === 'DTEND') current.end = dateValueToISO(value);
  }

  return events;
}

async function fetchVrboEvents(url) {
  if (!url) {
    console.warn('VRBO_ICAL_URL not set — skipping VRBO fetch, writing manual blocks only.');
    return [];
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch VRBO calendar: ${res.status} ${res.statusText}`);
  }
  const icsText = await res.text();
  return parseICSEvents(icsText);
}

async function loadManualBlocks() {
  try {
    const raw = await readFile(MANUAL_BLOCKS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Only start/end/source are ever written to the public availability.json —
    // fields like "note" may contain guest names and must not reach the browser.
    return parsed.map(({ start, end }) => ({ start, end, source: 'direct' }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function main() {
  const [vrboEvents, manualBlocks] = await Promise.all([
    fetchVrboEvents(VRBO_ICAL_URL),
    loadManualBlocks(),
  ]);

  const bookedRanges = [...vrboEvents, ...manualBlocks].sort((a, b) =>
    a.start.localeCompare(b.start)
  );

  const output = {
    generatedAt: new Date().toISOString(),
    vrboFeedConfigured: Boolean(VRBO_ICAL_URL),
    bookedRanges,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${bookedRanges.length} booked range(s) to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
