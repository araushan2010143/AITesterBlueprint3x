'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ContentRow } from '../lib/types';

interface Props {
  row: ContentRow | null;
}

type TabId = 'linkedin' | 'medium' | 'instagram' | 'youtube' | 'devto';

const TABS: { id: TabId; label: string; field: keyof ContentRow; imageField?: keyof ContentRow }[] = [
  { id: 'linkedin', label: 'LinkedIn', field: 'linkedinPost', imageField: 'linkedinImage' },
  { id: 'medium', label: 'Medium', field: 'mediumArticle', imageField: 'mediumImage' },
  { id: 'instagram', label: 'Instagram', field: 'igScript', imageField: 'igImage' },
  { id: 'youtube', label: 'YouTube', field: 'ytScript' },
  { id: 'devto', label: 'Dev.to', field: 'devtoArticle' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-ghost text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function ContentTabs({ row }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('linkedin');

  if (!row) {
    return (
      <div className="card text-center py-16 text-slate-500">
        No content for today yet. Click &quot;Run Now&quot; to generate.
      </div>
    );
  }

  const active = TABS.find((t) => t.id === activeTab)!;
  const content = row[active.field] as string;
  const imageUrl = active.imageField ? (row[active.imageField] as string) : '';

  return (
    <div className="card">
      <div className="flex gap-0 border-b border-slate-700 mb-4 -mx-4 px-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab whitespace-nowrap ${activeTab === tab.id ? 'tab-active' : 'tab-inactive'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {imageUrl && (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${active.label} image`}
            className="rounded-lg max-h-64 object-cover w-full"
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-slate-300 text-sm font-medium">{active.label} Content</h3>
        {content && <CopyButton text={content} />}
      </div>

      {content ? (
        <div className="prose prose-invert prose-sm max-w-none overflow-auto max-h-[600px] text-slate-300 leading-relaxed">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-slate-500 text-sm italic">Not generated yet.</p>
      )}
    </div>
  );
}
