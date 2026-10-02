import { useState, type ReactNode } from 'react';
import { Check, Copy, Square, Trash2 } from 'lucide-react';
import { useDetector } from '@/hooks/use-detector';

interface Props {
  id: string;
  numeral: string;
  title: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  streaming: boolean;
  status?: string;
  onStop?: () => void;
  actions?: ReactNode;
}

const btn =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-input bg-card hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none';

export function TextPanel(p: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const d = useDetector(p.value, p.streaming);

  const copy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(p.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      const area = document.createElement('textarea');
      area.value = p.value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand('copy');
      area.remove();
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      } else {
        setCopyError('Copy failed. Select the text and copy it using your keyboard.');
      }
    }
  };

  return (
    <section className="flex flex-col border border-card-border bg-card" data-testid={`panel-${p.id}`}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="font-mono text-xs text-primary">{p.numeral}</div>
          <h2 className="font-serif text-xl font-semibold leading-tight">{p.title}</h2>
          <p className="text-xs text-muted-foreground">{p.hint}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <button className={btn} onClick={copy} disabled={!p.value} data-testid={`button-copy-${p.id}`}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className={btn} onClick={() => p.onChange('')} disabled={!p.value && !p.streaming} data-testid={`button-delete-${p.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </header>
      {copyError && <p role="alert" className="px-4 py-2 text-xs text-destructive">{copyError}</p>}

      <div className="relative">
        {p.streaming && <div className="streaming-bar absolute inset-x-0 top-0 h-0.5 bg-primary" />}
        <textarea
          aria-label={p.title}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          placeholder={p.placeholder}
          spellCheck={false}
          className="block h-80 w-full resize-y bg-transparent px-4 py-3 font-serif text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:bg-background/50"
          data-testid={`input-${p.id}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        {p.actions}
        {p.streaming && p.onStop && (
          <button className={btn + ' border-destructive text-destructive'} onClick={p.onStop} data-testid={`button-stop-${p.id}`}>
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        )}
        {p.status && p.streaming && (
          <span className="font-mono text-xs text-muted-foreground" data-testid={`text-status-${p.id}`}>{p.status}</span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground" data-testid={`text-count-${p.id}`}>
          {p.value.length.toLocaleString()} chars
        </span>
      </div>

      <div className="border-t border-border bg-muted/50 px-4 py-2.5 text-xs" data-testid={`detect-${p.id}`}>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-primary">Automatic GPTZero analysis</p>
        <Detection d={d} streaming={p.streaming} />
      </div>
    </section>
  );
}

function Detection({ d, streaming }: { d: ReturnType<typeof useDetector>; streaming: boolean }) {
  if (streaming) return <span className="text-muted-foreground">AI check waits until generation finishes.</span>;
  switch (d.kind) {
    case 'idle':
      return <span className="text-muted-foreground">AI check starts once there is text.</span>;
    case 'short':
      return <span className="text-muted-foreground">Too short to check: {d.length} of 250 characters minimum.</span>;
    case 'checking':
      return <span className="text-muted-foreground">Checking for AI-written text...</span>;
    case 'error':
      return <span className="text-destructive">AI check failed: {d.message}</span>;
    case 'done': {
      const pct = d.probability * 100;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              AI probability <span className="font-mono text-base" data-testid="text-ai-probability">{pct.toFixed(1)}%</span>
            </span>
            <span className="text-muted-foreground">{d.classification}</span>
          </div>
          <div className="h-1.5 w-full bg-border">
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="text-muted-foreground">
            {d.message} Analyzed {d.analyzed.toLocaleString()} of {d.total.toLocaleString()} characters. AI detectors give estimates, not proof.
          </p>
        </div>
      );
    }
  }
}
