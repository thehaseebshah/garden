require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {globSync} = require("glob");

const themeCommentRegex = /\/\*[\s\S]*?\*\//g;
const THEME_GLOB = "src/site/styles/_theme.*.css";

async function fetchText(url) {
  // Node 22 has fetch built in.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function downloadTheme(themeUrl) {
  //https://forum.obsidian.md/t/1-0-theme-migration-guide/42537
  //Not all themes with no legacy mark have a theme.css file, so we need to check for it
  try {
    return await fetchText(themeUrl);
  } catch (error) {
    let fallbackUrl = null;
    if (themeUrl.indexOf("theme.css") > -1) {
      fallbackUrl = themeUrl.replace("theme.css", "obsidian.css");
    } else if (themeUrl.indexOf("obsidian.css") > -1) {
      fallbackUrl = themeUrl.replace("obsidian.css", "theme.css");
    }
    if (!fallbackUrl) {
      throw error;
    }
    return fetchText(fallbackUrl);
  }
}

async function getTheme() {
  const themeUrl = process.env.THEME;
  if (!themeUrl) {
    // No theme configured: remove any stale downloaded theme so the default styles are used.
    globSync(THEME_GLOB).forEach((file) => fs.rmSync(file));
    return;
  }

  let css;
  try {
    css = await downloadTheme(themeUrl);
  } catch (error) {
    // A theme is optional styling: keep whatever theme file is already there
    // (or none) and let the build continue instead of failing the deploy.
    console.warn(`[get-theme] Could not download theme (${error.message}); keeping the existing theme files.`);
    return;
  }

  let skippedFirstComment = false;
  const data = css.replace(themeCommentRegex, (match) => {
    if (skippedFirstComment) {
      return "";
    } else {
      skippedFirstComment = true;
      return match;
    }
  });
  const hashSum = crypto.createHash("sha256");
  hashSum.update(data);
  const hex = hashSum.digest("hex");
  const target = `src/site/styles/_theme.${hex.substring(0, 8)}.css`;

  // Write the new theme first, then remove old ones, so a failure never leaves the site without a theme.
  fs.writeFileSync(target, data);
  globSync(THEME_GLOB)
    .filter((file) => path.resolve(file) !== path.resolve(target))
    .forEach((file) => fs.rmSync(file));
}

getTheme();
