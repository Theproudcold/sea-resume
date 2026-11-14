declare module 'fontkit' {
  export interface FontkitGlyph {
    id: number;
  }

  export interface FontkitSubset {
    glyphs: number[];
    includeGlyph(glyph: FontkitGlyph | number): number;
    encode(): Uint8Array;
  }

  export interface FontkitFont {
    glyphForCodePoint(codePoint: number): FontkitGlyph;
    createSubset(): FontkitSubset;
  }

  export function create(buffer: Uint8Array | Buffer, postscriptName?: string): FontkitFont;
}
