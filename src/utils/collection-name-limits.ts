/**
 * How long a folder or Thread name may be.
 *
 * Both are labels before they are records: they sit in list rows, in the search panel's
 * header, in a note's inspector, and inside sentences on Activity ("God's Sovereignty keeps
 * filling up"). Every one of those places truncates, which means a name past a certain
 * length is not information — it is an ellipsis the reader has to open something to resolve.
 *
 * 60 characters is roughly a full line in the narrowest of those surfaces. It is generous
 * enough that no reasonable name hits it and short enough that an unreasonable one cannot
 * push a row's meta off its own edge. Shared space titles cap at 80 for the same reason,
 * with more room because a space title has fewer places to fit.
 *
 * Enforced at the input rather than on save, so the limit is something you feel while typing
 * instead of an error you meet after committing to a name.
 */
export const FOLDER_NAME_MAX_LENGTH = 60;

/** Same reasoning, same number — the two are the same kind of label. */
export const THREAD_NAME_MAX_LENGTH = 60;
