import React, { useEffect, useRef } from 'react';

interface FilePreviewProps {
  file: File;
  pageCount: number;
  onClear: () => void;
}

declare const pdfjsLib: any;

export const FilePreview: React.FC<FilePreviewProps> = ({ file, pageCount, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (file && canvasRef.current) {
      const renderPdf = async () => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1); // Render first page
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          if (context) {
            await page.render({ canvasContext: context, viewport: viewport }).promise;
          }
        }
      };
      renderPdf().catch(console.error);
    }
  }, [file]);

  return (
    <div className="w-full bg-slate-700/50 border border-slate-600 rounded-xl p-4 flex items-center space-x-4 animate-fade-in">
      <div className="flex-shrink-0">
        <canvas ref={canvasRef} className="rounded-md w-20 h-28 bg-slate-800 shadow-md"></canvas>
      </div>
      <div className="flex-grow min-w-0">
        <p className="font-semibold text-slate-200 truncate" title={file.name}>
          {file.name}
        </p>
        <p className="text-sm text-slate-400">
          {pageCount} page{pageCount > 1 ? 's' : ''}
        </p>
      </div>
      <button 
        onClick={onClear} 
        className="flex-shrink-0 text-slate-400 hover:text-red-400 transition-colors duration-200 p-2"
        aria-label="Remove file"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </button>
    </div>
  );
};