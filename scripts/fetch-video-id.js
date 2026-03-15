#!/usr/bin/env node
// Fetches the daily House floor video ID from C-SPAN and writes it to video-id.json

const https = require("https");
const fs = require("fs");
const path = require("path");

const URL = "https://www.c-span.org/congress/?chamber=house";
// Matches: https://m3u8-l.c-spanvideo.org/event/event.4XXXXX.tsc.m3u8
const M3U8_RE = /m3u8-[^/]+\.c-spanvideo\.org\/event\/event\.(4\d+)\.tsc\.m3u8/;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchPage(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  const html = await fetchPage(URL);
  const match = html.match(M3U8_RE);

  if (!match) {
    throw new Error("Could not find m3u8 video ID in page source");
  }

  const videoId = match[1]; // e.g. "412345"
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
