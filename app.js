const { useState, useEffect, useMemo, useCallback } = React;

// ============ Storage ============
const STORAGE_KEY = 'shift-app-data-v1';

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { notes: [], shifts: [] };
        const parsed = JSON.parse(raw);
        return {
            notes: parsed.notes || [],
            shifts: parsed.shifts || []
        };
    } catch {
        return { notes: [], shifts: [] };
    }
}

function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============ Helpers ============
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const fmtMoney = (n) => '$' + (n || 0).toFixed(2);
const fmtHours = (h) => (h || 0).toFixed(2) + ' h';

const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const fmtTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const fmtRelative = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d} days ago`;
    return new Date(iso).toLocaleDateString();
};

const combineDateAndTime = (dateStr, timeStr) => {
    return new Date(`${dateStr}T${timeStr}:00`).toISOString();
};

const todayStr = () => new Date().toISOString().split('T')[0];
const defaultTime = (h) => `${String(h).padStart(2, '0')}:00`;

const hoursBetween = (startIso, endIso) => {
    return Math.max(0, (new Date(endIso) - new Date(startIso)) / 3600000);
};

// ============ Icons ============
const Icon = ({ name, size = 24 }) => {
    const icons = {
        note: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>,
        clock: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>,
        money: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>,
        plus: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>,
        close: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>,
        chevron: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>,
        trash: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
        alert: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
        check: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
        calendar: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
    };
    return <span style={{width: size, height: size, display: 'inline-flex'}}>{icons[name]}</span>;
};

// ============ App ============
function App() {
    const [state, setState] = useState(loadState);
    const [tab, setTab] = useState('notes');

    useEffect(() => { saveState(state); }, [state]);

    // Auto-rollover: upcoming -> completed when end time has passed
    useEffect(() => {
        const checkRollover = () => {
            setState(s => {
                const now = Date.now();
                let changed = false;
                const shifts = s.shifts.map(sh => {
                    if (sh.status === 'upcoming' && new Date(sh.endTime).getTime() <= now) {
                        changed = true;
                        return { ...sh, status: 'completed', needsReview: true };
                    }
                    return sh;
                });
                return changed ? { ...s, shifts } : s;
            });
        };
        checkRollover();
        const id = setInterval(checkRollover, 60000);
        return () => clearInterval(id);
    }, []);

    const actions = {
        addNote: (title, content) => {
            const now = new Date().toISOString();
            setState(s => ({ ...s, notes: [...s.notes, { id: uid(), title, content, createdAt: now, updatedAt: now }] }));
        },
        updateNote: (id, title, content) => {
            setState(s => ({
                ...s,
                notes: s.notes.map(n => n.id === id ? { ...n, title, content, updatedAt: new Date().toISOString() } : n)
            }));
        },
        deleteNote: (id) => {
            setState(s => ({ ...s, notes: s.notes.filter(n => n.id !== id) }));
        },
        addShift: (shift) => {
            setState(s => ({ ...s, shifts: [...s.shifts, { ...shift, id: uid(), createdAt: new Date().toISOString() }] }));
        },
        updateShift: (id, updates) => {
            setState(s => ({
                ...s,
                shifts: s.shifts.map(sh => sh.id === id ? { ...sh, ...updates } : sh)
            }));
        },
        deleteShift: (id) => {
            setState(s => ({ ...s, shifts: s.shifts.filter(sh => sh.id !== id) }));
        }
    };

    return (
        <>
            {tab === 'notes' && <NotesScreen notes={state.notes} actions={actions} />}
            {tab === 'shifts' && <ShiftsScreen shifts={state.shifts} actions={actions} />}
            {tab === 'earnings' && <EarningsScreen shifts={state.shifts} />}
            <TabBar current={tab} onChange={setTab} />
        </>
    );
}

// ============ Tab Bar ============
function TabBar({ current, onChange }) {
    const tabs = [
        { id: 'notes', label: 'Notes', icon: 'note' },
        { id: 'shifts', label: 'Shifts', icon: 'clock' },
        { id: 'earnings', label: 'Earnings', icon: 'money' }
    ];
    return (
        <nav className="tab-bar">
            {tabs.map(t => (
                <button
                    key={t.id}
                    className={`tab-item ${current === t.id ? 'active' : ''}`}
                    onClick={() => onChange(t.id)}
                >
                    <Icon name={t.icon} />
                    <span>{t.label}</span>
                </button>
            ))}
        </nav>
    );
}

// ============ Notes ============
function NotesScreen({ notes, actions }) {
    const [editor, setEditor] = useState(null);
    const sorted = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return (
        <>
            <header className="nav-bar">
                <div className="nav-title">Notes</div>
                <button className="nav-icon" onClick={() => setEditor({ mode: 'create' })}>
                    <Icon name="plus" />
                </button>
            </header>
            <main className="scroll">
                {sorted.length === 0 ? (
                    <div className="empty">
                        <div className="empty-icon">📝</div>
                        <h2>No notes yet</h2>
                        <p>Tap + to jot something down.</p>
                    </div>
                ) : (
                    <div className="list-card">
                        {sorted.map(note => (
                            <div key={note.id} className="list-row" onClick={() => setEditor({ mode: 'edit', note })}>
                                <div className="row-content">
                                    <div className="row-title">{note.title || 'Untitled'}</div>
                                    {note.content && <div className="row-subtitle">{note.content}</div>}
                                    <div className="row-meta">{fmtRelative(note.updatedAt)}</div>
                                </div>
                                <div className="row-chevron"><Icon name="chevron" size={20} /></div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
            {editor && (
                <NoteEditor
                    mode={editor.mode}
                    note={editor.note}
                    onSave={(title, content) => {
                        if (editor.mode === 'create') actions.addNote(title, content);
                        else actions.updateNote(editor.note.id, title, content);
                        setEditor(null);
                    }}
                    onDelete={() => {
                        actions.deleteNote(editor.note.id);
                        setEditor(null);
                    }}
                    onClose={() => setEditor(null)}
                />
            )}
        </>
    );
}

function NoteEditor({ mode, note, onSave, onDelete, onClose }) {
    const [title, setTitle] = useState(note?.title || '');
    const [content, setContent] = useState(note?.content || '');
    const [confirmDelete, setConfirmDelete] = useState(false);

    const canSave = title.trim() || content.trim();

    return (
        <div className="overlay" onClick={onClose}>
            <div className="sheet" onClick={e => e.stopPropagation()}>
                <div className="sheet-header">
                    <button className="nav-button" onClick={onClose}>Cancel</button>
                    <div className="sheet-title">{mode === 'edit' ? 'Edit Note' : 'New Note'}</div>
                    <button className="nav-button bold" disabled={!canSave}
                            style={{opacity: canSave ? 1 : 0.4}}
                            onClick={() => canSave && onSave(title, content)}>
                        Save
                    </button>
                </div>
                <div className="sheet-body">
                    <div className="form-section">
                        <div className="form-group">
                            <div className="form-row">
                                <input className="form-input text" type="text" placeholder="Title"
                                       value={title} onChange={e => setTitle(e.target.value)} autoFocus />
                            </div>
                        </div>
                    </div>
                    <div className="form-section">
                        <div className="form-group">
                            <textarea className="form-textarea" placeholder="Write your note..."
                                      value={content} onChange={e => setContent(e.target.value)} />
                        </div>
                    </div>
                    {mode === 'edit' && (
                        <button className="nav-button" style={{color: 'var(--danger)', width: '100%', padding: '14px', background: 'var(--surface)', borderRadius: '12px'}}
                                onClick={() => setConfirmDelete(true)}>
                            Delete Note
                        </button>
                    )}
                </div>
            </div>
            {confirmDelete && (
                <div className="overlay center" onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}>
                    <div className="alert" onClick={e => e.stopPropagation()}>
                        <h3>Delete Note?</h3>
                        <p>This cannot be undone.</p>
                        <div className="alert-buttons">
                            <button className="cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            <button className="destructive" onClick={onDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ Shifts ============
function ShiftsScreen({ shifts, actions }) {
    const [section, setSection] = useState('upcoming');
    const [addMode, setAddMode] = useState(null);
    const [reviewShift, setReviewShift] = useState(null);

    const upcoming = shifts.filter(s => s.status === 'upcoming')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const past = shifts.filter(s => s.status === 'completed')
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <>
            <header className="nav-bar">
                <div className="nav-title">Shifts</div>
                <button className="nav-icon" onClick={() => setAddMode(section)}>
                    <Icon name="plus" />
                </button>
            </header>
            <main className="scroll">
                <div className="segmented">
                    <button className={`segment ${section === 'upcoming' ? 'active' : ''}`}
                            onClick={() => setSection('upcoming')}>
                        Upcoming {upcoming.length > 0 && `(${upcoming.length})`}
                    </button>
                    <button className={`segment ${section === 'past' ? 'active' : ''}`}
                            onClick={() => setSection('past')}>
                        Past {past.length > 0 && `(${past.length})`}
                    </button>
                </div>

                {section === 'upcoming' ? (
                    upcoming.length === 0 ? (
                        <div className="empty">
                            <div className="empty-icon">📅</div>
                            <h2>No upcoming shifts</h2>
                            <p>Plan a shift to estimate earnings.</p>
                        </div>
                    ) : (
                        upcoming.map(sh => (
                            <ShiftCard key={sh.id} shift={sh}
                                       onClick={() => setReviewShift(sh)} />
                        ))
                    )
                ) : (
                    past.length === 0 ? (
                        <div className="empty">
                            <div className="empty-icon">⏱</div>
                            <h2>No past shifts</h2>
                            <p>Add a completed shift to track earnings.</p>
                        </div>
                    ) : (
                        past.map(sh => (
                            <ShiftCard key={sh.id} shift={sh} showReview
                                       onClick={() => setReviewShift(sh)} />
                        ))
                    )
                )}
            </main>

            {addMode === 'upcoming' && (
                <ShiftForm mode="upcoming" onClose={() => setAddMode(null)}
                           onSave={(data) => { actions.addShift({ ...data, status: 'upcoming' }); setAddMode(null); }} />
            )}
            {addMode === 'past' && (
                <ShiftForm mode="past" onClose={() => setAddMode(null)}
                           onSave={(data) => { actions.addShift({ ...data, status: 'completed' }); setAddMode(null); }} />
            )}
            {reviewShift && (
                <ShiftForm
                    mode="edit"
                    shift={reviewShift}
                    onClose={() => setReviewShift(null)}
                    onSave={(data) => {
                        actions.updateShift(reviewShift.id, { ...data, status: 'completed', needsReview: false });
                        setReviewShift(null);
                    }}
                    onDelete={() => {
                        actions.deleteShift(reviewShift.id);
                        setReviewShift(null);
                    }}
                />
            )}
        </>
    );
}

function ShiftCard({ shift, showReview, onClick }) {
    const hours = hoursBetween(shift.startTime, shift.endTime);
    const earnings = hours * shift.hourlyWage;
    return (
        <div className="shift-card" onClick={onClick}>
            <div className="shift-head">
                <div className="shift-date">{fmtDate(shift.date)}</div>
                {showReview && shift.needsReview && <span className="badge">Needs review</span>}
            </div>
            <div className="shift-time">
                <Icon name="clock" size={14} />
                {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
            </div>
            <div className="shift-footer">
                <div className="shift-hours">{fmtHours(hours)} · {fmtMoney(shift.hourlyWage)}/h</div>
                <div className="shift-earnings">{fmtMoney(earnings)}</div>
            </div>
        </div>
    );
}

function ShiftForm({ mode, shift, onClose, onSave, onDelete }) {
    const initDate = shift ? shift.date.split('T')[0] : todayStr();
    const initStart = shift ? fmtTime(shift.startTime).replace(/\s?(AM|PM)/i, '') : defaultTime(9);
    const initEnd = shift ? fmtTime(shift.endTime).replace(/\s?(AM|PM)/i, '') : defaultTime(17);

    const getTimeStr = (iso) => {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const [date, setDate] = useState(shift ? shift.date.split('T')[0] : todayStr());
    const [startTime, setStartTime] = useState(shift ? getTimeStr(shift.startTime) : defaultTime(9));
    const [endTime, setEndTime] = useState(shift ? getTimeStr(shift.endTime) : defaultTime(17));
    const [duration, setDuration] = useState(shift ? hoursBetween(shift.startTime, shift.endTime).toFixed(1) : '6');
    const [wage, setWage] = useState(shift ? shift.hourlyWage : 15);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    const isUpcoming = mode === 'upcoming';

    const calc = useMemo(() => {
        if (isUpcoming) {
            const hrs = parseFloat(duration) || 0;
            return { hours: hrs, earnings: hrs * (parseFloat(wage) || 0) };
        }
        const startIso = combineDateAndTime(date, startTime);
        const endIso = combineDateAndTime(date, endTime);
        const hrs = hoursBetween(startIso, endIso);
        return { hours: hrs, earnings: hrs * (parseFloat(wage) || 0) };
    }, [date, startTime, endTime, duration, wage, isUpcoming]);

    const handleSave = () => {
        setError('');
        const w = parseFloat(wage);
        if (isNaN(w) || w < 0) return setError('Hourly wage must be zero or greater.');

        if (isUpcoming) {
            const dur = parseFloat(duration);
            if (isNaN(dur) || dur <= 0) return setError('Duration must be greater than zero.');
            const startIso = combineDateAndTime(date, startTime);
            const endIso = new Date(new Date(startIso).getTime() + dur * 3600000).toISOString();
            onSave({
                date: new Date(date).toISOString(),
                startTime: startIso,
                endTime: endIso,
                hourlyWage: w
            });
        } else {
            const startIso = combineDateAndTime(date, startTime);
            const endIso = combineDateAndTime(date, endTime);
            if (new Date(endIso) <= new Date(startIso)) return setError('End time must be after start time.');
            onSave({
                date: new Date(date).toISOString(),
                startTime: startIso,
                endTime: endIso,
                hourlyWage: w
            });
        }
    };

    const title = mode === 'upcoming' ? 'Plan Shift' : mode === 'past' ? 'Add Past Shift' : (shift?.needsReview ? 'Review Shift' : 'Edit Shift');

    return (
        <div className="overlay" onClick={onClose}>
            <div className="sheet" onClick={e => e.stopPropagation()}>
                <div className="sheet-header">
                    <button className="nav-button" onClick={onClose}>Cancel</button>
                    <div className="sheet-title">{title}</div>
                    <button className="nav-button bold" onClick={handleSave}>Save</button>
                </div>
                <div className="sheet-body">
                    {mode === 'edit' && shift?.needsReview && (
                        <div className="review-banner">
                            <Icon name="alert" size={16} />
                            <span>This upcoming shift has ended — confirm the actual times.</span>
                        </div>
                    )}
                    {error && <div className="error-box">{error}</div>}

                    <div className="form-section">
                        <div className="form-section-title">When</div>
                        <div className="form-group">
                            <div className="form-row">
                                <div className="form-label">Date</div>
                                <input className="form-input" type="date" value={date}
                                       onChange={e => setDate(e.target.value)} />
                            </div>
                            <div className="form-row">
                                <div className="form-label">Start</div>
                                <input className="form-input" type="time" value={startTime}
                                       onChange={e => setStartTime(e.target.value)} />
                            </div>
                            {!isUpcoming && (
                                <div className="form-row">
                                    <div className="form-label">End</div>
                                    <input className="form-input" type="time" value={endTime}
                                           onChange={e => setEndTime(e.target.value)} />
                                </div>
                            )}
                        </div>
                    </div>

                    {isUpcoming && (
                        <div className="form-section">
                            <div className="form-section-title">Estimate</div>
                            <div className="form-group">
                                <div className="form-row">
                                    <div className="form-label">Duration (h)</div>
                                    <input className="form-input" type="number" step="0.5" min="0"
                                           value={duration} onChange={e => setDuration(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="form-section">
                        <div className="form-section-title">Pay</div>
                        <div className="form-group">
                            <div className="form-row">
                                <div className="form-label">Hourly wage</div>
                                <input className="form-input" type="number" step="0.01" min="0"
                                       value={wage} onChange={e => setWage(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <div className="form-section-title">{isUpcoming ? 'Expected' : 'Summary'}</div>
                        <div className="form-group">
                            <div className="form-row">
                                <div className="form-label">Hours</div>
                                <div style={{fontVariantNumeric: 'tabular-nums'}}>{fmtHours(calc.hours)}</div>
                            </div>
                            <div className="form-row">
                                <div className="form-label">Earnings</div>
                                <div style={{fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--tint)'}}>
                                    {isUpcoming && '≈ '}{fmtMoney(calc.earnings)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {mode === 'edit' && (
                        <button onClick={() => setConfirmDelete(true)}
                                style={{width: '100%', padding: '14px', background: 'var(--surface)', color: 'var(--danger)', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'}}>
                            Delete Shift
                        </button>
                    )}
                </div>
            </div>
            {confirmDelete && (
                <div className="overlay center" onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}>
                    <div className="alert" onClick={e => e.stopPropagation()}>
                        <h3>Delete Shift?</h3>
                        <p>This cannot be undone.</p>
                        <div className="alert-buttons">
                            <button className="cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            <button className="destructive" onClick={onDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ Earnings ============
function EarningsScreen({ shifts }) {
    const summary = useMemo(() => {
        const completed = shifts.filter(s => s.status === 'completed');
        const upcoming = shifts.filter(s => s.status === 'upcoming');

        const totalEarned = completed.reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime) * s.hourlyWage, 0);
        const totalHours = completed.reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime), 0);
        const expected = upcoming.reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime) * s.hourlyWage, 0);
        const expectedHours = upcoming.reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime), 0);

        return {
            totalEarned, totalHours, expected, expectedHours,
            completedCount: completed.length, upcomingCount: upcoming.length,
            combined: totalEarned + expected
        };
    }, [shifts]);

    return (
        <>
            <header className="nav-bar">
                <div className="nav-title">Earnings</div>
            </header>
            <main className="scroll">
                {shifts.length === 0 ? (
                    <div className="empty">
                        <div className="empty-icon">💰</div>
                        <h2>No earnings yet</h2>
                        <p>Add shifts to track your earnings.</p>
                    </div>
                ) : (
                    <>
                        <div className="earnings-card green">
                            <div className="earnings-header">
                                <div className="earnings-label">
                                    <Icon name="check" size={18} />
                                    Total Earned
                                </div>
                                <div className="earnings-detail">{fmtHours(summary.totalHours)}</div>
                            </div>
                            <div className="earnings-value">{fmtMoney(summary.totalEarned)}</div>
                            <div className="earnings-subtitle">
                                From {summary.completedCount} completed shift{summary.completedCount === 1 ? '' : 's'}
                            </div>
                        </div>

                        <div className="earnings-card blue">
                            <div className="earnings-header">
                                <div className="earnings-label">
                                    <Icon name="calendar" size={18} />
                                    Expected
                                </div>
                                <div className="earnings-detail">~{fmtHours(summary.expectedHours)}</div>
                            </div>
                            <div className="earnings-value">≈ {fmtMoney(summary.expected)}</div>
                            <div className="earnings-subtitle">
                                From {summary.upcomingCount} upcoming shift{summary.upcomingCount === 1 ? '' : 's'}
                            </div>
                        </div>

                        <div className="combined-card">
                            <div className="earnings-label" style={{marginBottom: 8}}>Combined outlook</div>
                            <div className="earnings-value">{fmtMoney(summary.combined)}</div>
                            <div className="earnings-subtitle">
                                Total past + expected upcoming
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
