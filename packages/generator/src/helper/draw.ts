import { PDFPage, PDFDocument, PDFEmbeddedPage, setCharacterSpacing } from 'pdf-lib';
import {
  validateBarcodeInput,
  Schema,
  TextSchema,
  isTextSchema,
  ImageSchema,
  isImageSchema,
  BarcodeSchema,
  isBarcodeSchema,
  BarCodeType,
} from '@pdfme/common';
import {
  getSchemaSizeAndRotate,
  hex2RgbColor,
  calcX,
  calcY,
  createBarCode,
  getFontProp,
  getSplittedLines,
} from './index.js';
import type { TextSchemaSetting, InputImageCache, EmbedPdfBox } from '../type';

const drawBackgroundColor = (arg: {
  templateSchema: TextSchema;
  page: PDFPage;
  pageHeight: number;
}) => {
  const { templateSchema, page, pageHeight } = arg;
  if (!templateSchema.backgroundColor) return;
  const { width, height, rotate } = getSchemaSizeAndRotate(templateSchema);
  const color = hex2RgbColor(templateSchema.backgroundColor);
  page.drawRectangle({
    x: calcX(templateSchema.position.x, templateSchema.alignment || 'left', width, width),
    y: calcY(templateSchema.position.y, pageHeight, height),
    width,
    height,
    color,
    rotate,
  });
};

const drawInputByTextSchema = (arg: {
  input: string;
  templateSchema: TextSchema;
  pdfDoc: PDFDocument;
  page: PDFPage;
  pageHeight: number;
  textSchemaSetting: TextSchemaSetting;
}) => {
  const { input, templateSchema, page, pageHeight, textSchemaSetting } = arg;
  const { fontObj, fallbackFontName, splitThreshold } = textSchemaSetting;

  const fontValue = fontObj[templateSchema.fontName ? templateSchema.fontName : fallbackFontName];

  drawBackgroundColor({ templateSchema, page, pageHeight });

  const { width, rotate } = getSchemaSizeAndRotate(templateSchema);
  const { size, color, alignment, lineHeight, characterSpacing } = getFontProp(templateSchema);
  page.pushOperators(setCharacterSpacing(characterSpacing));

  let beforeLineOver = 0;

  input.split(/\r|\n|\r\n/g).forEach((inputLine, inputLineIndex) => {
    const isOverEval = (testString: string) => {
      const testStringWidth =
        fontValue.widthOfTextAtSize(testString, size) + (testString.length - 1) * characterSpacing;
      /**
       * split if the difference is less then two pixel
       * (found out / tested this threshold heuristically, most probably widthOfTextAtSize is unprecise)
       **/

      return width - testStringWidth <= splitThreshold;
    };
    const splitedLines = getSplittedLines(inputLine, isOverEval);
    const drawLine = (splitedLine: string, splitedLineIndex: number) => {
      const textWidth =
        fontValue.widthOfTextAtSize(splitedLine, size) +
        (splitedLine.length - 1) * characterSpacing;
      page.drawText(splitedLine, {
        x: calcX(templateSchema.position.x, alignment, width, textWidth),
        y:
          calcY(templateSchema.position.y, pageHeight, size) -
          lineHeight * size * (inputLineIndex + splitedLineIndex + beforeLineOver) -
          (lineHeight === 0 ? 0 : ((lineHeight - 1) * size) / 2),
        rotate,
        size,
        color,
        lineHeight: lineHeight * size,
        maxWidth: width,
        font: fontValue,
        wordBreaks: [''],
      });
      if (splitedLines.length === splitedLineIndex + 1) beforeLineOver += splitedLineIndex;
    };

    splitedLines.forEach(drawLine);
  });
};

const getCacheKey = (templateSchema: Schema, input: string) => `${templateSchema.type}${input}`;
const drawInputByImageSchema = async (arg: {
  input: string;
  templateSchema: ImageSchema;
  pageHeight: number;
  pdfDoc: PDFDocument;
  page: PDFPage;
  inputImageCache: InputImageCache;
}) => {
  const { input, templateSchema, pageHeight, pdfDoc, page, inputImageCache } = arg;

  const { width, height, rotate } = getSchemaSizeAndRotate(templateSchema);
  const opt = {
    x: calcX(templateSchema.position.x, 'left', width, width),
    y: calcY(templateSchema.position.y, pageHeight, height),
    rotate,
    width,
    height,
  };
  const inputImageCacheKey = getCacheKey(templateSchema, input);
  let image = inputImageCache[inputImageCacheKey];
  if (!image) {
    const isPng = input.startsWith('data:image/png;');
    image = await (isPng ? pdfDoc.embedPng(input) : pdfDoc.embedJpg(input));
  }
  inputImageCache[inputImageCacheKey] = image;
  page.drawImage(image, opt);
};

const drawInputByBarcodeSchema = async (arg: {
  input: string;
  templateSchema: BarcodeSchema;
  pageHeight: number;
  pdfDoc: PDFDocument;
  page: PDFPage;
  inputImageCache: InputImageCache;
}) => {
  const { input, templateSchema, pageHeight, pdfDoc, page, inputImageCache } = arg;
  if (!validateBarcodeInput(templateSchema.type as BarCodeType, input)) return;

  const { width, height, rotate } = getSchemaSizeAndRotate(templateSchema);
  const opt = {
    x: calcX(templateSchema.position.x, 'left', width, width),
    y: calcY(templateSchema.position.y, pageHeight, height),
    rotate,
    width,
    height,
  };
  const inputBarcodeCacheKey = getCacheKey(templateSchema, input);
  let image = inputImageCache[inputBarcodeCacheKey];
  if (!image) {
    const imageBuf = await createBarCode(
      Object.assign(templateSchema, { type: templateSchema.type as BarCodeType, input })
    );
    image = await pdfDoc.embedPng(imageBuf);
  }
  inputImageCache[inputBarcodeCacheKey] = image;
  page.drawImage(image, opt);
};

export const drawInputByTemplateSchema = async (arg: {
  input: string;
  templateSchema: Schema;
  pdfDoc: PDFDocument;
  page: PDFPage;
  pageHeight: number;
  textSchemaSetting: TextSchemaSetting;
  inputImageCache: InputImageCache;
}) => {
  if (!arg.input || !arg.templateSchema) return;

  if (isTextSchema(arg.templateSchema)) {
    const templateSchema = arg.templateSchema as TextSchema;
    drawInputByTextSchema({ ...arg, templateSchema });
  } else if (isImageSchema(arg.templateSchema)) {
    const templateSchema = arg.templateSchema as ImageSchema;
    await drawInputByImageSchema({ ...arg, templateSchema });
  } else if (isBarcodeSchema(arg.templateSchema)) {
    const templateSchema = arg.templateSchema as BarcodeSchema;
    await drawInputByBarcodeSchema({ ...arg, templateSchema });
  }
};

export const drawEmbeddedPage = (arg: {
  page: PDFPage;
  embeddedPage: PDFEmbeddedPage;
  embedPdfBox: EmbedPdfBox;
}) => {
  const { page, embeddedPage, embedPdfBox } = arg;
  page.drawPage(embeddedPage);
  const { mediaBox: mb, bleedBox: bb, trimBox: tb } = embedPdfBox;
  page.setMediaBox(mb.x, mb.y, mb.width, mb.height);
  page.setBleedBox(bb.x, bb.y, bb.width, bb.height);
  page.setTrimBox(tb.x, tb.y, tb.width, tb.height);
};
