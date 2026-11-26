import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { apiFetch, getSessionToken } from '../../lib/api';
import { formatUtcInTimezone } from '../../lib/timezone';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface Props {
  section: 'notes' | 'recordings' | 'assignments' | 'submissions' | 'resources';
  data: any;
  teacherTz: string;
  onRefresh: () => void;
}

export const AdminNotesRecordingsAssignments: React.FC<Props> = ({
  section,
  data,
  teacherTz,
  onRefresh,
}) => {
  const classes: any[] = data.classes || [];
  const courses: any[] = data.courses || [];
  const students: any[] = data.students || [];
  const lessonNotes: any[] = data.lessonNotes || [];
  const recordings: any[] = data.recordings || [];
  const assignments: any[] = data.assignments || [];
  const submissions: any[] = data.submissions || [];
  const resources: any[] = data.resources || [];

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ================= LESSON NOTES EDITOR STATE =================
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const [homeworkInstructions, setHomeworkInstructions] = useState('');
  const [privateObservations, setPrivateObservations] = useState('');
  const [transcriptInput, setTranscriptInput] = useState('');
  const [teacherContext, setTeacherContext] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [versionsModal, setVersionsModal] = useState<{ noteId: string; versions: any[] } | null>(null);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
    const existing = lessonNotes.find((n) => n.class_id === selectedClassId);
    const cls = classes.find((c) => c.id === selectedClassId);
    if (existing) {
      setNoteTitle(existing.title || '');
      setNoteMarkdown(existing.content_markdown || '');
      setHomeworkInstructions(existing.homework_instructions || '');
      setPrivateObservations(existing.private_observations || '');
    } else if (cls) {
      setNoteTitle(`${cls.subject}: ${cls.topic || cls.title}`);
      setNoteMarkdown(
        `## Lesson Overview\n\n## Key Concepts Covered\n- \n\n## Practice Examples\n\n## Next Steps\n`
      );
      setHomeworkInstructions('');
      setPrivateObservations('');
    }
    const clsRec = recordings.find((r) => r.class_id === selectedClassId && r.transcript_text);
    setTranscriptInput(clsRec?.transcript_text || '');
  }, [selectedClassId, lessonNotes, classes, recordings]);

  const insertMarkdownSnippet = (snippet: string) => {
    setNoteMarkdown((prev) => `${prev}${prev.endsWith('\n') || prev === '' ? '' : '\n'}${snippet}`);
  };

  const handleGenerateAiSummary = async () => {
    if (!selectedClassId) return;
    setMsg('');
    setErr('');
    setGeneratingAi(true);
    try {
      const res = await apiFetch<{ note: any }>(`/api/admin/classes/${selectedClassId}/generate-summary`, {
        method: 'POST',
        body: JSON.stringify({
          transcript: transcriptInput,
          teacherContext,
        }),
      });
      if (res.note) {
        setNoteTitle(res.note.title);
        setNoteMarkdown(res.note.content_markdown);
        setHomeworkInstructions(res.note.homework_instructions || '');
      }
      setMsg(
        'AI structured draft generated in Draft status. Review carefully and edit before publishing to students/parents.'
      );
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to generate AI draft.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSaveNotes = async (targetStatus: 'draft' | 'published' | 'unpublished') => {
    if (!selectedClassId) return;
    setMsg('');
    setErr('');
    setSavingNote(true);
    try {
      await apiFetch(`/api/admin/classes/${selectedClassId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({
          title: noteTitle,
          contentMarkdown: noteMarkdown,
          homeworkInstructions,
          privateObservations,
          status: targetStatus,
          changeSummary:
            targetStatus === 'published'
              ? 'Teacher reviewed and published notes'
              : targetStatus === 'unpublished'
              ? 'Unpublished by teacher'
              : 'Saved draft',
        }),
      });
      setMsg(
        targetStatus === 'published'
          ? 'Lesson notes published. Student & parent can now view them (private observations stay hidden).'
          : targetStatus === 'unpublished'
          ? 'Lesson notes unpublished from student & parent view.'
          : 'Lesson notes saved as draft.'
      );
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not save lesson notes.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleOpenVersions = async (noteId: string) => {
    try {
      const res = await apiFetch<{ versions: any[] }>(`/api/admin/lesson-notes/${noteId}/versions`);
      setVersionsModal({ noteId, versions: res.versions || [] });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not load revision history.');
    }
  };

  // ================= RECORDINGS STATE =================
  const [recClassId, setRecClassId] = useState(classes[0]?.id || '');
  const [recProvider, setRecProvider] = useState('manual');
  const [recUrl, setRecUrl] = useState('');
  const [recTranscript, setRecTranscript] = useState('');
  const [recDuration, setRecDuration] = useState('3600');
  const [syncingClassId, setSyncingClassId] = useState<string | null>(null);

  const handleFileUploadToServer = async (
    file: File,
    onUrl: (url: string) => void
  ) => {
    setErr('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await apiFetch<{ fileUrl: string }>('/api/uploads', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            dataBase64: reader.result,
          }),
        });
        onUrl(res.fileUrl);
        setMsg(`Uploaded ${file.name}.`);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Upload failed.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/recordings', {
        method: 'POST',
        body: JSON.stringify({
          classId: recClassId,
          provider: recProvider,
          playbackUrl: recUrl,
          transcriptText: recTranscript,
          durationSeconds: Number(recDuration) || 0,
          status: 'awaiting_review',
        }),
      });
      setRecUrl('');
      setRecTranscript('');
      setMsg('Recording added in Awaiting Review status.');
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to add recording.');
    }
  };

  const handleSyncZoomRecordings = async (classId: string) => {
    setMsg('');
    setErr('');
    setSyncingClassId(classId);
    try {
      await apiFetch(`/api/admin/classes/${classId}/sync-zoom-recordings`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMsg('Zoom cloud recording synced in Awaiting Review status.');
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Zoom cloud sync failed.');
    } finally {
      setSyncingClassId(null);
    }
  };

  const handleRecordingStatus = async (recordingId: string, status: string) => {
    setMsg('');
    setErr('');
    try {
      await apiFetch(`/api/admin/recordings/${recordingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMsg(`Recording status updated to ${status}.`);
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not update recording status.');
    }
  };

  // ================= ASSIGNMENTS & SUBMISSIONS STATE =================
  const [aCourseId, setACourseId] = useState(courses[0]?.id || '');
  const [aClassId, setAClassId] = useState('');
  const [aStudentId, setAStudentId] = useState('');
  const [aTitle, setATitle] = useState('');
  const [aInstructions, setAInstructions] = useState('');
  const [aAttachmentUrl, setAAttachmentUrl] = useState('');
  const [aExternalLink, setAExternalLink] = useState('');
  const [aDueDate, setADueDate] = useState('');
  const [aMaxMarks, setAMaxMarks] = useState('100');

  const [reviewingSub, setReviewingSub] = useState<any>(null);
  const [marksAwarded, setMarksAwarded] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'reviewed' | 'needs_correction'>('reviewed');

  // ================= RESOURCES STATE =================
  const [resTitle, setResTitle] = useState('');
  const [resType, setResType] = useState('pdf');
  const [resDesc, setResDesc] = useState('');
  const [resFileUrl, setResFileUrl] = useState('');
  const [resCourseId, setResCourseId] = useState('');
  const [resClassId, setResClassId] = useState('');
  const [resStudentId, setResStudentId] = useState('');
  const [deleteResourceId, setDeleteResourceId] = useState<string | null>(null);

  const downloadProtectedFile = async (url: string) => {
    if (!url.startsWith('/api/files/')) return;
    const token = getSessionToken();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = url.split('/').pop() || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  // ================= RENDER: LESSON NOTES =================
  if (section === 'notes') {
    const activeNote = lessonNotes.find((n) => n.class_id === selectedClassId);
    const activeClass = classes.find((c) => c.id === selectedClassId);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
              Lesson Notes &amp; AI Draft Assistant
            </h1>
            <p className="text-xs text-[#64748B]">
              AI-generated notes always save as Drafts for teacher review and are never auto-published.
            </p>
          </div>
          {activeNote && (
            <button
              type="button"
              onClick={() => handleOpenVersions(activeNote.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C4] bg-white px-3.5 py-2 text-xs font-medium text-[#0F213E]"
            >
              <History className="h-4 w-4" /> Revision History
            </button>
          )}
        </div>

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {classes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            Schedule or confirm a class first to create lesson notes or generate AI summaries.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column: Class Picker & Gemini Assistant */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <label className="block text-xs font-semibold text-[#0F213E]">
                  1. Select Class Session
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {formatUtcInTimezone(c.start_time_utc, teacherTz)} (
                      {c.notes_status || 'no notes'})
                    </option>
                  ))}
                </select>
                {activeClass && (
                  <p className="mt-2 text-xs text-[#64748B]">
                    Student(s): {activeClass.student_names || '—'} · Current Note Status:{' '}
                    <strong className="uppercase text-[#0F213E]">
                      {activeNote?.status || 'none'}
                    </strong>
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#C6922C]" />
                  <h2 className="font-display text-base font-semibold text-[#0F213E]">
                    2. Gemini AI Draft Generator
                  </h2>
                </div>
                <p className="text-xs text-[#64748B]">
                  Paste a Zoom/Meet transcript or write short teacher bullet points. Gemini converts
                  it into structured Markdown notes saved as a Draft.
                </p>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Lesson Transcript / Session Notes
                  </label>
                  <textarea
                    rows={5}
                    value={transcriptInput}
                    onChange={(e) => setTranscriptInput(e.target.value)}
                    placeholder="Paste lesson transcript or key formulas discussed..."
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Additional Teacher Focus / Context
                  </label>
                  <textarea
                    rows={2}
                    value={teacherContext}
                    onChange={(e) => setTeacherContext(e.target.value)}
                    placeholder="e.g. Emphasise simplifying improper fractions and include 3 practice problems."
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={generatingAi}
                  onClick={handleGenerateAiSummary}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F213E] px-4 py-2.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4 text-[#D6B15C]" />
                  {generatingAi ? 'Generating Draft with Gemini...' : 'Generate AI Draft (Gemini)'}
                </button>
              </div>

              <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <h3 className="text-xs font-semibold text-[#0F213E]">All Saved Lesson Notes</h3>
                <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                  {lessonNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedClassId(n.class_id)}
                      className={`w-full rounded-lg border p-2.5 text-left text-xs ${
                        n.class_id === selectedClassId
                          ? 'border-[#0F213E] bg-[#FAF8F4]'
                          : 'border-[#EFEAE0] bg-white'
                      }`}
                    >
                      <p className="font-semibold text-[#0F213E]">{n.title}</p>
                      <p className="mt-0.5 text-[#64748B]">
                        {n.student_names || 'Learner'} · {n.status.toUpperCase()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 2 columns: Rich Markdown Editor + Preview + Private Observations */}
            <div className="lg:col-span-2 rounded-xl border border-[#E5DFD3] bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEAE0] pb-3">
                <h2 className="font-display text-lg font-semibold text-[#0F213E]">
                  Structured Lesson Notes Editor
                </h2>
                <button
                  type="button"
                  onClick={() => setPreviewMode((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                >
                  <Eye className="h-3.5 w-3.5" /> {previewMode ? 'Edit Markdown' : 'Live Preview'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569]">Note Title</label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>

              {!previewMode ? (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#E5DFD3] bg-[#FAF8F4] p-1.5">
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('## Heading')}
                      className="rounded px-2 py-1 text-xs font-semibold text-[#0F213E] hover:bg-white"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('### Subheading')}
                      className="rounded px-2 py-1 text-xs font-semibold text-[#0F213E] hover:bg-white"
                    >
                      H3
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('**important term**')}
                      className="rounded px-2 py-1 text-xs font-semibold text-[#0F213E] hover:bg-white"
                    >
                      Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('- Key concept\n- Supporting point')}
                      className="rounded px-2 py-1 text-xs font-medium text-[#0F213E] hover:bg-white"
                    >
                      Bullets
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('1. Step one\n2. Step two')}
                      className="rounded px-2 py-1 text-xs font-medium text-[#0F213E] hover:bg-white"
                    >
                      Numbered
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertMarkdownSnippet(
                          '| Concept | Example | Formula / Rule |\n| --- | --- | --- |\n| Item | Sample | Expression |'
                        )
                      }
                      className="rounded px-2 py-1 text-xs font-medium text-[#0F213E] hover:bg-white"
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('`a² + b² = c²` or `x = (-b ± √(b² - 4ac)) / 2a`')}
                      className="rounded px-2 py-1 text-xs font-medium text-[#0F213E] hover:bg-white"
                    >
                      Math Expr
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('[Reference Guide](https://example.org)')}
                      className="rounded px-2 py-1 text-xs font-medium text-[#0F213E] hover:bg-white"
                    >
                      Link
                    </button>
                  </div>
                  <textarea
                    rows={14}
                    value={noteMarkdown}
                    onChange={(e) => setNoteMarkdown(e.target.value)}
                    className="w-full rounded-lg border border-[#D8D1C4] p-3 font-mono text-xs leading-relaxed"
                  />
                </div>
              ) : (
                <div className="min-h-[300px] rounded-xl border border-[#E5DFD3] bg-[#FAF8F4] p-5">
                  <MarkdownRenderer content={noteMarkdown} />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Homework &amp; Next-Class Preparation (Visible when published)
                </label>
                <textarea
                  rows={3}
                  value={homeworkInstructions}
                  onChange={(e) => setHomeworkInstructions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <Lock className="h-3.5 w-3.5" /> Private Teacher Observations (Strictly Hidden from
                  Parents &amp; Students)
                </label>
                <textarea
                  rows={3}
                  value={privateObservations}
                  onChange={(e) => setPrivateObservations(e.target.value)}
                  placeholder="Internal pedagogical notes, attention pacing, areas to revisit privately..."
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#EFEAE0] pt-4">
                {activeNote?.status === 'published' && (
                  <button
                    type="button"
                    disabled={savingNote}
                    onClick={() => handleSaveNotes('unpublished')}
                    className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-xs font-medium text-[#0F213E]"
                  >
                    Unpublish
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingNote}
                  onClick={() => handleSaveNotes('draft')}
                  className="rounded-lg border border-[#0F213E] px-4 py-2 text-xs font-medium text-[#0F213E]"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={savingNote}
                  onClick={() => handleSaveNotes('published')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-5 py-2 text-xs font-semibold text-white"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#D6B15C]" /> Approve &amp; Publish to Portal
                </button>
              </div>
            </div>
          </div>
        )}

        {versionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3">
                <h3 className="font-display text-lg font-semibold text-[#0F213E]">
                  Lesson Note Revision History
                </h3>
                <button
                  type="button"
                  onClick={() => setVersionsModal(null)}
                  className="text-xs font-medium text-[#64748B]"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {versionsModal.versions.map((v) => (
                  <div key={v.id} className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-3">
                    <p className="text-xs font-semibold text-[#0F213E]">
                      Version {v.version_number} · {v.change_summary}
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {v.editor_name || 'Teacher'} · {v.created_at}
                    </p>
                    <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-[#334155]">
                      {v.content_markdown}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER: RECORDINGS =================
  if (section === 'recordings') {
    const zoomClasses = classes.filter((c) => c.video_provider === 'zoom');
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Class Recordings &amp; Parental Consent Guard
          </h1>
          <p className="text-xs text-[#64748B]">
            Sync Zoom Cloud recordings or upload manually. Recordings remain private until parental
            consent is verified and you click Publish.
          </p>
        </div>

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Manual Recording / Transcript Upload */}
          <form
            onSubmit={handleAddRecording}
            className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3"
          >
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              Add Recording or Transcript Manually
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Class</label>
                <select
                  required
                  value={recClassId}
                  onChange={(e) => setRecClassId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({formatUtcInTimezone(c.start_time_utc, teacherTz)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Source</label>
                <select
                  value={recProvider}
                  onChange={(e) => setRecProvider(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                >
                  <option value="manual">Manual Upload / Link</option>
                  <option value="zoom">Zoom Cloud Link</option>
                  <option value="google_meet">Google Meet / Drive Link</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Playback URL or Upload Video/Audio File
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={recUrl}
                  onChange={(e) => setRecUrl(e.target.value)}
                  placeholder="https://... or uploaded file path"
                  className="flex-1 rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs font-medium text-[#0F213E]">
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input
                    type="file"
                    accept="video/*,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUploadToServer(f, setRecUrl);
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Transcript (Optional — used by Gemini Lesson Notes)
              </label>
              <textarea
                rows={3}
                value={recTranscript}
                onChange={(e) => setRecTranscript(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="w-40">
                <label className="block text-xs font-medium text-[#475569]">Duration (sec)</label>
                <input
                  type="number"
                  value={recDuration}
                  onChange={(e) => setRecDuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
              >
                Save Recording (Awaiting Review)
              </button>
            </div>
          </form>

          {/* Zoom Sync Card */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              Sync Zoom Cloud Recordings
            </h2>
            <p className="text-xs text-[#64748B]">
              Fetch cloud recordings for completed Zoom classes. Webhook events at{' '}
              <code>/api/webhooks/zoom</code> also ingest recordings automatically when configured.
            </p>
            {zoomClasses.length === 0 ? (
              <p className="rounded-lg bg-[#FAF8F4] p-4 text-xs text-[#64748B]">
                No Zoom-linked classes found yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {zoomClasses.map((zc) => (
                  <div
                    key={zc.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#0F213E]">{zc.title}</p>
                      <p className="text-[#64748B]">
                        {formatUtcInTimezone(zc.start_time_utc, teacherTz)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={syncingClassId === zc.id}
                      onClick={() => handleSyncZoomRecordings(zc.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#0F213E] px-3 py-1.5 font-medium text-[#0F213E]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {syncingClassId === zc.id ? 'Syncing...' : 'Sync Zoom'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recordings List */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Recorded Sessions ({recordings.length})
          </h2>
          {recordings.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">No recordings stored yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {recordings.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-4 text-sm"
                >
                  <div>
                    <p className="text-xs font-medium text-[#64748B]">
                      {r.provider.toUpperCase()} · Status: {r.status.toUpperCase()} ·{' '}
                      {r.parental_consent_given ? (
                        <span className="text-[#166534]">Parental Consent Verified</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <ShieldAlert className="h-3.5 w-3.5" /> Parental Consent Missing
                        </span>
                      )}
                    </p>
                    <h3 className="mt-1 font-semibold text-[#0F213E]">
                      {r.class_title} ({r.student_name || 'Learner'})
                    </h3>
                    <p className="text-xs text-[#475569]">
                      {formatUtcInTimezone(r.start_time_utc, teacherTz)} ·{' '}
                      {Math.round((r.duration_seconds || 0) / 60)} min
                    </p>
                    {r.playback_url && (
                      <div className="mt-1 text-xs">
                        {r.playback_url.startsWith('/api/files/') ? (
                          <button
                            type="button"
                            onClick={() => downloadProtectedFile(r.playback_url)}
                            className="font-medium text-[#0F213E] underline"
                          >
                            Download Uploaded Recording
                          </button>
                        ) : (
                          <a
                            href={r.playback_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[#0F213E] underline"
                          >
                            Open Playback Link
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'published' ? (
                      <button
                        type="button"
                        onClick={() => handleRecordingStatus(r.id, 'published')}
                        className="rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        Publish to Student &amp; Parent
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRecordingStatus(r.id, 'unpublished')}
                        className="rounded-lg border border-[#D8D1C4] bg-white px-3.5 py-2 text-xs font-medium text-[#0F213E]"
                      >
                        Unpublish
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= RENDER: ASSIGNMENTS =================
  if (section === 'assignments') {
    const handleCreateAssignment = async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg('');
      setErr('');
      try {
        await apiFetch('/api/admin/assignments', {
          method: 'POST',
          body: JSON.stringify({
            courseId: aCourseId,
            classId: aClassId || null,
            studentId: aStudentId || null,
            title: aTitle,
            instructions: aInstructions,
            attachmentUrl: aAttachmentUrl,
            externalLink: aExternalLink,
            dueDateUtc: aDueDate ? new Date(aDueDate).toISOString() : null,
            maxMarks: Number(aMaxMarks) || 100,
            status: 'published',
          }),
        });
        setATitle('');
        setAInstructions('');
        setAAttachmentUrl('');
        setAExternalLink('');
        setADueDate('');
        setMsg('Assignment published and student notified.');
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Failed to create assignment.');
      }
    };

    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
          Assignments &amp; Homework
        </h1>
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateAssignment}
            className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3"
          >
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              Create Assignment
            </h2>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Course</label>
              <select
                required
                value={aCourseId}
                onChange={(e) => setACourseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Assign to Specific Student (Optional)
              </label>
              <select
                value={aStudentId}
                onChange={(e) => setAStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
              >
                <option value="">All Students Enrolled in Course</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.grade_level})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Link to Class Session (Optional)
              </label>
              <select
                value={aClassId}
                onChange={(e) => setAClassId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
              >
                <option value="">None</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({formatUtcInTimezone(c.start_time_utc, teacherTz)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Title</label>
              <input
                type="text"
                required
                value={aTitle}
                onChange={(e) => setATitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Instructions</label>
              <textarea
                rows={4}
                required
                value={aInstructions}
                onChange={(e) => setAInstructions(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Due Date</label>
                <input
                  type="datetime-local"
                  value={aDueDate}
                  onChange={(e) => setADueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Max Marks</label>
                <input
                  type="number"
                  value={aMaxMarks}
                  onChange={(e) => setAMaxMarks(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Worksheet Upload or Link
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={aAttachmentUrl || aExternalLink}
                  onChange={(e) => setAExternalLink(e.target.value)}
                  placeholder="https://... or upload PDF"
                  className="flex-1 rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D8D1C4] px-2.5 py-1.5 text-xs font-medium">
                  <Upload className="h-3.5 w-3.5" /> PDF
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUploadToServer(f, setAAttachmentUrl);
                    }}
                  />
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
            >
              Publish Assignment
            </button>
          </form>

          <div className="lg:col-span-2 space-y-3">
            {assignments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
                No assignments created yet.
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                  <p className="text-xs font-medium text-[#64748B]">
                    {a.subject} · {a.course_title} · Student: {a.student_name || 'All Course Learners'}{' '}
                    · Max Marks: {a.max_marks}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{a.title}</h3>
                  <p className="mt-1 text-sm text-[#475569]">{a.instructions}</p>
                  {a.due_date_utc && (
                    <p className="mt-2 text-xs text-[#9A6D14]">
                      Due: {formatUtcInTimezone(a.due_date_utc, teacherTz)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER: SUBMISSIONS =================
  if (section === 'submissions') {
    const handleReviewSubmission = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!reviewingSub) return;
      setMsg('');
      setErr('');
      try {
        await apiFetch(`/api/admin/submissions/${reviewingSub.id}/review`, {
          method: 'POST',
          body: JSON.stringify({
            marksAwarded: marksAwarded === '' ? undefined : Number(marksAwarded),
            teacherFeedback,
            status: reviewStatus,
          }),
        });
        setReviewingSub(null);
        setMsg('Submission graded and student notified.');
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Failed to save review.');
      }
    };

    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
          Student Assignment Submissions
        </h1>
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No student homework submissions received yet.
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
              <div key={sub.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="text-xs font-medium text-[#64748B]">
                      {sub.subject} · Status: {sub.status.toUpperCase()} · Submitted:{' '}
                      {formatUtcInTimezone(sub.submitted_at, teacherTz)}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                      {sub.student_name} — {sub.assignment_title}
                    </h3>
                    {sub.written_answer && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#FAF8F4] p-3 text-sm text-[#334155]">
                        {sub.written_answer}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {sub.submission_link && (
                        <a
                          href={sub.submission_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#0F213E] underline"
                        >
                          Open Student Link
                        </a>
                      )}
                      {sub.attachment_url && (
                        <button
                          type="button"
                          onClick={() => downloadProtectedFile(sub.attachment_url)}
                          className="font-medium text-[#0F213E] underline"
                        >
                          Download Student Attachment
                        </button>
                      )}
                    </div>
                    {sub.status === 'reviewed' && (
                      <p className="mt-2 text-xs text-[#166534]">
                        Score: {sub.marks_awarded ?? '—'}/{sub.max_marks} · Feedback:{' '}
                        {sub.teacher_feedback}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewingSub(sub);
                      setMarksAwarded(sub.marks_awarded != null ? String(sub.marks_awarded) : '');
                      setTeacherFeedback(sub.teacher_feedback || '');
                      setReviewStatus(sub.status === 'needs_correction' ? 'needs_correction' : 'reviewed');
                    }}
                    className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
                  >
                    {sub.status === 'reviewed' ? 'Edit Grade & Feedback' : 'Grade & Give Feedback'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {reviewingSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <form
              onSubmit={handleReviewSubmission}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-3"
            >
              <h3 className="font-display text-lg font-semibold text-[#0F213E]">
                Review: {reviewingSub.student_name} — {reviewingSub.assignment_title}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Marks (out of {reviewingSub.max_marks})
                  </label>
                  <input
                    type="number"
                    value={marksAwarded}
                    onChange={(e) => setMarksAwarded(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Decision</label>
                  <select
                    value={reviewStatus}
                    onChange={(e) =>
                      setReviewStatus(e.target.value as 'reviewed' | 'needs_correction')
                    }
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                  >
                    <option value="reviewed">Reviewed / Graded</option>
                    <option value="needs_correction">Request Corrections</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Teacher Feedback</label>
                <textarea
                  rows={4}
                  required
                  value={teacherFeedback}
                  onChange={(e) => setTeacherFeedback(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingSub(null)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
                >
                  Save Review &amp; Notify
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER: RESOURCES LIBRARY =================
  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/resources', {
        method: 'POST',
        body: JSON.stringify({
          title: resTitle,
          resourceType: resType,
          description: resDesc,
          fileUrl: resFileUrl,
          courseId: resCourseId || null,
          classId: resClassId || null,
          studentId: resStudentId || null,
          isPublished: true,
        }),
      });
      setResTitle('');
      setResDesc('');
      setResFileUrl('');
      setMsg('Learning resource added and published.');
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to add resource.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
        Learning Resources Library
      </h1>
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleAddResource}
          className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3"
        >
          <h2 className="font-display text-base font-semibold text-[#0F213E]">
            Upload or Link Resource
          </h2>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Title</label>
            <input
              type="text"
              required
              value={resTitle}
              onChange={(e) => setResTitle(e.target.value)}
              placeholder="e.g. Grade 6 Fractions Worksheet"
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Type</label>
            <select
              value={resType}
              onChange={(e) => setResType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
            >
              <option value="pdf">PDF Worksheet</option>
              <option value="slides">Presentation Slides</option>
              <option value="code">Code Starter / Repo</option>
              <option value="link">External Study Link</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">File URL or Upload</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                required
                value={resFileUrl}
                onChange={(e) => setResFileUrl(e.target.value)}
                placeholder="https://... or upload file"
                className="flex-1 rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs font-medium">
                <Upload className="h-3.5 w-3.5" /> File
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUploadToServer(f, setResFileUrl);
                  }}
                />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Course (Optional)</label>
            <select
              value={resCourseId}
              onChange={(e) => setResCourseId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Class (Optional)</label>
            <select
              value={resClassId}
              onChange={(e) => setResClassId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
            >
              <option value="">None</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Student (Optional)</label>
            <select
              value={resStudentId}
              onChange={(e) => setResStudentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
            >
              <option value="">Shared</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569]">Description</label>
            <textarea
              rows={2}
              value={resDesc}
              onChange={(e) => setResDesc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            Add Resource
          </button>
        </form>

        <div className="lg:col-span-2 space-y-3">
          {resources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
              No resources uploaded yet.
            </div>
          ) : (
            resources.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DFD3] bg-white p-4"
              >
                <div>
                  <p className="text-xs font-medium text-[#64748B]">
                    {r.resource_type.toUpperCase()} · {r.course_title || 'General'} ·{' '}
                    {r.student_name || 'Shared'}
                  </p>
                  <h3 className="font-semibold text-[#0F213E]">{r.title}</h3>
                  {r.description && <p className="text-xs text-[#475569]">{r.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {r.file_url.startsWith('/api/files/') ? (
                    <button
                      type="button"
                      onClick={() => downloadProtectedFile(r.file_url)}
                      className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                    >
                      Download
                    </button>
                  ) : (
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                    >
                      Open
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteResourceId(r.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-700"
                    aria-label="Delete resource"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteResourceId)}
        title="Delete Learning Resource?"
        message="This removes the resource from student and parent portals."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteResourceId(null)}
        onConfirm={async () => {
          if (!deleteResourceId) return;
          await apiFetch(`/api/admin/resources/${deleteResourceId}`, { method: 'DELETE' });
          setDeleteResourceId(null);
          onRefresh();
        }}
      />
    </div>
  );
};
