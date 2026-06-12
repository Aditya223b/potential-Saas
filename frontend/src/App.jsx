import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowRight, ArrowLeft, Check, X, Upload as UploadIcon, FileText, 
  Home, Trash2, Eye, MoreVertical, Mail, Download, PlusCircle, 
  LayoutGrid, Calculator, Globe, Building, Users, BarChart2, 
  AlertTriangle, Bot, FileEdit, Save, ChevronRight, Moon, Sun,
  TrendingUp, Search, RefreshCw, FileQuestion
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Design System & Styling Constants
// Terracotta accent theme, Geist sans, tabular numeric alignments.
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: 'oklch(1 0 0)',
  surface: 'oklch(0.992 0.001 250)',
  surfaceTinted: 'oklch(0.985 0.003 250)',
  ink: 'oklch(0.16 0.01 250)',
  ink2: 'oklch(0.36 0.008 250)',
  muted: 'oklch(0.48 0.005 250)',
  faint: 'oklch(0.62 0.004 250)',
  hairline: 'oklch(0.92 0.003 250)',
  hairlineStrong: 'oklch(0.84 0.004 250)',
  accent: 'oklch(0.46 0.16 25)',
  accentDeep: 'oklch(0.36 0.14 25)',
  accentSoft: 'oklch(0.97 0.018 25)',
  accentBorder: 'oklch(0.78 0.10 25)',
};

const SERIF = `'Fraunces', 'Times New Roman', serif`;
const SANS = `'Geist', -apple-system, BlinkMacSystemFont, sans-serif`;
const MONO = `'Geist Mono', 'JetBrains Mono', ui-monospace, monospace`;

const STEP_CONFIG = {
  parse: { label: 'Parsing Financial Statements', icon: <FileText size={14} style={{ marginTop: 2 }} /> },
  categorize: { label: 'Document Categorisation', icon: <LayoutGrid size={14} style={{ marginTop: 2 }} /> },
  extract: { label: 'Extracting Financial Figures', icon: <Calculator size={14} style={{ marginTop: 2 }} /> },
  projection: { label: 'Upload Company Projections', icon: <TrendingUp size={14} style={{ marginTop: 2 }} /> },
  validate: { label: 'Analyst Verification', icon: <Search size={14} style={{ marginTop: 2 }} /> },
  web: { label: 'Web Research', icon: <Globe size={14} style={{ marginTop: 2 }} /> },
  background: { label: 'Company Background Analysis', icon: <Building size={14} style={{ marginTop: 2 }} /> },
  competitors: { label: 'Competitor Analysis', icon: <Users size={14} style={{ marginTop: 2 }} /> },
  ratios: { label: 'Calculating Financial Ratios', icon: <BarChart2 size={14} style={{ marginTop: 2 }} /> },
  projection_analysis: { label: 'Reviewing Management Projections', icon: <TrendingUp size={14} style={{ marginTop: 2 }} /> },
  financial: { label: 'Deep Financial Analysis', icon: <TrendingUp size={14} style={{ marginTop: 2 }} /> },
  risks: { label: 'Risk Assessment', icon: <AlertTriangle size={14} style={{ marginTop: 2 }} /> },
  recommendation: { label: 'Investment Recommendation', icon: <Bot size={14} style={{ marginTop: 2 }} /> },
  report: { label: 'Generating Report', icon: <FileEdit size={14} style={{ marginTop: 2 }} /> },
  save: { label: 'Saving to your Profile', icon: <Save size={14} style={{ marginTop: 2 }} /> },
};

function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <line x1="6" y1="10" x2="26" y2="10" stroke={C.ink} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="16" x2="20" y2="16" stroke={C.ink} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="22" x2="23" y2="22" stroke={C.ink} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="26" cy="22" r="1.8" fill={C.accent} />
    </svg>
  );
}

function StepCounter({ step, total }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
      {String(step).padStart(2, '0')} <span style={{ color: C.faint, margin: '0 6px' }}>/</span> {String(total).padStart(2, '0')}
    </div>
  );
}

function Primary({ children, onClick, disabled, trailing = true }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex items-center gap-2 transition-all duration-200"
      style={{
        background: disabled ? C.hairlineStrong : C.accent,
        color: disabled ? C.muted : '#fff',
        padding: '14px 22px',
        borderRadius: 12,
        fontFamily: SANS,
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 200ms cubic-bezier(0.16,1,0.3,1), transform 120ms ease-out',
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.985)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = C.accentDeep)}
      onMouseOut={(e) => !disabled && (e.currentTarget.style.background = C.accent)}
    >
      {children}
      {trailing && <ArrowRight size={16} strokeWidth={2} />}
    </button>
  );
}

function Quiet({ children, onClick, leading = false }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        background: 'transparent',
        color: C.ink2,
        padding: '14px 8px',
        fontFamily: SANS,
        fontSize: 14.5,
        fontWeight: 450,
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = C.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.color = C.ink2)}
    >
      {leading && <ArrowLeft size={15} strokeWidth={2} />}
      {children}
    </button>
  );
}

function Frame({ step, total, children }) {
  return (
    <div style={{ background: C.bg, fontFamily: SANS, color: C.ink }}>
      <header
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '28px 40px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-3">
          <BrandMark size={26} />
          <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.012em' }}>FinAnalyzer</span>
        </div>
        {step !== null && <StepCounter step={step} total={total} />}
      </header>
      <main key={step ?? 'frame'} className="step-in" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 40px' }}>
        {children}
      </main>
    </div>
  );
}

// Welcome Screen
function Welcome({ onNext }) {
  return (
    <div style={{ paddingTop: 'clamp(80px, 16vh, 180px)', maxWidth: 760 }}>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 28 }}>
        For analysts who read between the lines
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'clamp(40px, 6.2vw, 76px)',
          fontWeight: 380,
          lineHeight: 1.02,
          letterSpacing: '-0.025em',
          color: C.ink,
          margin: 0,
          textWrap: 'balance',
        }}
      >
        A new way to <em style={{ fontStyle: 'italic', fontWeight: 360 }}>read</em> the numbers.
      </h1>
      <p
        style={{
          fontSize: 17.5,
          lineHeight: 1.55,
          color: C.ink2,
          margin: '28px 0 0',
          maxWidth: 540,
          fontWeight: 400,
          textWrap: 'pretty',
        }}
      >
        Tell us how you work. We'll set up an analysis approach that matches how
        you think about businesses, not a one-size-fits-all dashboard.
      </p>
      <div style={{ marginTop: 48 }}>
        <Primary onClick={onNext}>Begin</Primary>
      </div>

      <div
        style={{
          marginTop: 'clamp(80px, 14vh, 140px)',
          paddingTop: 24,
          borderTop: `1px solid ${C.hairline}`,
          display: 'flex',
          gap: 32,
          fontSize: 13,
          color: C.muted,
        }}
      >
        <span>Five questions. Two minutes.</span>
        <span style={{ color: C.faint }}>·</span>
        <span>You can change anything later.</span>
      </div>
    </div>
  );
}

// Role Option Data
const ROLES = [
  {
    id: 'analyst',
    title: 'Investment Analyst',
    line: 'Buy, hold, sell. The thesis carries the work.',
    detail: 'Three-statement modeling, peer multiples, conviction-weighted positions.',
  },
  {
    id: 'auditor',
    title: 'External Auditor',
    line: 'Material weaknesses. Going concern. Trail.',
    detail: 'Control testing, policy review, related-party transactions, footnote scrutiny.',
  },
  {
    id: 'cfo',
    title: 'CFO / Finance Lead',
    line: 'Working capital, runway, allocation.',
    detail: 'Cash conversion, covenant headroom, segment economics, capital structure.',
  },
  {
    id: 'researcher',
    title: 'Equity Researcher',
    line: 'Comps, multiples, the narrative around them.',
    detail: 'Sector pulse, consensus deltas, model upkeep, sell-side framing.',
  },
];

function RoleStep({ value, onChange, onNext, onBack }) {
  return (
    <div style={{ paddingTop: 'clamp(48px, 10vh, 96px)', paddingBottom: 80, maxWidth: 920 }}>
      <h2 style={headlineStyle}>
        Where do you <em style={{ fontStyle: 'italic', fontWeight: 360 }}>sit</em> in the chain?
      </h2>
      <p style={subheadStyle}>
        Different roles ask different questions of the same numbers.
        We'll calibrate everything from this: depth, output format, what gets flagged.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-12">
        {ROLES.map((r) => {
          const selected = value === r.id;
          return (
            <button
              key={r.id}
              onClick={() => onChange(r.id)}
              className="text-left transition-all duration-200"
              style={{
                background: selected ? C.accentSoft : C.surface,
                border: `1px solid ${selected ? C.accentBorder : C.hairline}`,
                borderRadius: 14,
                padding: '24px 26px',
                cursor: 'pointer',
                position: 'relative',
                fontFamily: SANS,
                transition: 'background 200ms, border-color 200ms',
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairlineStrong;
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairline;
              }}
            >
              {selected && (
                <div
                  style={{
                    position: 'absolute',
                    top: 18,
                    right: 18,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: C.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={13} color="#fff" strokeWidth={3} />
                </div>
              )}
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 22,
                  fontWeight: 420,
                  letterSpacing: '-0.018em',
                  color: C.ink,
                  marginBottom: 6,
                  paddingRight: 32,
                }}
              >
                {r.title}
              </div>
              <div style={{ fontSize: 14.5, color: C.ink2, marginBottom: 14, lineHeight: 1.45 }}>
                {r.line}
              </div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                {r.detail}
              </div>
            </button>
          );
        })}
      </div>

      <NavRow onBack={onBack} onNext={onNext} canNext={!!value} />
    </div>
  );
}

// Sector Option Data
const SECTORS = [
  'Financials',
  'Information Technology',
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Health Care',
  'Industrials',
  'Energy',
  'Materials',
  'Utilities',
  'Real Estate',
  'Generalist',
];

function SectorStep({ value, onChange, onNext, onBack }) {
  const toggle = (s) => {
    if (value.includes(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  };

  return (
    <div style={{ paddingTop: 'clamp(48px, 10vh, 96px)', paddingBottom: 80, maxWidth: 820 }}>
      <h2 style={headlineStyle}>
        Which sectors do you <em style={{ fontStyle: 'italic', fontWeight: 360 }}>cover</em>?
      </h2>
      <p style={subheadStyle}>
        Pick as many as you watch. We'll calibrate peer-comparison sets, expected margin
        bands, and which footnotes get attention by default.
      </p>

      <div className="flex flex-wrap gap-2.5 mt-10">
        {SECTORS.map((s) => {
          const selected = value.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggle(s)}
              className="transition-all duration-200"
              style={{
                background: selected ? C.ink : C.surface,
                color: selected ? '#fff' : C.ink,
                border: `1px solid ${selected ? C.ink : C.hairline}`,
                borderRadius: 999,
                padding: '10px 18px',
                fontSize: 14,
                fontFamily: SANS,
                fontWeight: 450,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 180ms, color 180ms, border-color 180ms',
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairlineStrong;
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairline;
              }}
            >
              {selected && <Check size={13} strokeWidth={2.5} />}
              {s}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
        {value.length} selected
      </div>

      <NavRow onBack={onBack} onNext={onNext} canNext={value.length > 0} />
    </div>
  );
}

// Depth Option Data
const DEPTHS = [
  {
    id: 'scan',
    title: 'Scan',
    minutes: 2,
    line: 'Surface-level read.',
    detail: 'Key ratios, YoY headline trends, immediate red flags.',
    bars: 1,
  },
  {
    id: 'standard',
    title: 'Standard',
    badge: 'Recommended',
    minutes: 8,
    line: 'Three-statement analysis with peer comp.',
    detail: 'Quality of earnings, working-capital trend, segment view, red-flag scan.',
    bars: 2,
  },
  {
    id: 'forensic',
    title: 'Forensic',
    minutes: 22,
    line: 'Deep mode. Adversarial.',
    detail: 'Accounting policy diffs, related-party trail, off-balance-sheet items, footnote-level scrutiny.',
    bars: 3,
  },
];

function DepthIndicator({ count }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: 18 + i * 6,
            background: i < count ? C.accent : C.hairline,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

function DepthStep({ value, onChange, onNext, onBack }) {
  return (
    <div style={{ paddingTop: 'clamp(48px, 10vh, 96px)', paddingBottom: 80, maxWidth: 820 }}>
      <h2 style={headlineStyle}>
        How deep should we <em style={{ fontStyle: 'italic', fontWeight: 360 }}>look</em>?
      </h2>
      <p style={subheadStyle}>
        Your default tier. You can change it per project. Forensic on one
        statement, a quick scan on the next.
      </p>

      <div className="flex flex-col gap-3 mt-10">
        {DEPTHS.map((d) => {
          const selected = value === d.id;
          return (
            <button
              key={d.id}
              onClick={() => onChange(d.id)}
              className="text-left transition-all duration-200"
              style={{
                background: selected ? C.accentSoft : C.surface,
                border: `1px solid ${selected ? C.accentBorder : C.hairline}`,
                borderRadius: 14,
                padding: '22px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                fontFamily: SANS,
                transition: 'background 200ms, border-color 200ms',
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairlineStrong;
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.borderColor = C.hairline;
              }}
            >
              <DepthIndicator count={d.bars} />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span
                    style={{
                      fontFamily: SERIF,
                      fontSize: 22,
                      fontWeight: 420,
                      letterSpacing: '-0.018em',
                      color: C.ink,
                    }}
                  >
                    {d.title}
                  </span>
                  {d.badge && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: C.accent,
                        background: 'transparent',
                        border: `1px solid ${C.accentBorder}`,
                        padding: '2px 7px',
                        borderRadius: 4,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {d.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14.5, color: C.ink2, marginBottom: 4 }}>{d.line}</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{d.detail}</div>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.muted,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  paddingLeft: 16,
                }}
              >
                ~{d.minutes} min
              </div>
              {selected && (
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: C.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Check size={13} color="#fff" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <NavRow onBack={onBack} onNext={onNext} canNext={!!value} />
    </div>
  );
}

function generateThesis(profile) {
  const role = ROLES.find((r) => r.id === profile.role);
  const depth = DEPTHS.find((d) => d.id === profile.depth);
  const sectors = profile.sectors;

  if (!role || !depth) return { headline: '', body: '', minutes: 0 };

  const roleFraming = {
    analyst: 'thesis-driven analysis: what would change your mind, what would confirm it',
    auditor: 'evidence-driven scrutiny: control gaps, policy drift, and unsupported balances',
    cfo: 'operator-grade reading: cash conversion, covenant headroom, and capital-allocation discipline',
    researcher: 'narrative-driven coverage: consensus deltas, comp-set drift, and model maintenance',
  }[profile.role] || '';

  const sectorFocus = (() => {
    if (sectors.includes('Financials')) return 'NIM, deposit beta, CET1 trajectory, and credit-cost normalization';
    if (sectors.includes('Information Technology'))
      return 'rule-of-40 mechanics, deferred-revenue health, and stock-comp dilution';
    if (sectors.includes('Energy')) return 'reserve replacement, F&D cost, and capex discipline through the cycle';
    if (sectors.includes('Health Care'))
      return 'gross-to-net bridges, pipeline-funded R&D, and inventory-channel positioning';
    if (sectors.includes('Real Estate')) return 'cap-rate compression, leverage covenants, and same-store NOI trend';
    if (sectors.includes('Consumer Discretionary') || sectors.includes('Consumer Staples'))
      return 'gross-margin defense, working-capital cadence, and SKU productivity';
    if (sectors.includes('Industrials'))
      return 'backlog quality, decremental margin behavior, and inventory-to-sales drift';
    return 'margin structure, working-capital cadence, and capital-allocation choices';
  })();

  const depthLine = {
    scan: 'a quick first read with headline ratios and immediate red flags',
    standard: 'a calibrated three-statement pass with peer comp and red-flag scan',
    forensic: 'a forensic-grade pass: accounting policy, footnotes, related-party trail',
  }[profile.depth] || '';

  return {
    headline: `You're an ${role.title.toLowerCase().includes('cfo') ? role.title : role.title}.`,
    body: `Default approach: ${depthLine}. Your coverage of ${sectors.length === 1 ? sectors[0].toLowerCase() : `${sectors.length} sectors`} means we'll lead with ${sectorFocus}, framed as ${roleFraming}.`,
    minutes: depth.minutes,
  };
}

function ThesisStep({ profile, onNext, onBack }) {
  const t = generateThesis(profile);
  const role = ROLES.find((r) => r.id === profile.role) || ROLES[0];
  const depth = DEPTHS.find((d) => d.id === profile.depth) || DEPTHS[1];

  return (
    <div style={{ paddingTop: 'clamp(48px, 10vh, 96px)', paddingBottom: 80, maxWidth: 820 }}>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 24 }}>
        Your analyst profile
      </div>

      <h2 style={{ ...headlineStyle, marginBottom: 24 }}>
        {t.headline.replace(/\.$/, '')}
        <span style={{ color: C.accent }}>.</span>
      </h2>

      <p
        style={{
          fontSize: 19,
          lineHeight: 1.55,
          color: C.ink2,
          maxWidth: 680,
          fontWeight: 400,
          textWrap: 'pretty',
          margin: 0,
        }}
      >
        {t.body}
      </p>

      <div
        style={{
          marginTop: 48,
          background: C.surface,
          border: `1px solid ${C.hairline}`,
          borderRadius: 14,
          padding: '28px 32px',
        }}
      >
        <RecapRow label="Role" value={role.title} />
        <RecapRow label="Coverage" value={profile.sectors.join(', ')} />
        <RecapRow label="Default depth" value={`${depth.title} · ~${depth.minutes} min`} last />
      </div>

      <div className="flex items-center gap-2 mt-10">
        <Quiet onClick={onBack} leading>
          Back
        </Quiet>
        <div style={{ flex: 1 }} />
        <Primary onClick={onNext}>Set up first analysis</Primary>
      </div>
    </div>
  );
}

function RecapRow({ label, value, last }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 24,
        padding: '14px 0',
        borderBottom: last ? 'none' : `1px solid ${C.hairline}`,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 12,
          color: C.muted,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          minWidth: 140,
          paddingTop: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15.5, color: C.ink, lineHeight: 1.5, fontWeight: 450 }}>{value}</div>
    </div>
  );
}

function normalizeWordLimitedText(text, maxWords = 300) {
  const words = (text || '').trim().match(/\S+/g) || [];
  return words.slice(0, maxWords).join(' ');
}

function countWords(text) {
  return ((text || '').trim().match(/\S+/g) || []).length;
}

function UploadStep({ profile, onBack, onComplete, onReset }) {
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const role = ROLES.find((r) => r.id === profile.role) || ROLES[0];
  const depth = DEPTHS.find((d) => d.id === profile.depth) || DEPTHS[1];

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const list = Array.from(e.dataTransfer.files || []);
    setFiles((f) => [...f, ...list]);
  };

  const canSubmit = company.trim() && files.length > 0;

  return (
    <div style={{ paddingTop: 'clamp(48px, 8vh, 80px)', paddingBottom: 80, maxWidth: 1120 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 64, alignItems: 'start' }} className="upload-grid">
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>
            New Analysis
          </div>
          <h2 style={{ ...headlineStyle, marginBottom: 14 }}>
            Upload <em style={{ fontStyle: 'italic', fontWeight: 360 }}>financial</em> statements.
          </h2>
          <p style={{ ...subheadStyle, marginBottom: 48 }}>
            Drop in the PDFs. We'll extract, verify, and analyse them end-to-end.
          </p>

          <Field label="Company" hint="Auto-detected from the filings if you skip">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Reliance Industries Limited"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = C.ink)}
              onBlur={(e) => (e.target.style.borderColor = C.hairlineStrong)}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Website" hint="Optional · used for context">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="company.com"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = C.ink)}
                onBlur={(e) => (e.target.style.borderColor = C.hairlineStrong)}
              />
            </Field>
            <Field label="Period" hint="Fiscal year or quarter">
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="FY2025"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = C.ink)}
                onBlur={(e) => (e.target.style.borderColor = C.hairlineStrong)}
              />
            </Field>
          </div>

          <Field label="Operating notes" hint="Optional · what the PDFs won't tell us">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 1500))}
              rows={4}
              placeholder="Anything unusual this period: restructurings, divestitures, accounting changes, management transitions."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 110, fontFamily: SANS }}
              onFocus={(e) => (e.target.style.borderColor = C.ink)}
              onBlur={(e) => (e.target.style.borderColor = C.hairlineStrong)}
            />
            <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11.5, color: C.muted, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              {notes.length} / 1500
            </div>
          </Field>

          <div style={{ marginTop: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>
              Filings <span style={{ color: C.muted, fontWeight: 400 }}>· Balance Sheet, P&L, Cash Flow</span>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `1.5px dashed ${dragging ? C.accent : C.hairlineStrong}`,
                background: dragging ? C.accentSoft : C.surfaceTinted,
                borderRadius: 14,
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 180ms, background 180ms',
              }}
            >
              <UploadIcon size={22} color={dragging ? C.accent : C.ink2} strokeWidth={1.5} style={{ margin: '0 auto 14px' }} />
              <div style={{ fontSize: 15, color: C.ink, fontWeight: 450, marginBottom: 4 }}>
                Drop PDFs here, or click to browse
              </div>
              <div style={{ fontSize: 13, color: C.muted, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                10-K · 10-Q · Audited statements · up to 50 MB each
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files || [])])}
              />
            </div>

            {files.length > 0 && (
              <div style={{ marginTop: 16, border: `1px solid ${C.hairline}`, borderRadius: 12, overflow: 'hidden' }}>
                {files.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 18px',
                      borderBottom: i < files.length - 1 ? `1px solid ${C.hairline}` : 'none',
                      background: C.surface,
                    }}
                  >
                    <FileText size={16} color={C.ink2} strokeWidth={1.5} />
                    <div style={{ flex: 1, fontSize: 14, color: C.ink, fontWeight: 450, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFiles((arr) => arr.filter((_, idx) => idx !== i));
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.muted }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-12">
            <Quiet onClick={onBack} leading>
              Back
            </Quiet>
            <div style={{ flex: 1 }} />
            <Primary onClick={() => onComplete({ company, website, period, notes, files })} disabled={!canSubmit}>
              Begin analysis
            </Primary>
          </div>
        </div>

        <aside
          style={{
            position: 'sticky',
            top: 28,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            borderRadius: 14,
            padding: '24px 24px 22px',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            We'll analyze as
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 420, letterSpacing: '-0.015em', color: C.ink, marginBottom: 6, lineHeight: 1.2 }}>
            {role.title}
          </div>
          <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.5, marginBottom: 22 }}>
            {role.line}
          </div>

          <div style={{ height: 1, background: C.hairline, marginBottom: 18 }} />

          <SidebarRow label="Depth" value={`${depth.title} · ~${depth.minutes}m`} />
          <SidebarRow label="Sectors" value={`${profile.sectors.length} selected`} />
          <SidebarRow
            label="Output"
            value={
              profile.role === 'analyst'
                ? 'Thesis memo'
                : profile.role === 'auditor'
                ? 'Findings log'
                : profile.role === 'cfo'
                ? 'Operator brief'
                : 'Coverage update'
            }
          />

          <button
            onClick={onReset}
            style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.hairline}`, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.accent, fontFamily: SANS, padding: '16px 0 0', width: '100%', textAlign: 'left' }}
          >
            Reconfigure analysis settings →
          </button>
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .upload-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function SidebarRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', gap: 16 }}>
      <span style={{ fontSize: 12.5, color: C.muted, letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 450, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

const labelStyle = {
  fontFamily: SANS,
  fontSize: 13,
  color: C.ink,
  fontWeight: 500,
  letterSpacing: '0.005em',
};
const hintStyle = { fontSize: 12.5, color: C.muted, fontWeight: 400, marginLeft: 6 };
const inputStyle = {
  width: '100%',
  background: C.bg,
  border: `1px solid ${C.hairlineStrong}`,
  borderRadius: 10,
  padding: '13px 16px',
  fontSize: 15,
  fontFamily: SANS,
  color: C.ink,
  outline: 'none',
  transition: 'border-color 160ms',
  boxSizing: 'border-box',
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={labelStyle}>{label}</span>
        {hint && <span style={hintStyle}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

const headlineStyle = {
  fontFamily: SERIF,
  fontSize: 'clamp(36px, 5vw, 60px)',
  fontWeight: 380,
  lineHeight: 1.05,
  letterSpacing: '-0.022em',
  color: C.ink,
  margin: 0,
  textWrap: 'balance',
};
const subheadStyle = {
  fontSize: 17,
  lineHeight: 1.55,
  color: C.ink2,
  margin: '20px 0 0',
  maxWidth: 580,
  fontWeight: 400,
  textWrap: 'pretty',
};

function NavRow({ onBack, onNext, canNext }) {
  return (
    <div className="flex items-center mt-12">
      <Quiet onClick={onBack} leading>
        Back
      </Quiet>
      <div style={{ flex: 1 }} />
      <Primary onClick={onNext} disabled={!canNext}>
        Continue
      </Primary>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthScreen
// Renders dynamic Login and Registration interfaces styled to match style.css.
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuthSuccess, authErrorMsg, setAuthErrorMsg }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthErrorMsg('Please enter email and password.');
      return;
    }

    setIsLoading(true);
    setAuthErrorMsg('');

    try {
      let res;
      if (isLoginMode) {
        res = await window.supabaseInstance.auth.signInWithPassword({ email: email.trim(), password });
      } else {
        res = await window.supabaseInstance.auth.signUp({ email: email.trim(), password });
      }

      if (res.error) {
        setAuthErrorMsg(res.error.message);
      } else if (!isLoginMode && !res.data.session) {
        setAuthErrorMsg('Please check your email to confirm your account.');
      } else {
        onAuthSuccess(res.data.session);
      }
    } catch (err) {
      setAuthErrorMsg('A network error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">
            <BarChart2 size={20} color="#fff" />
          </div>
          <span>Fin<em>Analyzer</em> AI</span>
        </div>
        <p className="auth-subtitle">AI-powered financial statement analysis</p>

        {authErrorMsg && <div className="auth-error">{authErrorMsg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label htmlFor="authEmail">Email</label>
            <input
              type="email"
              id="authEmail"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label htmlFor="authPassword">Password</label>
            <input
              type="password"
              id="authPassword"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
            {isLoading ? 'Please wait...' : isLoginMode ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          <span>{isLoginMode ? "Don't have an account?" : 'Already have an account?'}</span>
          <button
            className="auth-toggle-btn"
            onClick={() => {
              setIsLoginMode(!isLoginMode);
              setAuthErrorMsg('');
            }}
          >
            {isLoginMode ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [session, setSession] = useState(null);
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  
  // App views: 'wizard' | 'progress' | 'results'
  const [activeView, setActiveView] = useState('wizard');
  // Skip onboarding for returning users who have a saved profile
  const [step, setStep] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem('fina_profile')); return p?.role ? 5 : 1; } catch { return 1; }
  });
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fina_profile')) || { role: null, sectors: [], depth: 'standard' }; } catch { return { role: null, sectors: [], depth: 'standard' }; }
  });

  const [currentJobId, setCurrentJobId] = useState(null);
  const [inProgressJobs, setInProgressJobs] = useState([]);
  const [historyAnalyses, setHistoryAnalyses] = useState([]);
  const [binAnalyses, setBinAnalyses] = useState([]);
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [theme, setTheme] = useState('light');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBinOpen, setIsBinOpen] = useState(false);

  // Results & Verification states
  const [currentResult, setCurrentResult] = useState(null);
  const [isHistoricalResult, setIsHistoricalResult] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState('final');

  // SSE/Progress streaming tracking
  const [progressSteps, setProgressSteps] = useState({});
  const [inspectedStepKey, setInspectedStepKey] = useState(null);
  const [inspectedStepDetails, setInspectedStepDetails] = useState(null);
  const [loadingStepDetails, setLoadingStepDetails] = useState(false);

  // Projections uploading states
  const [selectedProjectionFiles, setSelectedProjectionFiles] = useState([]);
  const [projectionUploadProgress, setProjectionUploadProgress] = useState({});
  const [uploadingProjections, setUploadingProjections] = useState(false);

  // Math Validation grid state
  const [validationFinancials, setValidationFinancials] = useState(null);
  const [validationSources, setValidationSources] = useState({});
  const [validationSourcePreviews, setValidationSourcePreviews] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [approvingFinancials, setApprovingFinancials] = useState(false);

  // Modal overlays
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalInput, setEmailModalInput] = useState('');
  const [emailModalJobId, setEmailModalJobId] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceModalData, setSourceModalData] = useState(null);
  const [loadingSourceModal, setLoadingSourceModal] = useState(false);

  // Interactive PDF Screenshot Preview State (within results dashboard)
  const [activePreviewField, setActivePreviewField] = useState(null);
  const [activePreviewYear, setActivePreviewYear] = useState(null);
  const [activePreviewData, setActivePreviewData] = useState(null);
  const [loadingPreviewData, setLoadingPreviewData] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 4000);
  };

  // Auth Fetch wrapper adding Supabase JWT token
  const authFetch = async (url, options = {}) => {
    if (!session) return fetch(url, options);
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${session.access_token}`;
    options.headers = headers;
    return fetch(url, options);
  };

  // Initialize Fonts and fetch config
  useEffect(() => {
    const id = 'finanalyzer-fonts';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,380;0,9..144,420;0,9..144,500;1,9..144,360;1,9..144,420&family=Geist:wght@300;400;450;500;600&family=Geist+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }

    const loadConfig = async () => {
      try {
        const resp = await fetch('/api/config');
        if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
        const cfg = await resp.json();
        
        window.supabaseInstance = window.supabase.createClient(cfg.supabase_url, cfg.supabase_key);
        setSupabaseConfigured(true);

        const { data } = await window.supabaseInstance.auth.getSession();
        if (data.session) {
          handleSessionChange(data.session);
        }

        window.supabaseInstance.auth.onAuthStateChange((event, sessionObj) => {
          if (event === 'SIGNED_IN') {
            handleSessionChange(sessionObj);
          } else if (event === 'TOKEN_REFRESHED') {
            setSession(sessionObj);
          } else if (event === 'SIGNED_OUT') {
            handleSessionChange(null);
            clearAppState();
          }
        });
      } catch (err) {
        console.error(err);
        setAuthErrorMsg('Failed to initialize Supabase configuration.');
      }
    };

    loadConfig();

    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Persist analyst profile so returning users skip onboarding
  useEffect(() => {
    if (profile.role) {
      localStorage.setItem('fina_profile', JSON.stringify(profile));
    }
  }, [profile]);

  const handleSessionChange = (sess) => {
    setSession(sess);
    if (sess) {
      loadHistory(sess);
      loadInProgressJobs(sess);
      loadBin(sess);
      rehydrateAppState(sess);
    }
  };

  // State Persistence Hooks
  const saveAppState = (view, jobId = null) => {
    localStorage.setItem('fina_view', view);
    if (jobId) localStorage.setItem('fina_job_id', jobId);
  };

  const clearAppState = () => {
    localStorage.removeItem('fina_view');
    localStorage.removeItem('fina_job_id');
  };

  const rehydrateAppState = async (sess) => {
    const savedView = localStorage.getItem('fina_view');
    const savedJobId = localStorage.getItem('fina_job_id');
    if (!savedView || !savedJobId) return;

    try {
      const res = await fetch(`/api/result/${savedJobId}`, {
        headers: { 'Authorization': `Bearer ${sess.access_token}` }
      });
      if (!res.ok) { clearAppState(); return; }
      const data = await res.json();
      
      if (data.status === 'completed') {
        setCurrentJobId(savedJobId);
        loadResults(savedJobId, sess);
      } else if (['failed', 'pending'].includes(data.status)) {
        clearAppState();
      } else {
        resumeJob(savedJobId, data.status, sess);
      }
    } catch (e) {
      clearAppState();
    }
  };

  // Sidebar Loading Helpers
  const loadHistory = async (sessObj = session) => {
    if (!sessObj) return;
    try {
      const res = await fetch('/api/my-analyses', {
        headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
      });
      const data = await res.json();
      setHistoryAnalyses(data.analyses || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadInProgressJobs = async (sessObj = session) => {
    if (!sessObj) return;
    try {
      const res = await fetch('/api/my-jobs', {
        headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
      });
      const data = await res.json();
      setInProgressJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadBin = async (sessObj = session) => {
    if (!sessObj) return;
    try {
      const res = await fetch('/api/bin', {
        headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
      });
      const data = await res.json();
      setBinAnalyses(data.analyses || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Job Controls
  const resumeJob = async (jobId, status, sessObj = session) => {
    setCurrentJobId(jobId);
    saveAppState('progress', jobId);
    setActiveView('progress');
    setCurrentResult(null);

    // Initial progress list setups
    const initSteps = {};
    Object.keys(STEP_CONFIG).forEach(k => {
      initSteps[k] = { label: STEP_CONFIG[k].label, message: 'Waiting...', done: false, active: false };
    });
    setProgressSteps(initSteps);

    try {
      const res = await fetch(`/api/result/${jobId}`, {
        headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
      });
      const data = await res.json();

      const updated = { ...initSteps };
      (data.progress || []).forEach(p => {
        if (p.step && p.step !== 'error') {
          updated[p.step] = { ...updated[p.step], message: p.message, done: p.done, active: !p.done };
        }
      });
      setProgressSteps(updated);

      if (data.status === 'awaiting_projection') {
        showProjectionUploadView(jobId, data);
      } else if (data.status === 'waiting_for_user') {
        showValidationSplitView(jobId, data);
      } else if (data.status === 'completed') {
        loadResults(jobId, sessObj);
      } else {
        listenToProgress(jobId, sessObj);
      }
    } catch (e) {
      showToast('Failed to resume analysis.', 'error');
    }
  };

  const stopInProgressJob = async (jobId) => {
    try {
      const res = await authFetch(`/api/jobs/${jobId}/stop`, { method: 'POST' });
      if (res.ok) {
        showToast('Analysis stopped.', 'success');
        loadInProgressJobs();
        if (currentJobId === jobId) handleNewAnalysis();
      } else {
        showToast('Failed to stop analysis.', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  const deleteInProgressJob = async (jobId) => {
    try {
      const res = await authFetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Analysis deleted.', 'success');
        loadInProgressJobs();
        if (currentJobId === jobId) handleNewAnalysis();
      } else {
        showToast('Failed to delete analysis.', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  // Real-time Event Streaming
  const listenToProgress = (jobId, sessObj = session) => {
    const es = new EventSource(`/api/progress/${jobId}`);
    
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.step === 'awaiting_projection') {
        es.close();
        showProjectionUploadView(jobId);
        return;
      }
      
      if (data.step === 'waiting_for_user') {
        es.close();
        showValidationSplitView(jobId);
        return;
      }
      
      if (data.step === 'done') {
        es.close();
        if (data.status === 'completed') {
          loadResults(jobId, sessObj);
        } else {
          showToast('Analysis failed.', 'error');
        }
        return;
      }
      if (data.step === 'error') {
        es.close();
        showToast(data.message, 'error');
        return;
      }

      setProgressSteps((prev) => {
        const next = { ...prev };
        if (next[data.step]) {
          next[data.step] = {
            ...next[data.step],
            message: data.message,
            done: data.done,
            active: !data.done
          };
        }
        return next;
      });
    };

    es.onerror = () => {
      es.close();
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/result/${jobId}`, {
            headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
          });
          const data = await res.json();
          if (data.status === 'awaiting_projection') {
            showProjectionUploadView(jobId, data);
          } else if (data.status === 'waiting_for_user') {
            showValidationSplitView(jobId, data);
          } else if (data.status === 'completed') {
            loadResults(jobId, sessObj);
          } else if (data.status === 'failed') {
            showToast(data.error || 'Analysis failed.', 'error');
          } else {
            // Reconnect progress listener
            listenToProgress(jobId, sessObj);
          }
        } catch (e) {
          // Poll fallback if network issues persist
          pollProgress(jobId);
        }
      }, 1500);
    };
  };

  const pollProgress = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/result/${jobId}`);
        const data = await res.json();
        
        if (data.progress) {
          setProgressSteps((prev) => {
            const next = { ...prev };
            data.progress.forEach(p => {
              if (p.step && p.step !== 'error' && next[p.step]) {
                next[p.step] = { ...next[p.step], message: p.message, done: p.done, active: !p.done };
              }
            });
            return next;
          });
        }
        
        if (data.status === 'waiting_for_user') {
          clearInterval(interval);
          showValidationSplitView(jobId, data);
        } else if (data.status === 'awaiting_projection') {
          clearInterval(interval);
          showProjectionUploadView(jobId, data);
        } else if (data.status === 'completed') {
          clearInterval(interval);
          loadResults(jobId);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          showToast(data.error || 'Analysis failed.', 'error');
        }
      } catch (e) {
        console.warn('Poll failed', e);
      }
    }, 3000);
  };

  // Math Validation Layout Render triggers
  const showProjectionUploadView = (jobId, data = null) => {
    setCurrentJobId(jobId);
    saveAppState('projection', jobId);
    setActiveView('progress');
    setValidationFinancials(null);
  };

  const showValidationSplitView = async (jobId, data = null) => {
    setCurrentJobId(jobId);
    saveAppState('validation', jobId);
    setActiveView('progress');

    let jobData = data;
    if (!jobData) {
      try {
        const res = await authFetch(`/api/result/${jobId}`);
        jobData = await res.json();
      } catch (e) {
        showToast('Failed to fetch financials for validation.', 'error');
        return;
      }
    }

    if (jobData && jobData.extracted_financials) {
      setValidationFinancials(jobData.extracted_financials);
      setValidationSources(jobData.extraction_sources || {});
      setValidationSourcePreviews(jobData.source_previews || {});
      runValidationChecks(jobData.extracted_financials);
    }
  };

  // Auto computations and mathematical validation rules
  const handleFinancialEdit = (year, field, val) => {
    setValidationFinancials((prev) => {
      const next = { ...prev };
      if (!next[year]) next[year] = {};
      next[year][field] = val;

      // Derived items
      const g = (k) => parseFloat(next[year][k]) || 0;

      if (next[year].share_capital !== undefined && next[year].reserves !== undefined) {
        next[year].equity = g('share_capital') + g('reserves');
      }
      if (next[year].long_term_borrowings !== undefined || next[year].short_term_borrowings !== undefined) {
        next[year].total_debt = g('long_term_borrowings') + g('short_term_borrowings');
      }
      if (next[year].revenue !== undefined || next[year].other_income !== undefined) {
        next[year].total_income = g('revenue') + g('other_income');
      }
      if (next[year].profit_before_tax !== undefined && next[year].tax_expense !== undefined) {
        next[year].net_profit = g('profit_before_tax') - g('tax_expense');
      }

      runValidationChecks(next);
      return next;
    });
  };

  const runValidationChecks = (finObj) => {
    const years = finObj.years_found || [];
    const fields = [
      "revenue", "other_income", "total_income", "cost_of_materials", "employee_expense", 
      "depreciation", "finance_cost", "other_expenses", "total_expenses", 
      "profit_before_tax", "tax_expense", "net_profit", "ebitda",
      "share_capital", "reserves", "equity", "long_term_borrowings", "short_term_borrowings", 
      "total_debt", "trade_payables", "current_liabilities_total",
      "tangible_assets", "trade_receivables", "cash_and_equivalents", "inventories", 
      "current_assets_total", "total_assets", "working_capital",
      "operating_cash_flow", "investing_cash_flow", "financing_cash_flow"
    ];

    const errs = [];
    const warns = [];
    const sortedYears = [...years].sort().reverse();

    fields.forEach(f => {
      sortedYears.forEach((y, idx) => {
        const data = finObj[y] || {};
        const g = (k) => parseFloat(data[k]) || 0;

        if (f === 'equity') {
          const calc = g('share_capital') + g('reserves');
          if (Math.abs(g('equity') - calc) > 1) {
            errs.push({ field: f, year: y, message: `Eq != Cap + Res in ${y}` });
          }
        }
        if (f === 'total_debt') {
          const calc = g('long_term_borrowings') + g('short_term_borrowings');
          if (Math.abs(g('total_debt') - calc) > 1) {
            errs.push({ field: f, year: y, message: `Debt != LT+ST in ${y}` });
          }
        }
        if (f === 'total_assets') {
          if (g('total_assets') < g('current_assets_total')) {
            errs.push({ field: f, year: y, message: `TA < CA in ${y}` });
          }
        }

        if (idx > 0) {
          const prevY = sortedYears[idx - 1];
          const prevData = finObj[prevY] || {};
          const prevV = parseFloat(prevData[f]) || 0;
          const currV = g(f);
          if (prevV !== 0 && currV !== 0) {
            const ratio = Math.abs(currV / prevV);
            if (ratio > 5 || ratio < 0.2) {
              warns.push({ field: f, year: y, message: `>500% YoY variance in ${y}` });
            }
          }
        }
      });
    });

    setValidationErrors(errs);
    setValidationWarnings(warns);
  };

  const approveValidation = async () => {
    setApprovingFinancials(true);
    try {
      const res = await authFetch(`/api/approve_financials/${currentJobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ financials: validationFinancials })
      });
      if (res.ok) {
        setValidationFinancials(null);
        listenToProgress(currentJobId);
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to submit approval.', 'error');
      }
    } catch (e) {
      showToast('Network error submitting approval.', 'error');
    } finally {
      setApprovingFinancials(false);
    }
  };

  const skipProjection = async () => {
    try {
      await authFetch(`/api/skip_projection/${currentJobId}`, { method: 'POST' });
      showValidationSplitView(currentJobId);
    } catch (e) {
      showValidationSplitView(currentJobId);
    }
  };

  const handleProjectionUpload = async () => {
    if (selectedProjectionFiles.length === 0) {
      showToast('Please attach a projection file.', 'warning');
      return;
    }
    setUploadingProjections(true);
    try {
      const formData = new FormData();
      selectedProjectionFiles.forEach(f => formData.append('projection_files', f));
      const res = await authFetch(`/api/upload_projection/${currentJobId}`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setSelectedProjectionFiles([]);
        setProjectionUploadProgress({});
        showValidationSplitView(currentJobId);
      } else {
        const data = await res.json();
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Upload failed due to network error.', 'error');
    } finally {
      setUploadingProjections(false);
    }
  };

  // Load Results Dashboard
  const loadResults = async (jobId, sessObj = session) => {
    try {
      const res = await fetch(`/api/result/${jobId}`, {
        headers: { 'Authorization': `Bearer ${sessObj.access_token}` }
      });
      const data = await res.json();
      if (data.status === 'completed' && data.result) {
        setCurrentResult(data.result);
        setCurrentJobId(jobId);
        setIsHistoricalResult(false);
        setActiveView('results');
        setActiveResultTab('final');
        saveAppState('results', jobId);
        loadHistory(sessObj);
        loadInProgressJobs(sessObj);
      } else {
        showToast('Analysis is not complete.', 'error');
      }
    } catch (e) {
      showToast('Failed to load results.', 'error');
    }
  };

  const openHistoricalAnalysis = async (analysisId) => {
    try {
      const res = await authFetch(`/api/my-analyses/${analysisId}`);
      const data = await res.json();
      if (res.ok && data.analysis) {
        setCurrentResult(data.analysis.analysis_data);
        setCurrentJobId(analysisId);
        setIsHistoricalResult(true);
        setActiveView('results');
        setActiveResultTab('final');
      } else {
        showToast('Failed to load analysis.', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  // Excel exports & Local document downloads
  const handleExcelExport = () => {
    if (!validationFinancials) return;
    const ws_data = [];
    const years = validationFinancials.years_found || [];
    ws_data.push(["Field", ...years]);

    const fields = [
      "revenue", "other_income", "total_income", "cost_of_materials", "employee_expense", 
      "depreciation", "finance_cost", "other_expenses", "total_expenses", 
      "profit_before_tax", "tax_expense", "net_profit", "ebitda",
      "share_capital", "reserves", "equity", "long_term_borrowings", "short_term_borrowings", 
      "total_debt", "trade_payables", "current_liabilities_total",
      "tangible_assets", "trade_receivables", "cash_and_equivalents", "inventories", 
      "current_assets_total", "total_assets", "working_capital",
      "operating_cash_flow", "investing_cash_flow", "financing_cash_flow"
    ];

    fields.forEach(f => {
      const row = [f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())];
      years.forEach(y => {
        row.push(validationFinancials[y] && validationFinancials[y][f] !== undefined ? validationFinancials[y][f] : null);
      });
      ws_data.push(row);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Financials");
    window.XLSX.writeFile(wb, `${currentResult?.company_name || 'Extracted'}_Financials.xlsx`);
  };

  const handleDownloadDocx = async () => {
    if (!currentJobId) return;
    if (!isHistoricalResult) {
      window.location.href = `/api/download/${currentJobId}`;
    } else {
      try {
        const res = await authFetch(`/api/report-url/${currentJobId}`);
        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
        } else {
          showToast('Doc file not found.', 'error');
        }
      } catch (e) {
        showToast('Failed to retrieve file.', 'error');
      }
    }
  };

  const downloadProjectionsJson = () => {
    if (!currentResult) return;
    const proj = currentResult.projection_analysis || {};
    const company = (currentResult.company_name || 'analysis').replace(/[^a-z0-9]/gi, '_');
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company}_Projections.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExtractionsJson = () => {
    if (!currentResult) return;
    const company = (currentResult.company_name || 'analysis').replace(/[^a-z0-9]/gi, '_');
    const payload = {
      company_name: currentResult.company_name,
      financials: currentResult.financials,
      financial_analysis: currentResult.financial_analysis,
      computed_ratios: currentResult.computed_ratios,
      growth_metrics: currentResult.growth_metrics,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company}_Extractions.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF Image Preview sidebar (inside results dashboard)
  const fetchSourcePreview = async (year, field) => {
    setActivePreviewField(field);
    setActivePreviewYear(year);
    setLoadingPreviewData(true);
    setActivePreviewData(null);

    const inlineSources = (currentResult?.financials?.sources || {})[year] || {};
    const inlineSource = inlineSources[field] || {};
    const inlinePreviews = (currentResult?.source_previews || {})[year] || {};
    const inlinePreview = inlinePreviews[field] || {};

    let resolvedImageUrl = inlinePreview.image_base64 ? `data:image/png;base64,${inlinePreview.image_base64}` : '';
    let resolvedExcerpt = inlinePreview.excerpt || inlineSource.excerpt || '';
    let resolvedSourceFile = inlinePreview.source_file || inlineSource.source_file || '';
    let resolvedPageNum = inlinePreview.page_number || inlineSource.page_number || '';

    if (!resolvedImageUrl) {
      try {
        const res = await authFetch(`/api/source-preview/${currentJobId}?year=${encodeURIComponent(year)}&field=${encodeURIComponent(field)}`);
        if (res.ok) {
          const data = await res.json();
          resolvedExcerpt = data.preview?.excerpt || resolvedExcerpt;
          resolvedSourceFile = data.preview?.source_file || resolvedSourceFile;
          resolvedPageNum = data.preview?.page_number || resolvedPageNum;
          resolvedImageUrl = data.image_data_url || '';
        }
      } catch (e) {
        // Fallback to whatever defaults exist
      }
    }

    setActivePreviewData({
      excerpt: resolvedExcerpt,
      sourceFile: resolvedSourceFile,
      pageNumber: resolvedPageNum,
      imageUrl: resolvedImageUrl
    });
    setLoadingPreviewData(false);
  };

  const handleStepInspector = async (stepKey) => {
    setInspectedStepKey(stepKey);
    setLoadingStepDetails(true);
    setInspectedStepDetails(null);
    try {
      const res = await authFetch(`/api/result/${currentJobId}`);
      const data = await res.json();
      setInspectedStepDetails(data);
    } catch (e) {
      showToast('Failed to load step metrics.', 'error');
    } finally {
      setLoadingStepDetails(false);
    }
  };

  const advanceWorkflow = async () => {
    try {
      const res = await authFetch(`/api/restart_job/${currentJobId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('Workflow pushed ahead!', 'success');
        setInspectedStepKey(null);
        if (data.status === 'awaiting_projection') {
          showProjectionUploadView(currentJobId, data);
        } else {
          listenToProgress(currentJobId);
        }
      } else {
        showToast(data.error || 'Could not push pipeline.', 'error');
      }
    } catch (e) {
      showToast('Network error advancing pipeline.', 'error');
    }
  };

  const handleForceRestart = async () => {
    if (!confirm('Force restart this pipeline? Current downstream adjustments will be overwritten.')) return;
    try {
      const res = await authFetch(`/api/restart_job/${currentJobId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Pipeline re-queued.', 'success');
        setValidationFinancials(null);
        listenToProgress(currentJobId);
      } else {
        showToast('Failed to force restart.', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  const handleSaveReport = async () => {
    try {
      const res = await authFetch(`/api/save/${currentJobId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Analysis saved to history!', 'success');
        loadHistory();
        loadInProgressJobs();
      } else {
        const d = await res.json();
        showToast(d.error || 'Save failed', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  const handleFlagReview = async () => {
    if (!confirm('Flag this analysis as broken or extraction failed?')) return;
    try {
      const res = await authFetch(`/api/flag_for_review/${currentJobId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Analysis flagged for human review.', 'success');
        handleNewAnalysis();
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  // Trash Bin Operations
  const handleMoveToBin = async (analysisId) => {
    try {
      const res = await authFetch(`/api/my-analyses/${analysisId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Analysis moved to Bin.', 'info');
        loadHistory();
        loadBin();
        if (currentJobId === analysisId) handleNewAnalysis();
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  const handleRestoreFromBin = async (analysisId) => {
    try {
      const res = await authFetch(`/api/my-analyses/${analysisId}/restore`, { method: 'POST' });
      if (res.ok) {
        showToast('Analysis restored successfully.', 'success');
        loadBin();
        loadHistory();
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  const handlePermDelete = async (analysisId) => {
    if (!confirm('Permanently delete this analysis? This action is irreversible.')) return;
    try {
      const res = await authFetch(`/api/my-analyses/${analysisId}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Analysis permanently deleted.', 'info');
        loadBin();
      }
    } catch (e) {
      showToast('Network error.', 'error');
    }
  };

  // Share Modal Operations
  const triggerEmailReport = async () => {
    if (!emailModalInput.trim()) {
      showToast('Please enter a recipient email.', 'error');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await authFetch(`/api/email/${emailModalJobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailModalInput.trim() })
      });
      if (res.ok) {
        showToast(`Report emailed to ${emailModalInput}!`, 'success');
        setEmailModalOpen(false);
        setEmailModalInput('');
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to email report.', 'error');
      }
    } catch (e) {
      showToast('Network error.', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSourceModal = async (year, field) => {
    setSourceModalOpen(true);
    setLoadingSourceModal(true);
    setSourceModalData(null);
    try {
      const res = await authFetch(`/api/source-preview/${currentJobId}?year=${encodeURIComponent(year)}&field=${encodeURIComponent(field)}`);
      const data = await res.json();
      if (res.ok) {
        setSourceModalData({
          year,
          field,
          sourceFile: data.preview?.source_file || data.source?.source_file || 'Unknown file',
          pageNumber: data.preview?.page_number || data.source?.page_number || 'N/A',
          imageUrl: data.image_data_url || data.image_url,
          excerpt: data.preview?.excerpt || data.source?.excerpt || ''
        });
      }
    } catch (e) {
      // Handle error
    } finally {
      setLoadingSourceModal(false);
    }
  };

  const handleNewAnalysis = () => {
    clearAppState();
    setCurrentJobId(null);
    setCurrentResult(null);
    setValidationFinancials(null);
    setActiveView('wizard');
    // Returning users with a saved profile skip straight to upload
    try {
      const saved = JSON.parse(localStorage.getItem('fina_profile'));
      if (saved?.role) { setProfile(saved); setStep(5); return; }
    } catch {}
    // New users start at the role-selection step (skip the Welcome splash)
    setStep(1);
    setProfile({ role: null, sectors: [], depth: 'standard' });
  };

  const resetProfile = () => {
    localStorage.removeItem('fina_profile');
    setProfile({ role: null, sectors: [], depth: 'standard' });
    setStep(0);
    setActiveView('wizard');
  };

  const triggerUpload = async (data) => {
    const formData = new FormData();
    data.files.forEach(f => formData.append('pdfs', f));
    if (data.company) formData.append('company', data.company.trim());
    if (data.website) formData.append('company_website', data.website.trim());
    if (data.notes) formData.append('company_context', normalizeWordLimitedText(data.notes.trim(), 300));
    if (session?.user?.email) formData.append('email', session.user.email);
    if (profile.role) formData.append('analyst_role', profile.role);
    if (profile.depth) formData.append('analysis_depth', profile.depth);
    if (profile.sectors?.length) formData.append('sectors', profile.sectors.join(','));

    try {
      const res = await authFetch('/api/upload', { method: 'POST', body: formData });
      const resData = await res.json();
      if (res.ok) {
        setCurrentJobId(resData.job_id);
        saveAppState('progress', resData.job_id);
        setActiveView('progress');
        // Initialize blank progress tracking steps
        const blankSteps = {};
        Object.keys(STEP_CONFIG).forEach(k => {
          blankSteps[k] = { label: STEP_CONFIG[k].label, message: 'Starting...', done: false, active: k === 'parse' };
        });
        setProgressSteps(blankSteps);
        listenToProgress(resData.job_id);
        loadInProgressJobs();
      } else {
        showToast(resData.error || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Network error during upload.', 'error');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleLogout = async () => {
    if (window.supabaseInstance) {
      await window.supabaseInstance.auth.signOut();
    }
  };

  if (!supabaseConfigured) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onAuthSuccess={handleSessionChange} authErrorMsg={authErrorMsg} setAuthErrorMsg={setAuthErrorMsg} />;
  }

  // Sidebar List Filter
  const filteredHistory = historyAnalyses.filter(item => 
    (item.company_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* SIDEBAR PANEL */}
      <aside className={`sidebar ${isSidebarExpanded ? 'expanded' : ''}`}>
        <div className="sidebar-logo" onClick={handleNewAnalysis}>
          <div className="logo-icon">
            <BarChart2 size={18} color="#fff" />
          </div>
          <span>FinAnalyzer</span>
        </div>

        <div className="sidebar-group">
          <button className={`nav-link ${activeView === 'wizard' && step === 0 ? 'active' : ''}`} onClick={handleNewAnalysis} title="Home">
            <Home size={17} />
            <span className="nav-label">Home</span>
          </button>
        </div>

        {/* IN PROGRESS MONITOR */}
        {inProgressJobs.length > 0 && (
          <div className="history-pane in-progress-pane" style={{ flex: 0, paddingBottom: 0 }}>
            <h4 className="in-progress-heading">
              <span className="in-progress-dot"></span>
              In Progress
            </h4>
            <div className="sidebar-list in-progress-list">
              {inProgressJobs.map((job) => {
                const title = job.company_name || (job.filenames && job.filenames[0]) || 'Analysis';
                const dateText = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div className="inprogress-item" key={job.job_id}>
                    <div className="inprogress-info">
                      <div className="inprogress-company" title={title}>{title}</div>
                      <div className="inprogress-meta">
                        <span className="inprogress-status">
                          {job.status === 'awaiting_projection' ? 'Projection req' : job.status === 'waiting_for_user' ? 'Validation req' : 'Running'}
                        </span>
                        <span className="inprogress-date">{dateText}</span>
                      </div>
                    </div>
                    <div className="inprogress-actions">
                      <button className="btn-resume" onClick={() => resumeJob(job.job_id, job.status)}>Resume</button>
                      <button className="btn-job-stop" onClick={() => stopInProgressJob(job.job_id)} title="Stop">&#9632;</button>
                      <button className="btn-job-delete" onClick={() => deleteInProgressJob(job.job_id)} title="Delete">&#x2715;</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* HISTORY LIST */}
        <div className="history-pane">
          <h4>Past Analyses</h4>
          <div className="sidebar-search">
            <input 
              type="text" 
              placeholder="Search companies..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="sidebar-list">
            {filteredHistory.length === 0 ? (
              <div className="sidebar-empty">No analyses found.</div>
            ) : (
              filteredHistory.map((item) => {
                const rec = (item.recommendation || '').toUpperCase();
                const recClass = rec === 'BUY' ? 'buy' : rec === 'HOLD' ? 'hold' : 'avoid';
                const dateText = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <HistoryItem 
                    key={item.id}
                    item={item}
                    recClass={recClass}
                    dateText={dateText}
                    isActive={currentJobId === item.id && activeView === 'results'}
                    onClick={() => openHistoricalAnalysis(item.id)}
                    onDownload={() => handleDownloadDocx()}
                    onEmail={() => {
                      setEmailModalJobId(item.id);
                      setEmailModalOpen(true);
                    }}
                    onDelete={() => handleMoveToBin(item.id)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* TRASH BIN */}
        <div className="history-pane bin-pane" style={{ flex: '0 0 auto', overflowY: 'visible' }}>
          <h4 className="bin-heading" onClick={() => setIsBinOpen(!isBinOpen)}>
            <Trash2 size={14} style={{ marginRight: 2 }} /> Bin
            {binAnalyses.length > 0 && <span className="bin-count-badge">{binAnalyses.length}</span>}
            <span className={`bin-toggle-icon ${isBinOpen ? 'open' : ''}`}>›</span>
          </h4>
          {isBinOpen && (
            <div className="sidebar-list bin-list">
              {binAnalyses.length === 0 ? (
                <div className="sidebar-empty" style={{ fontSize: 12, padding: '8px 0' }}>Bin is empty.</div>
              ) : (
                binAnalyses.map((item) => {
                  const delDate = item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (
                    <div className="bin-item" key={item.id}>
                      <div className="bin-item-info">
                        <div className="bin-item-name" title={item.company_name}>{item.company_name}</div>
                        <div className="bin-item-date">Deleted {delDate}</div>
                      </div>
                      <div className="bin-item-actions">
                        <button className="btn-bin-restore" onClick={() => handleRestoreFromBin(item.id)}>Restore</button>
                        <button className="btn-bin-perm-del" onClick={() => handlePermDelete(item.id)}>✕</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Collapse toggle at bottom */}
        <button className="sidebar-collapse-btn" onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}>
          <span>{isSidebarExpanded ? '‹' : '›'}</span>
        </button>
      </aside>

      {/* MAIN VIEW CONTENT CONTAINER */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-actions">
            <span className="header-badge">POWERED BY GEMINI 2.5 PRO</span>

            <div className="theme-toggle-wrap" onClick={toggleTheme} title="Toggle light / dark mode">
              <span className="theme-toggle-icon theme-icon-sun">☀</span>
              <div className="theme-toggle-track" style={{ transform: theme === 'dark' ? 'translateX(18px)' : 'none' }}>
                <div className="theme-toggle-thumb"></div>
              </div>
              <span className="theme-toggle-icon theme-icon-moon">🌙</span>
            </div>

            <div className="user-menu">
              <span className="user-email">{session.user.email}</span>
              <button className="btn btn-sm btn-ghost" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </header>

        <div id="mainContent">
          {/* VIEW: WIZARD — onboarding (steps 1-4) + upload home (step 5) */}
          {activeView === 'wizard' && step >= 1 && step <= 4 && (
            <section className="wizard-section">
              <Frame step={step} total={4}>
                {step === 1 && (
                  <RoleStep
                    value={profile.role}
                    onChange={(v) => setProfile((p) => ({ ...p, role: v }))}
                    onNext={() => setStep(2)}
                    onBack={() => setStep(1)}
                  />
                )}
                {step === 2 && (
                  <SectorStep
                    value={profile.sectors}
                    onChange={(v) => setProfile((p) => ({ ...p, sectors: v }))}
                    onNext={() => setStep(3)}
                    onBack={() => setStep(1)}
                  />
                )}
                {step === 3 && (
                  <DepthStep
                    value={profile.depth}
                    onChange={(v) => setProfile((p) => ({ ...p, depth: v }))}
                    onNext={() => setStep(4)}
                    onBack={() => setStep(2)}
                  />
                )}
                {step === 4 && (
                  <ThesisStep profile={profile} onNext={() => setStep(5)} onBack={() => setStep(3)} />
                )}
              </Frame>
            </section>
          )}

          {activeView === 'wizard' && step === 5 && (
            <div style={{ padding: '0 0 40px', fontFamily: SANS, color: C.ink }}>
              <UploadStep
                profile={profile}
                onBack={() => setStep(1)}
                onComplete={triggerUpload}
                onReset={resetProfile}
              />
            </div>
          )}

          {/* VIEW: SPLIT PROCESS/VALIDATION SCREEN */}
          {activeView === 'progress' && (
            <section>
              <div className="progress-split-layout">
                {/* Left Side Workflow Step Indicators */}
                <div className="progress-left-pane">
                  <div className="progress-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2>🤖 Analysis in Progress</h2>
                      <p>Gemini 2.5 Pro is analyzing your financial statements...</p>
                    </div>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={handleForceRestart}>
                      🔄 Force Restart
                    </button>
                  </div>

                  <div className="progress-steps">
                    {Object.keys(STEP_CONFIG).map((key) => {
                      const stepState = progressSteps[key] || { message: 'Waiting...', done: false, active: false };
                      const isSelected = inspectedStepKey === key;
                      return (
                        <div 
                          key={key}
                          className={`progress-step step-clickable ${isSelected ? 'step-selected' : ''}`}
                          onClick={() => handleStepInspector(key)}
                        >
                          <div className={`step-indicator ${stepState.done ? 'done' : stepState.active ? 'active' : 'pending'}`}>
                            {stepState.done ? <Check size={14} /> : stepState.active ? <div className="spinner"></div> : STEP_CONFIG[key].icon}
                          </div>
                          <div className="step-text">
                            <div className="step-label">{STEP_CONFIG[key].label}</div>
                            <div className="step-detail">{stepState.message}</div>
                          </div>
                          <div className="step-inspect-hint">›</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Inspector Panel */}
                  {inspectedStepKey && (
                    <div className="step-detail-panel">
                      <div className="step-detail-header">
                        <span style={{ fontWeight: 600, fontSize: 15 }}>
                          {STEP_CONFIG[inspectedStepKey]?.label}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn btn-sm btn-primary" onClick={advanceWorkflow}>⏩ Push Ahead</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setInspectedStepKey(null)}>✕</button>
                        </div>
                      </div>
                      <div className="step-detail-content">
                        {loadingStepDetails ? (
                          <div className="spinner" style={{ margin: '16px auto' }}></div>
                        ) : (
                          <StepDataContent stepKey={inspectedStepKey} data={inspectedStepDetails} />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side Validation Framework */}
                <div className="validation-right-pane" style={{ display: 'flex' }}>
                  {/* Projections Drag & Drop Panel */}
                  {!validationFinancials && (
                    <div style={{ width: '100%' }}>
                      <h3><TrendingUp size={18} style={{ display: 'inline-block', verticalAlign: -2, marginRight: 4 }} /> Upload Company Projections</h3>
                      <p className="subtitle" style={{ marginBottom: 16 }}>
                        Stage 1 is complete. Upload the company’s projected financials before analyst verification.
                      </p>
                      <div className="upload-container-card">
                        <div className="upload-header">
                          <h3>Upload Company Projections</h3>
                          <button className="upload-close-btn" onClick={() => setSelectedProjectionFiles([])}>✕</button>
                        </div>
                        
                        <div 
                          className="dropzone"
                          onClick={() => document.getElementById('projInput').click()}
                        >
                          <input 
                            type="file" 
                            id="projInput" 
                            multiple 
                            style={{ display: 'none' }}
                            onChange={(e) => setSelectedProjectionFiles(Array.from(e.target.files))}
                          />
                          <div className="premium-dropzone-icon">
                            <div className="file-stack-icon">
                              <div className="file-icon-back"></div>
                              <div className="file-icon-front"><span className="plus-sign">+</span></div>
                            </div>
                          </div>
                          <div className="dropzone-text">DRAG AND DROP OR <span className="highlight-green">CLICK TO BROWSE</span></div>
                          <div className="dropzone-subtext">MAX FILE SIZE: 25MB</div>
                        </div>

                        {selectedProjectionFiles.length > 0 && (
                          <div className="file-list" style={{ display: 'block' }}>
                            {selectedProjectionFiles.map((file, i) => (
                              <div className="premium-file-card" key={i}>
                                <div className="premium-file-info">
                                  <div className="file-card-top-row">
                                    <span className="premium-file-name">{file.name}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="modal-actions" style={{ marginTop: 24 }}>
                        <button className="btn btn-ghost" onClick={skipProjection}>Skip Projection Upload</button>
                        <button className="btn btn-primary" onClick={handleProjectionUpload} disabled={uploadingProjections}>
                          {uploadingProjections ? 'Uploading...' : 'Continue to Verification'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Math Audit Grid Pane */}
                  {validationFinancials && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h3><Search size={18} style={{ display: 'inline-block', verticalAlign: -2, marginRight: 4 }} /> Validate Extracted Financials</h3>
                        <button className="btn btn-sm btn-ghost" onClick={handleExcelExport}>⬇️ Download Excel</button>
                      </div>
                      <p className="subtitle" style={{ marginBottom: 16 }}>
                        Review the extracted figures. Values marked in <strong style={{ color: 'var(--danger)' }}>Red</strong> indicate math errors. Use <strong>View Source</strong> to inspect origin PDF details.
                      </p>

                      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <ValidationTable 
                          financials={validationFinancials} 
                          validationSources={validationSources}
                          onEdit={handleFinancialEdit}
                          onSourceClick={handleSourceModal}
                        />
                      </div>

                      <div className="modal-actions" style={{ marginTop: 24 }}>
                        {validationErrors.length > 0 && (
                          <div style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 500, marginRight: 'auto' }}>
                            Please resolve the highlighted discrepancies before continuing.
                          </div>
                        )}
                        <button 
                          className="btn btn-primary" 
                          onClick={approveValidation}
                          disabled={validationErrors.length > 0 || approvingFinancials}
                        >
                          {approvingFinancials ? 'Processing...' : '✓ Approve & Continue to AI Analysis'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* VIEW: RESULTS DASHBOARD */}
          {activeView === 'results' && currentResult && (
            <section>
              <div className="analysis-page-header">
                <div className="analysis-page-title">
                  <h2>{currentResult.company_name || 'Financial Analysis'}</h2>
                  <p className="analysis-page-subtitle">Following company's analysis report</p>
                </div>
              </div>

              <div className="analysis-tab-cards">
                <div className={`analysis-tab-card ${activeResultTab === 'final' ? 'active' : ''}`} onClick={() => setActiveResultTab('final')}>
                  <div className="tab-card-icon"><FileText /></div>
                  <div className="tab-card-label">Final Doc</div>
                </div>
                <div className={`analysis-tab-card ${activeResultTab === 'extracted' ? 'active' : ''}`} onClick={() => setActiveResultTab('extracted')}>
                  <div className="tab-card-icon"><BarChart2 /></div>
                  <div className="tab-card-label">Extracted Financial</div>
                </div>
                <div className={`analysis-tab-card ${activeResultTab === 'projected' ? 'active' : ''}`} onClick={() => setActiveResultTab('projected')}>
                  <div className="tab-card-icon"><TrendingUp /></div>
                  <div className="tab-card-label">Projected Financials</div>
                </div>
              </div>

              {/* TAB CONTENT: FINAL DOC */}
              {activeResultTab === 'final' && (
                <div className="analysis-tab-content" style={{ display: 'block' }}>
                  <FinalDocTab 
                    result={currentResult} 
                    jobId={currentJobId}
                    isHistorical={isHistoricalResult}
                    onDownload={handleDownloadDocx}
                    onSave={handleSaveReport}
                    onNew={handleNewAnalysis}
                  />
                </div>
              )}

              {/* TAB CONTENT: EXTRACTED FINANCIALS WITH SOURCE PREVIEW */}
              {activeResultTab === 'extracted' && (
                <div className="analysis-tab-content" style={{ display: 'block' }}>
                  <div className="section-card">
                    <h3><span className="icon"><BarChart2 size={20} /></span> Financial Ratios</h3>
                    <RatioTable ratios={currentResult.computed_ratios} />
                  </div>

                  <div className="section-card">
                    <h3 style={{ marginBottom: 6 }}><span className="icon"><LayoutGrid size={20} /></span> Extracted Financial Figures</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                      Click any row to see the source PDF excerpt where the value was found. Double-click figures to inline edit.
                    </p>
                    
                    <div className="extraction-split-view">
                      <div className="extraction-table-panel">
                        <ExtractedFiguresTable 
                          financials={currentResult.financials || {}}
                          sources={currentResult.financials?.sources || {}}
                          onCellEdit={async (year, field, val) => {
                            if (!currentResult.financials[year]) currentResult.financials[year] = {};
                            currentResult.financials[year][field] = val;
                            try {
                              await authFetch(`/api/update-financials/${currentJobId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ financials: currentResult.financials })
                              });
                            } catch (e) {
                              showToast('Failed to save edited figure to server.', 'error');
                            }
                          }}
                          onRowClick={fetchSourcePreview}
                          activeField={activePreviewField}
                        />
                      </div>

                      {/* Interactive PDF Excerpt Preview Frame */}
                      <div className="extraction-preview-panel">
                        {loadingPreviewData ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
                            <div className="spinner"></div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Retrieving excerpt...</p>
                          </div>
                        ) : activePreviewData ? (
                          <div className="source-preview-card">
                            <div className="source-preview-header">
                              <h4>{activePreviewField.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h4>
                              <span className="source-meta">
                                {activePreviewData.sourceFile && `${activePreviewData.sourceFile}`}
                                {activePreviewData.pageNumber && ` • p.${activePreviewData.pageNumber}`}
                              </span>
                            </div>
                            {activePreviewData.imageUrl && (
                              <div className="source-preview-image-wrap">
                                <img src={activePreviewData.imageUrl} alt="Source excerpt page screenshot" />
                              </div>
                            )}
                            {activePreviewData.excerpt && (
                              <div className="source-preview-excerpt">
                                {activePreviewData.excerpt.includes('|') ? (
                                  <table className="excerpt-table">
                                    <tbody>
                                      <tr>
                                        {activePreviewData.excerpt.split('|').map((cell, idx) => (
                                          <td key={idx}>{cell.trim()}</td>
                                        ))}
                                      </tr>
                                    </tbody>
                                  </table>
                                ) : (
                                  `"${activePreviewData.excerpt}"`
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="source-preview-empty">
                            <Eye size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.5 }} />
                            <p>Click a row to see the PDF source</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {currentResult.financial_analysis?.revenue_trend && (
                    <div className="section-card">
                      <h3><span className="icon"><TrendingUp size={20} /></span> Revenue & Profitability</h3>
                      <p className="summary-text">{currentResult.financial_analysis.revenue_trend}</p>
                      {currentResult.financial_analysis.margin_analysis && (
                        <p className="summary-text" style={{ marginTop: 12 }}>{currentResult.financial_analysis.margin_analysis}</p>
                      )}
                    </div>
                  )}

                  {currentResult.financial_analysis?.cash_flow_analysis && (
                    <div className="section-card">
                      <h3><span className="icon"><TrendingUp size={20} /></span> Cash Flow Analysis</h3>
                      <p className="summary-text">{currentResult.financial_analysis.cash_flow_analysis}</p>
                    </div>
                  )}

                  <div className="tab-actions-bar">
                    <button className="btn btn-primary" onClick={downloadExtractionData}>
                      <Download size={14} style={{ marginRight: 6 }} /> Download Extractions JSON
                    </button>
                    <button className="btn btn-ghost" onClick={handleNewAnalysis}>
                      <PlusCircle size={14} style={{ marginRight: 6 }} /> New Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: PROJECTED FINANCIALS */}
              {activeResultTab === 'projected' && (
                <div className="analysis-tab-content" style={{ display: 'block' }}>
                  <ProjectedTab proj={currentResult.projection_analysis} onNew={handleNewAnalysis} onDownload={downloadProjectionsJson} />
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* SHARE EMAIL MODAL */}
      {emailModalOpen && (
        <div className="modal-overlay active">
          <div className="modal">
            <h3>📧 Send Report</h3>
            <p>Enter the email address to send the analysis report:</p>
            <input 
              type="email" 
              className="form-input" 
              placeholder="recipient@example.com" 
              value={emailModalInput}
              onChange={(e) => setEmailModalInput(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEmailModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={triggerEmailReport} disabled={sendingEmail}>
                {sendingEmail ? 'Sending...' : 'Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOURCE EVIDENCE POPUP MODAL */}
      {sourceModalOpen && (
        <div className="modal-overlay active">
          <div className="modal source-modal">
            <h3>Source Evidence</h3>
            <p style={{ marginBottom: 12, fontWeight: 500 }}>
              {loadingSourceModal ? 'Loading source details...' : sourceModalData ? `${sourceModalData.year} • ${sourceModalData.field.replace(/_/g, ' ')}` : ''}
            </p>
            <div className="source-image-container">
              {loadingSourceModal ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
                  <div className="spinner"></div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Generating page preview...</p>
                </div>
              ) : sourceModalData ? (
                <div style={{ width: '100%' }}>
                  {sourceModalData.imageUrl ? (
                    <img src={sourceModalData.imageUrl} alt="Source snippet screenshot" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                  ) : null}
                  {sourceModalData.excerpt && (
                    <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace' }}>
                      {sourceModalData.excerpt}
                    </p>
                  )}
                </div>
              ) : (
                <p>No source reference available for this field.</p>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setSourceModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST SYSTEM POPUPS */}
      <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>{toast.message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Sidebar History Item Component
function HistoryItem({ item, recClass, dateText, isActive, onClick, onDownload, onEmail, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const kebabRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  return (
    <div className={`history-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="history-item-top">
        <div className="history-company" title={item.company_name}>{item.company_name}</div>
        <div className="history-date">{dateText}</div>
      </div>
      <div className="history-badges">
        <span className={`h-badge ${recClass}`}>{item.recommendation || 'HOLD'}</span>
      </div>
      
      <button 
        className="history-kebab" 
        ref={kebabRef}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        title="Options"
      >
        <MoreVertical size={16} />
      </button>

      {menuOpen && (
        <div className="history-menu show" style={{ top: kebabRef.current?.getBoundingClientRect().bottom + 4, right: window.innerWidth - kebabRef.current?.getBoundingClientRect().right }}>
          <button className="history-menu-item" onClick={(e) => { e.stopPropagation(); onDownload(); setMenuOpen(false); }}>
            <Download size={14} /> Download DOCX
          </button>
          <button className="history-menu-item" onClick={(e) => { e.stopPropagation(); onEmail(); setMenuOpen(false); }}>
            <Mail size={14} /> Email
          </button>
          <button className="history-menu-item danger" onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Format local figures to Indian numbering styles
function formatExtVal(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n === 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

// Math Verification Grid Component
function ValidationTable({ financials, validationSources, onEdit, onSourceClick }) {
  const years = financials.years_found || [];
  
  const fields = [
    { label: "P&L", isHeader: true },
    "revenue", "other_income", "total_income", "cost_of_materials", "employee_expense", 
    "depreciation", "finance_cost", "other_expenses", "total_expenses", 
    "profit_before_tax", "tax_expense", "net_profit", "ebitda",
    { label: "Equity & Liabilities", isHeader: true },
    "share_capital", "reserves", "equity", "long_term_borrowings", "short_term_borrowings", 
    "total_debt", "trade_payables", "current_liabilities_total",
    { label: "Assets", isHeader: true },
    "tangible_assets", "trade_receivables", "cash_and_equivalents", "inventories", 
    "current_assets_total", "total_assets", "working_capital",
    { label: "Cash Flow", isHeader: true },
    "operating_cash_flow", "investing_cash_flow", "financing_cash_flow"
  ];

  return (
    <div className="excel-table-container" style={{ margin: 0 }}>
      <table className="excel-table" style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th>Field</th>
            {years.map(y => <th key={y}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {fields.map((f, idx) => {
            if (typeof f === 'object' && f.isHeader) {
              return (
                <tr key={idx}>
                  <td colSpan={years.length + 1} style={{ background: 'var(--bg-secondary)', fontWeight: 'bold', color: 'var(--accent)', textTransform: 'uppercase' }}>
                    {f.label}
                  </td>
                </tr>
              );
            }

            return (
              <tr key={f}>
                <td style={{ fontWeight: 500 }}>{f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                {years.map(y => {
                  const val = financials[y] ? financials[y][f] : null;
                  const isNull = val === null || val === '';
                  const hasSource = !!((validationSources[y] || {})[f]);

                  return (
                    <td key={y}>
                      <div className="field-cell">
                        <input 
                          type="number"
                          step="any"
                          value={isNull ? '' : val}
                          placeholder={isNull ? 'null' : '0'}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            fontSize: 13,
                            fontFamily: 'monospace',
                            borderRadius: 4,
                            color: 'var(--text-primary)',
                            outline: 'none',
                            border: `1px solid ${isNull ? 'var(--warning, #f59e0b)' : 'var(--border)'}`,
                            background: isNull ? 'rgba(245,158,11,0.15)' : 'var(--bg-secondary)'
                          }}
                          onChange={(e) => {
                            const parsed = e.target.value === '' ? null : parseFloat(e.target.value);
                            onEdit(y, f, parsed);
                          }}
                        />
                        {hasSource && (
                          <button className="source-btn" type="button" onClick={() => onSourceClick(y, f)}>View Source</button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Workflow Step Details Data Renderer
function StepDataContent({ stepKey, data }) {
  if (!data) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pending step updates...</p>;
  const fmt = (v) => v == null ? '—' : Number(v).toLocaleString();

  switch (stepKey) {
    case 'parse':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 13 }}>Company</td><td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 500 }}>{data.company_name || '—'}</td></tr>
            <tr><td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 13 }}>Files</td><td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 500 }}>{(data.filenames || []).join(', ') || '—'}</td></tr>
            <tr><td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 13 }}>Gemini files</td><td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 500 }}>{(data.gemini_files || []).length}</td></tr>
          </tbody>
        </table>
      );
    case 'categorize':
      const catalog = data.document_catalog || [];
      if (!catalog.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No catalog details.</p>;
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '5px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>File</th>
              <th style={{ padding: '5px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Category</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((c, i) => (
              <tr key={i}>
                <td style={{ padding: '5px 10px', fontSize: 13 }}>{c.filename}</td>
                <td style={{ padding: '5px 10px', fontSize: 13, color: 'var(--accent-light)' }}>{c.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'extract':
      const fin = data.extracted_financials;
      if (!fin) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Extraction pending.</p>;
      const years = fin.years_found || [];
      const keyFields = ['revenue', 'net_profit', 'total_assets', 'equity', 'total_debt', 'operating_cash_flow'];
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Field</th>
                {years.map(y => <th key={y} style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--accent)' }}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {keyFields.map(f => (
                <tr key={f}>
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{f.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  {years.map(y => <td key={y} style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(fin[y]?.[f])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'projection':
      const pfiles = data.projection_filenames || [];
      return pfiles.length > 0 ? (
        <p style={{ fontSize: 13 }}>Projection files: <strong>{pfiles.join(', ')}</strong></p>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No files uploaded.</p>
      );
    case 'validate':
      return <p style={{ fontSize: 13 }}>Awaiting math review on the right verification panel.</p>;
    case 'web':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 13 }}>Website</td><td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 500 }}>{data.company_website || '—'}</td></tr>
            <tr><td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 13 }}>Competitors</td><td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 500 }}>{Array.isArray(data.competitors) ? data.competitors.length : 0}</td></tr>
          </tbody>
        </table>
      );
    default:
      return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Step data logged successfully.</p>;
  }
}

// Results Tab: Final Doc summary view
function FinalDocTab({ result, jobId, isHistorical, onDownload, onSave, onNew }) {
  const rec = result.recommendation || {};
  const bg = result.company_background || {};
  const fin = result.financial_analysis || {};
  const risk = result.risk_analysis || {};

  const verdict = (rec.recommendation || 'N/A').toUpperCase();
  const verdictClass = verdict === 'BUY' ? 'buy' : verdict === 'HOLD' ? 'hold' : (verdict === 'SELL' || verdict === 'AVOID') ? 'avoid' : '';

  return (
    <div>
      <div className={`verdict-card ${verdictClass}`} style={{ marginBottom: 24 }}>
        <div className="verdict-label">Investment Recommendation</div>
        <div className={`verdict-value ${verdictClass}`}>{verdict}</div>
        <div className="summary-text" style={{ maxWidth: 600, margin: '0 auto' }}>{rec.summary || ''}</div>
        <div className="verdict-meta">
          <div className="v-meta-item">
            <div className="label">Confidence</div>
            <div className="value">{rec.confidence_level || 'N/A'}</div>
          </div>
          <div className="v-meta-item">
            <div className="label">Horizon</div>
            <div className="value">{rec.target_horizon || 'N/A'}</div>
          </div>
          <div className="v-meta-item">
            <div className="label">Suitable For</div>
            <div className="value">{rec.suitable_for || 'N/A'}</div>
          </div>
        </div>
      </div>

      <div className="section-card">
        <h3><span className="icon"><FileText size={20} /></span> Executive Summary</h3>
        <p className="summary-text">{fin.executive_summary || 'N/A'}</p>
        {fin.key_highlights && (
          <ul className="bullet-list" style={{ marginTop: 14 }}>
            {fin.key_highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}
      </div>

      <div className="section-card">
        <h3><span className="icon"><Building size={20} /></span> Company Background</h3>
        <div className="info-grid">
          <div className="info-item"><div className="label">Industry</div><div className="value">{bg.industry || 'N/A'}</div></div>
          <div className="info-item"><div className="label">Sub-Industry</div><div className="value">{bg.sub_industry || 'N/A'}</div></div>
          <div className="info-item"><div className="label">Headquarters</div><div className="value">{bg.headquarters || 'N/A'}</div></div>
          <div className="info-item"><div className="label">Business Model</div><div className="value">{bg.business_model || 'N/A'}</div></div>
        </div>
        {bg.company_description && <p className="summary-text" style={{ marginTop: 16 }}>{bg.company_description}</p>}
      </div>

      <div className="section-card">
        <h3><span className="icon">⚠️</span> Risk Factors</h3>
        <div style={{ marginBottom: 16 }}>
          <span className={`badge ${risk.overall_risk_rating === 'High' ? 'badge-red' : risk.overall_risk_rating === 'Medium' ? 'badge-orange' : 'badge-green'}`}>
            Overall Risk: {risk.overall_risk_rating || 'N/A'}
          </span>
        </div>
        {risk.risk_summary && <p className="summary-text" style={{ marginBottom: 16 }}>{risk.risk_summary}</p>}
        {risk.risk_factors && risk.risk_factors.map((rf, idx) => (
          <div className={`risk-item ${(rf.severity || '').toLowerCase()}`} key={idx}>
            <div className="risk-header">
              <span className={`badge ${rf.severity === 'High' ? 'badge-red' : rf.severity === 'Medium' ? 'badge-orange' : 'badge-green'}`}>{rf.severity}</span>
              <span className="risk-category">{rf.category}</span>
            </div>
            <div className="risk-desc">{rf.description}</div>
            {rf.mitigation && <div className="risk-mitigation">Mitigation: {rf.mitigation}</div>}
          </div>
        ))}
      </div>

      <div className="tab-actions-bar">
        <button className="btn btn-primary" onClick={onDownload}>
          <Download size={14} style={{ marginRight: 6 }} /> Download DOCX
        </button>
        {!isHistorical && (
          <button className="btn btn-accent" onClick={onSave}>
            <Save size={14} style={{ marginRight: 6 }} /> Save to History
          </button>
        )}
        <button className="btn btn-ghost" onClick={onNew} style={{ border: '1px solid var(--border)' }}>
          <PlusCircle size={14} style={{ marginRight: 6 }} /> New Analysis
        </button>
      </div>
    </div>
  );
}

// Financial Ratios Table
function RatioTable({ ratios }) {
  if (!ratios || Object.keys(ratios).length === 0) return <p className="summary-text">No ratios calculated.</p>;
  
  const looksLikeRatioLeaf = (val) => {
    return val && typeof val === 'object' && (
      Object.prototype.hasOwnProperty.call(val, 'formatted') ||
      Object.prototype.hasOwnProperty.call(val, 'benchmark') ||
      Object.prototype.hasOwnProperty.call(val, 'status')
    );
  };

  const renderCategoryTable = (category, items) => {
    return (
      <div key={category}>
        <h4 style={{ margin: '16px 0 8px', fontSize: 14, color: 'var(--accent)' }}>{category}</h4>
        <div className="excel-table-container">
          <table className="excel-table">
            <thead>
              <tr><th>Ratio</th><th>Value</th><th>Benchmark</th><th>Status</th></tr>
            </thead>
            <tbody>
              {Object.entries(items).map(([name, data]) => {
                if (!looksLikeRatioLeaf(data)) return null;
                const statusClass = data.status?.includes('PASS') ? 'status-pass' : data.status?.includes('FAIL') ? 'status-fail' : 'status-caution';
                return (
                  <tr key={name}>
                    <td>{name}</td>
                    <td style={{ fontWeight: 600 }}>{data.formatted || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{data.benchmark || '—'}</td>
                    <td className={statusClass}>{data.status || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const firstValue = Object.values(ratios)[0];
  const isMultiYear = firstValue && typeof firstValue === 'object' && !looksLikeRatioLeaf(firstValue);

  if (isMultiYear) {
    return Object.entries(ratios).map(([year, categories]) => (
      <div key={year}>
        <h3 style={{ margin: '20px 0 10px', fontSize: 18, color: 'var(--accent)' }}>{year}</h3>
        {Object.entries(categories || {}).map(([category, items]) => renderCategoryTable(category, items))}
      </div>
    ));
  }

  return Object.entries(ratios).map(([category, items]) => renderCategoryTable(category, items));
}

// Extracted Figures Table Component
function ExtractedFiguresTable({ financials, sources, onCellEdit, onRowClick, activeField }) {
  const sortedYears = (financials.years_found || []).slice().sort();
  if (!sortedYears.length) return <p className="summary-text">No extracted figures available.</p>;

  const sections = [
    { label: 'Profit & Loss', fields: [
      ['Revenue', 'revenue'], ['Other Income', 'other_income'], ['Total Income', 'total_income'],
      ['Cost of Materials', 'cost_of_materials'], ['Employee Expense', 'employee_expense'],
      ['Depreciation', 'depreciation'], ['Finance Cost', 'finance_cost'],
      ['Other Expenses', 'other_expenses'], ['Total Expenses', 'total_expenses'],
      ['Profit Before Tax', 'profit_before_tax'], ['Tax Expense', 'tax_expense'],
      ['Net Profit', 'net_profit'], ['EBITDA', 'ebitda'],
    ]},
    { label: 'Balance Sheet', fields: [
      ['Share Capital', 'share_capital'], ['Reserves & Surplus', 'reserves'],
      ['Equity (Net Worth)', 'equity'], ['Long Term Borrowings', 'long_term_borrowings'],
      ['Short Term Borrowings', 'short_term_borrowings'], ['Total Debt', 'total_debt'],
      ['Trade Payables', 'trade_payables'], ['Current Liabilities', 'current_liabilities_total'],
      ['Tangible Assets', 'tangible_assets'], ['Trade Receivables', 'trade_receivables'],
      ['Cash & Equivalents', 'cash_and_equivalents'], ['Inventories', 'inventories'],
      ['Current Assets', 'current_assets_total'], ['Total Assets', 'total_assets'],
      ['Working Capital', 'working_capital'],
    ]},
    { label: 'Cash Flow', fields: [
      ['Operating Cash Flow', 'operating_cash_flow'],
      ['Investing Cash Flow', 'investing_cash_flow'],
      ['Financing Cash Flow', 'financing_cash_flow'],
    ]},
  ];

  return (
    <table className="extracted-figures-table">
      <thead>
        <tr>
          <th>Particulars</th>
          {sortedYears.map(y => <th key={y}>{y}</th>)}
        </tr>
      </thead>
      <tbody>
        {sections.map((section, idx) => (
          <React.Fragment key={idx}>
            <tr className="section-header-row">
              <td colSpan={1 + sortedYears.length}>{section.label}</td>
            </tr>
            {section.fields.map(([label, key]) => {
              let hasValue = false;
              for (const yr of sortedYears) {
                if (financials[yr] && financials[yr][key]) { hasValue = true; break; }
              }
              if (!hasValue) return null;

              let clickYear = sortedYears[0];
              for (const yr of sortedYears) {
                if (sources[yr] && sources[yr][key]) { clickYear = yr; break; }
              }
              const hasSource = sources[clickYear] && sources[clickYear][key];

              return (
                <tr 
                  key={key}
                  className={activeField === key ? 'source-active' : ''}
                  onClick={() => onRowClick(clickYear, key)}
                  title={hasSource ? 'Click to view source' : 'No source reference available'}
                >
                  <td>
                    {label}
                    {hasSource && <span className="source-badge"><Eye size={10} style={{ marginRight: 2 }} /> Source</span>}
                  </td>
                  {sortedYears.map(yr => {
                    const val = financials[yr] ? financials[yr][key] : null;
                    return (
                      <EditableCell 
                        key={yr}
                        value={val}
                        onSave={(newVal) => onCellEdit(yr, key, newVal)}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

// Double-click Inline Edit cell component
function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value === null ? '' : value);

  if (editing) {
    return (
      <td onClick={(e) => e.stopPropagation()}>
        <input 
          type="number"
          step="any"
          value={inputVal}
          className="inline-edit-input"
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const parsed = inputVal === '' ? null : parseFloat(inputVal);
            onSave(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditing(false);
              const parsed = inputVal === '' ? null : parseFloat(inputVal);
              onSave(parsed);
            }
          }}
          autoFocus
        />
      </td>
    );
  }

  return (
    <td 
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Double-click to edit raw value"
    >
      {formatExtVal(value)}
    </td>
  );
}

// Results Tab: Projections Tab view
function ProjectedTab({ proj, onNew, onDownload }) {
  if (!proj || Object.keys(proj).length === 0) {
    return (
      <div className="projected-empty-state">
        <FileQuestion size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No projection data available for this analysis.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Upload company projection files before starting an analysis to see management projection reviews.</p>
      </div>
    );
  }

  const credibilityColor = {
    'Optimistic': 'badge-red', 'Realistic': 'badge-green',
    'Conservative': 'badge-blue', 'Mixed': 'badge-orange',
  };

  const cp = proj.ai_counter_projection || null;

  return (
    <div className="section-card">
      <h3><span className="icon"><TrendingUp size={20} /></span> Projection Analysis</h3>
      {proj.overall_credibility && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className={`badge ${credibilityColor[proj.overall_credibility] || 'badge-orange'}`}>
            Overall: {proj.overall_credibility}
          </span>
          {proj.projection_period && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Period: {proj.projection_period}</span>}
        </div>
      )}
      {proj.overall_credibility_summary && <p className="summary-text" style={{ marginBottom: 16 }}>{proj.overall_credibility_summary}</p>}

      {proj.management_assumptions && proj.management_assumptions.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Management Assumptions</h4>
          <ul className="bullet-list" style={{ marginBottom: 20 }}>
            {proj.management_assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </>
      )}

      {proj.review_table && proj.review_table.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Projection Review</h4>
          <div className="excel-table-container" style={{ marginBottom: 24 }}>
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Metric</th><th>Management Projection</th>
                  <th>Historical Baseline</th><th>Credibility</th><th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {proj.review_table.map((row, idx) => {
                  const cClass = row.credibility === 'Realistic' ? 'status-pass' : row.credibility === 'Optimistic' ? 'status-fail' : 'status-caution';
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{row.metric}{row.risk_flag ? ' ⚠️' : ''}</td>
                      <td>{row.management_projection || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{row.historical_baseline || '—'}</td>
                      <td className={cClass}>{row.credibility || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.credibility_reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {proj.key_concerns && proj.key_concerns.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Key Concerns</h4>
          <ul className="bullet-list" style={{ marginBottom: 20 }}>
            {proj.key_concerns.map((c, i) => <li key={i} style={{ color: 'var(--danger)' }}>{c}</li>)}
          </ul>
        </>
      )}

      {cp && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 4 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🤖 AI Counter-Projection</h4>
          {cp.methodology && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{cp.methodology}</p>}
          {cp.projections && cp.projections.length > 0 && (
            <div className="excel-table-container" style={{ marginBottom: 16 }}>
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {cp.projections[0].year_by_year ? cp.projections[0].year_by_year.map(y => <th key={y.year}>{y.year}</th>) : null}
                  </tr>
                </thead>
                <tbody>
                  {cp.projections.map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{p.metric}</td>
                      {(p.year_by_year || []).map((y, yidx) => (
                        <td key={yidx} title={y.reasoning || ''}>{y.value || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cp.summary && <p className="summary-text">{cp.summary}</p>}
        </div>
      )}

      <div className="tab-actions-bar">
        <button className="btn btn-primary" onClick={onDownload}>
          <Download size={14} style={{ marginRight: 6 }} /> Download Projections JSON
        </button>
        <button className="btn btn-ghost" onClick={onNew} style={{ border: '1px solid var(--border)' }}>
          <PlusCircle size={14} style={{ marginRight: 6 }} /> New Analysis
        </button>
      </div>
    </div>
  );
}
