import path from "node:path";

export function analyzeTextDocument(name, text) {
  const numericTokens = text.match(/(?<![\p{L}\p{N}])[-+]?\d+(?:[.,]\d+)*(?:%|‰)?/gu) ?? [];
  return {
    name,
    mediaType: mediaTypeFor(name),
    text,
    characterCount: text.length,
    numericTokenCount: numericTokens.length
  };
}

export function recommendMode(documents) {
  const numericTokenCount = documents.reduce(
    (total, document) => total + document.numericTokenCount,
    0
  );
  return {
    mode: numericTokenCount >= 8 ? "data-first" : "evidence-first",
    reason:
      numericTokenCount >= 8
        ? "The source contains enough quantitative evidence for a data-led structure."
        : "The source is better suited to a narrative evidence structure."
  };
}

function mediaTypeFor(name) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".md") return "text/markdown";
  if (extension === ".html" || extension === ".htm") return "text/html";
  return "text/plain";
}
