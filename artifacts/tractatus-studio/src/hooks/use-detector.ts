import { useEffect, useRef, useState } from 'react';
import { useDetectText } from '@workspace/api-client-react';

export const MIN_DETECT = 250;

export type DetectState =
  | { kind: 'idle' }
  | { kind: 'short'; length: number }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | {
      kind: 'done';
      probability: number;
      classification: string;
      message: string;
      analyzed: number;
      total: number;
    };

export function useDetector(text: string, streaming: boolean): DetectState {
  const [state, setState] = useState<DetectState>({ kind: 'idle' });
  const detect = useDetectText();
  const mutateRef = useRef(detect.mutateAsync);
  mutateRef.current = detect.mutateAsync;

  useEffect(() => {
    let stale = false;
    if (streaming) {
      setState({ kind: 'idle' });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setState({ kind: 'idle' });
      return;
    }
    if (trimmed.length < MIN_DETECT) {
      setState({ kind: 'short', length: trimmed.length });
      return;
    }
    setState({ kind: 'checking' });
    const t = setTimeout(() => {
      mutateRef
        .current({ data: { text } })
        .then((r) => {
          if (stale) return;
          setState({
            kind: 'done',
            probability: r.aiProbability,
            classification: r.classification,
            message: r.message,
            analyzed: r.analyzedCharacters,
            total: r.totalCharacters,
          });
        })
        .catch((e: unknown) => {
          if (stale) return;
          setState({
            kind: 'error',
            message: e instanceof Error ? e.message : 'Detection failed',
          });
        });
    }, 1200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [text, streaming]);

  return state;
}
