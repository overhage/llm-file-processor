'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Something went wrong</h1>
      <p style={{ whiteSpace: 'pre-wrap' }}>{error?.message ?? 'Unknown error'}</p>
      <button onClick={() => reset()}>Try again</button>
    </main>
  );
}
