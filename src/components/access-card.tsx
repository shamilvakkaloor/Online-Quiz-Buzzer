'use client';
import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';
export function AccessCardDownload({
  title,
  label,
  code,
  link,
}: {
  title: string;
  label: string;
  code: string;
  link: string;
}) {
  const qr = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const svg = qr.current?.querySelector('svg');
      if (!svg) throw Error('QR unavailable');
      const data = new Blob([new XMLSerializer().serializeToString(svg)], {
        type: 'image/svg+xml',
      });
      const source = URL.createObjectURL(data);
      try {
        const img = new Image();
        img.src = source;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1600;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#f6f8ee';
        c.fillRect(0, 0, 1200, 1600);
        c.fillStyle = '#243d32';
        c.fillRect(0, 0, 1200, 390);
        c.fillStyle = '#d7f486';
        c.font = 'bold 78px Arial';
        c.fillText('buzzer.', 90, 145);
        c.font = '22px Arial';
        c.fillText('QUICK THINKING. GOOD TIMES.', 92, 200);
        const text = (value: string, y: number, size: number, color: string) => {
          c.fillStyle = color;
          let n = size;
          do {
            c.font = `bold ${n--}px Arial`;
          } while (c.measureText(value).width > 1020 && n > 16);
          c.fillText(value, 90, y);
        };
        text(title, 310, 48, '#ffffff');
        text(label, 495, 52, '#243d32');
        c.fillStyle = '#ffffff';
        c.fillRect(250, 560, 700, 700);
        c.drawImage(img, 285, 595, 630, 630);
        text(code, 1360, 65, '#243d32');
        c.fillStyle = '#526357';
        c.font = '28px Arial';
        c.fillText('Scan to join · or enter your access code', 90, 1430);
        c.font = '23px Arial';
        c.fillText(new URL(link).host, 90, 1490);
        c.font = '20px Arial';
        c.fillText('Keep this card with its intended player or role.', 90, 1550);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(Error('Export failed'))), 'image/png'),
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buzzer-${label.replace(/[^a-z0-9]/gi, '-')}-${code}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } finally {
        URL.revokeObjectURL(source);
      }
    } catch {
      setError('Card could not be downloaded. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div ref={qr} hidden>
        <QRCodeSVG value={link} size={630} marginSize={4} level="M" />
      </div>
      <button
        type="button"
        className="button small"
        disabled={busy}
        onClick={() => void download()}
      >
        <Download size={16} />
        {busy ? 'Preparing…' : 'Download QR card'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
