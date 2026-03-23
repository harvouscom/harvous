import React, { useState } from 'react';

interface CounterProps {
  initialValue?: number;
  label?: string;
}

export default function Counter({ initialValue = 0, label = "Counter" }: CounterProps) {
  const [count, setCount] = useState(initialValue);

  return (
    <div className="panel" style={{ padding: '1rem', borderColor: 'var(--color-gray)' }}>
      <h3 className="text-subtitle" style={{ marginBottom: '0.5rem' }}>{label}</h3>
      <div className="flex-row" style={{ gap: '1rem' }}>
        <button
          onClick={() => setCount(count - 1)}
          className="btn btn--sm btn--danger"
        >
          -
        </button>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, minWidth: '3rem', textAlign: 'center' }}>{String(count ?? 0)}</span>
        <button
          onClick={() => setCount(count + 1)}
          className="btn btn--sm btn--primary"
        >
          +
        </button>
      </div>
      <button
        onClick={() => setCount(initialValue)}
        className="btn btn--sm btn--secondary"
        style={{ marginTop: '0.5rem' }}
      >
        Reset
      </button>
    </div>
  );
}
