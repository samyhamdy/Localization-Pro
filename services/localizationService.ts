import { GoogleGenAI, Type } from '@google/genai';
import { type TranslationPair, type GeneratedFile } from '../types';

declare global {
  interface Window {
    pdfjsWorker: string;
    pdfjsLib: any;
    JSZip: any;
  }
}

type ProgressCallback = (message: string, percentage?: number) => void;

// Helper to quickly get page count for UI feedback
export const getPdfPageCount = async (file: File): Promise<number> => {
    if (typeof window.pdfjsLib === 'undefined') {
        throw new Error('pdf.js library is not loaded.');
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.pdfjsWorker;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
};


// Helper to extract text directly from PDF. Works only for text-based PDFs.
const extractTextFromPdf = async (file: File): Promise<string[]> => {
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error('pdf.js library is not loaded. Please check index.html.');
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.pdfjsWorker;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const uniqueTexts = new Set<string>();

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    textContent.items.forEach((item: any) => {
      const trimmedText = item.str.trim();
      if (trimmedText.length > 1) {
        uniqueTexts.add(trimmedText);
      }
    });
  }

  return Array.from(uniqueTexts);
};

// Helper to generate keys and translations from an array of text strings.
const generateKeysAndTranslations = async (texts: string[]): Promise<TranslationPair[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Given the following list of text strings extracted from a UI design, perform the following tasks:
    1. For each unique piece of text, generate a meaningful, concise, and unique localization key in snake_case.
    2. For each key, provide both the English and Arabic translations.
       - If the original text is in English, provide it as 'en_text' and translate it to get 'ar_text'.
       - If the original text is in Arabic, provide it as 'ar_text' and translate it to get 'en_text'.
       - If the original text is in another language, translate it to both English ('en_text') and Arabic ('ar_text').
    3. The final output must be a valid JSON array of objects.
    Example input: ["Hello World", "مرحباً بالعالم", "Submit"]
    Example output:
    [
        {"key": "hello_world", "en_text": "Hello World", "ar_text": "مرحباً بالعالم"},
        {"key": "submit_button", "en_text": "Submit", "ar_text": "إرسال"}
    ]
    Ensure that strings with the same meaning are consolidated under a single key.
    Here is the list of strings to process:
    ${JSON.stringify(texts)}
    `;

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING },
              en_text: { type: Type.STRING },
              ar_text: { type: Type.STRING },
            },
            required: ['key', 'en_text', 'ar_text'],
          },
        },
      },
    });
  } catch (e) {
    console.error("Gemini API call failed (text-based):", e);
    if (e instanceof Error && (e.message.includes('Rpc failed') || /\[5\d{2}\]/.test(e.message))) {
      throw new Error("API call failed. Check your API key and billing status. This may also be a temporary Google Cloud issue.");
    }
    throw new Error("An unknown error occurred while generating translations.");
  }

  try {
    const jsonString = response.text.trim();
    return JSON.parse(jsonString) as TranslationPair[];
  } catch (e) {
    console.error("Failed to parse AI response:", response.text);
    throw new Error("The AI returned an invalid response. Please try again.");
  }
};

// Helper function to render PDF pages to base64 image strings
const convertPdfPagesToImageParts = async (file: File, onProgress: ProgressCallback): Promise<{ data: string; mimeType: string }[]> => {
    if (typeof window.pdfjsLib === 'undefined') throw new Error('pdf.js library is not loaded.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.pdfjsWorker;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const imageParts: { data: string; mimeType: string }[] = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not create canvas context for rendering PDF.");

    for (let i = 1; i <= pdf.numPages; i++) {
        const progressPercentage = Math.round((i / pdf.numPages) * 30); // Conversion is ~30% of the work
        onProgress(`Converting page ${i}/${pdf.numPages} to image...`, progressPercentage);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR quality
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = dataUrl.split(',')[1];
        if (base64Data) {
            imageParts.push({ data: base64Data, mimeType: 'image/jpeg' });
        }
    }
    canvas.remove();
    return imageParts;
};

// OCR Fallback: generate keys and translations from PDF images in parallel.
const generateLocalizationFromPdfImages = async (file: File, onProgress: ProgressCallback): Promise<TranslationPair[]> => {
    const imageParts = await convertPdfPagesToImageParts(file, onProgress);
    if (imageParts.length === 0) {
        throw new Error("Could not convert PDF to images for OCR processing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
    Given the following UI design image, perform the following tasks:
    1. Identify and extract all visible text strings from the image.
    2. For each unique piece of text, generate a meaningful, concise, and unique localization key in snake_case.
    3. For each key, provide both the English and Arabic translations.
      - If the original text is in English, provide it as 'en_text' and translate it to get 'ar_text'.
      - If the original text is in Arabic, provide it as 'ar_text' and translate it to get 'en_text'.
      - If the original text is in another language, translate it to both English ('en_text') and Arabic ('ar_text').
    4. The final output must be a valid JSON array of objects. Do not include any text that isn't part of the UI. If no text is found, return an empty array.
    Example output structure:
    [
        {"key": "welcome_message", "en_text": "Welcome back!", "ar_text": "مرحبا بعودتك!"}
    ]
    Process the text in the image and return only the JSON output.`;

    const processPage = async (imagePart: { data: string; mimeType: string }, index: number): Promise<TranslationPair[]> => {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }, { inlineData: imagePart }] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                key: { type: Type.STRING },
                                en_text: { type: Type.STRING },
                                ar_text: { type: Type.STRING },
                            },
                            required: ['key', 'en_text', 'ar_text'],
                        },
                    },
                },
            });

            const jsonString = response.text.trim();
            return JSON.parse(jsonString) as TranslationPair[];
        } catch (e) {
            // Re-throw critical auth/billing errors to fail the entire batch fast.
            if (e instanceof Error && (e.message.includes('Rpc failed') || /\[5\d{2}\]/.test(e.message) || e.message.includes('API key'))) {
                 throw new Error("API call failed. Check your API key and billing status. This may also be a temporary Google Cloud issue.");
            }
            // For other, non-critical errors, just warn and return an empty array.
            console.warn(`Failed to process page ${index + 1} via OCR. Skipping page.`, e);
            return [];
        }
    };

    const BATCH_SIZE = 5; // Process in smaller chunks to avoid rate limiting
    const allTranslations: TranslationPair[] = [];
    const ocrStartProgress = 30;
    const ocrEndProgress = 90;
    const ocrProgressRange = ocrEndProgress - ocrStartProgress;

    for (let i = 0; i < imageParts.length; i += BATCH_SIZE) {
        const batch = imageParts.slice(i, i + BATCH_SIZE);
        const batchStartIndex = i;

        const progress = ocrStartProgress + (batchStartIndex / imageParts.length) * ocrProgressRange;
        onProgress(
            `Processing OCR on pages ${batchStartIndex + 1}-${Math.min(batchStartIndex + BATCH_SIZE, imageParts.length)}...`,
            Math.round(progress)
        );
        
        const batchPromises = batch.map((part, indexInBatch) => 
            processPage(part, batchStartIndex + indexInBatch)
        );

        try {
            const batchResults = await Promise.all(batchPromises);
            allTranslations.push(...batchResults.flat());
        } catch (e) {
            console.error("A critical error occurred during a batch process:", e);
            throw e; // Re-throw to stop the entire operation
        }
    }
    
    onProgress('Consolidating results...', 90);
    
    // De-duplicate results from all pages
    const uniqueTranslations = new Map<string, TranslationPair>();
    allTranslations.forEach(item => {
        const uniqueKey = item.en_text.trim().toLowerCase() || item.ar_text.trim();
        if (uniqueKey && !uniqueTranslations.has(uniqueKey)) {
            uniqueTranslations.set(uniqueKey, item);
        }
    });

    return Array.from(uniqueTranslations.values());
};


// Helper to generate final Flutter files from structured data.
const generateFlutterFiles = (data: TranslationPair[]): GeneratedFile[] => {
  const enTranslations: Record<string, string> = {};
  const arTranslations: Record<string, string> = {};
  const allKeys = new Set<string>();

  data.forEach(item => {
    enTranslations[item.key] = item.en_text;
    arTranslations[item.key] = item.ar_text;
    allKeys.add(item.key);
  });
  
  const sortedKeys = Array.from(allKeys).sort();

  const localeKeysContent = `// DO NOT EDIT. This is code generated via package:easy_localization/generate.dart\n\nabstract class  LocaleKeys {\n${sortedKeys.map(key => `  static const ${key} = '${key}';`).join('\n')}\n\n}\n`;

  const arMapString = JSON.stringify(arTranslations, null, 2);
  const enMapString = JSON.stringify(enTranslations, null, 2);

  const codegenLoaderContent = `// DO NOT EDIT. This is code generated via package:easy_localization/generate.dart

// ignore_for_file: prefer_single_quotes, avoid_renaming_method_parameters, constant_identifier_names

import 'dart:ui';

import 'package:easy_localization/easy_localization.dart' show AssetLoader;

class CodegenLoader extends AssetLoader{
  const CodegenLoader();

  @override
  Future<Map<String, dynamic>?> load(String path, Locale locale) {
    return Future.value(mapLocales[locale.toString()]);
  }

  static const Map<String,dynamic> _ar = ${arMapString};
  static const Map<String,dynamic> _en = ${enMapString};
  static const Map<String, Map<String,dynamic>> mapLocales = {"ar": _ar, "en": _en};
}
`;

  return [
    { filename: 'ar.json', content: JSON.stringify(arTranslations, null, 2) },
    { filename: 'en.json', content: JSON.stringify(enTranslations, null, 2) },
    { filename: 'locale_keys.g.dart', content: localeKeysContent },
    { filename: 'codegen_loader.dart', content: codegenLoaderContent },
  ];
};

// Main service function orchestrating the entire process.
export const processPdfForLocalization = async (file: File, onProgress: ProgressCallback): Promise<GeneratedFile[]> => {
  onProgress('Extracting text from PDF...', 5);
  const texts = await extractTextFromPdf(file);
  
  let localizationData: TranslationPair[];

  if (texts.length > 5) { // Use text extraction if it finds a reasonable amount of text
    onProgress('Generating keys & translations...', 50);
    localizationData = await generateKeysAndTranslations(texts);
  } else {
    onProgress('Text extraction insufficient. Starting OCR process...', 10);
    localizationData = await generateLocalizationFromPdfImages(file, onProgress);
  }

  if (localizationData.length === 0) {
    throw new Error("No localizable text was found in the PDF. The file might be empty or contain only images with no recognizable text.");
  }

  onProgress('Constructing Flutter files...', 95);
  return generateFlutterFiles(localizationData);
};