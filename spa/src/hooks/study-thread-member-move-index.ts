/** Map drag-over insertBeforeIndex (handle below row i → i + 1) to a new array index. */
export function computeStudyThreadMemberMoveIndex(
  fromIndex: number,
  insertBeforeIndex: number,
): number | null {
  if (fromIndex === insertBeforeIndex) {
    return insertBeforeIndex > 0 ? insertBeforeIndex - 1 : null;
  }
  let toIndex = insertBeforeIndex;
  if (fromIndex < toIndex) toIndex -= 1;
  if (fromIndex === toIndex) return null;
  return toIndex;
}
