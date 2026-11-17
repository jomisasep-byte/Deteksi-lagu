import {
  BookOpen,
  FileAudio,
  FileCheck2,
  History,
  Menu,
  MessageSquare,
  Plus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ChatbotView } from './components/ChatbotView.tsx';
import { GuideTermuxView } from './components/GuideTermuxView.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { LicenseDatabaseView } from './components/LicenseDatabaseView.tsx';
import { ScanWorkspace } from './components/ScanWorkspace.tsx';
import type { ChatMessage, LicenseRecord, ScanRecord } from './types.ts';

type TabId = 'scan' | 'history' | 'licenses' | 'chat' | 'guide';

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  Icon: typeof FileAudio;
}> = [
  { id: 'scan', label: 'Pemeriksa Media', Icon: FileAudio },
  { id: 'history', label: 'Riwayat & Laporan', Icon: History },
  { id: 'licenses', label: 'Database Lisensi', Icon: FileCheck2 },
  { id: 'chat', label: 'Asisten Hak Cipta', Icon: MessageSquare },
  { id: 'guide', label: 'Panduan & Termux', Icon: BookOpen },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [activeScan, setActiveScan] = useState<ScanRecord | null>(null);

  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatScanId, setChatScanId] = useState<string | null>(null);

  const fetchScans = useCallback(async () => {
    setScansLoading(true);
    try {
      const res = await fetch('/api/scans');
      const data = (await res.json()) as { scans?: ScanRecord[] };
      if (data.scans) {
        setScans(data.scans);
        setActiveScan((curr) =>
          curr ? data.scans?.find((s) => s.id === curr.id) ?? curr : null
        );
      }
    } finally {
      setScansLoading(false);
    }
  }, []);

  const fetchLicenses = useCallback(async () => {
    setLicensesLoading(true);
    try {
      const res = await fetch('/api/licenses');
      const data = (await res.json()) as { licenses?: LicenseRecord[] };
      if (data.licenses) {
        setLicenses(data.licenses);
      }
    } finally {
      setLicensesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();
    fetchLicenses();
  }, [fetchScans, fetchLicenses]);

  const handleScanCreated = (scan: ScanRecord) => {
    setScans((prev) => [scan, ...prev]);
    setActiveScan(scan);
    setChatScanId(scan.id);
  };

  const handleScanUpdated = (updated: ScanRecord) => {
    setScans((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setActiveScan(updated);
  };

  const handleDeleteScan = async (id: string) => {
    await fetch(`/api/scans/${id}`, { method: 'DELETE' });
    setScans((prev) => prev.filter((s) => s.id !== id));
    if (activeScan?.id === id) setActiveScan(null);
    if (chatScanId === id) setChatScanId(null);
  };

  const handleLicensesChanged = async () => {
    await fetchLicenses();
    await fetchScans();
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            PraCek Musik
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
          Hasil pemindaian merupakan indikasi awal pra-unggah, bukan jaminan bebas Content ID YouTube.
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold tracking-tight text-slate-900">
                PraCek Musik
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setActiveTab(id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Top Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
              <span className="hidden sm:inline text-slate-400">PraCek Musik</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-medium text-slate-900 truncate">{currentNav.label}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveScan(null);
              setActiveTab('scan');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pindai Media Baru</span>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1280px] w-full mx-auto">
          {activeTab === 'scan' && (
            <ScanWorkspace
              activeScan={activeScan}
              licenses={licenses}
              onScanCreated={handleScanCreated}
              onScanUpdated={handleScanUpdated}
              onClearActiveScan={() => setActiveScan(null)}
              onAskAssistant={(scanId) => {
                setChatScanId(scanId);
                setActiveTab('chat');
              }}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              scans={scans}
              loading={scansLoading}
              onSelectScan={(scan) => {
                setActiveScan(scan);
                setActiveTab('scan');
              }}
              onDeleteScan={handleDeleteScan}
              onStartNewScan={() => {
                setActiveScan(null);
                setActiveTab('scan');
              }}
            />
          )}

          {activeTab === 'licenses' && (
            <LicenseDatabaseView
              licenses={licenses}
              loading={licensesLoading}
              onRefresh={handleLicensesChanged}
            />
          )}

          {activeTab === 'chat' && (
            <ChatbotView
              messages={chatMessages}
              setMessages={setChatMessages}
              scans={scans}
              selectedScanId={chatScanId}
              onSelectScanId={setChatScanId}
            />
          )}

          {activeTab === 'guide' && <GuideTermuxView />}
        </main>
      </div>
    </div>
  );
}
