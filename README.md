# PUBG SMG Troll Website

A fun website to track how many times you died to SMGs in PUBG and generate troll messages to PUBG devs.

## Features

- SMG death counter with local persistence
- Troll message generator
- Death log with killer name, platform, and time
- Stream clip finder helper links for Twitch, YouTube, and Kick

## Run locally

Open `index.html` in your browser.

## Free hosting options

### Option 1: GitHub Pages

1. Create a GitHub repo and push these files.
2. In GitHub repo settings, go to Pages.
3. Source: `Deploy from a branch`, branch: `main`, folder: `/root`.
4. Save, then wait for the URL.

### Option 2: Cloudflare Pages

1. Create a GitHub repo and push these files.
2. In Cloudflare Pages, choose `Connect to Git`.
3. Select your repo and deploy with:
   - Build command: *(empty)*
   - Build output directory: `.`
4. Deploy.

### Option 3: Netlify Drop

1. Go to Netlify.
2. Drag and drop this folder.
3. It deploys instantly.

## About automatic clipping

A full `pubg.report` clone needs game telemetry + platform APIs + auth tokens and a backend worker. This MVP gives fast search links by killer name + death time. If you want, next step is to add:

- PUBG telemetry ingestion
- Twitch Helix + YouTube Data + Kick integration
- Automatic VOD timestamp matching
- One-click clip generation where API permits
