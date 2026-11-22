import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  FileUp,
  Loader2,
  PersonStanding,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ALL_LOCAL_ASSET_SLOTS,
  classifyLocalAvatarFiles,
  formatFileSize,
  type LocalAssetSlot,
} from '../game/vrm/localAssetDb';
import type {
  LocomotionState,
  VrmAvatarStatusSnapshot,
} from '../game/vrm/VrmAvatarController';

interface LocalAvatarLoaderPanelProps {
  status: VrmAvatarStatusSnapshot;
  thirdPersonPreview: boolean;
  onImportFile: (slot: LocalAssetSlot, file: File) => Promise<void>;
  onRemoveSlot: (slot: LocalAssetSlot) => Promise<void>;
  onClearAll: () => Promise<void>;
  onToggleThirdPerson: () => void;
  onToggleHeroinePreview: () => void;
}

interface SlotDescriptor {
  slot: LocalAssetSlot;
  title: string;
  hint: string;
  accept: string;
  extLabel: string;
  group: 'protagonist' | 'heroine';
}

const PROTAGONIST_SLOTS: readonly SlotDescriptor[] = [
  {
    slot: 'vrm',
    title: '男主模型',
    hint: '支持 VRM 0.x / 1.0',
    accept: '.vrm',
    extLabel: '.vrm',
    group: 'protagonist',
  },
  {
    slot: 'idle',
    title: '待机动作',
    hint: 'idle.fbx (男女主共用)',
    accept: '.fbx',
    extLabel: 'idle.fbx',
    group: 'protagonist',
  },
  {
    slot: 'walk',
    title: '行走动作',
    hint: 'walk.fbx (男女主共用)',
    accept: '.fbx',
    extLabel: 'walk.fbx',
    group: 'protagonist',
  },
  {
    slot: 'run',
    title: '奔跑动作',
    hint: 'run.fbx (Shift)',
    accept: '.fbx',
    extLabel: 'run.fbx',
    group: 'protagonist',
  },
] as const;

const HEROINE_SLOTS: readonly SlotDescriptor[] = [
  {
    slot: 'heroine',
    title: '女主模型',
    hint: 'heroine.vrm (卧室床沿)',
    accept: '.vrm',
    extLabel: 'heroine.vrm',
    group: 'heroine',
  },
  {
    slot: 'sit',
    title: '坐姿动作',
    hint: 'sit.fbx 可选 · 不传则程序化坐姿',
    accept: '.fbx',
    extLabel: 'sit.fbx',
    group: 'heroine',
  },
] as const;

const ALL_SLOT_DESCRIPTORS: readonly SlotDescriptor[] = [
  ...PROTAGONIST_SLOTS,
  ...HEROINE_SLOTS,
];

const MOTION_LABELS: Record<LocomotionState, string> = {
  idle: '待机 Idle',
  walk: '行走 Walk',
  run: '奔跑 Run',
};

const PANEL_CLS =
  'rounded-lg border border-white/25 bg-[#150f22]/78 shadow-[0_6px_22px_rgba(8,4,16,0.45)]';

export function LocalAvatarLoaderPanel({
  status,
  thirdPersonPreview,
  onImportFile,
  onRemoveSlot,
  onClearAll,
  onToggleThirdPerson,
  onToggleHeroinePreview,
}: LocalAvatarLoaderPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [draggingBatch, setDraggingBatch] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<LocalAssetSlot | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);

  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const slotInputRefs = useRef<Record<LocalAssetSlot, HTMLInputElement | null>>({
    vrm: null,
    idle: null,
    walk: null,
    run: null,
    heroine: null,
    sit: null,
  });

  const cachedCount = ALL_LOCAL_ASSET_SLOTS.filter((s) =>
    Boolean(status.assets[s])
  ).length;
  const boundAnimCount = (['idle', 'walk', 'run'] as LocomotionState[]).filter(
    (s) => status.boundClips[s]
  ).length;
  const isBusy = status.loadingSlot !== null;

  const exitLockIfNeeded = () => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  };

  const handleBatchFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    exitLockIfNeeded();
    setDropNotice(null);
    const { matched, unrecognized } = classifyLocalAvatarFiles(files);

    // Import VRM models first so FBX files dropped alongside immediately retarget onto them
    const orderedSlots: LocalAssetSlot[] = [
      'vrm',
      'heroine',
      'idle',
      'walk',
      'run',
      'sit',
    ];
    let importedCount = 0;
    for (const slot of orderedSlots) {
      const file = matched[slot];
      if (file) {
        await onImportFile(slot, file);
        importedCount += 1;
      }
    }

    if (unrecognized.length > 0) {
      setDropNotice(
        `已忽略不支持的文件：${unrecognized.slice(0, 2).join('、')}${
          unrecognized.length > 2 ? ' 等' : ''
        }（仅支持 .vrm 与 .fbx）`
      );
    } else if (importedCount === 0) {
      setDropNotice('未识别到 .vrm 或 .fbx 文件');
    }
  };

  const handleSlotFile = async (slot: LocalAssetSlot, file: File) => {
    exitLockIfNeeded();
    setDropNotice(null);
    const lower = file.name.toLowerCase();
    const expectedExt = slot === 'vrm' || slot === 'heroine' ? '.vrm' : '.fbx';
    if (!lower.endsWith(expectedExt)) {
      setDropNotice(`该槽位仅支持 ${expectedExt} 文件（当前：${file.name}）`);
      return;
    }
    await onImportFile(slot, file);
  };

  const handleBatchDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingBatch(false);
    setDraggingSlot(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleBatchFiles(e.dataTransfer.files);
    }
  };

  const handleSlotDrop = (slot: LocalAssetSlot) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingBatch(false);
    setDraggingSlot(null);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      void handleBatchFiles(files);
      return;
    }
    void handleSlotFile(slot, files[0]);
  };

  const handleBatchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleBatchFiles(files);
    }
    e.target.value = '';
  };

  const handleSlotInputChange =
    (slot: LocalAssetSlot) => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleSlotFile(slot, file);
      }
      e.target.value = '';
    };

  const renderSlotRow = (desc: SlotDescriptor) => {
    const meta = status.assets[desc.slot];
    const isSlotLoading =
      status.loadingSlot === desc.slot || status.loadingSlot === 'restore';
    const isDragTarget = draggingSlot === desc.slot;

    let isBound = false;
    let boundLabel = '已重定向';
    if (desc.slot === 'vrm') {
      isBound = status.vrmLoaded;
      boundLabel = `VRM${status.vrmVersion ? ` ${status.vrmVersion}` : ''}`;
    } else if (desc.slot === 'heroine') {
      isBound = status.heroineLoaded;
      boundLabel = status.heroineSpawned
        ? `床沿已就位`
        : `VRM${status.heroineVersion ? ` ${status.heroineVersion}` : ''}`;
    } else if (desc.slot === 'sit') {
      isBound = status.heroineSitClipBound;
      boundLabel = '已绑定坐姿';
    } else {
      isBound = status.boundClips[desc.slot as LocomotionState];
    }

    const isActiveMotion =
      (desc.slot === 'idle' || desc.slot === 'walk' || desc.slot === 'run') &&
      status.vrmLoaded &&
      isBound &&
      status.activeMotion === desc.slot;

    return (
      <div
        key={desc.slot}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDraggingSlot(desc.slot);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDraggingSlot((cur) => (cur === desc.slot ? null : cur));
        }}
        onDrop={handleSlotDrop(desc.slot)}
        className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition-colors ${
          isDragTarget
            ? 'border-[#ffb88c] bg-[#ffb88c]/20'
            : isActiveMotion || (desc.slot === 'heroine' && status.heroineSpawned)
              ? 'border-emerald-300/50 bg-emerald-500/12'
              : 'border-white/15 bg-black/22'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-[#f8eefc]">
              {desc.title}
            </span>
            <span className="font-mono text-[9.5px] text-[#cbb8de]/80">
              {desc.extLabel}
            </span>
            {isSlotLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-[#ffb88c]" />
            ) : isBound ? (
              <span className="inline-flex items-center gap-0.5 text-[9.5px] text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {boundLabel}
              </span>
            ) : meta ? (
              <span className="text-[9.5px] text-amber-200/90">
                {desc.slot === 'vrm' || desc.slot === 'heroine'
                  ? '待加载'
                  : desc.slot === 'sit'
                    ? '待导入女主VRM'
                    : '待导入VRM'}
              </span>
            ) : desc.slot === 'sit' && status.heroineLoaded ? (
              <span className="text-[9.5px] text-sky-200/85">程序化坐姿</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-[#cbb8de]/80 tabular-nums">
            {meta
              ? `${meta.name} (${formatFileSize(meta.size)})`
              : `未缓存 · ${desc.hint}`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              exitLockIfNeeded();
              slotInputRefs.current[desc.slot]?.click();
            }}
            className="flex items-center gap-0.5 rounded border border-white/22 bg-white/10 px-1.5 py-0.5 text-[10px] text-[#f5ecff] hover:bg-white/20 disabled:opacity-50 cursor-pointer"
          >
            <FileUp className="h-2.5 w-2.5" />
            <span>{meta ? '替换' : '选择'}</span>
          </button>
          {meta && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                exitLockIfNeeded();
                setDropNotice(null);
                void onRemoveSlot(desc.slot);
              }}
              title={`移除 ${desc.title} 缓存`}
              className="rounded border border-white/15 p-0.5 text-[#cbb8de] hover:border-rose-300/45 hover:bg-rose-500/20 hover:text-rose-100 disabled:opacity-50 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-3 z-20 flex flex-col items-start select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden multi-file picker */}
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept=".vrm,.fbx"
        className="hidden"
        onChange={handleBatchInputChange}
      />

      {/* Hidden per-slot pickers */}
      {ALL_SLOT_DESCRIPTORS.map((desc) => (
        <input
          key={desc.slot}
          ref={(el) => {
            slotInputRefs.current[desc.slot] = el;
          }}
          type="file"
          accept={desc.accept}
          className="hidden"
          onChange={handleSlotInputChange(desc.slot)}
        />
      ))}

      {/* Expanded Debug Drawer */}
      {expanded && (
        <div
          className={`mb-2 w-[324px] max-w-[calc(100vw-24px)] max-h-[78vh] overflow-y-auto p-3 text-[#f1e7fc] ${PANEL_CLS}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Database className="h-3.5 w-3.5 shrink-0 text-[#ffb88c]" />
              <span className="text-xs font-semibold tracking-wide truncate">
                加载本地模型/动画
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {cachedCount > 0 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    exitLockIfNeeded();
                    setDropNotice(null);
                    void onClearAll();
                  }}
                  title="清空 IndexedDB 中缓存的所有模型和动作"
                  className="flex items-center gap-1 rounded border border-rose-300/35 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200 hover:bg-rose-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  <span>清空缓存</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                title="折叠面板"
                className="rounded border border-white/15 p-0.5 text-[#cbb8de] hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Unified Drag-and-Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDraggingBatch(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDraggingBatch(false);
            }}
            onDrop={handleBatchDrop}
            onClick={() => {
              exitLockIfNeeded();
              batchInputRef.current?.click();
            }}
            className={`mt-2.5 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-2.5 py-2 text-center transition-colors ${
              draggingBatch
                ? 'border-[#ffb88c] bg-[#ffb88c]/18 text-[#fff3e8]'
                : 'border-white/28 bg-white/[0.04] text-[#d6c7e8] hover:border-[#ffb88c]/65 hover:bg-white/[0.08]'
            }`}
          >
            <Upload className="h-4 w-4 text-[#ffb88c]" />
            <p className="mt-1 text-[11px] font-medium text-[#f8eefc]">
              拖放或点击批量导入 .vrm / .fbx
            </p>
            <p className="mt-0.5 text-[10px] text-[#cbb8de]/85">
              自动识别 heroine.vrm / idle / walk / run / sit 并写入 IndexedDB
            </p>
          </div>

          {/* Protagonist Slots */}
          <div className="mt-2.5 space-y-1.5">
            {PROTAGONIST_SLOTS.map(renderSlotRow)}
          </div>

          {/* Heroine Slots */}
          <div className="mt-2.5 border-t border-white/15 pt-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10.5px] font-medium text-[#ffcae2]">
                <Sparkles className="h-3 w-3 text-[#ff9ec7]" />
                <span>女主资产 · 卧室床沿等待</span>
              </div>
              {status.heroineLoaded && (
                <button
                  type="button"
                  onClick={() => {
                    exitLockIfNeeded();
                    onToggleHeroinePreview();
                  }}
                  title="在卧室床沿预览或隐藏女主坐姿与视线追踪"
                  className={`rounded border px-1.5 py-0.5 text-[9.5px] font-medium transition-colors cursor-pointer ${
                    status.heroineSpawned
                      ? 'border-emerald-300/55 bg-emerald-500/20 text-emerald-100'
                      : 'border-pink-300/40 bg-pink-500/15 text-pink-100 hover:bg-pink-500/28'
                  }`}
                >
                  {status.heroineSpawned ? '已在床沿 · 隐藏' : '床沿预览'}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {HEROINE_SLOTS.map(renderSlotRow)}
            </div>
          </div>

          {/* Live Retargeting / Locomotion Status & Third-Person Preview Toggle */}
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/15 pt-2">
            <div className="text-[10.5px] text-[#d6c7e8] tabular-nums">
              {status.vrmLoaded ? (
                <span>
                  动作状态：
                  <strong className="text-[#ffb88c]">
                    {MOTION_LABELS[status.activeMotion]}
                  </strong>
                  <span className="ml-1 text-[#b7a5cc]">({boundAnimCount}/3)</span>
                </span>
              ) : (
                <span className="text-[#b7a5cc]">刷新后自动从 IndexedDB 恢复</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                exitLockIfNeeded();
                onToggleThirdPerson();
              }}
              title="切换第三人称跟随视角，方便观察 VRM 模型与 Mixamo 动作"
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                thirdPersonPreview
                  ? 'border-[#ffb88c]/65 bg-[#ffb085]/28 text-[#ffe6d4]'
                  : 'border-white/22 bg-white/10 text-[#ece1f8] hover:bg-white/18'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>{thirdPersonPreview ? '第三人称中' : '第三人称预览'}</span>
            </button>
          </div>

          {/* Error / Validation Feedback */}
          {(status.lastError || dropNotice) && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-rose-300/40 bg-rose-950/55 px-2 py-1.5 text-[10.5px] text-rose-100">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-300" />
              <span className="leading-snug">{dropNotice || status.lastError}</span>
            </div>
          )}
        </div>
      )}

      {/* Compact Corner Toggle Chip (supports direct drag-over to expand!) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            exitLockIfNeeded();
            setExpanded((prev) => !prev);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setExpanded(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[#f1e7fc] transition-colors hover:border-white/40 hover:bg-[#1f1633]/88 cursor-pointer ${PANEL_CLS}`}
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ffb88c]" />
          ) : (
            <PersonStanding
              className={`h-3.5 w-3.5 ${
                status.vrmLoaded || status.heroineLoaded
                  ? 'text-emerald-300'
                  : 'text-[#ffb88c]'
              }`}
            />
          )}
          <span>加载本地模型/动画</span>
          {cachedCount > 0 && (
            <span className="rounded border border-white/20 bg-white/10 px-1 py-0 text-[9.5px] font-mono text-[#ffd8be] tabular-nums">
              {status.vrmLoaded ? `VRM+${boundAnimCount}` : `${cachedCount}项`}
              {status.heroineLoaded ? '+女主' : ''}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-[#cbb8de]" />
          ) : (
            <ChevronUp className="h-3 w-3 text-[#cbb8de]" />
          )}
        </button>

        {!expanded && status.vrmLoaded && (
          <button
            type="button"
            onClick={() => {
              exitLockIfNeeded();
              onToggleThirdPerson();
            }}
            className={`flex items-center gap-1 px-2 py-1.5 text-[10.5px] font-medium transition-colors cursor-pointer ${PANEL_CLS} ${
              thirdPersonPreview
                ? 'border-[#ffb88c]/60 text-[#ffd8be]'
                : 'text-[#d6c7e8] hover:text-white'
            }`}
          >
            <Eye className="h-3 w-3" />
            <span>{thirdPersonPreview ? '切回第一人称' : '第三人称预览'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
