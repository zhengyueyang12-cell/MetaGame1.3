import {
  Archive,
  Backpack,
  BookOpen,
  Cpu,
  Eye,
  EyeOff,
  FolderOpen,
  Image as ImageIcon,
  Lightbulb,
  Lock,
  Minus,
  Monitor,
  Plus,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  AtmosphereMode,
  BasementPartId,
  HitFeedbackPayload,
  InteractResult,
  InventorySnapshot,
  PipelineSettings,
  RoomId,
  ViewMode,
} from '../game/types';

interface HudOverlayProps {
  currentRoom: { id: RoomId; label: string };
  viewMode: ViewMode;
  atmosphere: AtmosphereMode;
  settings: PipelineSettings;
  hoverTarget: { label: string; actionLabel: string } | null;
  inspectMessage: InteractResult | null;
  discoveredClues: number;
  totalClues: number;
  collectedParts: BasementPartId[];
  adapterCrafted: boolean;
  currentStoryLabel: string;
  realityAlert: string | null;
  isPointerLocked: boolean;
  dockCollapsed: boolean;
  contextLost: boolean;
  onToggleDock: () => void;
  onSelectRoom: (room: RoomId) => void;
  onSelectViewMode: (mode: ViewMode) => void;
  onSelectAtmosphere: (mode: AtmosphereMode) => void;
  onToggleSetting: (key: Exclude<keyof PipelineSettings, 'brightness'>) => void;
  onChangeBrightness: (value: number) => void;
  livingLightOn: boolean;
  onToggleLivingLight: () => void;
  onRequestPointerLock: () => void;
  onDismissInspect: () => void;
  onDismissRealityAlert: () => void;
  onOpenComputer: () => void;
  onOpenDevTools: () => void;
  onOpenFiles: () => void;
  onOpenGallery: () => void;
  inventory: InventorySnapshot;
  hitFeedback: HitFeedbackPayload | null;
  onOpenInventory: () => void;
  onSwitchAmmo: () => void;
  onOpenPaperNote: () => void;
}

const ROOM_ITEMS: { id: RoomId; label: string }[] = [
  { id: 'living', label: '客厅' },
  { id: 'entryway', label: '玄关' },
  { id: 'dining', label: '餐厅' },
  { id: 'kitchen', label: '厨房' },
  { id: 'bedroom', label: '卧室' },
  { id: 'bathroom', label: '浴室' },
  { id: 'basement', label: '地下室' },
];

const ATMOSPHERE_ITEMS: { id: AtmosphereMode; label: string }[] = [
  { id: 'daylight', label: '日光' },
  { id: 'sunset', label: '黄昏' },
  { id: 'midnight', label: '深夜' },
  { id: 'meta', label: '异常' },
];

const PART_ITEMS: { id: BasementPartId; shortLabel: string }[] = [
  { id: 'part_pcie_card', shortLabel: 'PCI-E卡' },
  { id: 'part_photodiode', shortLabel: '光敏管' },
  { id: 'part_oscillator', shortLabel: '晶振' },
];

// Shared compact semi-transparent panel style with crisp outer border stroke
const PANEL_CLS =
  'rounded-lg border border-white/25 bg-[#150f22]/52 shadow-[0_4px_18px_rgba(8,4,16,0.32)]';

export function HudOverlay({
  currentRoom,
  viewMode,
  atmosphere,
  settings,
  hoverTarget,
  inspectMessage,
  discoveredClues,
  totalClues,
  collectedParts,
  adapterCrafted,
  currentStoryLabel,
  realityAlert,
  isPointerLocked,
  dockCollapsed,
  contextLost,
  onToggleDock,
  onSelectRoom,
  onSelectViewMode,
  onSelectAtmosphere,
  onToggleSetting,
  onChangeBrightness,
  livingLightOn,
  onToggleLivingLight,
  onRequestPointerLock,
  onDismissInspect,
  onDismissRealityAlert,
  onOpenComputer,
  onOpenDevTools,
  onOpenFiles,
  onOpenGallery,
  inventory,
  hitFeedback,
  onOpenInventory,
  onSwitchAmmo,
  onOpenPaperNote,
}: HudOverlayProps) {
  const partsReady = collectedParts.length >= 3;
  const equippedItem =
    inventory.equippedSlot !== null ? inventory.slots[inventory.equippedSlot] ?? null : null;
  const ownedItemCount = inventory.slots.filter(Boolean).length;
  const brightnessPct = Math.round((settings.brightness ?? 1.15) * 100);
  const cycleBrightnessPreset = () => {
    const presets = [0.85, 1.0, 1.15, 1.35, 1.55];
    const curr = settings.brightness ?? 1.15;
    const next = presets.find((p) => p > curr + 0.04) ?? presets[0];
    onChangeBrightness(next);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-3">
      {/* Top Row: One-Click Collapse Button + Compact Translucent Status & Utility Strips */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-start gap-1.5">
          {/* Master One-Click Fold/Unfold Toggle (always accessible in top-left) */}
          <button
            type="button"
            onClick={onToggleDock}
            title="一键折叠 / 展开界面 (快捷键 H)"
            className={`pointer-events-auto flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#f1e7fc] transition-colors hover:bg-[#1f1633]/75 hover:border-white/40 cursor-pointer whitespace-nowrap ${PANEL_CLS}`}
          >
            {dockCollapsed ? (
              <>
                <Eye className="h-3 w-3 text-[#ffb88c]" />
                <span>展开界面 [H]</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3 text-[#cbb8de]" />
                <span>折叠 [H]</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className={`pointer-events-auto px-2.5 py-1.5 max-w-md ${PANEL_CLS}`}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#e6daf3] tabular-nums">
                <span className="font-semibold text-[#ffb88c]">{currentRoom.label}</span>
                <span className="text-white/30">·</span>
                <span>
                  线索 {discoveredClues}/{totalClues}
                </span>
                <span className="text-white/30 hidden sm:inline">·</span>
                <span className="hidden sm:inline text-[#cbb8de]/90">
                  F 互动 · B 背包 · Q 装备 · 滚轮切换
                </span>
              </div>

              {/* Compact Objective Line */}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-white/15 pt-1 text-[10.5px]">
                <Cpu className="h-3 w-3 shrink-0 text-[#ffb88c]" />
                {!adapterCrafted ? (
                  <>
                    <span className="text-[#e6daf3]">零件 {collectedParts.length}/3</span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      {PART_ITEMS.map((part) => {
                        const got = collectedParts.includes(part.id);
                        return (
                          <span
                            key={part.id}
                            className={got ? 'text-emerald-300' : 'text-[#b7a5cc]'}
                          >
                            {got ? '✓' : '○'}
                            {part.shortLabel}
                          </span>
                        );
                      })}
                    </span>
                    {!partsReady ? (
                      <button
                        type="button"
                        onClick={() => onSelectRoom('basement')}
                        className="ml-auto rounded border border-[#ffb88c]/40 bg-[#ffb085]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#ffd0b0] hover:bg-[#ffb085]/35 cursor-pointer whitespace-nowrap"
                      >
                        去地下室
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenComputer}
                        className="ml-auto rounded border border-[#ffd2b5]/50 bg-[#ffb085]/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#1c132b] hover:bg-[#ffc3a1] cursor-pointer whitespace-nowrap"
                      >
                        去卧室开机
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-emerald-300 font-medium">已接入主机</span>
                    <span className="text-[#d6c7e8] truncate max-w-[150px]">
                      {currentStoryLabel}
                    </span>
                    <button
                      type="button"
                      onClick={onOpenComputer}
                      className="ml-auto flex items-center gap-1 rounded border border-[#ffd2b5]/45 bg-[#ffb085]/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#1c132b] hover:bg-[#ffc3a1] cursor-pointer whitespace-nowrap"
                    >
                      <Monitor className="h-2.5 w-2.5" />
                      <span>电脑</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top-Right Compact Utility Buttons (folds away cleanly with dockCollapsed!) */}
        {!dockCollapsed && (
          <div className={`pointer-events-auto flex flex-wrap items-center gap-1 p-1 ${PANEL_CLS}`}>
            <button
              type="button"
              onClick={onOpenInventory}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/8 px-2 py-1 text-[11px] font-medium text-[#f2eafc] transition-colors hover:bg-white/18 cursor-pointer whitespace-nowrap"
            >
              <Backpack className="h-3 w-3 text-[#7ee0c0]" />
              <span>背包[B]{ownedItemCount > 0 ? `(${ownedItemCount})` : ''}</span>
            </button>
            <button
              type="button"
              onClick={onOpenDevTools}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/8 px-2 py-1 text-[11px] font-medium text-[#f2eafc] transition-colors hover:bg-white/18 cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="h-3 w-3 text-[#ffb88c]" />
              <span>跳章</span>
            </button>
            <button
              type="button"
              onClick={onOpenFiles}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/8 px-2 py-1 text-[11px] font-medium text-[#f2eafc] transition-colors hover:bg-white/18 cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="h-3 w-3 text-emerald-300" />
              <span>档案</span>
            </button>
            <button
              type="button"
              onClick={onOpenGallery}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/8 px-2 py-1 text-[11px] font-medium text-[#f2eafc] transition-colors hover:bg-white/18 cursor-pointer whitespace-nowrap"
            >
              <ImageIcon className="h-3 w-3 text-sky-300" />
              <span>记录</span>
            </button>
            {adapterCrafted && (
              <button
                type="button"
                onClick={onOpenComputer}
                className="flex items-center gap-1 rounded border border-[#b79dff]/40 bg-[#6b4eb0]/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-[#7d5ec7] cursor-pointer whitespace-nowrap"
              >
                <Archive className="h-3 w-3" />
                <span>程序</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center Reticle, Hitmarker (ONLY on special catches/hits, never walls) & Compact Hover Prompt */}
      {viewMode === 'first-person' && !contextLost && (
        <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {equippedItem?.id === 'toy_gun' && (
              <div
                className={`absolute h-5 w-5 rounded-full border transition-colors duration-150 ${
                  inventory.ammoType === 'dart'
                    ? 'border-[#ff8a5b]/70'
                    : 'border-[#7ee0c0]/80 border-dashed'
                }`}
              />
            )}

            {hitFeedback && (
              <svg
                key={hitFeedback.id}
                viewBox="0 0 36 36"
                className="absolute h-9 w-9 animate-ping"
                style={{ animationDuration: '280ms', animationIterationCount: 1 }}
                aria-hidden="true"
              >
                <g
                  stroke={
                    hitFeedback.kind === 'capture'
                      ? '#ffd98a'
                      : hitFeedback.kind === 'net'
                        ? '#7ee0c0'
                        : hitFeedback.kind === 'bounce'
                          ? '#ffe885'
                          : '#ff7744'
                  }
                  strokeWidth="2.6"
                  strokeLinecap="round"
                >
                  <line x1="6" y1="6" x2="13" y2="13" />
                  <line x1="30" y1="6" x2="23" y2="13" />
                  <line x1="6" y1="30" x2="13" y2="23" />
                  <line x1="30" y1="30" x2="23" y2="23" />
                </g>
              </svg>
            )}

            <div
              className={`h-1.5 w-1.5 rounded-full transition-transform duration-100 shadow-[0_0_4px_rgba(0,0,0,0.65)] ${
                hoverTarget
                  ? 'scale-150 bg-[#ffb88c] ring-2 ring-[#ffb88c]/55'
                  : equippedItem?.id === 'toy_gun'
                    ? inventory.ammoType === 'dart'
                      ? 'bg-[#ff8452]'
                      : 'bg-[#7ee0c0]'
                    : 'bg-white/85'
              }`}
            />
          </div>

          {hitFeedback?.label && (
            <div className="mt-2.5 rounded border border-white/25 bg-[#150f22]/65 px-2 py-0.5 text-[11px] font-medium text-[#ffe9d6]">
              {hitFeedback.label}
            </div>
          )}

          {hoverTarget && (
            <div className="mt-3 rounded-md border border-white/28 bg-[#150f22]/60 px-2.5 py-1 text-[11px] text-[#f8eefc]">
              <span className="font-mono font-semibold text-[#ffb88c]">[F]</span>{' '}
              <span>{hoverTarget.actionLabel}</span>
              <span className="mx-1 text-white/35">·</span>
              <span className="font-medium">{hoverTarget.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Minimal Compact Equipped Item Chip (Bottom-Right, semi-transparent + thin outline) */}
      {viewMode === 'first-person' && !contextLost && equippedItem && (
        <div
          className={`pointer-events-auto fixed right-3 z-20 px-2.5 py-1.5 ${
            dockCollapsed ? 'bottom-3' : 'bottom-16'
          } ${PANEL_CLS}`}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-medium text-[#fff1e4]">{equippedItem.shortName}</span>
            {equippedItem.id === 'toy_gun' ? (
              <button
                type="button"
                onClick={onSwitchAmmo}
                className={`rounded border px-1.5 py-0.5 text-[10.5px] font-medium transition cursor-pointer ${
                  inventory.ammoType === 'dart'
                    ? 'border-[#ff8a5b]/60 bg-[#ff6f3c]/25 text-[#ffd8c2]'
                    : 'border-[#7ee0c0]/60 bg-[#73dfc0]/22 text-[#d4fff0]'
                }`}
              >
                {inventory.ammoType === 'dart' ? '吸盘镖' : '捕捉网'} [X]
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenPaperNote}
                className="rounded border border-[#f5e2c4]/45 bg-[#f6e8d2]/18 px-1.5 py-0.5 text-[10.5px] font-medium text-[#fff0d9] hover:bg-[#f6e8d2]/30 cursor-pointer"
              >
                展开字条
              </button>
            )}
            <span className="text-[10px] text-[#cbb8de]">[Q]收起</span>
          </div>
        </div>
      )}

      {/* WebGL Context Lost Fallback Notice */}
      {contextLost && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-[#161024]/95">
          <div className="max-w-md rounded-xl border border-white/25 bg-[#201733] p-6 text-center">
            <p className="text-base font-semibold text-[#f8eefc]">3D 渲染上下文已暂停</p>
            <p className="mt-2 text-xs text-[#cbb8de]">
              浏览器正在恢复 WebGL 渲染资源，请稍候或刷新页面。
            </p>
          </div>
        </div>
      )}

      {/* Bottom Area: Compact Toasts + One-Click Collapsible Control Bar */}
      <div className="flex flex-col items-center gap-1.5">
        {realityAlert && (
          <div className="pointer-events-auto w-full max-w-md rounded-lg border border-rose-300/45 bg-[#211022]/70 px-3 py-1.5 shadow-lg">
            <div className="flex items-center justify-between gap-2 text-[11px] text-rose-100">
              <div className="flex items-center gap-1.5 min-w-0">
                <Zap className="h-3.5 w-3.5 shrink-0 text-[#ff85a3]" />
                <span className="truncate sm:whitespace-normal">
                  <strong className="text-[#ff85a3] mr-1">[同步]</strong>
                  {realityAlert}
                </span>
              </div>
              <button
                type="button"
                onClick={onDismissRealityAlert}
                className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-rose-200/90 hover:bg-white/15 cursor-pointer"
              >
                确认
              </button>
            </div>
          </div>
        )}

        {inspectMessage && (
          <div className={`pointer-events-auto w-full max-w-md px-3.5 py-2.5 ${PANEL_CLS} bg-[#150f22]/72`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#ffbe94]">{inspectMessage.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#f2eafc]">
                  {inspectMessage.message}
                </p>
              </div>
              <button
                type="button"
                onClick={onDismissInspect}
                className="shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-[10.5px] text-[#d5c5ea] hover:bg-white/15 hover:text-white cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {/* Compact Semi-Transparent Outlined Bottom Control Bar (folded completely when dockCollapsed=true) */}
        {!dockCollapsed && (
          <div className={`pointer-events-auto w-full max-w-[820px] px-2.5 py-1.5 ${PANEL_CLS}`}>
            {/* Row 1: Rooms + Overview + Pointer Lock */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/15 pb-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {ROOM_ITEMS.map((r) => {
                  const active = viewMode === 'first-person' && currentRoom.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelectRoom(r.id)}
                      className={`whitespace-nowrap shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-[#ffd4b8]/60 bg-[#ffb085]/90 text-[#1c132b]'
                          : 'border-white/15 bg-white/8 text-[#eee5fa] hover:bg-white/18'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onSelectViewMode(viewMode === 'first-person' ? 'overview' : 'first-person')
                  }
                  className={`flex items-center gap-1 whitespace-nowrap shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'overview'
                      ? 'border-[#c5aef7]/60 bg-[#9b7ce0]/90 text-[#140d21]'
                      : 'border-white/15 bg-white/8 text-[#eee5fa] hover:bg-white/18'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  <span>{viewMode === 'overview' ? '第一人称' : '俯瞰'}</span>
                </button>

                <button
                  type="button"
                  onClick={onRequestPointerLock}
                  className={`flex items-center gap-1 whitespace-nowrap shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    isPointerLocked
                      ? 'border-[#ffb88c]/55 bg-[#ffb085]/25 text-[#ffd2b5]'
                      : 'border-white/15 bg-white/8 text-[#eee5fa] hover:bg-white/18'
                  }`}
                >
                  <Lock className="h-3 w-3" />
                  <span>{isPointerLocked ? '已锁定(ESC)' : '锁定视角'}</span>
                </button>
              </div>
            </div>

            {/* Row 2: Atmosphere + Brightness + Living Light + Render Toggles */}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                {ATMOSPHERE_ITEMS.map((a) => {
                  const active = atmosphere === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelectAtmosphere(a.id)}
                      className={`whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                        active
                          ? a.id === 'meta'
                            ? 'border-rose-300/60 bg-[#e34b74]/85 text-white'
                            : a.id === 'daylight'
                              ? 'border-[#ffe29c]/60 bg-[#f5b95f]/90 text-[#1c132b]'
                              : 'border-[#b99ff2]/60 bg-[#7c61b8]/85 text-white'
                          : 'border-white/12 bg-white/6 text-[#dfd3ed] hover:bg-white/16'
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <div
                  className="flex items-center overflow-hidden rounded border border-white/20 bg-white/8"
                  title="调整画面明暗"
                >
                  <button
                    type="button"
                    onClick={() => onChangeBrightness((settings.brightness ?? 1.15) - 0.1)}
                    aria-label="调暗画面"
                    className="px-1 py-0.5 text-[#dfd3ed] hover:bg-white/16 cursor-pointer"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cycleBrightnessPreset}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10.5px] font-medium text-[#ffcca8] tabular-nums hover:bg-white/12 cursor-pointer whitespace-nowrap"
                  >
                    <Sun className="h-3 w-3 text-[#ffd28a]" />
                    <span>{brightnessPct}%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBrightness((settings.brightness ?? 1.15) + 0.1)}
                    aria-label="调亮画面"
                    className="px-1 py-0.5 text-[#dfd3ed] hover:bg-white/16 cursor-pointer"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onToggleLivingLight}
                  className={`flex items-center gap-1 whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-medium cursor-pointer ${
                    livingLightOn
                      ? 'border-[#ffe28a]/55 bg-[#ffdf85]/25 text-[#fff0b8]'
                      : 'border-white/15 bg-white/8 text-[#dfd3ed] hover:bg-white/16'
                  }`}
                >
                  <Lightbulb
                    className={`h-3 w-3 ${livingLightOn ? 'text-[#ffe48c]' : 'text-[#b5a3ca]'}`}
                  />
                  <span>客厅灯</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleSetting('celShading')}
                  className={`whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] cursor-pointer ${
                    settings.celShading
                      ? 'border-[#ffb88c]/40 bg-white/16 text-[#ffcca8]'
                      : 'border-white/12 bg-white/6 text-[#b5a3ca]'
                  }`}
                >
                  暮紫着色
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSetting('volumetricRays')}
                  className={`whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] cursor-pointer ${
                    settings.volumetricRays
                      ? 'border-[#ffb88c]/40 bg-white/16 text-[#ffcca8]'
                      : 'border-white/12 bg-white/6 text-[#b5a3ca]'
                  }`}
                >
                  光束
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSetting('inkOutlines')}
                  className={`whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] cursor-pointer ${
                    settings.inkOutlines
                      ? 'border-[#ffb88c]/40 bg-white/16 text-[#ffcca8]'
                      : 'border-white/12 bg-white/6 text-[#b5a3ca]'
                  }`}
                >
                  描边
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSetting('audioEnabled')}
                  aria-label="切换音效"
                  className={`flex items-center gap-0.5 whitespace-nowrap shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] cursor-pointer ${
                    settings.audioEnabled
                      ? 'border-[#ffb88c]/40 bg-white/16 text-[#ffcca8]'
                      : 'border-white/12 bg-white/6 text-[#b5a3ca]'
                  }`}
                >
                  {settings.audioEnabled ? (
                    <Volume2 className="h-3 w-3" />
                  ) : (
                    <VolumeX className="h-3 w-3" />
                  )}
                  <span>音效</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
