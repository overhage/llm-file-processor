'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ padding: 24 }}>
        <h1>App Error</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{error.message}</p>
        <button onClick={() => reset()}>Reload</button>
      </body>
    </html>
  );
}
