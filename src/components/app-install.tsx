'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function AppInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    setInstalled(matchMedia('(display-mode: standalone)').matches);
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  if (installed) return null;
  return (
    <div className="install-widget">
      <button
        className="button small"
        onClick={async () => {
          if (!prompt) {
            setHelp(!help);
            return;
          }
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        <Download size={15} /> Install app
      </button>
      {help && (
        <div className="install-help">
          In Chrome, open the menu → Cast, save and share → Install page as app. On mobile, choose
          Add to Home screen. Live quizzes require internet.
        </div>
      )}
    </div>
  );
}
