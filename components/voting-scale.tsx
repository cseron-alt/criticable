"use client";

import { useId } from "react";

type VotingScaleProps = {
  disabled?: boolean;
  leftLabel: string;
  onSelect: (value: 1 | 2 | 3 | 4 | 5) => void;
  question: string;
  rightLabel: string;
  selectedValue: 1 | 2 | 3 | 4 | 5 | null;
  stepLabels: readonly [string, string, string, string, string];
};

const steps = [1, 2, 3, 4, 5] as const;

export function VotingScale({
  disabled = false,
  leftLabel,
  onSelect,
  question,
  rightLabel,
  selectedValue,
  stepLabels,
}: VotingScaleProps) {
  const groupId = useId();

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement | HTMLButtonElement>,
  ) => {
    if (disabled) {
      return;
    }

    const baseValue = selectedValue ?? 3;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        onSelect(Math.max(1, baseValue - 1) as 1 | 2 | 3 | 4 | 5);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        onSelect(Math.min(5, baseValue + 1) as 1 | 2 | 3 | 4 | 5);
        break;
      case "Home":
        event.preventDefault();
        onSelect(1);
        break;
      case "End":
        event.preventDefault();
        onSelect(5);
        break;
      default:
        break;
    }
  };

  return (
    <div
      aria-label={question}
      className={`voting-scale ${selectedValue ? "voting-scale--has-selection" : ""} ${disabled ? "voting-scale--disabled" : ""}`}
      id={groupId}
      onKeyDown={handleKeyDown}
      role="radiogroup"
      tabIndex={disabled ? -1 : 0}
    >
      <div className="voting-scale__surface">
        <div className="voting-scale__track">
          {steps.map((step, index) => {
            const isSelected = selectedValue === step;

            return (
              <button
                aria-checked={isSelected}
                aria-label={`${stepLabels[index]} (${step} de 5)`}
                className={`voting-scale__segment ${isSelected ? "voting-scale__segment--selected" : ""}`}
                disabled={disabled}
                key={step}
                onKeyDown={handleKeyDown}
                onClick={() => onSelect(step)}
                role="radio"
                tabIndex={
                  disabled
                    ? -1
                    : isSelected || (selectedValue === null && step === 3)
                      ? 0
                      : -1
                }
                type="button"
              >
                <span className="voting-scale__segment-dot" />
              </button>
            );
          })}
        </div>

        <div className="voting-scale__feedback" aria-live="polite">
          {selectedValue ? `Voto registrado: ${stepLabels[selectedValue - 1]}` : ""}
        </div>
      </div>

      <div className="voting-scale__labels" aria-hidden="true">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
