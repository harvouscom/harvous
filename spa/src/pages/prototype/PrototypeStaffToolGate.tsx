/**
 * What a church staff tool shows before it knows the viewer may use it. Without this the
 * expanded tools rendered an empty column while the role check loaded — or forever, when it
 * failed — which reads as a broken page rather than a wait or a refusal.
 */
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';

export default function PrototypeStaffToolGate({
  loading,
  error,
  onRetry,
  toolName,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** "Content", "Ministries" … for the refusal line. */
  toolName: string;
}) {
  if (loading) return <ProtoSpaceLoading label={`Loading ${toolName.toLowerCase()}`} />;
  return (
    <div className="proto-church-review__body proto-church-review__body--empty">
      {error ? (
        <PrototypeListEmptyState
          iconName="circle-exclamation"
          title="Couldn’t check your role"
          description="Harvous couldn’t confirm you’re on this church’s staff just now."
          action={
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={onRetry}>
              Try again
            </button>
          }
        />
      ) : (
        <PrototypeListEmptyState
          iconName="lock"
          title={`${toolName} is for church staff`}
          description="Ask an admin at your church to add you to the team."
        />
      )}
    </div>
  );
}
