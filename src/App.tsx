import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromPdf } from './services/geminiService';
import { DataTable } from './components/DataTable';
import { exportToExcel } from './utils/excelExport';
import { ExtractedDocument, ProcessingStatus, ExcelExportConfig, ThemeConfig, HistoryItem } from './types';
import { 
  FileUp, FileSpreadsheet, Loader2, AlertCircle, Check, Copy, Settings, X, 
  UploadCloud, History, Trash2, Cpu, Palette, Monitor
} from 'lucide-react';

const THEMES: ThemeConfig[] = [
  { id: 'blue', name: 'Xanh dương', primary: 'blue', gray: 'slate' },
  { id: 'emerald', name: 'Thiên nhiên', primary: 'emerald', gray: 'zinc' },
  { id: 'violet', name: 'Sáng tạo', primary: 'violet', gray: 'slate' },
  { id: 'rose', name: 'Nổi bật', primary: 'rose', gray: 'stone' },
  { id: 'amber', name: 'Mặc định', primary: 'amber', gray: 'neutral' },
];

const PRESET_BG_COLORS = [
  { name: 'Sương mai', value: '#F8FAFC' },
  { name: 'Bạc hà', value: '#F0FDF4' },
  { name: 'Bầu trời', value: '#F0F9FF' },
  { name: 'Oải hương', value: '#F5F3FF' },
  { name: 'Cát trắng', value: '#FAFAF9' },
  { name: 'Hồng phấn', value: '#FFF1F2' },
  { name: 'Cam đào', value: '#FFF7ED' },
  { name: 'Mặc định', value: '#F5FFFA' },
];

const DEFAULT_BG_COLOR = '#F5FFFA';

// Reliable theme style dictionary for Tailwind
const THEME_CLASSES: Record<string, {
  iconBg: string;
  lightBg: string;
  text: string;
  borderHover: string;
  shadow: string;
  accentHex: string;
}> = {
  blue: {
    iconBg: 'bg-blue-600 shadow-blue-500/20 text-white',
    lightBg: 'bg-blue-50 text-blue-600',
    text: 'text-blue-600',
    borderHover: 'hover:border-blue-400',
    shadow: 'shadow-blue-500/10',
    accentHex: '#3B82F6',
  },
  emerald: {
    iconBg: 'bg-emerald-600 shadow-emerald-500/20 text-white',
    lightBg: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-600',
    borderHover: 'hover:border-emerald-400',
    shadow: 'shadow-emerald-500/10',
    accentHex: '#10B981',
  },
  violet: {
    iconBg: 'bg-violet-600 shadow-violet-500/20 text-white',
    lightBg: 'bg-violet-50 text-violet-600',
    text: 'text-violet-600',
    borderHover: 'hover:border-violet-400',
    shadow: 'shadow-violet-500/10',
    accentHex: '#8B5CF6',
  },
  rose: {
    iconBg: 'bg-rose-600 shadow-rose-500/20 text-white',
    lightBg: 'bg-rose-50 text-rose-600',
    text: 'text-rose-600',
    borderHover: 'hover:border-rose-400',
    shadow: 'shadow-rose-500/10',
    accentHex: '#F43F5E',
  },
  amber: {
    iconBg: 'bg-amber-600 shadow-amber-500/20 text-white',
    lightBg: 'bg-amber-50 text-amber-700',
    text: 'text-amber-600',
    borderHover: 'hover:border-amber-400',
    shadow: 'shadow-amber-500/10',
    accentHex: '#F59E0B',
  },
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedDocument[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showNotification, setShowNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('app_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [backgroundColor, setBackgroundColor] = useState<string>(() => localStorage.getItem('app_bg_color') || DEFAULT_BG_COLOR);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(() => {
    try {
      const savedThemeId = localStorage.getItem('app_theme_id');
      if (savedThemeId) {
        const found = THEMES.find(t => t.id === savedThemeId);
        if (found) return found;
      }
    } catch {}
    return THEMES[0];
  });

  const [excelConfig] = useState<ExcelExportConfig>({ fontName: 'Times New Roman', fontSize: 14, wrapText: true, allBorders: true });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const configPanelRef = useRef<HTMLDivElement>(null);
  
  const themeStyle = THEME_CLASSES[currentTheme.primary] || THEME_CLASSES.blue;

  useEffect(() => { localStorage.setItem('app_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('app_bg_color', backgroundColor); }, [backgroundColor]);
  useEffect(() => { localStorage.setItem('app_theme_id', currentTheme.id); }, [currentTheme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (configPanelRef.current && !configPanelRef.current.contains(event.target as Node)) {
        setShowConfigPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let interval: any;
    if (status === ProcessingStatus.PROCESSING) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (file && file.size > 20 * 1024 * 1024) {
             return prev >= 95 ? 95 : prev + 0.15;
          }
          return prev >= 98 ? 98 : prev + (prev > 80 ? 0.3 : 1.5);
        });
      }, 500);
    } else if (status === ProcessingStatus.SUCCESS) {
      setProgress(100);
      notify("Bóc tách thành công!", "success");
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [status, file]);

  const notify = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setShowNotification({ message, type });
    setTimeout(() => setShowNotification(null), 4000);
  };

  const handleExtract = async (pdfFile: File) => {
    setFile(pdfFile);
    setStatus(ProcessingStatus.PROCESSING);
    setErrorMessage('');
    setExtractedData([]);
    
    try {
      const data = await extractDataFromPdf(pdfFile);
      setExtractedData(data);
      setStatus(ProcessingStatus.SUCCESS);
      
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fileName: pdfFile.name,
        data: data
      };
      setHistory(prev => [newHistoryItem, ...prev]);
    } catch (err: any) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      const msg = err.message || "Đã xảy ra lỗi trong quá trình xử lý.";
      setErrorMessage(msg);
      notify(msg, "error");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleExtract(selectedFile);
    }
  };

  const handleExport = () => {
    if (extractedData.length === 0) return;
    exportToExcel(extractedData, `ket_qua_${file?.name.split('.')[0] || 'trich_xuat'}`, excelConfig);
    notify("Đã xuất file Excel thành công", "success");
  };

  const handleCopy = async () => {
    if (extractedData.length === 0) return;
    // Sao chép danh sách không sao chép số thứ tự (5 cột dữ liệu chính)
    const rows = extractedData.map(d => 
      `${d.symbol}\t${d.date}\t${d.docType} ${d.summary}\t${d.authority}\t${d.pageRange}`
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(rows);
      setCopySuccess(true);
      notify("Đã sao chép vào bộ nhớ tạm (không kèm STT)", "success");
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      notify("Lỗi khi sao chép", "error");
    }
  };

  const handleDeleteHistory = (id: string) => {
    setHistory(history.filter(h => h.id !== id));
    notify("Đã xóa bản ghi lịch sử", "info");
  };

  const handleLoadHistory = (item: HistoryItem) => {
    setExtractedData(item.data);
    setStatus(ProcessingStatus.SUCCESS);
    setFile(new File([], item.fileName));
    setShowHistory(false);
    notify(`Đã tải lại kết quả: ${item.fileName}`, "success");
  };

  return (
    <div 
      className="min-h-screen transition-all duration-700 ease-in-out pb-20 font-sans"
      style={{ backgroundColor }}
    >
      <nav className="bg-white/85 backdrop-blur-lg sticky top-0 z-40 border-b border-slate-200/60 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl shadow-lg ${themeStyle.iconBg}`}>
              <Cpu size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-slate-900 tracking-tight leading-none">
                TRÍCH XUẤT TÀI LIỆU CHÍNH QUYỀN
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Hệ thống trích xuất văn bản v2.1 • Giữ 100% dòng file PDF
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all active:scale-95 cursor-pointer border border-transparent hover:border-slate-200"
            >
              <History size={18} className="group-hover:rotate-[-30deg] transition-transform" /> 
              <span className="hidden sm:inline">Lịch sử</span>
              {history.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full font-black">
                  {history.length}
                </span>
              )}
            </button>
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <button 
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`p-2.5 rounded-2xl transition-all active:scale-90 relative cursor-pointer ${
                showConfigPanel ? `${themeStyle.lightBg} border border-current` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Cài đặt giao diện & màu sắc"
            >
              <Settings size={22} className={showConfigPanel ? 'animate-spin-slow' : ''} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="space-y-12 animate-in fade-in duration-700">
          <div className="space-y-12">
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-14 overflow-hidden relative group">
              <div 
                className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none transition-transform duration-1000 group-hover:scale-110"
                style={{ color: themeStyle.accentHex }}
              >
                <UploadCloud size={400} strokeWidth={1} />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-5 mb-12">
                  <div className={`p-5 rounded-[2rem] shadow-inner ${themeStyle.lightBg}`}>
                    <UploadCloud size={32} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 leading-tight">Trung tâm bóc tách</h3>
                    <p className="text-slate-500 font-medium text-lg">
                      Phân tích văn bản hành chính theo quy chuẩn 2024 • Giữ nguyên từng dòng không đổi vị trí
                    </p>
                  </div>
                </div>

                <div 
                  className={`relative border-2 border-dashed rounded-[3rem] p-12 sm:p-24 transition-all cursor-pointer group/upload flex flex-col items-center justify-center ${
                    isDragging ? `border-indigo-500 bg-indigo-50/50 scale-[1.01] shadow-2xl` : `border-slate-200 hover:border-slate-400 hover:bg-slate-50/30`
                  } ${status === ProcessingStatus.PROCESSING ? 'pointer-events-none opacity-60' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFile = e.dataTransfer.files[0];
                    if (droppedFile) handleExtract(droppedFile);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
                  
                  <div 
                    className={`w-32 h-32 rounded-full flex items-center justify-center mb-10 group-hover/upload:scale-110 transition-transform duration-700 shadow-xl ${themeStyle.lightBg}`}
                  >
                    {status === ProcessingStatus.PROCESSING ? (
                      <Loader2 className="animate-spin text-current" size={56} />
                    ) : (
                      <FileUp className="text-current" size={56} />
                    )}
                  </div>

                  <div className="text-center max-w-lg">
                    <p className="text-2xl font-black text-slate-800 mb-3">
                      {file && status !== ProcessingStatus.IDLE ? file.name : "Kéo thả tài liệu PDF vào đây"}
                    </p>
                    <p className="text-slate-400 font-medium text-lg leading-relaxed">
                      AI sẽ tự động nhận diện Số hiệu, Ngày tháng, Trích yếu và tính khoảng trang.
                    </p>
                  </div>

                  {status === ProcessingStatus.PROCESSING && (
                    <div className="mt-16 w-full max-w-xl">
                      <div className="flex justify-between items-end mb-4">
                        <div className="flex flex-col">
                          <span className={`text-xs font-black uppercase tracking-[0.2em] mb-1 ${themeStyle.text}`}>
                            Đang kết nối Gemini AI
                          </span>
                          <span className="text-slate-500 font-bold text-sm">
                            Vui lòng chờ trong giây lát...
                          </span>
                        </div>
                        <span className={`text-3xl font-black tabular-nums ${themeStyle.text}`}>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner p-1">
                        <div 
                          className="h-full rounded-full transition-all duration-300 ease-out shadow-lg"
                          style={{ width: `${progress}%`, backgroundColor: themeStyle.accentHex }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div ref={resultsRef} className="space-y-12">
              {status === ProcessingStatus.ERROR && (
                <div className="bg-rose-50 rounded-[3rem] border border-rose-100 p-12 text-center animate-in zoom-in duration-500 relative overflow-hidden">
                  <div className="relative z-10">
                      <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <AlertCircle size={40} />
                      </div>
                      <h4 className="text-2xl font-black text-rose-900">Có lỗi xảy ra</h4>
                      <p className="text-rose-600 mt-3 text-lg font-medium max-w-md mx-auto">{errorMessage}</p>
                      <button 
                        onClick={() => file && handleExtract(file)}
                        className="mt-8 px-10 py-4 bg-rose-500 text-white rounded-2xl font-black shadow-xl shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95 cursor-pointer"
                      >
                        Thử lại ngay
                      </button>
                  </div>
                </div>
              )}

              {(status === ProcessingStatus.SUCCESS || extractedData.length > 0) && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 px-4">
                    <div className="flex items-center gap-5">
                      <div className={`p-4 rounded-[1.5rem] ${themeStyle.lightBg}`}>
                        <Monitor size={28} />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">Kết quả bóc tách</h3>
                        <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest flex items-center gap-2">
                          <span>Tìm thấy {extractedData.length} văn bản</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-emerald-600 font-black">Giữ nguyên vị trí file PDF</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-full lg:w-auto">
                      <button
                        onClick={handleCopy}
                        className={`flex-1 lg:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-[1.5rem] font-black transition-all shadow-xl active:scale-95 cursor-pointer ${
                          copySuccess 
                            ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                            : `bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-slate-200/50`
                        }`}
                        title="Sao chép toàn bộ danh sách không kèm số thứ tự (phù hợp dán vào Word/Excel)"
                      >
                        {copySuccess ? <Check size={20} strokeWidth={3} /> : <Copy size={20} />}
                        {copySuccess ? 'Đã sao chép' : 'Sao chép bảng'}
                      </button>
                      <button
                        onClick={handleExport}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500 text-white rounded-[1.5rem] font-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 hover:-translate-y-1 transition-all active:scale-95 cursor-pointer"
                      >
                        <FileSpreadsheet size={20} /> Xuất Excel
                      </button>
                    </div>
                  </div>
                  <DataTable 
                    data={extractedData} 
                    theme={currentTheme} 
                    onUpdateData={(newData) => setExtractedData(newData)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Configuration Drawer */}
      <div 
        ref={configPanelRef}
        className={`fixed inset-y-0 right-0 w-84 bg-white/95 backdrop-blur-2xl shadow-2xl z-[55] transform transition-transform duration-500 ease-out border-l border-slate-100 ${
          showConfigPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${themeStyle.lightBg}`}>
                <Palette size={20} />
              </div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">Giao diện</h4>
            </div>
            <button onClick={() => setShowConfigPanel(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-10 overflow-y-auto pr-2 custom-scrollbar">
            {/* Theme Colors */}
            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5">Chủ đề màu sắc</p>
              <div className="grid grid-cols-5 gap-3">
                {THEMES.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setCurrentTheme(t)} 
                    className={`aspect-square rounded-2xl border-2 transition-all cursor-pointer ${
                      currentTheme.id === t.id ? 'border-slate-900 ring-4 ring-slate-100 scale-105' : 'border-transparent shadow-sm hover:scale-105'
                    }`} 
                    style={{ 
                      backgroundColor: t.primary === 'blue' ? '#3B82F6' : t.primary === 'emerald' ? '#10B981' : t.primary === 'violet' ? '#8B5CF6' : t.primary === 'rose' ? '#F43F5E' : '#F59E0B' 
                    }} 
                    title={t.name}
                  />
                ))}
              </div>
            </section>

            {/* Background Colors */}
            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5">Màu nền ứng dụng</p>
              <div className="grid grid-cols-2 gap-2.5">
                {PRESET_BG_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setBackgroundColor(c.value)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      backgroundColor === c.value ? 'border-slate-900 ring-2 ring-slate-200 font-black' : 'border-slate-200 hover:border-slate-300 font-medium'
                    }`}
                    style={{ backgroundColor: c.value }}
                  >
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" style={{ backgroundColor: c.value }} />
                    <span className="text-xs text-slate-800">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowHistory(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-8 animate-in slide-in-from-right duration-500">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <History size={20} className="text-indigo-600" />
                <h3 className="text-2xl font-black">Lịch sử bóc tách</h3>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full cursor-pointer">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-180px)] pr-2">
              {history.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-semibold text-slate-600">Chưa có lịch sử xử lý nào</p>
                  <p className="text-xs text-slate-400 mt-1">Các lần bóc tách tệp sẽ được lưu tự động tại đây</p>
                </div>
              ) : (
                history.map(item => (
                  <div 
                    key={item.id} 
                    className="p-5 bg-slate-50 rounded-3xl hover:bg-white hover:shadow-md border border-slate-100 cursor-pointer group transition-all" 
                    onClick={() => handleLoadHistory(item)}
                  >
                    <p className="font-black text-slate-900 truncate text-sm">{item.fileName}</p>
                    <div className="flex justify-between items-center mt-2.5">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {new Date(item.timestamp).toLocaleString()} • {item.data.length} văn bản
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id); }} 
                        className="text-slate-300 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Xóa bản ghi này"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Notification */}
      {showNotification && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10">
          <div className={`px-10 py-4 rounded-[2rem] shadow-2xl font-black text-white flex items-center gap-4 ${
            showNotification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
          }`}>
            {showNotification.type === 'success' ? <Check size={20} strokeWidth={3} /> : <AlertCircle size={20} />}
            <span>{showNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
