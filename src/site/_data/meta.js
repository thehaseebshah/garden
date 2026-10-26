require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const { globSync } = require("glob");

// Version for stylesheet URLs: changes only when a stylesheet changes, so
// browsers keep their cached CSS across deploys that don't touch styles.
function getStyleVersion() {
  const hash = crypto.createHash("sha256");
  for (const file of globSync("src/site/styles/**/*.{scss,css}").sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex").substring(0, 10);
}

module.exports = async (data) => {
  let baseUrl = process.env.SITE_BASE_URL || "";
  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = "https://" + baseUrl;
  }
  // Page URLs start with "/", so the base must not end with one (avoids "//" in URLs).
  baseUrl = baseUrl.replace(/\/+$/, "");
  let themeStyle = globSync("src/site/styles/_theme.*.css")[0] || "";

  // Check for logo file (supports multiple image formats)
  const logoFiles = globSync("src/site/logo.{png,jpg,jpeg,gif,svg,webp}");
  let logoPath = "";
  if (logoFiles.length > 0) {
    // Use the first match and convert to site-relative path
    logoPath = "/" + logoFiles[0].split("src/site/")[1];
  }
  if (themeStyle) {
    themeStyle = themeStyle.split("site")[1];
  }
  let bodyClasses = [];
  let noteIconsSettings = {
    filetree: false,
    links: false,
    title: false,
    default: process.env.NOTE_ICON_DEFAULT,
  };

  const styleSettingsCss = process.env.STYLE_SETTINGS_CSS || "";
  const styleSettingsBodyClasses = process.env.STYLE_SETTINGS_BODY_CLASSES || "";

  if (process.env.NOTE_ICON_TITLE && process.env.NOTE_ICON_TITLE == "true") {
    bodyClasses.push("title-note-icon");
    noteIconsSettings.title = true;
  }
  if (
    process.env.NOTE_ICON_FILETREE &&
    process.env.NOTE_ICON_FILETREE == "true"
  ) {
    bodyClasses.push("filetree-note-icon");
    noteIconsSettings.filetree = true;
  }
  if (
    process.env.NOTE_ICON_INTERNAL_LINKS &&
    process.env.NOTE_ICON_INTERNAL_LINKS == "true"
  ) {
    bodyClasses.push("links-note-icon");
    noteIconsSettings.links = true;
  }
  if (
    process.env.NOTE_ICON_BACK_LINKS &&
    process.env.NOTE_ICON_BACK_LINKS == "true"
  ) {
    bodyClasses.push("backlinks-note-icon");
    noteIconsSettings.backlinks = true;
  }
  if (styleSettingsCss) {
    bodyClasses.push("css-settings-manager");
  }
  if (styleSettingsBodyClasses) {
    bodyClasses.push(styleSettingsBodyClasses);
  }

  let timestampSettings = {
    timestampFormat: process.env.TIMESTAMP_FORMAT || "MMM dd, yyyy h:mm a",
    showCreated: process.env.SHOW_CREATED_TIMESTAMP == "true",
    showUpdated: process.env.SHOW_UPDATED_TIMESTAMP == "true",
  };

  const uiStrings = {
    backlinkHeader: process.env.UI_BACKLINK_HEADER || "Linked from",
    noBacklinksMessage: process.env.UI_NO_BACKLINKS_MESSAGE || "No other notes link here yet.",
    searchButtonText: process.env.UI_SEARCH_BUTTON_TEXT || "Search",
    searchPlaceholder: process.env.UI_SEARCH_PLACEHOLDER || "Start typing...",
    searchEnterHint: process.env.UI_SEARCH_ENTER_HINT || "Enter to select",
    searchNavigateHint: process.env.UI_SEARCH_NAVIGATE_HINT || "to navigate",
    searchCloseHint: process.env.UI_SEARCH_CLOSE_HINT || "ESC to close",
    searchNoResults: process.env.UI_SEARCH_NO_RESULTS || "No results for",
    searchPreviewPlaceholder: process.env.UI_SEARCH_PREVIEW_PLACEHOLDER || "Select a result to preview",
  };

  const meta = {
    env: process.env.ELEVENTY_ENV,
    theme: process.env.THEME,
    themeStyle,
    bodyClasses: bodyClasses.join(" "),
    noteIconsSettings,
    timestampSettings,
    baseTheme: process.env.BASE_THEME || "dark",
    siteName: process.env.SITE_NAME_HEADER || "Digital Garden",
    siteLogoPath: logoPath,
    mainLanguage: process.env.SITE_MAIN_LANGUAGE || "en",
    siteBaseUrl: baseUrl,
    styleSettingsCss,
    uiStrings,
    buildDate: new Date(),
    styleVersion: getStyleVersion(),
  };

  return meta;
};
