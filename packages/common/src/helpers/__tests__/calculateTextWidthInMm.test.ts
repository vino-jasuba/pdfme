import * as fontkit from 'fontkit';
import { PDFDocument, PDFFont } from '@pdfme/pdf-lib';
import { calculateTextWidthInMm } from '../calculateTextWidthInMm';
import { HELVETICA } from "../../constants"

describe('calculateTextWidthInMm', () => {
  let font: PDFFont;

  beforeAll(async () => {
    const doc = await PDFDocument.create();

    doc.registerFontkit(fontkit);
    font = await doc.embedFont(HELVETICA);
  });

  it('returns the correct width for a simple string', () => {
    const textContent = 'Hello, world!';
    const textFontSize = 12;
    const textCharacterSpacing = 0;

    const width = calculateTextWidthInMm(textContent, textFontSize, font, textCharacterSpacing);

    expect(width).toBe(23.139414575999997);
  });

  it('accounts for character spacing', () => {
    const textContent = 'Hello, world!';
    const textFontSize = 12;
    const textCharacterSpacing = 1;

    const width = calculateTextWidthInMm(textContent, textFontSize, font, textCharacterSpacing);

    expect(width).toBe(27.372750575999998);
  });

  it('returns 0 for an empty string', () => {
    const textContent = '';
    const textFontSize = 12;
    const textCharacterSpacing = 0;

    const width = calculateTextWidthInMm(textContent, textFontSize, font, textCharacterSpacing);

    expect(width).toBe(0);
  });
});
