import { useEffect, useState } from 'react';

interface Ask {
  message: string;
  okLabel: string;
  resolve: (v: boolean) => void;
}

/** Notifications et confirmations intégrées à la page. */
export function Dialogs() {
  const [toast, setToast] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    let timer = 0;
    const onToast = (e: Event) => {
      setToast((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 3500);
    };
    const onAsk = (e: Event) => setAsk((e as CustomEvent<Ask>).detail);
    window.addEventListener('orbit:toast', onToast);
    window.addEventListener('orbit:ask', onAsk);
    return () => {
      window.removeEventListener('orbit:toast', onToast);
      window.removeEventListener('orbit:ask', onAsk);
    };
  }, []);
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <>
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {ask && (
        <div className="sheet-backdrop" onClick={() => close(false)}>
          <div className="sheet ask" onClick={(e) => e.stopPropagation()}>
            <p>{ask.message}</p>
            <div className="ask-row">
              <button type="button" className="btn" onClick={() => close(false)}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={() => close(true)}>
                {ask.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
