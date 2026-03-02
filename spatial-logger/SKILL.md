---
name: spatial-logger
description: Use when the user wants to log a trip, travel, visit, or location check-in. Triggers: "Log a trip", "I visited...", "Check in...", "Log travel to [place]".
---

## Context
This skill is triggered when the user requests to log a trip, visit, or travel itinerary.
It creates structured logs in `340-Travel-and-Geospatial-Logs/` to serve as a Google Maps Timeline alternative.

## Source Locations
- User Prompt

## Workflow
1. **Classify**: Determine if the request is for a **Travel Log** (multi-day trip, usually overseas) or a **Spatial Log** (single-day visit, usually local/Singapore).
   - If "Trip", "Vacation", "Holiday", or explicit dates spanning days -> **Travel Log**.
   - If "Visit", "Went to", "Check in", or explicit single date -> **Spatial Log**.

2. **Draft (Travel Log)**:
   - Use `Travel Log Template` (`000-System/Templates/Travel Log Template.md`).
   - Title: `Travel - Location - MMM YYYY`.
   - Path: `340-Travel-and-Geospatial-Logs/Overseas/Location-Name/`.
   - Fill in: `date` (start), `endDate`, `location`.
   - Each trip to the same country/region gets its own file in the location subfolder.

3. **Draft (Spatial Log)**:
   - Use `Spatial Log Template` (`000-System/Templates/Spatial Log Template.md`).
   - Title: `Visit - YYYY-MM-DD - Location`.
   - Path: `340-Travel-and-Geospatial-Logs/Singapore/Location-Name/`.
   - Each visit to the same location gets its own dated file within the location subfolder.
   - Fill in: `date`, `location`.
   - **Crucial**: Identify specific Points of Interest (POIs).
   - **Enhance**: If possible, use `google_web_search` to find `[lat, lon]` coordinates for the POIs.
   - Fill in `## Locations Visited` with `Name`, `Address`, `Coordinates`, `Activity`.

4. **Place**: Save the file in the appropriate location subfolder. Create the subfolder if it does not exist.

5. **Log**: Append a link to the new log in the current Daily Note under `## Ramblings`.

## Folder Structure
```
340-Travel-and-Geospatial-Logs/
  Singapore/
    Jurong-East/
      Visit - 2026-01-15.md
      Visit - 2026-02-10.md
    Changi-Airport/
      Visit - 2026-01-20.md
  Overseas/
    Japan-Tokyo/
      Travel - Jan 2026.md
      Travel - Dec 2026.md
    Sweden-Jonkoping/
      Travel - Sep 2025.md
```

Each location subfolder holds multiple visit/travel files, one per dated visit.
This replaces the previous approach of lumping all visits to a location into a single file.

## Guidelines
- Always prioritize precise coordinates (`[lat, lon]`) for Map View compatibility.
- Use `google_web_search` to find missing coordinates.
- One file per visit -- never append to an existing log.
- Respect the Emoji Mandate.
