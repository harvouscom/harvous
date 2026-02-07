export interface ScriptureDetection {
  isScripture: boolean;
  references: string[];
  confidence: number;
  primaryReference: string | null;
  parsedReference: ParsedScriptureReference | null;
}

export interface ParsedScriptureReference {
  book: string;
  chapter: number;
  verse: number | [number, number];
}

export interface FetchVerseResponse {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  translation: string;
  text: string;
}

export interface CheckExistingParams {
  reference: string;
  threadId?: string;
}

export interface CheckExistingResponse {
  exists: boolean;
  noteId: string | null;
  reference?: string;
  inThread: boolean;
  inUnorganized: boolean;
}
