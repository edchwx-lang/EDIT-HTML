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
  const quantitativeThreshold = 8;
  const mode =
    numericTokenCount >= quantitativeThreshold ? "data-first" : "evidence-first";
  return {
    mode,
    numericTokenCount,
    quantitativeThreshold,
    reasonCode:
      mode === "data-first" ? "quantitative-evidence" : "narrative-evidence"
  };
}

function mediaTypeFor(name) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".md") return "text/markdown";
  if (extension === ".html" || extension === ".htm") return "text/html";
  return "text/plain";
}
