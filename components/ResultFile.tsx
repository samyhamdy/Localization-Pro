import React from 'react';
import { GeneratedFile } from '../types';
import { FileJsonIcon } from './icons/FileJsonIcon';
import { FileDartIcon } from './icons/FileDartIcon';
import { DownloadIcon } from './icons/DownloadIcon';

interface ResultFileProps {
  file: GeneratedFile;
  onDownload: (file: GeneratedFile) => void;
}

const getFileIcon = (filename: string) => {
  if (filename.endsWith('.json')) {
    return <FileJsonIcon className="h-8 w-8 text-sky-400" />;
  }
  if (filename.endsWith('.dart')) {
    return <FileDartIcon className="h-8 w-8 text-teal-400" />;
  }
  return null;
};

export const ResultFile: React.FC<ResultFileProps> = ({ file, onDownload }) => {
  return (
    <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 flex items-center justify-between hover:bg-slate-700 transition-colors duration-200">
      <div className="flex items-center space-x-4 min-w-0">
        {getFileIcon(file.filename)}
        <span className="font-mono text-slate-300 truncate" title={file.filename}>
          {file.filename}
        </span>
      </div>
      <button 
        onClick={() => onDownload(file)} 
        className="p-2 rounded-full bg-slate-600 hover:bg-sky-600 transition-colors duration-200"
        aria-label={`Download ${file.filename}`}
      >
        <DownloadIcon className="h-5 w-5 text-white" />
      </button>
    </div>
  );
};