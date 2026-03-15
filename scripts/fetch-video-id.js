#!/usr/bin/env node
// Fetches the daily House floor video ID from C-SPAN and writes it to video-id.json

const https = require("https");
const fs = require("fs");
const path = require("path");

const PAGE_URL = "https://www.c-span.org/congress/?chamber=house";

// Try patterns from most specific to most permissive
const PATTERNS = [
  // Full m3u8 URL with subdomain
  /m3u8-[^"'\s]+\.c-spanvideo\.org\/event\/event\.(4\d+)\.tsc\.m3u8/,
  // Any c-spanvideo.org event URL
  /c-spanvideo\.org\/event\/event\.(4\d+)/,
  // JSON-style "videoId":"412345" or videoId: 412345
  /"videoId"\s*:\s*"?(4\d{4,6})"?/,
  // Any standalone 4XXXXX integer near "video" context (last resort)
  /\bvideo[^"'\n]{0,80}(4\d{5})\b/i,
];

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

  let videoId = null;
  for (const re of PATTERNS) {
    const m = html.match(re);
    if (m) {
      videoId = m[1];
      console.log(`Matched pattern: ${re}`);
      break;
    }
  }

  if (!videoId) {
    // Print a diagnostic snippet to help diagnose future failures
    const snippet = html.slice(0, 3000).replace(/\s+/g, " ");
    console.error("--- First 3000 chars of page (for diagnostics) ---");
    console.error(snippet);
    console.error("---------------------------------------------------");
    throw new Error("Could not find m3u8 video ID in page source");
  }

  const outPath = path.join(__dirname, "..", "video-id.json");
  const payload = {
    videoId,
    m3u8Url: `https://m3u8-l.c-spanvideo.org/event/event.${videoId}.tsc.m3u8`,
    fetchedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Video ID: ${videoId}`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
