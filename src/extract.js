import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";

const orderedXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  processEntities: true
});

export async function extractDocument(name, contents) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".txt") {
    const text = new TextDecoder().decode(contents);
    return { mediaType: "text/plain", text, units: plainUnits(text), assets: [], warnings: [] };
  }
  if (extension === ".md" || extension === ".markdown") {
    const text = new TextDecoder().decode(contents);
    return { mediaType: "text/markdown", text, units: markdownUnits(text), assets: [], warnings: [] };
  }
  if (extension === ".html" || extension === ".htm") {
    const html = new TextDecoder().decode(contents);
    const text = extractHtmlText(html);
    return { mediaType: "text/html", text, units: htmlUnits(html), assets: [], warnings: [] };
  }
  if (extension === ".docx") return extractDocx(contents);
  if (extension === ".pptx") return extractPptx(contents);
  if (extension === ".pdf") return extractPdf(contents);
  throw new Error('unsupported source format "' + extension + '"');
}

function extractDocx(contents) {
  const files = unzipSync(contents);
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error("DOCX is missing word/document.xml");
  const xml = strFromU8(documentXml);
  assertWellFormed(xml, "DOCX document.xml");
  const relationships = relationshipMap(files["word/_rels/document.xml.rels"]);
  const units = [];
  const assets = [];
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i)?.[1] ?? xml;
  const blocks = body.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/gi) ?? [];
  for (const block of blocks) {
    if (/^<w:tbl\b/i.test(block)) {
      const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)].map((row) =>
        [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)].map((cell) => paragraphText(cell[0]).trim())
      ).filter((row) => row.some(Boolean));
      if (rows.length) units.push({ type: "table", rows });
      continue;
    }
    const text = paragraphText(block).trim();
    const style = attributeValue(block.match(/<w:pStyle\b[^>]*>/i)?.[0], "w:val");
    const headingLevel = headingLevelFor(style);
    const numbered = /<w:numPr\b/i.test(block);
    if (text) {
      units.push(headingLevel
        ? { type: "heading", level: headingLevel, text }
        : numbered
          ? { type: "list", text, items: [text], ordered: true }
          : { type: "paragraph", text, links: paragraphLinks(block, relationships) });
    }
    for (const match of block.matchAll(/<a:blip\b[^>]*\br:embed\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const relationship = relationships.get(match[1]);
      if (!relationship) continue;
      const target = relationship.target.replace(/^\.\.\//, "");
      const zipPath = target.startsWith("word/") ? target : "word/" + target.replace(/^\//, "");
      const bytes = files[zipPath];
      const fileName = path.posix.basename(target);
      const assetPath = "source-assets/" + fileName;
      if (bytes && !assets.some((asset) => asset.path === assetPath)) assets.push({ path: assetPath, bytes });
      const docPr = block.match(/<wp:docPr\b[^>]*>/i)?.[0] ?? "";
      units.push({
        type: "image",
        assetPath,
        alt: attributeValue(docPr, "descr") || attributeValue(docPr, "name") || fileName
      });
    }
  }
  const footnotesXml = files["word/footnotes.xml"] ? strFromU8(files["word/footnotes.xml"]) : "";
  for (const match of footnotesXml.matchAll(/<w:footnote\b[^>]*w:id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/w:footnote>/gi)) {
    const text = paragraphText(match[2]).trim();
    if (text && Number(match[1]) >= 0) units.push({ type: "footnote", text, footnoteId: match[1] });
  }
  return {
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text: units.map(unitPlainText).filter(Boolean).join("\n"),
    units,
    assets,
    warnings: []
  };
}

function extractPptx(contents) {
  const files = unzipSync(contents);
  const slideNames = Object.keys(files).filter((item) => /^ppt\/slides\/slide\d+\.xml$/i.test(item)).sort((a, b) => slideNumber(a) - slideNumber(b));
  const units = [];
  for (const slideName of slideNames) {
    const slide = slideNumber(slideName);
    const xml = strFromU8(files[slideName]);
    const paragraphs = xml.split(/<\/a:p>/i).map((paragraph) => [...paragraph.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)].map((match) => decodeXml(match[1])).join("")).filter(Boolean);
    paragraphs.forEach((text, index) => units.push({ type: index === 0 ? "heading" : "paragraph", level: index === 0 ? 1 : undefined, text, slide }));
    for (const table of xml.matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/gi)) {
      const rows = [...table[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/gi)].map((row) => [...row[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/gi)].map((cell) => [...cell[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)].map((m) => decodeXml(m[1])).join("")));
      if (rows.length) units.push({ type: "table", rows, slide });
    }
  }
  return {
    mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    text: slideNames.map((name) => units.filter((unit) => unit.slide === slideNumber(name) && ["heading", "paragraph"].includes(unit.type)).map((unit) => unit.text).join("\n")).join("\n\n"),
    units,
    assets: [],
    slideCount: slideNames.length,
    warnings: []
  };
}

async function extractPdf(contents) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const data = contents instanceof Uint8Array ? new Uint8Array(contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)) : new Uint8Array(contents);
  const document = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const pages = [];
    const units = [];
    const assets = [];
    const warnings = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
      const viewport = page.getViewport({ scale: 1.5 });
      let canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      } catch (error) {
        canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#111111";
        context.font = "18px sans-serif";
        drawWrappedText(context, text || "PDF page " + pageNumber, 42, 56, Math.max(200, canvas.width - 84), 28);
        warnings.push("PDF page " + pageNumber + " used a text image fallback: " + error.message);
      }
      const pageImagePath = "source-assets/pdf-page-" + pageNumber + ".png";
      assets.push({ path: pageImagePath, bytes: canvas.toBuffer("image/png") });
      pages.push(text);
      units.push({ type: "page", page: pageNumber, text, pageImagePath });
    }
    return { mediaType: "application/pdf", text: pages.join("\n\n"), units, assets, pageCount: document.numPages, warnings };
  } finally {
    await document.destroy();
  }
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y);
      line = character;
      y += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) context.fillText(line, x, y);
}

function markdownUnits(text) {
  const units = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) units.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flush(); units.push({ type: "heading", level: heading[1].length, text: heading[2] }); continue; }
    const list = line.match(/^([-*+] |\d+[.)] )(.+)$/);
    if (list) { flush(); units.push({ type: "list", text: list[2], items: [list[2]], ordered: /^\d/.test(line) }); continue; }
    if (/^\|.*\|$/.test(line)) {
      flush();
      const tableLines = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      const rows = tableLines
        .filter((item) => !/^\|?\s*:?-{3,}/.test(item.replace(/\|\s*$/, "").replace(/^\|/, "")))
        .map((item) => item.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
      if (rows.length) units.push({ type: "table", rows });
      continue;
    }
    if (!line) { flush(); continue; }
    paragraph.push(line);
  }
  flush();
  return units;
}

function plainUnits(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((text) => ({ type: "paragraph", text }));
}

function htmlUnits(html) {
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const units = [];
  const blocks = clean.match(/<h[1-6]\b[\s\S]*?<\/h[1-6]>|<p\b[\s\S]*?<\/p>|<table\b[\s\S]*?<\/table>|<img\b[^>]*>/gi) ?? [];
  for (const block of blocks) {
    const heading = block.match(/^<h([1-6])/i);
    if (heading) units.push({ type: "heading", level: Number(heading[1]), text: stripTags(block) });
    else if (/^<p\b/i.test(block)) units.push({ type: "paragraph", text: stripTags(block) });
    else if (/^<img\b/i.test(block)) units.push({ type: "image", assetPath: attributeValue(block, "src"), alt: attributeValue(block, "alt") });
    else {
      const rows = [...block.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((row) => [...row[0].matchAll(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi)].map((cell) => stripTags(cell[0])));
      if (rows.length) units.push({ type: "table", rows });
    }
  }
  return units.length ? units : plainUnits(extractHtmlText(html));
}

function extractHtmlText(html) {
  return decodeXml(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<\/?(?:address|article|aside|blockquote|br|div|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")).split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function relationshipMap(bytes) {
  const map = new Map();
  if (!bytes) return map;
  const xml = strFromU8(bytes);
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)) {
    const id = attributeValue(match[1], "Id");
    const target = attributeValue(match[1], "Target");
    if (id && target) map.set(id, { target, type: attributeValue(match[1], "Type") });
  }
  return map;
}

function paragraphLinks(block, relationships) {
  return [...block.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/gi)].map((match) => {
    const id = attributeValue(match[1], "r:id");
    return { text: paragraphText(match[2]), target: relationships.get(id)?.target ?? null };
  });
}

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/gi)].map((match) => match[1] === undefined ? " " : decodeXml(match[1])).join("");
}

function headingLevelFor(style = "") {
  const match = style.match(/(?:Heading|标题)\s*([1-6])/i);
  return match ? Number(match[1]) : null;
}

function unitPlainText(unit) {
  if (unit.text) return unit.text;
  if (unit.rows) return unit.rows.map((row) => row.join("\t")).join("\n");
  return unit.alt ?? "";
}

function stripTags(value) {
  return decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attributeValue(value = "", name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp("\\b" + escaped + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"))?.[1] ?? "";
}

function assertWellFormed(xml, label) {
  try { orderedXmlParser.parse(xml); } catch (error) { throw new Error(label + " is invalid: " + error.message); }
}

function slideNumber(name) { return Number(name.match(/slide(\d+)\.xml$/i)[1]); }

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&").replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number))).replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)));
}
