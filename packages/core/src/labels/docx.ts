/**
 * Card labels as a Word document (decision 26: printed from Microsoft Word at 100%).
 *
 * Written by hand as Office Open XML, following the prototype that was measured within 0.1 mm
 * across and 0.2 mm down in Word (architecture §7): one fixed-layout table per sheet, a cell
 * per label column, exact row heights, Word 2010 compatibility mode. Two Word quirks matter:
 * Word lines up the first cell's *text* with the page margin, so the table is indented by the
 * first cell's left padding; and table properties must be in schema order, or Word calls the
 * file corrupt.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { LabelTemplate } from '../generated/label-template.js';
import type { FittedText } from './text.js';
import {
  CLASS_PT,
  NUMBER_PT,
  QR_COLUMN_MM,
  QR_SIZE_MM,
  TEXT_PAD_LEFT_MM,
  TEXT_PAD_RIGHT_MM,
  type LabelSlot,
} from './plan.js';
import { qrPng } from './qr.js';

export interface DocxOptions {
  /** Event code, for the document title. */
  readonly code: string;
  /** Leave room for, and print, the QR code (default true). */
  readonly qr?: boolean;
  /** Printer alignment: move everything right / down by this many mm (negative = left / up). */
  readonly offsetXmm?: number;
  readonly offsetYmm?: number;
  /** Dotted label outlines, for a plain-paper test print. */
  readonly outlines?: boolean;
}

const QR_PAD_LEFT_MM = 1.0;
const QR_PAD_RIGHT_MM = 0.5;
const BOTTOM_MARGIN_MM = 4;

const twips = (mm: number) => Math.round(mm * 56.6929);
const emu = (mm: number) => Math.round(mm * 36000);
const halfPoints = (pt: number) => Math.round(pt * 2);

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function run(text: string, pt: number, opts: { bold?: boolean; colour?: string } = {}): string {
  const sz = halfPoints(pt);
  return (
    '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' +
    (opts.bold ? '<w:b/><w:bCs/>' : '') +
    (opts.colour ? `<w:color w:val="${opts.colour}"/>` : '') +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
  );
}

function para(runs: string, align: 'left' | 'center' = 'left'): string {
  return (
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' +
    `<w:jc w:val="${align}"/></w:pPr>${runs}</w:p>`
  );
}

const EMPTY_PARA = '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';

const DOTTED = 'w:val="dotted" w:sz="4" w:space="0" w:color="A0A0A0"';

/** One table cell; `sides` are the outline edges to draw (schema order: top, left, bottom, right). */
function cell(
  widthMm: number,
  content: string,
  pad: { left: number; right: number } | null,
  sides: { top?: boolean; left?: boolean; bottom?: boolean; right?: boolean } | null,
): string {
  let pr = `<w:tcW w:w="${twips(widthMm)}" w:type="dxa"/>`;
  if (sides) {
    const edge = (name: string, on: boolean | undefined) =>
      on ? `<w:${name} ${DOTTED}/>` : `<w:${name} w:val="nil"/>`;
    pr +=
      '<w:tcBorders>' +
      edge('top', sides.top) +
      edge('left', sides.left) +
      edge('bottom', sides.bottom) +
      edge('right', sides.right) +
      '</w:tcBorders>';
  }
  if (pad) {
    pr +=
      '<w:tcMar><w:top w:w="0" w:type="dxa"/>' +
      `<w:left w:w="${twips(pad.left)}" w:type="dxa"/>` +
      '<w:bottom w:w="0" w:type="dxa"/>' +
      `<w:right w:w="${twips(pad.right)}" w:type="dxa"/></w:tcMar>`;
  }
  pr += '<w:vAlign w:val="center"/>';
  return `<w:tc><w:tcPr>${pr}</w:tcPr>${content || EMPTY_PARA}</w:tc>`;
}

function image(rid: string, id: number): string {
  const size = emu(QR_SIZE_MM);
  return (
    '<w:r><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${size}" cy="${size}"/>` +
    `<wp:docPr id="${id}" name="QR ${id}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="qr${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size}" cy="${size}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

/** What one label position shows: a card label, a position number (test page), or nothing. */
export type DocxSlot = LabelSlot | { readonly position: number };

const fitted = (t: FittedText, opts: { bold?: boolean; colour?: string } = {}) =>
  run(t.text, t.pt, opts);

/** Build the Word document for these label positions, sheet after sheet. */
export function labelsDocx(
  slots: readonly DocxSlot[],
  template: LabelTemplate,
  options: DocxOptions,
): Uint8Array {
  const qr = options.qr ?? true;
  const outlines = options.outlines ?? false;
  const dx = options.offsetXmm ?? 0;
  const dy = options.offsetYmm ?? 0;
  const t = template;
  const gap = t.pitch.across_mm - t.label.width_mm;
  const textW = t.label.width_mm - (qr ? QR_COLUMN_MM : 0);
  const perLabel = qr ? 2 : 1;

  const widths: number[] = [];
  for (let c = 0; c < t.columns; c++) {
    if (qr) widths.push(QR_COLUMN_MM);
    widths.push(textW);
    if (c < t.columns - 1) widths.push(gap);
  }
  const firstPad = qr ? QR_PAD_LEFT_MM : TEXT_PAD_LEFT_MM;

  const media: Zippable = {};
  const rels: string[] = [
    `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdSettings" Type="${REL}/settings" Target="settings.xml"/>`,
  ];
  let imageId = 0;

  const perSheet = t.columns * t.rows;
  const sheets = Math.max(1, Math.ceil(slots.length / perSheet));
  let body = '';
  for (let s = 0; s < sheets; s++) {
    let rows = '';
    for (let r = 0; r < t.rows; r++) {
      let cells = '';
      for (let c = 0; c < t.columns; c++) {
        const slot = slots[s * perSheet + r * t.columns + c] ?? null;
        const box = (i: number) =>
          outlines ? { top: true, bottom: true, left: i === 0, right: i === perLabel - 1 } : null;
        let qrContent = '';
        let text = '';
        if (slot && 'position' in slot) {
          text = para(run(String(slot.position), 9, { colour: '808080' }));
        } else if (slot) {
          if (qr) {
            imageId += 1;
            const rid = `rIdQr${imageId}`;
            media[`word/media/qr${imageId}.png`] = qrPng(slot.qr);
            rels.push(
              `<Relationship Id="${rid}" Type="${REL}/image" Target="media/qr${imageId}.png"/>`,
            );
            qrContent = para(image(rid, imageId), 'center');
          }
          text =
            para(
              run(String(slot.number), NUMBER_PT, { bold: true }) +
                run('  ', slot.lapText.pt, { bold: true }) +
                fitted(slot.lapText, { bold: true }),
            ) +
            para(fitted(slot.name)) +
            para(run(slot.classText.text, CLASS_PT, { colour: '404040' }));
        }
        if (qr) {
          cells += cell(
            QR_COLUMN_MM,
            qrContent,
            { left: QR_PAD_LEFT_MM, right: QR_PAD_RIGHT_MM },
            box(0),
          );
        }
        cells += cell(
          textW,
          text,
          { left: TEXT_PAD_LEFT_MM, right: TEXT_PAD_RIGHT_MM },
          box(perLabel - 1),
        );
        if (c < t.columns - 1) cells += cell(gap, '', null, null);
      }
      rows +=
        '<w:tr><w:trPr><w:cantSplit/>' +
        `<w:trHeight w:val="${twips(t.pitch.down_mm)}" w:hRule="exact"/></w:trPr>${cells}</w:tr>`;
    }
    body +=
      '<w:tbl><w:tblPr>' +
      `<w:tblW w:w="${twips(widths.reduce((a, b) => a + b, 0))}" w:type="dxa"/>` +
      `<w:tblInd w:w="${twips(firstPad)}" w:type="dxa"/>` +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>' +
      '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
      '</w:tblPr>' +
      `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${twips(w)}"/>`).join('')}</w:tblGrid>` +
      rows +
      '</w:tbl>' +
      // A 1-point paragraph after each sheet's table, carrying the page break.
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>' +
      (s < sheets - 1 ? '<w:r><w:br w:type="page"/></w:r>' : '') +
      '</w:p>';
  }

  const left = Math.max(0, t.margin.left_mm + dx);
  const top = Math.max(0, t.margin.top_mm + dy);
  const usedWidth = (t.columns - 1) * t.pitch.across_mm + t.label.width_mm;
  const right = Math.max(0, t.page.width_mm - left - usedWidth);
  const sect =
    '<w:sectPr>' +
    `<w:pgSz w:w="${twips(t.page.width_mm)}" w:h="${twips(t.page.height_mm)}"/>` +
    `<w:pgMar w:top="${twips(top)}" w:right="${twips(right)}" w:bottom="${twips(BOTTOM_MARGIN_MM)}" ` +
    `w:left="${twips(left)}" w:header="0" w:footer="0" w:gutter="0"/>` +
    '</w:sectPr>';

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W}" xmlns:r="${R}" ` +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${body}${sect}</w:body></w:document>`;

  const files: Zippable = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'docProps/core.xml': strToU8(coreProps(`Card labels: ${options.code}`)),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STYLES),
    'word/settings.xml': strToU8(SETTINGS),
    'word/_rels/document.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels.join('') +
        '</Relationships>',
    ),
    ...media,
  };
  // A fixed timestamp keeps the file identical for the same labels.
  return zipSync(files, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') });
}

/** The plain-paper alignment test page: every label position outlined and numbered. */
export function alignmentTestDocx(template: LabelTemplate, options: DocxOptions): Uint8Array {
  const slots = Array.from({ length: template.columns * template.rows }, (_, i) => ({
    position: i + 1,
  }));
  return labelsDocx(slots, template, { ...options, outlines: true });
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="png" ContentType="image/png"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>';

function coreProps(title: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${esc(title)}</dc:title><dc:creator>tScore</dc:creator>` +
    '</cp:coreProperties>'
  );
}

// Text defaults to 1 pt so the empty paragraphs Word needs in every cell take no room.
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<w:styles xmlns:w="${W}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/>' +
  '<w:sz w:val="2"/><w:szCs w:val="2"/><w:lang w:val="en-AU"/>' +
  '</w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
  '</w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
  '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
  '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>' +
  '<w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>' +
  '</w:tblCellMar></w:tblPr></w:style>' +
  '</w:styles>';

// Word 2010 compatibility mode: the mode the prototype's alignment was measured in.
const SETTINGS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<w:settings xmlns:w="${W}">` +
  '<w:defaultTabStop w:val="720"/>' +
  '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"/></w:compat>' +
  '</w:settings>';
