import React, { useEffect } from 'react';
import { X, Crosshair, BookOpen, Check } from 'lucide-react';
import type { InventoryItem, InventorySnapshot, ToyGunAmmoType } from '../game/types';

interface InventoryModalProps {
  open: boolean;
  inventory: InventorySnapshot;
  onClose: () => void;
  onSelectSlot: (slotIndex: number) => void;
  onToggleEquip: (slotIndex: number) => void;
  onSwitchAmmo: (ammo: ToyGunAmmoType) => void;
  onOpenPaperNote: () => void;
}

function ItemGlyph({
  item,
  ammoType,
  large = false,
}: {
  item: InventoryItem;
  ammoType: ToyGunAmmoType;
  large?: boolean;
}) {
  const sizeClass = large ? 'w-20 h-20' : 'w-11 h-11';
  if (item.id === 'toy_gun') {
    return (
      <svg viewBox="0 0 64 64" className={sizeClass} aria-hidden="true">
        {/* Chunky mint-green receiver & stubby barrel */}
        <rect x="14" y="18" width="28" height="15" rx="6" fill="#73dfc0" stroke="#2d2033" strokeWidth="2.2" />
        <rect x="38" y="20" width="12" height="11" rx="3" fill="#73dfc0" stroke="#2d2033" strokeWidth="2.2" />
        {/* Flared orange-red muzzle */}
        <path d="M48 18 L57 15 L57 36 L48 33 Z" fill="#ff6736" stroke="#2d2033" strokeWidth="2.2" strokeLinejoin="round" />
        {/* Cream-yellow top sight & grip */}
        <rect x="19" y="13" width="18" height="6" rx="3" fill="#fff0a8" stroke="#2d2033" strokeWidth="2" />
        <path d="M22 33 L16 50 C15 53 19 55 23 54 L28 52 L31 33 Z" fill="#fff0a8" stroke="#2d2033" strokeWidth="2.2" strokeLinejoin="round" />
        {/* Orange trigger & pommel */}
        <path d="M31 34 Q36 39 31 42" fill="none" stroke="#ff6736" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="15" cy="25" r="4.5" fill="#ff6736" stroke="#2d2033" strokeWidth="1.8" />
        {/* Transparent ammo drum showing dart or net color */}
        <rect
          x="27"
          y="20"
          width="11"
          height="11"
          rx="3"
          fill={ammoType === 'dart' ? 'rgba(255, 118, 66, 0.55)' : 'rgba(156, 240, 214, 0.65)'}
          stroke="#fffdf4"
          strokeWidth="1.6"
        />
        {/* Tiny cartoon star sticker */}
        <circle cx="22" cy="25.5" r="2.6" fill="#ffe169" />
      </svg>
    );
  }

  // Paper Airplane Note glyph
  return (
    <svg viewBox="0 0 64 64" className={sizeClass} aria-hidden="true">
      {/* Pale off-white hand-folded paper airplane */}
      <path
        d="M10 35 L54 14 L42 50 L29 39 Z"
        fill="#f8f2e1"
        stroke="#4b3b36"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* Inner crease fold */}
      <path
        d="M54 14 L29 39 L26 49 L34 42"
        fill="#e9dec7"
        stroke="#4b3b36"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Tiny hand-drawn coral heart on wing */}
      <path
        d="M36 28 C34 25.5 31 26.5 32 29 C33 31 36 32.8 36 32.8 C36 32.8 39 31 40 29 C41 26.5 38 25.5 36 28 Z"
        fill="#e4666c"
      />
    </svg>
  );
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  open,
  inventory,
  onClose,
  onSelectSlot,
  onToggleEquip,
  onSwitchAmmo,
  onOpenPaperNote,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyB') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const selectedItem = inventory.slots[inventory.selectedSlot] ?? null;
  const isSelectedEquipped =
    selectedItem !== null && inventory.equippedSlot === inventory.selectedSlot;
  const ownedCount = inventory.slots.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0816]/72 p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[660px] rounded-2xl border border-[#ffe2cf]/25 bg-[#191227]/96 text-[#fff4eb] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ffe2cf]/12">
          <div>
            <h2 className="text-[17px] font-semibold tracking-wide text-[#fff2e6]">
              随身物品栏
            </h2>
            <p className="text-[12px] text-[#c7b7d4] mt-0.5">
              4 × 4 背包 · 已收纳 {ownedCount} / 16 件物品
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ffe2cf]/18 bg-[#281d3d] text-[#f4dfd0] hover:bg-[#382954] transition cursor-pointer"
            aria-label="关闭物品栏"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: 4x4 Grid on left + Detail panel on right */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5 p-6">
          {/* 4x4 Slots */}
          <div className="grid grid-cols-4 gap-2.5">
            {inventory.slots.map((slot, idx) => {
              const isSelected = idx === inventory.selectedSlot;
              const isEquipped = idx === inventory.equippedSlot && slot !== null;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSlot(idx)}
                  onDoubleClick={() => {
                    if (!slot) return;
                    if (slot.id === 'paper_airplane_note') {
                      onOpenPaperNote();
                    } else {
                      onToggleEquip(idx);
                    }
                  }}
                  className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 transition cursor-pointer ${
                    isSelected
                      ? 'border-[#ffb88c] bg-[#2e2246] shadow-[0_0_0_1px_rgba(255,184,140,0.45)]'
                      : slot
                        ? 'border-[#ffe2cf]/22 bg-[#231936] hover:border-[#ffb88c]/55 hover:bg-[#2a1f40]'
                        : 'border-[#ffe2cf]/10 bg-[#140e20]/80 hover:border-[#ffe2cf]/18'
                  }`}
                >
                  {slot ? (
                    <>
                      <ItemGlyph item={slot} ammoType={inventory.ammoType} />
                      <span className="mt-1 text-[11px] font-medium text-[#ffefe2] truncate max-w-full px-1">
                        {slot.shortName}
                      </span>
                      {isEquipped && (
                        <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded bg-[#ffb88c] text-[#1a1126]">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                      {slot.id === 'toy_gun' && (
                        <span className="absolute top-1.5 left-1.5 text-[9px] leading-none font-medium px-1 py-0.5 rounded bg-[#140d21]/85 text-[#9ef0d6] border border-[#9ef0d6]/30">
                          {inventory.ammoType === 'dart' ? '吸盘' : '网弹'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-[#78688c]/45 font-mono">
                      {idx + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Item Inspector */}
          <div className="flex flex-col justify-between rounded-xl border border-[#ffe2cf]/14 bg-[#140e21]/90 p-4">
            {selectedItem ? (
              <>
                <div>
                  <div className="flex items-center justify-center h-24 rounded-lg bg-[#201733] border border-[#ffe2cf]/10 mb-3">
                    <ItemGlyph item={selectedItem} ammoType={inventory.ammoType} large />
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-[#fff3e8]">
                      {selectedItem.name}
                    </h3>
                    <span className="text-[11px] text-[#cbb6dc] shrink-0">
                      {selectedItem.category}
                    </span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#d9cbe4]">
                    {selectedItem.description}
                  </p>

                  {selectedItem.id === 'toy_gun' && (
                    <div className="mt-3 pt-3 border-t border-[#ffe2cf]/10">
                      <div className="text-[11px] text-[#b8a5cc] mb-1.5">
                        当前弹药类型（按 X 切换）
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSwitchAmmo('dart')}
                          className={`px-2 py-1.5 rounded-lg text-[11.5px] font-medium border transition cursor-pointer ${
                            inventory.ammoType === 'dart'
                              ? 'border-[#ff8a5b] bg-[#ff6f3c]/25 text-[#ffd9c4]'
                              : 'border-[#ffe2cf]/14 bg-[#1d142e] text-[#c7b6d6] hover:bg-[#271b3e]'
                          }`}
                        >
                          吸盘飞镖弹
                        </button>
                        <button
                          type="button"
                          onClick={() => onSwitchAmmo('net')}
                          className={`px-2 py-1.5 rounded-lg text-[11.5px] font-medium border transition cursor-pointer ${
                            inventory.ammoType === 'net'
                              ? 'border-[#7ee0c0] bg-[#73dfc0]/22 text-[#d4fff0]'
                              : 'border-[#ffe2cf]/14 bg-[#1d142e] text-[#c7b6d6] hover:bg-[#271b3e]'
                          }`}
                        >
                          捕捉网弹
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {selectedItem.readable && (
                    <button
                      type="button"
                      onClick={onOpenPaperNote}
                      className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-[#f6e8d2] text-[#2c1f20] text-[12.5px] font-semibold hover:bg-[#fff2de] transition cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      展开阅读手写字条
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleEquip(inventory.selectedSlot)}
                    className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[12.5px] font-semibold transition cursor-pointer ${
                      isSelectedEquipped
                        ? 'border border-[#ffe2cf]/25 bg-[#2a1f40] text-[#ffe9db] hover:bg-[#382954]'
                        : 'bg-[#ffb88c] text-[#1c1229] hover:bg-[#ffc8a6]'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    {isSelectedEquipped ? '卸下物品 [Q]' : '装备到手中 [Q]'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center py-8 px-2">
                <p className="text-[13px] font-medium text-[#cbbad8]">空格子</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#9282a8]">
                  探索公寓拾取物品后会自动收纳进这里。客厅沙发上似乎放着一把塑料玩具枪。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Controls Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 bg-[#130d1f] border-t border-[#ffe2cf]/10 text-[11.5px] text-[#baa9cc]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><strong className="text-[#ffd6bc]">B</strong> 开关物品栏</span>
            <span><strong className="text-[#ffd6bc]">Q</strong> 快速装备 / 卸下</span>
            <span><strong className="text-[#ffd6bc]">滚轮</strong> 切换物品</span>
            <span><strong className="text-[#ffd6bc]">X</strong> 切换玩具枪弹药</span>
          </div>
          <span className="text-[#9987b0]">双击格子可快捷使用</span>
        </div>
      </div>
    </div>
  );
};
