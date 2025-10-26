import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { type GeneratedFile } from './types';
import { processPdfForLocalization, getPdfPageCount } from './services/localizationService';
import { UploadIcon } from './components/icons/UploadIcon';
import { DownloadIcon } from './components/icons/DownloadIcon';
import { ZipIcon } from './components/icons/ZipIcon';
import { ProgressBar } from './components/ProgressBar';
import { FilePreview } from './components/FilePreview';
import { ResultFile } from './components/ResultFile';

declare global {
  // FIX: Resolve global type conflict for window.aistudio.
  // The original anonymous type for `aistudio` conflicted with another declaration expecting the type `AIStudio`.
  // This defines (or merges with an existing) `AIStudio` interface and applies it to `window.aistudio` to ensure type consistency.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [progress, setProgress] = useState({ message: '', percentage: 0 });
  const [isKeyReady, setIsKeyReady] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        setIsKeyReady(await window.aistudio.hasSelectedApiKey());
      } else {
        // If the aistudio object doesn't exist, we might be in an environment
        // where the key is injected directly. Assume ready and let Gemini call fail if not.
        setIsKeyReady(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success and update UI immediately to avoid race conditions
      setIsKeyReady(true);
      setError(null);
    }
  };

  const resetState = () => {
    setFile(null);
    setPageCount(0);
    setError(null);
    setGeneratedFiles([]);
    setProgress({ message: '', percentage: 0 });
    if(fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (selectedFile: File | null) => {
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please upload a valid PDF file.');
        resetState();
      } else {
        resetState();
        setFile(selectedFile);
        try {
          const count = await getPdfPageCount(selectedFile);
          setPageCount(count);
        } catch (e) {
          setError("Could not read PDF metadata.");
          resetState();
        }
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.target.files?.[0] || null);
  };
  
  const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isEntering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    handleDragEvents(e, false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleProcessClick = useCallback(async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedFiles([]);
    setProgress({ message: 'Initializing...', percentage: 0 });

    try {
      const onProgress = (message: string, percentage?: number) => {
        setProgress(prev => ({ message, percentage: percentage ?? prev.percentage }));
      };
      const files = await processPdfForLocalization(file, onProgress);
      setGeneratedFiles(files);
      setProgress({ message: 'Completed!', percentage: 100 });
    } catch (err) {
      console.error(err);
      if (err instanceof Error && (err.message.includes('API key') || err.message.includes('Requested entity was not found'))) {
          setError("Your API key is not valid. Please select a new one to continue.");
          setIsKeyReady(false);
      } else {
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [file]);
  
  const handleDownload = (fileToDownload: GeneratedFile) => {
    const blob = new Blob([fileToDownload.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileToDownload.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadAll = async () => {
    const zip = new JSZip();
    generatedFiles.forEach(file => {
      zip.file(file.filename, file.content);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'localization_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isKeyReady) {
    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-xl text-center bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl shadow-2xl shadow-slate-950/50 p-8">
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-500 mb-4">
                    API Key Required
                </h1>
                <p className="text-slate-400 mb-6">
                    This tool requires a Gemini API key to function. Please select an active API key to proceed.
                    <br />
                    For more details, see the{' '}
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                        billing documentation
                    </a>.
                </p>
                {error && <p className="text-red-400 bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 mb-6 text-sm">{error}</p>}
                <button
                    onClick={handleSelectKey}
                    className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75"
                >
                    Select API Key
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-500">
            101 localization Extractor
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Export from Figma to Flutter localization files in seconds.
          </p>
        </header>

        <main className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl shadow-2xl shadow-slate-950/50 p-6 sm:p-8 space-y-8">
          
          {!file && (
            <label 
              htmlFor="file-upload" 
              className={`w-full cursor-pointer bg-slate-700/50 hover:bg-slate-700 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${isDragging ? 'border-sky-500 scale-105 shadow-lg' : 'border-slate-600 hover:border-sky-500'}`}
              onDragEnter={(e) => handleDragEvents(e, true)}
              onDragLeave={(e) => handleDragEvents(e, false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <UploadIcon className="h-12 w-12 mx-auto text-slate-500 mb-4" />
              <span className="text-slate-300 font-semibold block">
                Click to upload or drag & drop
              </span>
              <span className="text-slate-500 text-sm mt-1 block">PDF exported from Figma</span>
              <input ref={fileInputRef} id="file-upload" type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </label>
          )}

          {file && (
            <FilePreview file={file} pageCount={pageCount} onClear={resetState} />
          )}

          {error && <p className="text-red-400 bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-center text-sm">{error}</p>}

          {file && !isLoading && generatedFiles.length === 0 && (
            <div className="flex justify-center">
              <button
                onClick={handleProcessClick}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75"
              >
                Generate Files
              </button>
            </div>
          )}

          {isLoading && <ProgressBar message={progress.message} percentage={progress.percentage} />}
          
          {generatedFiles.length > 0 && !isLoading && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-2xl font-bold text-slate-300">Generated Files</h2>
                 <button onClick={handleDownloadAll} className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:scale-105 transition-all duration-300">
                    <ZipIcon className="h-5 w-5" />
                    <span>Download All (.zip)</span>
                 </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {generatedFiles.map((genFile, index) => (
                  <ResultFile key={index} file={genFile} onDownload={handleDownload} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;