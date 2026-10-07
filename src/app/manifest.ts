import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Buzzer — Live Quiz',
    short_name: 'Buzzer',
    description: 'Your live quiz, ready to play.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8f2',
    theme_color: '#243d32',
    icons: [192, 512].map((size) => ({
      src: `/icons/buzzer-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
    shortcuts: [
      ['Play', '/join'],
      ['Quizmaster', '/quizmaster'],
      ['Scorekeeper', '/scorekeeper'],
      ['Audience', '/audience'],
      ['Admin', '/admin'],
    ].map(([name, url]) => ({ name, url })),
  };
}
