/**
 * Browser Web Speech API — live interim captions without recording a file.
 * Used on web when available so text appears while the user speaks.
 */

type WebSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: WebSpeechResultEvent) => void) | null;
  onerror: ((ev: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type WebSpeechResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; 0: { transcript: string } };
  };
};

type WebSpeechErrorEvent = { error: string };

type GlobalWithSpeech = typeof globalThis & {
  SpeechRecognition?: new () => WebSpeechRecognition;
  webkitSpeechRecognition?: new () => WebSpeechRecognition;
};

function speechGlobal(): GlobalWithSpeech {
  return globalThis as GlobalWithSpeech;
}

export function isWebSpeechRecognitionSupported(): boolean {
  const g = speechGlobal();
  return Boolean(g.SpeechRecognition || g.webkitSpeechRecognition);
}

function getSpeechCtor(): (new () => WebSpeechRecognition) | undefined {
  const g = speechGlobal();
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

/**
 * Starts live recognition. Call `stop()` to end and receive the best-effort full transcript.
 */
export function createWebSpeechLiveSession(
  onText: (text: string) => void,
  lang = 'en-US',
): { start: () => void; stop: () => Promise<string> } {
  const Ctor = getSpeechCtor();
  if (!Ctor) {
    return {
      start: () => {},
      stop: async () => '',
    };
  }

  let finalized = '';
  let lastInterim = '';
  let recognition: WebSpeechRecognition | null = null;

  const flush = () => {
    onText(`${finalized}${lastInterim}`.trim());
  };

  return {
    start: () => {
      finalized = '';
      lastInterim = '';
      const rec = new Ctor();
      recognition = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;
      rec.maxAlternatives = 1;

      rec.onresult = (event: WebSpeechResultEvent) => {
        lastInterim = '';
        let newFinal = finalized;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const row = event.results[i];
          const piece = row[0]?.transcript ?? '';
          if (row.isFinal) newFinal += piece;
          else lastInterim += piece;
        }
        finalized = newFinal;
        flush();
      };

      rec.onerror = () => {
        /* onend still runs for many errors */
      };

      try {
        rec.start();
      } catch {
        recognition = null;
      }
    },

    stop: () =>
      new Promise(resolve => {
        const r = recognition;
        if (!r) {
          resolve(`${finalized}${lastInterim}`.trim());
          return;
        }
        let settled = false;
        const out = () => `${finalized}${lastInterim}`.trim();
        const done = () => {
          if (settled) return;
          settled = true;
          recognition = null;
          resolve(out());
        };
        const tid = globalThis.setTimeout(done, 2500);
        const doneOnce = () => {
          globalThis.clearTimeout(tid);
          done();
        };
        r.onend = doneOnce;
        r.onerror = doneOnce;
        try {
          r.stop();
        } catch {
          doneOnce();
        }
      }),
  };
}
