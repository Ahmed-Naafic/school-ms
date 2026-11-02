import React from 'react';

// The "⋮ More" per-Lesson menu — only ever rendered while Edit Mode is on
// (MasterTimetablePage), and never shows a permanent action icon inside a
// cell. Move and Swap are the same underlying action in this system (one
// dialog changes the Assignment and/or the Day/Period together), so they
// are presented as a single "Move / Swap" entry rather than two menu items
// that would do the identical thing — simpler and more honest than the
// literal three-item list, per the UI's own "minimal, no fake distinctions"
// priority.
export function LessonActionsMenu({ lesson, onMoveSwap, onLock, onUnlock, onSplit, onDelete }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const runThenClose = (fn) => () => {
    setOpen(false);
    fn(lesson);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-navy-800 dark:hover:text-gray-200"
      >
        ⋮
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg dark:border-navy-700 dark:bg-navy-900"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={runThenClose(onMoveSwap)}>Move / Swap</MenuItem>
          {lesson.locked ? (
            <MenuItem onClick={runThenClose(onUnlock)}>Unlock</MenuItem>
          ) : (
            <MenuItem onClick={runThenClose(onLock)}>Lock</MenuItem>
          )}
          {lesson.lessonGroupId && <MenuItem onClick={runThenClose(onSplit)}>Split Double Period</MenuItem>}
          <MenuItem tone="danger" onClick={runThenClose(onDelete)}>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'block w-full px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-navy-800',
        tone === 'danger' ? 'text-danger' : 'text-gray-700 dark:text-gray-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
