import React from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import CardThread from './CardThread';

interface OrganizedContentItem {
  id: string;
  type: 'thread' | 'note';
  title: string;
  content?: string;
  subtitle?: string;
  count?: number;
  threadId?: string;
  noteId?: string;
  accentColor?: string;
  lastUpdated?: string;
  noteType?: string;
  isPrivate?: boolean;
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes';
}

export default function OrganizedContentList({ 
  initialItems, 
  filter = 'all' 
}: OrganizedContentListProps) {
  const loadMore = async (offset: number, limit: number) => {
    const url = new URL('/api/content/load-more', window.location.origin);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('filter', filter);

    const response = await fetch(url.toString(), {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more content');
    }

    const data = await response.json();
    return {
      items: data.items,
      hasMore: data.hasMore
    };
  };

  const renderItem = (item: OrganizedContentItem, index: number) => {
    const href = item.type === 'thread' 
      ? `/${item.threadId}` 
      : `/${item.noteId}`;

    return (
      <div 
        className={`content-item ${item.type}-item mb-3 card-enter`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <a 
          href={href}
          className="block transition-transform duration-200 hover:scale-[1.002]"
        >
          {item.type === 'note' ? (
            <CardNote 
              title={item.title}
              content={item.content || ''}
              noteType={item.noteType || 'default'}
            />
          ) : (
            <CardThread 
              thread={{
                id: item.threadId || '',
                title: item.title,
                subtitle: item.subtitle,
                count: item.count,
                accentColor: item.accentColor,
                lastUpdated: item.lastUpdated,
                isPrivate: item.isPrivate
              }}
            />
          )}
        </a>
      </div>
    );
  };

  return (
    <InfiniteScrollList
      initialItems={initialItems}
      loadMore={loadMore}
      renderItem={renderItem}
      itemKey={(item) => item.id}
      limit={20}
      className="flex flex-col"
    />
  );
}

