'use client';

import { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeTab {
  readonly language: string;
  readonly title: string;
  readonly code: string;
}

interface CodeBlockProps {
  readonly tabs: readonly CodeTab[];
}

const languageColors: Record<string, string> = {
  javascript: 'text-yellow-400',
  typescript: 'text-blue-400',
  python: 'text-green-400',
  go: 'text-cyan-400',
  bash: 'text-gray-400',
  json: 'text-orange-400',
};

function highlightLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;

  const commentMatch = line.match(/^(\s*)(\/\/.*|#.*)$/);
  if (commentMatch) {
    parts.push(
      <span key={key++}>{commentMatch[1]}</span>,
      <span key={key++} className="text-gray-500 italic">{commentMatch[2]}</span>,
    );
    return parts;
  }

  const stringRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>
          {highlightKeywords(line.slice(lastIndex, match.index))}
        </span>,
      );
    }
    parts.push(
      <span key={key++} className="text-emerald-400">{match[0]}</span>,
    );
    lastIndex = stringRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(
      <span key={key++}>
        {highlightKeywords(line.slice(lastIndex))}
      </span>,
    );
  }

  return parts.length > 0 ? parts : line;
}

function highlightKeywords(text: string): React.ReactNode {
  const keywords =
    /\b(const|let|var|function|async|await|return|import|from|export|default|if|else|for|while|class|new|try|catch|throw|def|func|package|fmt|go|err|nil|print|range|type|struct|interface|require)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = keywords.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={key++} className="text-purple-400 font-medium">{match[0]}</span>,
    );
    lastIndex = keywords.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

export default function CodeBlock({ tabs }: CodeBlockProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeCode = tabs[activeTab];

  const handleCopy = useCallback(async () => {
    if (!activeCode) return;
    await navigator.clipboard.writeText(activeCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeCode]);

  if (!activeCode) return null;

  const lines = activeCode.code.split('\n');
  const colorClass = languageColors[activeCode.language] ?? 'text-gray-300';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-1">
        <div className="flex">
          {tabs.map((tab, i) => (
            <button
              key={tab.language}
              type="button"
              onClick={() => { setActiveTab(i); setCopied(false); }}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                i === activeTab
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mr-2 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <pre className={`text-sm leading-relaxed ${colorClass}`}>
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-6 inline-block w-8 select-none text-right text-gray-600">
                  {i + 1}
                </span>
                <span>{highlightLine(line)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
