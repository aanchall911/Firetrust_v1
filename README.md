# FireTrust

**Is the fire trend real, or just the sensor?**

FireTrust is a browser-based prototype that merges NASA's **MODIS** and **VIIRS** active-fire detections into one record and shows **how much to trust each week**. It was built for the **NASA Space Apps Challenge 2026**, challenge *Harmonization of MODIS and VIIRS Hot Spots*.

It is a single web page (`index.html`). There is no server, no build step and no account. Your data is analysed inside your own browser and is never uploaded.

## What it does

| Feature | What you get |
|---|---|
| **Harmonized counts** | VIIRS counts are scaled to MODIS-equivalent counts using the years both sensors flew, giving one continuous record. |
| **Trust score** | Every week gets high, medium or low trust, based on how closely the two sensors agree. |
| **Fire Rings** | Each year is one ring on a 365-day clock, so you can see a season grow, fade or shift at a glance. |
| **Trust calendar** | A day-by-day calendar with low-trust weeks dotted and unusually busy weeks outlined. |
| **Season shift** | The date half of a season's detections have happened, year by year, with a trend line and an honest note on whether it could be chance. |
| **Calibration check** | A chart of MODIS, raw VIIRS and scaled VIIRS so you can see the harmonization working. |
| **Share card** | A one-tap picture of the latest week in English, Hindi or Punjabi, for WhatsApp. |

When the page first opens it shows **synthetic sample data** so you can explore straight away. A yellow banner says so. Load real NASA FIRMS files to analyse a real area.

## Put it online with GitHub Pages (works from a phone)

1. Create a new public repository on GitHub, for example `firetrust`.
2. Choose **Add file, then Upload files**, and upload `index.html`, `README.md` and `LICENSE` into the main folder.
3. Go to **Settings, then Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then Save.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/firetrust/`. Use that link for the *Link to Final Project* field on the NASA Space Apps form.

You can also just double-click `index.html` to run it on a computer.

## Use real NASA data

A synthetic sample dataset is in `data/`. It is only for testing the upload and is not real fire data.

1. Go to [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/download/) and request active-fire archive data for your area. You need **MODIS** and **VIIRS** CSV files covering as many years as you can. The overlap years are what make the calibration work.
2. Use **one VIIRS satellite (S-NPP)**. Mixing S-NPP, NOAA-20 and NOAA-21 adds satellites over time, which raises counts and can look like a trend. FireTrust warns you if it sees this.
3. Open the page, go to **Use your own NASA data**, choose the MODIS and VIIRS files, type an area name and press **Analyse my data**.
4. If a file covers a whole country, open *Limit to a map box* to keep only your area. The Punjab and Haryana preset is approximate.

Big files take a while on a phone. Several years for a single state is fine. A whole country is better filtered on FIRMS first.

## What is in this project

| Path | What it is |
|---|---|
| `index.html` | The whole app in one file. This is what GitHub Pages serves. |
| `data/` | Sample dataset: two synthetic CSVs in NASA FIRMS format, to test uploads. See `data/README.md`. |
| `src/` | Readable source: `engine.js` (maths), `app.js` (interface), `style.css`, `template.html`. |
| `build.py` | Joins `src/` into `index.html`. Run `python3 build.py` after editing `src/`. |
| `test_engine.js` | Quick check of the maths. Run `node test_engine.js`. |
| `docs/` | The final presentation (.pptx) and the prototype screenshots used in it. |

Only `index.html` is needed to run the app. Everything else is for reading, testing and the submission.

## How it works

1. Detections are counted per day for each sensor. Low-confidence detections are dropped by default.
2. On days both sensors were flying, total counts are compared. Their ratio is the **scale factor** that turns VIIRS counts into MODIS-equivalent counts. Where both cover a day, MODIS and scaled VIIRS are averaged.
3. For each 7-day block (counted from 1 January) the **trust score** is the average of two things: how close the two counts are after scaling, and how many 0.25 degree map cells where MODIS saw fire VIIRS also saw. Scores from 0.70 are high, from 0.45 medium, below that low. Weeks with fewer than 8 detections are marked "too few to judge".
4. Each week is compared with the same week in the other years. It is flagged when it sits at least 1.5 spreads above the usual level.
5. The **season shift** is the day of year when half of a season's detections have happened, with a least-squares line through the years.

All the maths lives in plain JavaScript inside the page and has no dependencies.

## Limits, stated plainly

- This is a **prototype**, not a validated scientific product, and it has not been peer reviewed.
- The calibration is **one simple ratio** for the whole area, not a physical model of the sensors.
- The trust thresholds are **provisional**.
- Satellites only see fires **when they pass over**. Fires lit in the evening can be missed, so a fall in counts does not prove a fall in burning.
- A trend line through a few years can be **chance**. The app says when it cannot rule that out.
- The share-card Hindi and Punjabi wording should be checked by a native speaker before wide use.
- The sample data is **synthetic**. It shows how the tool behaves, not what happened in any real place or year.

## Data and credits

- Fire detections: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/), MODIS and VIIRS active fire data, courtesy of NASA. Please follow NASA's data citation guidance.
- Fonts: Bree Serif, Nunito Sans, Noto Sans Devanagari and Noto Sans Gurmukhi from Google Fonts (SIL Open Font License).
- This project is not an official NASA product and is not endorsed by NASA. It uses no NASA logos.

## Use of AI (disclosure)

The code, interface and sample-data generator were written with the help of an AI assistant (Claude, by Anthropic), working from Aanchal Bhatt's direction. Aanchal chose the challenge and the direction. The brainstorming of features, the code and the illustrations were AI-assisted. The submission form's *Use of Super Intelligence* field should say this in your own words.

## Licence

MIT. See `LICENSE`.

Built by Aanchal Bhatt for the NASA Space Apps Challenge 2026.
