const fs = require("fs");
const path = require("path");
const slugify = require("@sindresorhus/slugify");
const matter = require("gray-matter");
const { globSync } = require("glob");

const { fixPermalink } = require("./pathFixes");

const NOTES_DIR = "src/site/notes";

// "Discipline/Cheat Meals Tier List" -> "/discipline/cheat-meals-tier-list/"
// (same shape as the permalinks the Obsidian plugin writes for newer notes).
function defaultPermalink(notePath) {
  const segments = notePath
    .replace(/^\/?notes\//, "")
    .replace(/\.md$/i, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => slugify(segment));
  return fixPermalink(`/${segments.join("/")}/`);
}

// The note's own title when its body starts with "# Title" (common in Obsidian).
function getLeadingH1(body) {
  const firstLine = (body || "").replace(/^\s+/, "").split("\n")[0] || "";
  const match = firstLine.match(/^#\s+(.+?)\s*#*\s*$/);
  return match ? match[1].trim() : null;
}

let index = null;

// Every published note keyed by its lower-cased path inside notes/ (no extension).
function getNoteIndex() {
  if (index) {
    return index;
  }
  index = new Map();
  for (const file of globSync(`${NOTES_DIR}/**/*.md`)) {
    const notePath = path.relative(NOTES_DIR, file).replace(/\\/g, "/").replace(/\.md$/i, "");
    let data = {};
    let body = "";
    try {
      const parsed = matter(fs.readFileSync(file, "utf8"));
      data = parsed.data || {};
      body = parsed.content;
    } catch (error) {
      console.warn(`[notes] Could not read front matter of ${file}: ${error.message}`);
    }
    const isHome = Array.isArray(data.tags) && data.tags.indexOf("gardenEntry") !== -1;
    index.set(notePath.toLowerCase(), {
      notePath,
      leadingH1: getLeadingH1(body),
      originalPermalink: typeof data.permalink === "string" ? data.permalink : null,
      permalink: isHome ? "/" : data.permalink ? fixPermalink(data.permalink) : defaultPermalink(notePath),
    });
  }
  return index;
}

function resetNoteIndex() {
  index = null;
}

// Resolves links the Obsidian plugin leaves in note bodies, e.g.
// "/notes/discipline/final%20diet%20plan" or "Some Note.md#heading".
// Returns the note's real URL, null if the href isn't a note link, or false
// if it is a note link whose target isn't published.
function resolveNoteHref(href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) {
    return null;
  }
  const [rawPath, hash] = href.split("#");
  const isNotesPath = rawPath.startsWith("/notes/");
  const isMarkdownFile = /\.md$/i.test(rawPath);
  if (!isNotesPath && !isMarkdownFile) {
    return null;
  }
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // Not valid percent-encoding: try the path as written.
  }
  const key = decoded.replace(/^\/?notes\//i, "").replace(/\.md$/i, "").replace(/\/+$/, "").toLowerCase();
  const notes = getNoteIndex();
  let note = notes.get(key);
  if (!note && !key.includes("/")) {
    // Relative "Note.md" links only carry the file name.
    const matches = [...notes.values()].filter((n) => n.notePath.split("/").pop().toLowerCase() === key);
    note = matches.length === 1 ? matches[0] : undefined;
  }
  if (!note) {
    return false;
  }
  return `${note.permalink}${hash ? `#${hash}` : ""}`;
}

// Note entry for a template's inputPath ("./src/site/notes/Folder/Note.md").
function getNoteByInputPath(inputPath) {
  const notePath = path.relative(NOTES_DIR, inputPath).replace(/\\/g, "/").replace(/\.md$/i, "");
  return getNoteIndex().get(notePath.toLowerCase()) || null;
}

exports.defaultPermalink = defaultPermalink;
exports.getNoteByInputPath = getNoteByInputPath;
exports.getNoteIndex = getNoteIndex;
exports.resetNoteIndex = resetNoteIndex;
exports.resolveNoteHref = resolveNoteHref;
