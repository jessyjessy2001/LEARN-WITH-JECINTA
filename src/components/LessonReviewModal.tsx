import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Video, X } from 'lucide-react';
import { apiFetch, getSessionToken } from '../lib/api';
import { formatUtcInTimezone } from '../lib/timezone';
import { MarkdownRenderer } from './MarkdownRenderer';

interface LessonReviewModalProps {
  classId: string | null;
  timezone: string;
  onClose: () => void;
}

export const LessonReviewModal: React.FC<LessonReviewModalProps> = ({
  classId,
  timezone,
  onClose,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    setError('');
    apiFetch(`/api/lessons/${classId}/review`)
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Could not load lesson details.'))
      .finally(() => setLoading(false));
  }, [classId]);

  if (!classId) return null;

  const openAuthFile = async (fileUrl: string) => {
    if (!fileUrl.startsWith('/api/files/')) {
      return;
    }
    const token = getSessionToken();
    const res = await fetch(fileUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileUrl.split('/').pop() || 'resource';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#E5DFD3] bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-[#EFEAE0] pb-4">
          <div>
            <p className="text-xs font-medium text-[#9A6D14]">
              {data?.lesson?.subject || 'Lesson Review'} ·{' '}
              {data?.lesson?.course_title || ''}
            </p>
            <h2 className="font-display mt-1 text-2xl font-semibold text-[#0F213E]">
              {data?.lesson?.title || 'Loading Lesson...'}
            </h2>
            {data?.lesson && (
              <p className="mt-1 text-xs text-[#64748B]">
                {formatUtcInTimezone(data.lesson.start_time_utc, timezone)} · Teacher:{' '}
                {data.lesson.teacher_name || 'Jecinta Maina'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#64748B] hover:bg-[#FAF8F4] hover:text-[#0F213E]"
            aria-label="Close lesson review"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="py-8 text-sm text-[#64748B]">Loading lesson materials...</p>}
        {error && (
          <div className="my-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="mt-6 space-y-6">
            {data.lesson.topic && (
              <div className="rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                <p className="text-xs font-semibold text-[#64748B]">Topic Covered</p>
                <p className="mt-1 text-sm font-medium text-[#0F213E]">{data.lesson.topic}</p>
                {data.lesson.student_instructions && (
                  <p className="mt-2 text-xs text-[#475569]">
                    Instructions: {data.lesson.student_instructions}
                  </p>
                )}
              </div>
            )}

            {/* Published Recordings */}
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F213E]">
                <Video className="h-4 w-4 text-[#C6922C]" /> Lesson Recording
              </h3>
              {data.recordings && data.recordings.length > 0 ? (
                <div className="mt-2 space-y-3">
                  {data.recordings.map((rec: any) => (
                    <div
                      key={rec.id}
                      className="rounded-xl border border-[#E5DFD3] bg-[#FAF8F4] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-[#475569]">
                          <span className="font-semibold text-[#0F213E]">
                            {rec.provider === 'zoom'
                              ? 'Zoom Cloud Recording'
                              : rec.provider === 'google_meet'
                              ? 'Google Meet Recording'
                              : 'Lesson Recording'}
                          </span>
                          {rec.duration_seconds > 0 && (
                            <span> · {Math.round(rec.duration_seconds / 60)} min</span>
                          )}
                        </div>
                        {rec.playback_url &&
                          (rec.playback_url.startsWith('/api/files/') ? (
                            <button
                              type="button"
                              onClick={() => openAuthFile(rec.playback_url)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                            >
                              Download / Play Recording
                            </button>
                          ) : (
                            <a
                              href={rec.playback_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                            >
                              Watch Recording <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#64748B]">
                  No published recording is available for this session yet.
                </p>
              )}
            </div>

            {/* Published Lesson Summary */}
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F213E]">
                <BookOpen className="h-4 w-4 text-[#C6922C]" /> Published Lesson Notes
              </h3>
              {data.note ? (
                <div className="mt-2 rounded-xl border border-[#E5DFD3] bg-white p-5">
                  {data.note.is_ai_generated === 1 && (
                    <p className="mb-3 text-xs text-[#64748B]">
                      AI-assisted draft reviewed &amp; approved by teacher
                    </p>
                  )}
                  <MarkdownRenderer content={data.note.content_markdown} />
                  {data.note.homework_instructions && (
                    <div className="mt-4 rounded-lg border border-[#EADBC0] bg-[#FAF3E6] p-4">
                      <p className="text-xs font-semibold text-[#92400E]">
                        Homework &amp; Practice Recommendations
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-[#0F213E]">
                        {data.note.homework_instructions}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#64748B]">
                  Your teacher has not published notes for this lesson yet.
                </p>
              )}
            </div>

            {/* Resources & Assignments */}
            {data.resources && data.resources.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F213E]">
                  <FileText className="h-4 w-4 text-[#C6922C]" /> Learning Resources
                </h3>
                <div className="mt-2 space-y-2">
                  {data.resources.map((resItem: any) => (
                    <div
                      key={resItem.id}
                      className="flex items-center justify-between rounded-lg border border-[#E5DFD3] px-4 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-medium text-[#0F213E]">{resItem.title}</p>
                        <p className="text-xs text-[#64748B]">{resItem.resource_type}</p>
                      </div>
                      {resItem.file_url.startsWith('/api/files/') ? (
                        <button
                          type="button"
                          onClick={() => openAuthFile(resItem.file_url)}
                          className="text-xs font-semibold text-[#1E40AF] underline"
                        >
                          Download
                        </button>
                      ) : (
                        <a
                          href={resItem.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#1E40AF] underline"
                        >
                          Open Resource
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
