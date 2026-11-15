# Sample dataset (synthetic)

`sample_MODIS_firms_format.csv` and `sample_VIIRS_firms_format.csv` are **synthetic** files made by the project's own generator (`src/engine.js`, fixed random seed). They imitate the column layout of NASA FIRMS downloads for a Punjab-like area, 2008 to 12 Nov 2026 (MODIS) and 2012 to 12 Nov 2026 (VIIRS).

They are **not real fire detections**. Use them to test the upload flow and to see how FireTrust behaves. Do not present anything computed from them as a real result.

## Real data

Real data must come from NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/download/
Download MODIS and VIIRS (Suomi NPP) active-fire CSVs for your area, then load them in the app under "Use your own NASA data".

## Columns the app reads

`latitude`, `longitude`, `acq_date` (YYYY-MM-DD) and `confidence` (optional). Other FIRMS columns are ignored.
