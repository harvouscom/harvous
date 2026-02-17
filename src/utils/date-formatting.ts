export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();

  // Handle future timestamps (negative diff) - treat as "Just now"
  // This can happen due to clock skew between server and client
  if (diffInMs < 0) {
    return "Just now";
  }

  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays > 30) {
    // Use hard-coded month names instead of toLocaleDateString to avoid iOS PWA
    // ignoring the 'en-US' locale hint and returning unexpected formats.
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  } else if (diffInDays > 0) {
    return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
  } else if (diffInHours > 0) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
  } else if (diffInMinutes > 0) {
    return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}
