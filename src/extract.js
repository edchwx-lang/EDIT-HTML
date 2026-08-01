import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

export async function extractDocument(name, contents) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
    return {
      mediaType: extension === ".txt" ? "text/plain" : "text/markdown",
      text: new TextDecoder().decode(contents),
      warnings: []
    };
  }
  if (extension === ".html" || extension === ".htm") {
    return {
      mediaType: "text/html",
      text: extractHtmlText(new TextDecoder().decode(contents)),
      warnings: []
    };
  }
  if (extension === ".docx") {
    const files = unzipSync(contents);
    const documentXml = files["word/document.xml"];
    if (!documentXml) throw new Error("DOCX is missing word/document.xml");
    return {
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      text: extractDocxText(strFromU8(documentXml)),
      warnings: []
    };
  }
  if (extension === ".pptx") {
    const files = unzipSync(contents);
    const slideNames = Object.keys(files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((left, right) => slideNumber(left) - slideNumber(right));
    return {
      mediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      text: slideNames
        .map((slideName) => extractPptxSlideText(strFromU8(files[slideName])))
        .join("\n\n"),
      slideCount: slideNames.length,
      warnings: []
    };
  }
  if (extension === ".pdf") {
    return extractPdf(contents);
  }
  throw new Error('unsupported source format "' + extension + '"');
}

function extractHtmlText(html) {
  return decodeXml(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?(?:address|article|aside|blockquote|br|div|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function extractPdf(contents) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data =
    contents instanceof Uint8Array
      ? new Uint8Array(
          contents.buffer.slice(
            contents.byteOffset,
            contents.byteOffset + contents.byteLength
          )
        )
      : new Uint8Array(contents);
  const document = await getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      );
    }
    return {
      mediaType: "application/pdf",
      text: pages.join("\n\n"),
      pageCount: document.numPages,
      warnings: []
    };
  } finally {
    await document.destroy();
  }
}

function slideNumber(name) {
  return Number(name.match(/slide(\d+)\.xml$/i)[1]);
}

function extractPptxSlideText(xml) {
  return xml
    .split(/<\/a:p>/i)
    .map((paragraph) =>
      [...paragraph.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)]
        .map((match) => decodeXml(match[1]))
        .join("")
    )
    .filter(Boolean)
    .join("\n");
}

function extractDocxText(xml) {
  return xml
    .split(/<\/w:p>/i)
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
        .map((match) => decodeXml(match[1]))
        .join("")
    )
    .filter(Boolean)
    .join("\n");
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16))
    );
}
