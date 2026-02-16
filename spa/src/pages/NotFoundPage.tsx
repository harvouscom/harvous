import { useRouter } from '@tanstack/react-router';

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '60vh',
        gap: '1.5rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--color-deep-grey)',
          margin: 0,
        }}
      >
        Page not found
      </h1>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--color-stone-grey)',
          margin: 0,
          maxWidth: '320px',
        }}
      >
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <button
        className="btn btn--sm btn--primary"
        onClick={() => router.navigate({ to: '/' })}
      >
        Go home
      </button>
    </div>
  );
}
