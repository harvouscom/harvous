import React, { useState } from 'react';

interface CounterProps {
  initialValue?: number;
  label?: string;
}

export default function Counter({ initialValue = 0, label = "Counter" }: CounterProps) {
  const [count, setCount] = useState(initialValue);

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm" style={{ borderColor: 'var(--color-gray)' }}>
      <h3 className="text-lg font-semibold mb-2">{label}</h3>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCount(count - 1)}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          -
        </button>
        <span className="text-2xl font-bold min-w-[3rem] text-center">{String(count ?? 0)}</span>
        <button
          onClick={() => setCount(count + 1)}
          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          +
        </button>
      </div>
      <button
        onClick={() => setCount(initialValue)}
        className="mt-2 px-3 py-1 text-white rounded transition-colors text-sm"
        style={{ backgroundColor: 'var(--color-stone-grey)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-deep-grey)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-stone-grey)';
        }}
      >
        Reset
      </button>
    </div>
  );
}
