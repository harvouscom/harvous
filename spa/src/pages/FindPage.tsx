import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';

export default function FindPage() {
  return (
    <div className="find-page">
      <FindSearchInput />
      <RecentSearches />
    </div>
  );
}
