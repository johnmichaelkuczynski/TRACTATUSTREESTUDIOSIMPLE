import { useRef, useState } from 'react';
import { ArrowRight, Eraser, Play, Upload } from 'lucide-react';
import { TextPanel } from '@/components/text-panel';

type Stage = 'tree' | 'variation' | 'prose';
type Key = 'source' | Stage;
const empty: Record<Key, string> = { source: '', tree: '', variation: '', prose: '' };
const from: Record<Stage, Key> = { tree: 'source', variation: 'tree', prose: 'variation' };

const btn =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-input bg-card hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none';
const primary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none';

export default function Home() {
  const [texts, setTexts] = useState(empty);
  const [active, setActive] = useState<Stage | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: Key) => (v: string) => {
    if (active === k) abortRef.current?.abort();
    setTexts((t) => ({ ...t, [k]: v }));
  };

  const stop = () => abortRef.current?.abort();

  const generate = async (stage: Stage) => {
    const input = texts[from[stage]];
    if (!input.trim() || active) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setActive(stage);
    setError('');
    setStatus('Starting');
    setTexts((t) => ({ ...t, [stage]: '' }));
    try {
      const res = await fetch('/api/tractatus/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, text: input }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let finished = false;
      const handle = (line: string) => {
        if (ctrl.signal.aborted) return;
        if (!line.startsWith('data:')) return;
        const raw = line.slice(5).trim();
        if (!raw) return;
        let m: { content?: string; status?: string; done?: boolean; error?: string };
        try {
          m = JSON.parse(raw);
        } catch {
          return;
        }
        if (m.error) throw new Error(m.error);
        if (m.status) setStatus(m.status);
        if (m.content) setTexts((t) => ({ ...t, [stage]: t[stage] + m.content }));
        if (m.done) finished = true;
      };
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(handle);
      }
      if (buf) handle(buf);
      if (!finished && !ctrl.signal.aborted) {
        throw new Error('The connection ended before completion. Partial output is retained; this result is incomplete.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    } finally {
      setActive(null);
      setStatus('');
      abortRef.current = null;
    }
  };

  const upload = async (file: File) => {
    setError('');
    const name = file.name.toLowerCase();
    if (!/\.(txt|md|markdown)$/.test(name) && !file.type.startsWith('text/')) {
      setError(`"${file.name}" is not plain text. PDF and DOCX parsing is not available here; export it as TXT or MD and upload that.`);
      return;
    }
    const text = await file.text();
    if (text.includes('\u0000')) {
      setError(`"${file.name}" looks binary and was not loaded.`);
      return;
    }
    setTexts((t) => ({ ...t, source: text }));
  };

  const clearAll = () => {
    abortRef.current?.abort();
    window.location.reload();
  };

  const gen = (stage: Stage, label: string) => (
    <button
      className={primary}
      onClick={() => generate(stage)}
      disabled={!!active || !texts[from[stage]].trim()}
      data-testid={`button-generate-${stage}`}
    >
      <Play className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 py-6">
          <div>
            <p className="font-mono text-xs text-primary">1. Die Welt ist alles, was der Fall ist.</p>
            <h1 className="font-serif text-4xl font-semibold tracking-tight">Tractatus Tree Studio</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Turn a text into numbered propositions, vary the examples, and return to prose without losing a single step of the argument.
            </p>
          </div>
          <button className={btn} onClick={clearAll} data-testid="button-clear">
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-5 py-6">
        {error && (
          <div className="border border-destructive bg-card px-4 py-2.5 text-sm text-destructive" role="alert" data-testid="text-error">
            {error}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <TextPanel
            id="source" numeral="Box 1" title="Source" hint="Type, paste, or upload TXT / MD."
            placeholder="Paste the text whose complete logical content you want to preserve."
            value={texts.source} onChange={set('source')} streaming={false}
            actions={
              <>
                <input
                  ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden"
                  data-testid="input-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(f);
                  }}
                />
                <button className={btn} onClick={() => fileRef.current?.click()} data-testid="button-upload">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
                {gen('tree', 'Generate tree')}
              </>
            }
          />
          <TextPanel
            id="tree" numeral="Box 2" title="Tractatus tree" hint="Numbered propositions, decimal hierarchy."
            placeholder="The original tree appears here. You may also write or paste one."
            value={texts.tree} onChange={set('tree')} streaming={active === 'tree'} status={status} onStop={stop}
            actions={gen('variation', 'Generate variation')}
          />
          <TextPanel
            id="variation" numeral="Box 3" title="Variation" hint="Same structure, fresh examples."
            placeholder="The variation with new examples appears here."
            value={texts.variation} onChange={set('variation')} streaming={active === 'variation'} status={status} onStop={stop}
            actions={gen('prose', 'Convert to prose')}
          />
          <TextPanel
            id="prose" numeral="Box 4" title="Prose" hint="The variation, rendered as continuous writing."
            placeholder="The prose conversion appears here."
            value={texts.prose} onChange={set('prose')} streaming={active === 'prose'} status={status} onStop={stop}
          />
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Source <ArrowRight className="h-3 w-3" /> tree <ArrowRight className="h-3 w-3" /> variation <ArrowRight className="h-3 w-3" /> prose. Stopping keeps whatever has streamed so far.
        </p>
      </main>
    </div>
  );
}
