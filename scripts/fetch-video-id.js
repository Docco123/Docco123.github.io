#!/usr/bin/env node
// Fetches the daily House floor video ID from C-SPAN and writes it to video-id.json

const https = require("https");
const fs = require("fs");
const path = require("path");

const PAGE_URL = "https://www.c-span.org/congress/?chamber=house";

// Matches data-videoid='412345' or data-videoid="412345"
const VIDEOID_RE = /data-videoid=['"](\d+)['"]/g;
// Matches data-videofile='https://...m3u8' to get the exact URL
const VIDEOFILE_RE = /data-videofile=['"]([^'"]+)['"]/;

function fetchPage(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`Redirect ${res.statusCode} -> ${res.headers.location}`);
          return fetchPage(res.headers.location, redirectCount + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
  });
}

async function main() {
  console.log(`Fetching: ${PAGE_URL}`);
  const html = await fetchPage(PAGE_URL);
  console.log(`Received ${html.length} bytes`);

  // Collect all data-videoid values
  const allIds = [];
  let m;
  while ((m = VIDEOID_RE.exec(html)) !== null) {
    allIds.push(m[1]);
  }
  console.log(`Found data-videoid values: ${allIds.join(", ") || "none"}`);

  // Prefer IDs starting with 4 (live House floor events), fall back to 6 (programs)
  const videoId =
    allIds.find((id) => id.startsWith("4")) ||
    allIds.find((id) => id.startsWith("6")) ||
    allIds[0];

  if (!videoId) {
    throw new Error("No data-videoid found in page source");
  }

  // Use data-videofile URL if present, otherwise construct from ID
  const fileMatch = html.match(VIDEOFILE_RE);
  const m3u8Url = fileMatch
    ? fileMatch[1]
    : `https://m3u8-l.c-spanvideo.org/event/event.${videoId}.tsc.m3u8`;

  const outPath = path.join(__dirname, "..", "video-id.json");
  const payload = {
    videoId,
    m3u8Url,
    fetchedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Video ID: ${videoId}`);
  console.log(`m3u8 URL: ${m3u8Url}`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
