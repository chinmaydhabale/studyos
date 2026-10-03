import React from 'react';
import { Delete, CornerDownLeft, X } from 'lucide-react';
import { mathSounds } from '../engines/mathSoundEffects.js';

interface MathNumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  allowNegative?: boolean;
  disabled?: boolean;
}

export const MathNumpad: React.FC<MathNumpadProps> = ({
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  allowNegative = false,
  disabled = false
}) => {
  const handlePress = (action: () => void) => {
    if (disabled) return;
    mathSounds.playClick();
    action();
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="w-full max-w-sm mx-auto grid grid-cols-3 gap-2 select-none">
      {digits.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => handlePress(() => onDigit(d))}
          disabled={disabled}
          className="h-14 sm:h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-white/10 active:border-cyan-400 text-xl sm:text-2xl font-bold text-white shadow-lg transition-all flex items-center justify-center focus:outline-none"
        >
          {d}
        </button>
      ))}

      {/* Row 4: Clear or Minus, 0, Backspace */}
      {allowNegative ? (
        <button
          type="button"
          onClick={() => handlePress(() => onDigit('-'))}
          disabled={disabled}
          className="h-14 sm:h-16 rounded-2xl bg-slate-900/70 hover:bg-slate-800 active:scale-95 border border-white/10 text-xl font-bold text-slate-300 shadow-lg transition-all flex items-center justify-center"
        >
          ±
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handlePress(onClear)}
          disabled={disabled}
          className="h-14 sm:h-16 rounded-2xl bg-slate-900/70 hover:bg-rose-950/40 active:scale-95 border border-white/10 hover:border-rose-500/30 text-rose-400 text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-1"
        >
          <X className="w-4 h-4" />
          <span>CLR</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => handlePress(() => onDigit('0'))}
        disabled={disabled}
        className="h-14 sm:h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-white/10 active:border-cyan-400 text-xl sm:text-2xl font-bold text-white shadow-lg transition-all flex items-center justify-center"
      >
        0
      </button>

      <button
        type="button"
        onClick={() => handlePress(onBackspace)}
        disabled={disabled}
        className="h-14 sm:h-16 rounded-2xl bg-slate-900/70 hover:bg-slate-800 active:scale-95 border border-white/10 text-amber-400 shadow-lg transition-all flex items-center justify-center"
      >
        <Delete className="w-6 h-6" />
      </button>

      {/* Full width Submit bar */}
      <div className="col-span-3 mt-1">
        <button
          type="button"
          onClick={() => handlePress(onSubmit)}
          disabled={disabled}
          className="w-full h-13 sm:h-14 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 active:scale-[0.99] text-white font-bold text-base sm:text-lg shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 border border-emerald-400/30 transition-all"
        >
          <span>SUBMIT</span>
          <CornerDownLeft className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
