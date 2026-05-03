export default function PrototypeSpaceIndexPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <p className="proto-title-md" style={{ marginBottom: 8 }}>
        Select a note
      </p>
      <p className="proto-caption" style={{ maxWidth: 320 }}>
        Choose a note from the list, or create a new one.
      </p>
    </div>
  );
}
