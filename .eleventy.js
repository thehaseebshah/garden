const markdownIt = require("markdown-it");
const fs = require("fs");
const matter = require("gray-matter");
const faviconsPlugin = require("eleventy-plugin-gen-favicons");
const tocPlugin = require("eleventy-plugin-nesting-toc");
const { parse } = require("node-html-parser");
const { DateTime } = require("luxon");
const htmlMinifier = require("html-minifier-terser");
const pluginRss = require("@11ty/eleventy-plugin-rss");

const { headerToId, namedHeadingsFilter } = require("./src/helpers/utils");
const { fixPermalink } = require("./src/helpers/pathFixes");
const {
  defaultPermalink,
  resetNoteIndex,
  resolveNoteHref,
} = require("./src/helpers/noteIndex");
const {
  userMarkdownSetup,
  userEleventySetup,
} = require("./src/helpers/userSetup");

const Image = require("@11ty/eleventy-img").default;
async function transformImage(src, cls, alt, sizes, widths = [500, 700, "auto"]) {
  let options = {
    widths: widths,
    formats: ["webp", "jpeg"],
    outputDir: "./dist/img/optimized",
    urlPath: "/img/optimized",
  };

  // Waits for the resized images to be written (results are cached by eleventy-img).
  return Image(src, options);
}

function escapeAttribute(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return escapeAttribute(value).replace(/'/g, "&#39;");
}

function getAnchorLink(filePath, linkTitle) {
  const { attributes, innerHTML } = getAnchorAttributes(filePath, linkTitle);
  return `<a ${Object.keys(attributes).map(key => `${key}="${escapeAttribute(attributes[key])}"`).join(" ")}>${innerHTML}</a>`;
}

// Front matter of linked notes, cached so every wikilink doesn't re-read and
// re-parse its target from disk. Cleared on each (re)build.
const frontMatterCache = new Map();

function readNoteFrontMatter(fullPath) {
  if (!frontMatterCache.has(fullPath)) {
    let data = null;
    try {
      data = matter(fs.readFileSync(fullPath, "utf8")).data;
    } catch {
      // Missing or unreadable note: cached as null and rendered as a dead link.
      data = null;
    }
    frontMatterCache.set(fullPath, data);
  }
  return frontMatterCache.get(fullPath);
}

function getAnchorAttributes(filePath, linkTitle) {
  let fileName = filePath.replaceAll("&amp;", "&");
  let header = "";
  let headerLinkPath = "";
  if (fileName.includes("#")) {
    [fileName, header] = fileName.split("#");
    headerLinkPath = `#${headerToId(header)}`;
  }

  let noteIcon = process.env.NOTE_ICON_DEFAULT;
  const title = linkTitle ? linkTitle : fileName;
  let permalink = defaultPermalink(fileName);
  let deadLink = false;
  const startPath = "./src/site/notes/";
  const fullPath = fileName.endsWith(".md")
    ? `${startPath}${fileName}`
    : `${startPath}${fileName}.md`;
  const data = readNoteFrontMatter(fullPath);
  if (!data) {
    deadLink = true;
  } else {
    if (data.permalink) {
      permalink = fixPermalink(data.permalink);
    }
    if (data.tags && data.tags.indexOf("gardenEntry") != -1) {
      permalink = "/";
    }
    if (data.noteIcon) {
      noteIcon = data.noteIcon;
    }
  }

  if (deadLink) {
    return {
      attributes: {
        "class": "internal-link is-unresolved",
        "href": "/404",
        "target": "",
      },
      innerHTML: title,
    }
  }
  return {
    attributes: {
      "class": "internal-link",
      "target": "",
      "data-note-icon": noteIcon,
      "href": `${permalink}${headerLinkPath}`,
    },
    innerHTML: title,
  }
}

function isExternalHref(href) {
  if (!/^https?:\/\//i.test(href)) {
    return false;
  }
  const siteBase = (process.env.SITE_BASE_URL || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  if (!siteBase) {
    return true;
  }
  const host = href.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
  return host !== siteBase && host !== `www.${siteBase}`;
}

const tagRegex = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?><]+)(?!([^<]*>))/g;

module.exports = function (eleventyConfig) {
  eleventyConfig.setLiquidOptions({
    dynamicPartials: true,
  });
  let markdownLib = markdownIt({
    breaks: true,
    html: true,
    linkify: true,
  })
    .use(require("markdown-it-anchor"), {
      slugify: headerToId,
    })
    .use(require("markdown-it-mark"))
    .use(require("markdown-it-footnote"))
    .use(function (md) {
      md.renderer.rules.hashtag_open = function (tokens, idx) {
        return '<a class="tag" onclick="toggleTagSearch(this)">';
      };
    })
    .use(require("markdown-it-mathjax3"), {
      tex: {
        inlineMath: [["$", "$"]],
      },
      options: {
        skipHtmlTags: { "[-]": ["pre"] },
      },
    })
    .use(require("markdown-it-attrs"))
    .use(require("markdown-it-task-checkbox"), {
      disabled: true,
      divWrap: false,
      divClass: "checkbox",
      idPrefix: "cbx_",
      ulClass: "task-list",
      liClass: "task-list-item",
    })
    .use(require("markdown-it-plantuml"), {
      openMarker: "```plantuml",
      closeMarker: "```",
    })
    .use(namedHeadingsFilter)
    .use(function (md) {
      //https://github.com/DCsunset/markdown-it-mermaid-plugin
      const origFenceRule =
        md.renderer.rules.fence ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
        const token = tokens[idx];
        if (token.info === "mermaid") {
          const code = token.content.trim();
          return `<pre class="mermaid">${code}</pre>`;
        }
        if (token.info === "transclusion") {
          const code = token.content.trim();
          return `<div class="transclusion">${md.render(code)}</div>`;
        }
        if (token.info.startsWith("ad-")) {
          const code = token.content.trim();
          const parts = code.split("\n")
          let titleLine;
          let collapse;
          let collapsible = false
          let collapsed = true
          let icon;
          let color;
          let nbLinesToSkip = 0
          for (let i = 0; i < 4; i++) {
            if (parts[i] && parts[i].trim()) {
              // Keep the original casing for values (titles); match keys case-insensitively.
              let originalLine = parts[i].trim()
              let line = originalLine.toLowerCase()
              if (line.startsWith("title:")) {
                titleLine = escapeHtml(originalLine.substring(6).trim());
                nbLinesToSkip++;
              } else if (line.startsWith("icon:")) {
                icon = line.substring(5);
                nbLinesToSkip++;
              } else if (line.startsWith("collapse:")) {
                collapsible = true
                collapse = line.substring(9);
                if (collapse && collapse.trim().toLowerCase() == 'open') {
                  collapsed = false
                }
                nbLinesToSkip++;
              } else if (line.startsWith("color:")) {
                color = line.substring(6);
                nbLinesToSkip++;
              }
            }
          }
          const foldDiv = collapsible ? `<div class="callout-fold">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          </div>` : "";
          const titleDiv = titleLine
            ? `<div class="callout-title"><div class="callout-title-inner">${titleLine}</div>${foldDiv}</div>`
            : "";
          let collapseClasses = titleLine && collapsible ? 'is-collapsible' : ''
          if (collapsible && collapsed) {
            collapseClasses += " is-collapsed"
          }

          let res = `<div data-callout-metadata class="callout ${collapseClasses}" data-callout="${escapeAttribute(token.info.substring(3))
            }">${titleDiv}\n<div class="callout-content">${md.render(
              parts.slice(nbLinesToSkip).join("\n")
            )}</div></div>`;
          return res
        }

        // Other languages
        return origFenceRule(tokens, idx, options, env, slf);
      };

      const defaultImageRule =
        md.renderer.rules.image ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const imageName = tokens[idx].content;
        //"image.png|metadata?|width"
        const [fileName, ...widthAndMetaData] = imageName.split("|");
        const lastValue = widthAndMetaData[widthAndMetaData.length - 1];
        const lastValueIsNumber = lastValue !== undefined && lastValue.trim() !== "" && !isNaN(lastValue);
        const width = lastValueIsNumber ? lastValue : null;

        let metaData = "";
        if (widthAndMetaData.length > 1) {
          metaData = widthAndMetaData.slice(0, widthAndMetaData.length - 1).join(" ");
        }

        if (!lastValueIsNumber && lastValue !== undefined) {
          metaData += ` ${lastValue}`;
        }

        // Alt text: Obsidian's "|alt" metadata when present, otherwise the
        // file name without its extension (never the "|width" suffix).
        // ("\|" is how a pipe is escaped inside Markdown tables, so drop the backslash.)
        const altText = metaData.trim() || fileName.replace(/\\+$/, "").replace(/\.[a-z0-9]+$/i, "").trim();
        tokens[idx].children = [{ type: "text", content: altText }];

        if (width) {
          const widthIndex = tokens[idx].attrIndex("width");
          const widthAttr = String(parseInt(width, 10));
          if (widthIndex < 0) {
            tokens[idx].attrPush(["width", widthAttr]);
          } else {
            tokens[idx].attrs[widthIndex][1] = widthAttr;
          }
        }

        return defaultImageRule(tokens, idx, options, env, self);
      };

      const defaultLinkRule =
        md.renderer.rules.link_open ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        // Only links to other sites open in a new tab and get the external style.
        // Links to this site (relative paths, #anchors, mailto:, own domain) stay as they are.
        const href = tokens[idx].attrGet("href") || "";

        // Point links to other notes ("/notes/folder/note name", "Note.md") at the note's real URL.
        const noteHref = resolveNoteHref(href);
        if (noteHref) {
          tokens[idx].attrSet("href", noteHref);
          tokens[idx].attrJoin("class", "internal-link");
          return defaultLinkRule(tokens, idx, options, env, self);
        }
        if (noteHref === false) {
          // The linked note isn't published: same treatment as an unresolved wikilink.
          tokens[idx].attrSet("href", "/404");
          tokens[idx].attrJoin("class", "internal-link is-unresolved");
          return defaultLinkRule(tokens, idx, options, env, self);
        }

        if (!isExternalHref(href)) {
          return defaultLinkRule(tokens, idx, options, env, self);
        }

        const relIndex = tokens[idx].attrIndex("rel");
        if (relIndex < 0) {
          tokens[idx].attrPush(["rel", "noopener noreferrer"]);
        }

        const aIndex = tokens[idx].attrIndex("target");
        const classIndex = tokens[idx].attrIndex("class");

        if (aIndex < 0) {
          tokens[idx].attrPush(["target", "_blank"]);
        } else {
          tokens[idx].attrs[aIndex][1] = "_blank";
        }

        if (classIndex < 0) {
          tokens[idx].attrPush(["class", "external-link"]);
        } else {
          tokens[idx].attrs[classIndex][1] = "external-link";
        }

        return defaultLinkRule(tokens, idx, options, env, self);
      };
    })
    .use(userMarkdownSetup);

  eleventyConfig.setLibrary("md", markdownLib);

  eleventyConfig.addFilter("isoDate", function (date) {
    return date && date.toISOString();
  });

  eleventyConfig.on("eleventy.before", () => {
    frontMatterCache.clear();
    resetNoteIndex();
  });

  function toDateTime(value) {
    if (!value) return null;
    if (value instanceof Date) return DateTime.fromJSDate(value);
    const str = String(value);
    // setZone keeps the author's UTC offset, so the date reads the same for every visitor.
    for (const parsed of [
      DateTime.fromISO(str, { setZone: true }),
      DateTime.fromSQL(str, { setZone: true }),
      DateTime.fromHTTP(str, { setZone: true }),
    ]) {
      if (parsed.isValid) return parsed;
    }
    return null;
  }

  // Dates are formatted at build time instead of in the browser, which removes
  // a client-side date library and the text popping in after load.
  eleventyConfig.addFilter("humanDate", function (value, format) {
    const date = toDateTime(value);
    return date ? date.toFormat(format || "MMM dd, yyyy h:mm a") : value;
  });

  eleventyConfig.addFilter("isoDateTime", function (value) {
    const date = toDateTime(value);
    return date ? date.toISO() : "";
  });

  // Plain-text summary of the rendered page for <meta name="description">.
  eleventyConfig.addFilter("metaDescription", function (html, maxLength = 160) {
    if (!html) return "";
    const root = parse(String(html));
    root.querySelectorAll("script, style, nav, .toc, .callout-title").forEach((el) => el.remove());
    const text = root.text.replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    const cut = text.substring(0, maxLength - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${cut.substring(0, lastSpace > maxLength * 0.6 ? lastSpace : cut.length)}…`;
  });

  eleventyConfig.addFilter("pdfEmbed", function (str) {
    if (!str) return str;
    // Match Obsidian embed syntax: ![[filename.pdf]] (with optional |height)
    return str.replace(/!\[\[([^\]]+\.pdf)(?:\|([^\]]*?))?\]\]/gi, function (match, fileName, options) {
      let height = "80vh";
      if (options && !isNaN(options.trim())) {
        height = options.trim() + "px";
      }
      // Search for the PDF file anywhere under src/site
      const { globSync } = require("glob");
      const baseName = fileName.split("/").pop();
      const matches = globSync(`src/site/**/${baseName}`, { nodir: true });
      let pdfPath = `/img/user/Attachments/${fileName}`; // fallback default
      if (matches.length > 0) {
        // Convert fs path to URL path (strip the "src/site" prefix)
        pdfPath = "/" + matches[0].replace(/\\/g, "/").replace(/^src\/site\//, "");
      }
      const encodedPath = encodeURI(pdfPath);
      const safeName = escapeHtml(fileName);
      return `<div class="pdf-embed" data-pdf-name="${safeName}">
        <div class="pdf-embed-header">
          <span class="pdf-embed-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </span>
          <span class="pdf-embed-title">${safeName}</span>
          <a class="pdf-embed-download" href="${encodedPath}" target="_blank" rel="noopener noreferrer" title="Open in new tab">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
        <iframe class="pdf-embed-viewer" src="${encodedPath}" style="height:${height}" loading="lazy" title="${safeName}"></iframe>
      </div>`;
    });
  });

  eleventyConfig.addFilter("link", function (str) {
    return (
      str &&
      str.replace(/\[\[(.*?\|.*?)\]\]/g, function (match, p1) {
        //Check if it is an embedded excalidraw drawing or mathjax javascript
        if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
          return match;
        }
        const [fileLink, linkTitle] = p1.split("|");

        return getAnchorLink(fileLink, linkTitle);
      })
    );
  });

  eleventyConfig.addFilter("taggify", function (str) {
    return (
      str &&
      str.replace(tagRegex, function (match, precede, tag) {
        // The href makes tags real, focusable links that also work without JS.
        return `${precede}<a class="tag" href="?q=${encodeURIComponent(tag)}" onclick="toggleTagSearch(this); return false;" data-content="${tag}">${tag}</a>`;
      })
    );
  });

  eleventyConfig.addFilter("searchableTags", function (str) {
    let tags;
    let match = str && str.match(tagRegex);
    if (match) {
      tags = match
        .map((m) => {
          return `"${m.split("#")[1]}"`;
        })
        .join(", ");
    }
    if (tags) {
      return `${tags},`;
    } else {
      return "";
    }
  });

  eleventyConfig.addFilter("hideDataview", function (str) {
    return (
      str &&
      str.replace(/\(\S+\:\:(.*)\)/g, function (_, value) {
        return value.trim();
      })
    );
  });

  function transformDataviewJsLinks(parsed) {
    for (const dataViewJsLink of parsed.querySelectorAll("a[data-href].internal-link")) {
      const notePath = dataViewJsLink.getAttribute("data-href");
      const title = dataViewJsLink.innerHTML;
      const { attributes, innerHTML } = getAnchorAttributes(notePath, title);
      for (const key in attributes) {
        dataViewJsLink.setAttribute(key, attributes[key]);
      }
      dataViewJsLink.innerHTML = innerHTML;
    }
  }

  function transformCallouts(parsed) {
    const transformCalloutBlocks = (
      blockquotes = parsed.querySelectorAll("blockquote")
    ) => {
      for (const blockquote of blockquotes) {
        transformCalloutBlocks(blockquote.querySelectorAll("blockquote"));

        let content = blockquote.innerHTML;

        let titleDiv = "";
        let calloutType = "";
        let calloutMetaData = "";
        let isCollapsable;
        let isCollapsed;
        const calloutMeta = /\[!([\w-]*)\|?(\s?.*)\](\+|\-){0,1}(\s?.*)/;
        if (!content.match(calloutMeta)) {
          continue;
        }

        content = content.replace(
          calloutMeta,
          function (metaInfoMatch, callout, metaData, collapse, title) {
            isCollapsable = Boolean(collapse);
            isCollapsed = collapse === "-";
            const titleText = title.replace(/(<\/{0,1}\w+>)/, "")
              ? title
              : `${callout.charAt(0).toUpperCase()}${callout
                .substring(1)
                .toLowerCase()}`;
            const fold = isCollapsable
              ? `<div class="callout-fold"><i data-lucide="chevron-down" aria-hidden="true"></i></div>`
              : ``;

            calloutType = callout;
            calloutMetaData = metaData;
            titleDiv = `<div class="callout-title"><div class="callout-title-inner">${titleText}</div>${fold}</div>`;
            return "";
          }
        );

        /* Hacky fix for callouts with only a title:
        This will ensure callout-content isn't produced if
        the callout only has a title, like this:
        ```md
        > [!info] i only have a title
        ```
        Not sure why content has a random <p> tag in it,
        */
        if (content === "\n<p>\n") {
          content = "";
        }
        let contentDiv = content ? `\n<div class="callout-content">${content}</div>` : "";

        blockquote.tagName = "div";
        blockquote.classList.add("callout");
        blockquote.classList.add(isCollapsable ? "is-collapsible" : "");
        blockquote.classList.add(isCollapsed ? "is-collapsed" : "");
        blockquote.setAttribute("data-callout", calloutType.toLowerCase());
        calloutMetaData && blockquote.setAttribute("data-callout-metadata", calloutMetaData);
        blockquote.innerHTML = `${titleDiv}${contentDiv}`;
      }
    };

    transformCalloutBlocks();
  }

  function fillPictureSourceSets(src, cls, alt, meta, width, imageTag) {
    imageTag.tagName = "picture";
    // These belong on the inner <img>, not on <picture>.
    ["src", "alt", "width", "height", "class"].forEach((attr) => imageTag.removeAttribute(attr));

    // Give the browser the intrinsic size so the layout doesn't jump while loading.
    const original = meta.jpeg[meta.jpeg.length - 1];
    const displayWidth = parseInt(width, 10) || original.width;
    const displayHeight = Math.round(displayWidth * original.height / original.width);
    let html = `<source
      media="(max-width:480px)"
      srcset="${meta.webp[0].url}"
      type="image/webp"
      />
      <source
      media="(max-width:480px)"
      srcset="${meta.jpeg[0].url}"
      />
      `
    if (meta.webp && meta.webp[1] && meta.webp[1].url) {
      html += `<source
        media="(max-width:1920px)"
        srcset="${meta.webp[1].url}"
        type="image/webp"
        />`
    }
    if (meta.jpeg && meta.jpeg[1] && meta.jpeg[1].url) {
      html += `<source
        media="(max-width:1920px)"
        srcset="${meta.jpeg[1].url}"
        />`
    }
    html += `<img
      class="${escapeAttribute(cls.toString())}"
      src="${escapeAttribute(src)}"
      alt="${escapeAttribute(alt || "")}"
      width="${displayWidth}"
      height="${displayHeight}"
      loading="lazy"
      decoding="async"
      />`;
    imageTag.innerHTML = html;
  }


  async function transformPictures(parsed) {
    if (process.env.USE_FULL_RESOLUTION_IMAGES === "true") {
      return;
    }
    for (const imageTag of parsed.querySelectorAll(".cm-s-obsidian img")) {
      const src = imageTag.getAttribute("src");
      if (src && src.startsWith("/") && !src.endsWith(".svg")) {
        const cls = imageTag.classList.value;
        const alt = imageTag.getAttribute("alt");
        const width = imageTag.getAttribute("width") || '';

        try {
          const meta = await transformImage(
            "./src/site" + decodeURI(imageTag.getAttribute("src")),
            cls.toString(),
            alt,
            ["(max-width: 480px)", "(max-width: 1024px)"]
          );

          if (meta) {
            fillPictureSourceSets(src, cls, alt, meta, width, imageTag);
          }
        } catch (error) {
          // Keep the original <img> if the image can't be processed, but say why.
          console.warn(`[image] Using the original image for ${src}: ${error.message}`);
        }
      }
    }
  }

  function transformTables(parsed) {    for (const t of parsed.querySelectorAll(".cm-s-obsidian > table")) {
      let inner = t.innerHTML;
      t.tagName = "div";
      t.classList.add("table-wrapper");
      t.innerHTML = `<table>${inner}</table>`;
    }

    for (const t of parsed.querySelectorAll(
      ".cm-s-obsidian > .block-language-dataview > table"
    )) {
      t.classList.add("dataview");
      t.classList.add("table-view-table");
      t.querySelector("thead")?.classList.add("table-view-thead");
      t.querySelector("tbody")?.classList.add("table-view-tbody");
      t.querySelectorAll("thead > tr")?.forEach((tr) => {
        tr.classList.add("table-view-tr-header");
      });
      t.querySelectorAll("thead > tr > th")?.forEach((th) => {
        th.classList.add("table-view-th");
      });
    }
  }

  // All DOM-based post-processing shares one parse per page, and only runs on
  // HTML output (not on feed.xml, sitemap.xml, graph.json or searchIndex.json).
  eleventyConfig.addTransform("html-dom", async function (str) {
    const outputPath = this.page && this.page.outputPath;
    if (!str || typeof outputPath !== "string" || !outputPath.endsWith(".html")) {
      return str;
    }
    const parsed = parse(str);
    transformDataviewJsLinks(parsed);
    transformCallouts(parsed);
    await transformPictures(parsed);
    transformTables(parsed);
    return parsed.innerHTML;
  });

  eleventyConfig.addTransform("htmlMinifier", async (content, outputPath) => {
    if (
      (process.env.NODE_ENV === "production" || process.env.ELEVENTY_ENV === "prod") &&
      outputPath &&
      outputPath.endsWith(".html")
    ) {
      try {
        return await htmlMinifier.minify(content, {
          useShortDoctype: true,
          removeComments: true,
          collapseWhitespace: true,
          conservativeCollapse: true,
          preserveLineBreaks: true,
          minifyCSS: true,
          minifyJS: true,
          keepClosingSlash: true,
        });
      } catch {
        // If the html minifying fails for some reason due to some malformed text, just return the content as is.
        return content;
      }
    }
    return content;
  });

  eleventyConfig.addPassthroughCopy("src/site/img");
  eleventyConfig.addPassthroughCopy("src/site/**/*.pdf");
  eleventyConfig.addPassthroughCopy("src/site/fonts");
  eleventyConfig.addPassthroughCopy("src/site/scripts");
  eleventyConfig.addPassthroughCopy("src/site/styles/_theme.*.css");
  eleventyConfig.addPassthroughCopy({ "src/site/logo.*": "/" });
  eleventyConfig.addPassthroughCopy({ "src/site/CNAME": "CNAME" });
  eleventyConfig.addPassthroughCopy({ "src/site/.nojekyll": ".nojekyll" });
  const genIcons = require("eleventy-plugin-gen-favicons/favicon-gen");
  eleventyConfig.addAsyncShortcode("favicons", async (sourceFile, opts) => {
    await genIcons(sourceFile, "dist", opts);
    return `
<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="/favicon.ico?v=2" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<link rel="manifest" href="/manifest.webmanifest?v=2">`;
  });
  eleventyConfig.addPlugin(tocPlugin, {
    ul: true,
    tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
  });


  eleventyConfig.addFilter("dateToZulu", function (date) {
    try {
      return new Date(date).toISOString("dd-MM-yyyyTHH:mm:ssZ");
    } catch {
      return "";
    }
  });

  eleventyConfig.addFilter("jsonify", function (variable) {
    return JSON.stringify(variable) || '""';
  });

  eleventyConfig.addFilter("validJson", function (variable) {
    if (Array.isArray(variable)) {
      return variable.map((x) => x.replaceAll("\\", "\\\\")).join(",");
    } else if (typeof variable === "string") {
      return variable.replaceAll("\\", "\\\\");
    }
    return variable;
  });

  eleventyConfig.addPlugin(pluginRss, {
    posthtmlRenderOptions: {
      closingSingleTag: "slash",
      singleTags: ["link"],
    },
  });

  userEleventySetup(eleventyConfig);

  return {
    dir: {
      input: "src/site",
      output: "dist",
      data: `_data`,
    },
    templateFormats: ["njk", "md", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
    passthroughFileCopy: true,
  };
};
