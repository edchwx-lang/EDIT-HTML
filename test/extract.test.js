import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import { extractDocument } from "../src/extract.js";

test("extractDocument preserves UTF-8 text material", async () => {
  const extracted = await extractDocument(
    "brief.md",
    strToU8("# Evidence\nRevenue 42")
  );

  assert.equal(extracted.mediaType, "text/markdown");
  assert.equal(extracted.text, "# Evidence\nRevenue 42");
});

test("extractDocument removes HTML markup and non-content scripts", async () => {
  const extracted = await extractDocument(
    "brief.html",
    strToU8(
      "<!doctype html><style>.x{color:red}</style><h1>Evidence &amp; action</h1>" +
        "<script>ignore()</script><p>Revenue 42</p>"
    )
  );

  assert.equal(extracted.mediaType, "text/html");
  assert.equal(extracted.text, "Evidence & action\nRevenue 42");
});

test("extractDocument reads paragraph text from DOCX OOXML", async () => {
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="urn:w">' +
        "<w:body><w:p><w:r><w:t>Heading</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Revenue &amp; profit 42</w:t></w:r></w:p></w:body>" +
        "</w:document>"
    )
  });

  const extracted = await extractDocument("brief.docx", docx);

  assert.equal(extracted.mediaType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(extracted.text, "Heading\nRevenue & profit 42");
  assert.deepEqual(extracted.warnings, []);
});

test("extractDocument reads PPTX slides in numeric order", async () => {
  const pptx = zipSync({
    "ppt/slides/slide2.xml": strToU8(
      '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Slide two</a:t></a:r></a:p></p:sld>'
    ),
    "ppt/slides/slide1.xml": strToU8(
      '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Slide one</a:t></a:r></a:p>' +
        "<a:p><a:r><a:t>Revenue 42</a:t></a:r></a:p></p:sld>"
    )
  });

  const extracted = await extractDocument("brief.pptx", pptx);

  assert.equal(extracted.mediaType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(extracted.text, "Slide one\nRevenue 42\n\nSlide two");
  assert.equal(extracted.slideCount, 2);
});

test("extractDocument reads text page by page from PDF", async () => {
  const extracted = await extractDocument("brief.pdf", minimalPdf("PDF evidence 42"));

  assert.equal(extracted.mediaType, "application/pdf");
  assert.equal(extracted.text, "PDF evidence 42");
  assert.equal(extracted.pageCount, 1);
  assert.equal(extracted.units[0].pageImagePath, "source-assets/pdf-page-1.png");
  assert.equal(extracted.assets[0].path, "source-assets/pdf-page-1.png");
  assert.equal(Buffer.from(extracted.assets[0].bytes).subarray(1, 4).toString("ascii"), "PNG");
});

function minimalPdf(text) {
  const stream = "BT /F1 18 Tf 72 720 Td (" + text + ") Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += index + 1 + " 0 obj\n" + object + "\nendobj\n";
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  }
  pdf +=
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xrefOffset +
    "\n%%EOF\n";
  return strToU8(pdf);
}
