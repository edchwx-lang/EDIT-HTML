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

test("extractDocument preserves PPTX images, chart caches, and speaker notes", async () => {
  const pptx = zipSync({
    "ppt/slides/slide1.xml": strToU8(
      '<p:sld xmlns:p="urn:p" xmlns:a="urn:a" xmlns:r="urn:r" xmlns:c="urn:c"><p:cSld>' +
      '<a:p><a:r><a:t>材料市场</a:t></a:r></a:p>' +
      '<p:pic><p:nvPicPr><p:cNvPr id="1" name="图片" descr="材料图"/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill></p:pic>' +
      '<c:chart r:id="rIdChart"/></p:cSld></p:sld>'
    ),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdImage" Target="../media/image1.png" Type="image"/>' +
      '<Relationship Id="rIdChart" Target="../charts/chart1.xml" Type="chart"/>' +
      '<Relationship Id="rIdNotes" Target="../notesSlides/notesSlide1.xml" Type="notesSlide"/>' +
      '</Relationships>'
    ),
    "ppt/media/image1.png": strToU8("png"),
    "ppt/charts/chart1.xml": strToU8(
      '<c:chartSpace xmlns:c="urn:c"><c:chart><c:plotArea><c:barChart><c:ser>' +
      '<c:tx><c:v>市场规模</c:v></c:tx><c:cat><c:strRef><c:strCache>' +
      '<c:pt idx="0"><c:v>全球</c:v></c:pt><c:pt idx="1"><c:v>国内</c:v></c:pt>' +
      '</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache>' +
      '<c:pt idx="0"><c:v>42</c:v></c:pt><c:pt idx="1"><c:v>21</c:v></c:pt>' +
      '</c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>'
    ),
    "ppt/notesSlides/notesSlide1.xml": strToU8(
      '<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>来源备注</a:t></a:r></a:p></p:notes>'
    )
  });

  const extracted = await extractDocument("brief.pptx", pptx);
  assert.deepEqual(extracted.units.map((unit) => unit.type), ["heading", "image", "chart", "note"]);
  assert.equal(extracted.units[1].assetPath, "source-assets/image1.png");
  assert.deepEqual(extracted.units[2].rows, [["类别", "市场规模"], ["全球", "42"], ["国内", "21"]]);
  assert.equal(extracted.units[2].sourceStatus, "cached-data");
  assert.equal(extracted.units[3].text, "来源备注");
  assert.equal(extracted.assets[0].path, "source-assets/image1.png");
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
