import ClassicAuthLogo from './ClassicAuthLogo';

/** Left/top mesh column shared by classic app sign-in and sign-up. */
export default function ClassicAuthMeshColumn() {
  return (
    <div className="auth-page__video-section thread-colors-mesh-gradient">
      <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
        <ClassicAuthLogo />
      </div>
    </div>
  );
}
