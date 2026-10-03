'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
          theme: string;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}
export function Captcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !window.turnstile || !ref.current) return;
    const id = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      callback: onToken,
      'expired-callback': () => onToken(''),
      'error-callback': () => onToken(''),
      theme: 'light',
    });
    return () => window.turnstile?.remove(id);
  }, [ready, siteKey, onToken]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
      />
      <div ref={ref} className="captcha-widget" />
    </>
  );
}
